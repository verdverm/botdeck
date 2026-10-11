/**
 * Server-side semantic validation for command tool calls.
 *
 * The agent can hallucinate actors, spells, targets, and items. This module
 * grounds every command in the actual extracted game state before the turn is
 * allowed to end. On failure it returns a precise error and a correction
 * message that lists the valid options derived from state.
 */

import { NES_BUTTONS, type GameCommand, type TurnRequest, type CommandSpec } from "./protocol.ts";

interface ValidatedPartyMember {
  index: number;
  name: string;
  canAct?: boolean;
  pendingAction?: unknown;
  spellsKnown?: { name?: string; level?: number; slot?: number; school?: string }[];
  spellCharges?: {
    levels: { level: number; current?: number; max?: number }[];
  };
}

interface ValidatedEnemy {
  slot: number;
  name?: string;
  hp?: number;
  alive?: boolean;
}

interface ValidatedInventoryItem {
  itemInfo?: { name?: string; type?: string };
  quantity: number;
}

interface ValidatedState {
  party?: ValidatedPartyMember[];
  battle?: {
    inBattle?: boolean;
    party?: ValidatedPartyMember[];
    enemies?: ValidatedEnemy[];
    activePartyIndex?: number;
  };
  inventory?: ValidatedInventoryItem[];
}

export interface ValidationFailure {
  error: string;
  correction: string;
}

const VALID_BUTTONS = Object.keys(NES_BUTTONS).map((b) => b.toLowerCase());
const MAX_PRESS_FRAMES = 600;

function validatePressButton(command: GameCommand): ValidationFailure | undefined {
  const args = command.args ?? {};
  const button = String(args.button ?? "").toLowerCase();
  if (!VALID_BUTTONS.includes(button)) {
    return {
      error: `press_button: unknown button "${button}".`,
      correction: `Valid buttons: ${VALID_BUTTONS.join(", ")}.`,
    };
  }
  const frames = args.frames;
  if (frames !== undefined && (typeof frames !== "number" || frames < 1 || frames > MAX_PRESS_FRAMES)) {
    return {
      error: `press_button: invalid frames ${String(frames)} (expected 1-${MAX_PRESS_FRAMES}).`,
      correction: "Omit frames for the default 4-frame hold, or pass 1-600.",
    };
  }
  return undefined;
}

export function validateCommand(command: GameCommand, request: TurnRequest): ValidationFailure | undefined {
  if (command.name === "press_button") {
    return validatePressButton(command);
  }

  const options = request.options;
  const spec = options.find((o) => o.name === command.name);
  if (!spec) {
    return {
      error: `Command "${command.name}" is not available in ${request.mode ?? "current"} mode.`,
      correction: buildCommandListCorrection(options),
    };
  }

  const args = command.args ?? {};
  const state = extractState(request);
  const isBattle = request.mode === "battle";

  if (commandSpecExpectsActor(spec)) {
    const actorFailure = validateActor(args, state, isBattle, request.actor);
    if (actorFailure) return actorFailure;
  }

  if (command.name === "magic") {
    const spellFailure = validateSpell(args, state, isBattle);
    if (spellFailure) return spellFailure;
  }

  if (command.name === "fight" || command.name === "magic") {
    const targetFailure = validateTarget(args, state, isBattle, command.name);
    if (targetFailure) return targetFailure;
  }

  if (command.name === "use_item") {
    const itemFailure = validateItem(args, state);
    if (itemFailure) return itemFailure;
    const targetFailure = validateItemTarget(args, state);
    if (targetFailure) return targetFailure;
  }

  return undefined;
}

function validateActor(
  args: Record<string, unknown>,
  state: ValidatedState,
  isBattle: boolean,
  expectedActor: string | undefined,
): ValidationFailure | undefined {
  const actorName = String(args.actor ?? "").trim();
  if (actorName === "") {
    return {
      error: "Battle commands must name an actor.",
      correction: buildActorCorrection(state, expectedActor),
    };
  }

  const member = findPartyMember(state, actorName);
  if (!member) {
    return {
      error: `Actor "${actorName}" is not a known party member.`,
      correction: buildActorCorrection(state, expectedActor),
    };
  }

  if (isBattle) {
    const nextActorName = expectedActor ?? findNextActor(state)?.name;
    if (nextActorName && nextActorName !== member.name) {
      return {
        error: `It is ${nextActorName}'s turn, not ${member.name}'s. Battle commands must be entered in party order.`,
        correction: `The next actor is ${nextActorName}. Issue the command for ${nextActorName}.`,
      };
    }
  }

  return undefined;
}

function validateSpell(
  args: Record<string, unknown>,
  state: ValidatedState,
  isBattle: boolean,
): ValidationFailure | undefined {
  const spellName = String(args.spell ?? "").trim();
  const actorName = String(args.actor ?? "").trim();
  // Resolve the actor through findPartyMember so slot references ("slot 1",
  // "1") work, then prefer the full roster for spells: the battle party shape
  // omits spellsKnown.
  const resolved = findPartyMember(state, actorName);
  const roster = state.party ?? state.battle?.party ?? [];
  const actor =
    (resolved
      ? roster.find(
          (p) => p.index === resolved.index || p.name.toLowerCase() === resolved.name.toLowerCase(),
        )
      : undefined) ??
    roster.find((p) => p.name.toLowerCase() === actorName.toLowerCase());
  const spells = actor?.spellsKnown ?? [];
  const displayName = actor?.name ?? resolved?.name ?? actorName;

  if (spellName === "") {
    return {
      error: `Magic command requires a spell name for ${displayName}.`,
      correction: buildSpellCorrection(displayName, spells),
    };
  }

  const normalized = spellName.toUpperCase();
  const known = spells.find((s) => (s.name ?? "").toUpperCase() === normalized);
  if (!known) {
    return {
      error: `Spell "${spellName}" is not known by ${displayName}.`,
      correction: buildSpellCorrection(displayName, spells, actor?.spellCharges),
    };
  }

  // In FF1 each spell level costs one charge from that level's MP pool.
  // Reject the command when the actor has no charges left for the spell's level.
  if (known.level !== undefined && actor?.spellCharges) {
    const charge = actor.spellCharges.levels.find((l) => l.level === known.level);
    if (charge && charge.current === 0) {
      return {
        error: `${displayName} has no MP left for level ${known.level} spells.`,
        correction: buildSpellCorrection(displayName, spells, actor.spellCharges),
      };
    }
  }

  return undefined;
}

function validateTarget(
  args: Record<string, unknown>,
  state: ValidatedState,
  isBattle: boolean,
  commandName: string,
): ValidationFailure | undefined {
  const targetName = String(args.target ?? "").trim();
  const targetDomain = commandName === "fight" ? "enemy" : "any";
  const targets = listValidTargets(state, isBattle, targetDomain);

  if (targetName === "") {
    return {
      error: `Command "${commandName}" requires a target.`,
      correction: buildTargetCorrection(targets, state, isBattle),
    };
  }

  if (!isValidTarget(targetName, targets)) {
    const deadMatch = targetDomain === "enemy" ? findDeadEnemyMatch(targetName, state) : undefined;
    if (deadMatch) {
      return {
        error: `Target "${targetName}" is ${deadMatch.name ?? `enemy slot ${deadMatch.slot}`} and is already dead.`,
        correction: buildTargetCorrection(targets, state, isBattle),
      };
    }
    return {
      error: `Target "${targetName}" is not valid for ${commandName}.`,
      correction: buildTargetCorrection(targets, state, isBattle),
    };
  }

  return undefined;
}

function validateItemTarget(args: Record<string, unknown>, state: ValidatedState): ValidationFailure | undefined {
  const targetName = String(args.target ?? "").trim();
  const party = state.party ?? state.battle?.party ?? [];
  const valid = party.map((m) => `${m.name} (slot ${m.index})`);

  if (targetName === "") {
    return {
      error: "use_item requires a target party member.",
      correction: `Valid targets: ${valid.join(", ") || "none"}.`,
    };
  }

  const match = party.find((m) => {
    if (m.name.toLowerCase() === targetName.toLowerCase()) return true;
    const parsed = parseSlotIndex(targetName);
    return parsed !== undefined && m.index === parsed;
  });

  if (!match) {
    return {
      error: `Target "${targetName}" is not a valid party member for use_item.`,
      correction: `Valid targets: ${valid.join(", ") || "none"}.`,
    };
  }

  return undefined;
}

function validateItem(args: Record<string, unknown>, state: ValidatedState): ValidationFailure | undefined {
  const itemName = String(args.item ?? "").trim();
  const consumables = (state.inventory ?? []).filter(
    (it) => it.quantity > 0 && it.itemInfo?.type === "consumable",
  );

  if (itemName === "") {
    return {
      error: "use_item requires an item name.",
      correction: buildItemCorrection(consumables),
    };
  }

  const match = consumables.find((it) => (it.itemInfo?.name ?? "").toLowerCase() === itemName.toLowerCase());
  if (!match) {
    return {
      error: `Item "${itemName}" is not available or is not a usable consumable.`,
      correction: buildItemCorrection(consumables),
    };
  }

  return undefined;
}

function commandSpecExpectsActor(spec: CommandSpec): boolean {
  if (!spec.args) return false;
  try {
    const schema = JSON.parse(spec.args) as Record<string, unknown>;
    return "actor" in schema;
  } catch {
    return false;
  }
}

function extractState(request: TurnRequest): ValidatedState {
  const ff1 = request.state?.ff1 as ValidatedState | undefined;
  return ff1 ?? {};
}

function parseSlotIndex(input: string): number | undefined {
  const match = input.match(/^slot\s*(\d+)$/i);
  if (match) return Number(match[1]);
  // Bare numeric references ("1", "2") were accepted before the regex rewrite;
  // keep supporting them so the prompt/LLM contract is not silently tightened.
  return /^\d+$/.test(input) ? Number(input) : undefined;
}

function findPartyMember(state: ValidatedState, name: string): ValidatedPartyMember | undefined {
  const normalized = name.toLowerCase();
  const party = state.battle?.party ?? state.party ?? [];

  // Exact name match first.
  let member = party.find((p) => p.name.toLowerCase() === normalized);
  if (member) return member;

  // Numeric slot/index match (0-based).
  const parsed = parseSlotIndex(normalized);
  if (parsed !== undefined) {
    member = party.find((p) => p.index === parsed);
    if (member) return member;
  }

  return undefined;
}

function findNextActor(state: ValidatedState): ValidatedPartyMember | undefined {
  const battleParty = state.battle?.party;
  if (!battleParty) return undefined;

  // canAct already encodes alive + no pendingAction in the FF1 reader.
  return battleParty.find((m) => m.canAct === true);
}

function listValidTargets(state: ValidatedState, isBattle: boolean, domain: "enemy" | "any" = "any"): string[] {
  const targets: string[] = [];
  if (isBattle) {
    const enemies = state.battle?.enemies ?? [];
    for (const e of enemies) {
      if (e.alive === false) continue;
      const label = e.name ? `${e.name} (slot ${e.slot})` : `enemy slot ${e.slot}`;
      targets.push(label);
    }
  }
  if (domain !== "enemy") {
    const party = state.party ?? state.battle?.party ?? [];
    for (const m of party) {
      targets.push(`${m.name} (slot ${m.index})`);
    }
  }
  return targets;
}

function findDeadEnemyMatch(targetName: string, state: ValidatedState): ValidatedEnemy | undefined {
  const enemies = state.battle?.enemies ?? [];
  const normalized = targetName.toLowerCase();
  return enemies.find((e) => {
    if (e.alive !== false) return false;
    if (e.name && e.name.toLowerCase() === normalized) return true;
    const parsed = parseSlotIndex(normalized);
    if (parsed !== undefined && e.slot === parsed) return true;
    if (`slot ${e.slot}` === normalized) return true;
    return false;
  });
}

function isValidTarget(name: string, targets: string[]): boolean {
  const normalized = name.toLowerCase();
  for (const target of targets) {
    if (target.toLowerCase() === normalized) return true;
    // Allow matching just the slot number or just the name.
    const match = target.match(/^(.+?)\s*\(slot\s*(\d+)\)$/i);
    if (match) {
      const [, label, slot] = match;
      if (label?.trim().toLowerCase() === normalized) return true;
      if (slot === normalized) return true;
      if (`slot ${slot}` === normalized) return true;
    }
  }
  return false;
}

function buildCommandListCorrection(options: CommandSpec[]): string {
  if (options.length === 0) {
    return "No commands are available this turn. Use durable tools (e.g. memory_write) to record what you observe, or reply with prose.";
  }
  const list = options.map((o) => `- ${o.name}: ${o.description}`).join("\n");
  return `Available commands this turn are:\n${list}\nCall exactly one of these command tools.`;
}

function buildActorCorrection(state: ValidatedState, expectedActor: string | undefined): string {
  const party = state.battle?.party ?? state.party ?? [];
  const names = party.map((p) => p.name).join(", ") || "none";
  if (expectedActor) {
    return `The next actor is ${expectedActor}. Valid party members: ${names}. Issue the command for ${expectedActor}.`;
  }
  const next = findNextActor(state);
  if (next) {
    return `The next actor is ${next.name}. Valid party members: ${names}. Issue the command for ${next.name}.`;
  }
  return `Valid party members: ${names}. Name the actor exactly.`;
}

function buildSpellCorrection(
  actorName: string,
  spells: { name?: string; level?: number }[],
  charges?: { levels: { level: number; current?: number; max?: number }[] },
): string {
  if (spells.length === 0) {
    return `${actorName} knows no spells.`;
  }
  const list = spells
    .map((s) => {
      const level = s.level !== undefined ? ` (level ${s.level})` : "";
      const charge = s.level !== undefined ? charges?.levels.find((l) => l.level === s.level) : undefined;
      const mp = charge ? ` [MP ${charge.current ?? "?"}/${charge.max ?? "?"}]` : "";
      return `${s.name ?? "?"}${level}${mp}`;
    })
    .join(", ");
  return `${actorName} knows: ${list}. Choose a spell with available MP.`;
}

function buildTargetCorrection(targets: string[], state: ValidatedState, isBattle: boolean): string {
  if (targets.length === 0) {
    const enemies = state.battle?.enemies ?? [];
    if (isBattle && enemies.length > 0 && enemies.every((e) => e.alive === false)) {
      return "All enemies are dead. No valid targets remain.";
    }
    return "No valid targets are visible.";
  }
  return `Valid targets: ${targets.join(", ")}.`;
}

function buildItemCorrection(consumables: ValidatedInventoryItem[]): string {
  if (consumables.length === 0) {
    return "No usable consumable items are in inventory.";
  }
  const list = consumables.map((it) => `${it.itemInfo?.name ?? "?"} x${it.quantity}`).join(", ");
  return `Available consumables: ${list}.`;
}
