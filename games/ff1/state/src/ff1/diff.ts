import type {
  BattleEnemy,
  BattlePartyMember,
  BattleState,
  FF1GameState,
  InventoryItem,
  PartyCharacter,
  WorldState,
} from "./types.js";

export interface QueuedActionDiff {
  /** Party member whose command buffer newly latched a command this step. */
  member: string;
  /** The command code as decoded by the reader (attack/magic/drink/item/run). */
  command: string;
  /** Human-readable resolved target, e.g. `enemy slot 1` / `Stu (ally 0)`. */
  target: string;
}

export interface EnemyHpDiff {
  slot: number;
  name: string;
  before: number | undefined;
  after: number | undefined;
  delta: number;
}

export interface BattleDiff {
  inBattle?: { before: boolean; after: boolean };
  phase?: { before: string | undefined; after: string | undefined };
  /** Commands newly written into the btl_charcmdbuf between before and after. */
  queued?: QueuedActionDiff[];
  /** Commands that were queued before and cleared by the after snapshot. */
  cleared?: string[];
  /** Enemy HP deltas (damage the round actually dealt), only for changed slots. */
  enemyHp?: EnemyHpDiff[];
}


export interface FF1StateDiff {
  changed: boolean;
  party?: {
    index: number;
    name: string;
    hp?: { before: number | undefined; after: number | undefined };
    maxHp?: { before: number | undefined; after: number | undefined };
    level?: { before: number | undefined; after: number | undefined };
    status?: { before: string[]; after: string[] };
  }[];
  gold?: { before: number; after: number; delta: number };
  position?: {
    before: string;
    after: string;
  };
  inventory?: {
    added: InventoryItem[];
    removed: InventoryItem[];
    changed: { item: string; before: number; after: number; delta: number }[];
  };
  context?: {
    battle?: { before: boolean; after: boolean };
    menu?: { before: string | undefined; after: string | undefined };
    dialog?: { before: boolean; after: boolean };
    cursor?: { before: number | undefined; after: number | undefined };
    window?: {
      before: { cursorMax: number; overlay: boolean };
      after: { cursorMax: number; overlay: boolean };
    };
    shop?: { before: string | undefined; after: string | undefined };
  };
  /**
   * Derived from the btl_charcmdbuf per snapshot: the game's authoritative
   * record of which member queued which command against which slot. This is
   * what actually happened, independent of what the agent said it did.
   */
  battle?: BattleDiff;
  summary: string;
}

function describeTarget(
  target: { kind?: string; slot?: number } | undefined,
  enemies: BattleEnemy[],
  party: PartyCharacter[],
): string {
  const t = target;
  if (!t) return "?";
  switch (t.kind) {
    case "enemy": {
      const slot = t.slot ?? 0;
      const enemy = enemies.find((e) => e.slot === slot);
      return `${enemy?.name ?? "enemy"} (enemy slot ${slot})`;
    }
    case "player": {
      const slot = t.slot ?? 0;
      const member = party.find((p) => p.index === slot);
      return `${member?.name ?? "ally"} (ally slot ${slot})`;
    }
    case "all_enemies":
      return "all enemies";
    case "all_players":
      return "all allies";
    default:
      return "?";
  }
}

function extractQueued(
  battle: BattleState | undefined,
  party: PartyCharacter[],
): QueuedActionDiff[] {
  if (!battle?.inBattle) return [];
  const out: QueuedActionDiff[] = [];
  for (const m of battle.party) {
    const pa = m.pendingAction as
      | { command?: string; target?: { kind?: string; slot?: number } }
      | undefined;
    if (!pa?.command) continue;
    out.push({
      member: m.name,
      command: pa.command,
      target: describeTarget(pa.target, battle.enemies, party),
    });
  }
  return out;
}

function diffBattle(
  before: FF1GameState,
  after: FF1GameState,
): BattleDiff | undefined {
  const b = before.battle;
  const a = after.battle;
  if (b?.inBattle !== true && a?.inBattle !== true) return undefined;

  const diff: BattleDiff = {};
  if (b?.inBattle !== a?.inBattle) {
    diff.inBattle = { before: b?.inBattle ?? false, after: a?.inBattle ?? false };
  }
  if (b?.phase !== a?.phase) {
    diff.phase = { before: b?.phase, after: a?.phase };
  }
  const beforeQueued = extractQueued(b, before.party);
  const afterQueued = extractQueued(a, after.party);
  const beforeNames = new Set(beforeQueued.map((q) => q.member));
  const afterNames = new Set(afterQueued.map((q) => q.member));
  const newlyQueued = afterQueued.filter((q) => !beforeNames.has(q.member));
  if (newlyQueued.length > 0) diff.queued = newlyQueued;
  const cleared = beforeQueued.filter((q) => !afterNames.has(q.member)).map((q) => q.member);
  if (cleared.length > 0) diff.cleared = cleared;

  if (b?.enemies && a?.enemies) {
    const enemyDiffs: EnemyHpDiff[] = [];
    for (const ae of a.enemies) {
      const be = b.enemies.find((e) => e.slot === ae.slot);
      const beforeHp = be?.hp;
      const afterHp = ae.hp;
      if (beforeHp === undefined || afterHp === undefined) continue;
      if (beforeHp === afterHp) continue;
      enemyDiffs.push({
        slot: ae.slot,
        name: ae.name ?? `enemy ${ae.slot}`,
        before: beforeHp,
        after: afterHp,
        delta: afterHp - beforeHp,
      });
    }
    if (enemyDiffs.length > 0) diff.enemyHp = enemyDiffs;
  }

  return Object.keys(diff).length > 0 ? diff : undefined;
}

function formatPosition(world: WorldState | undefined): string {
  if (!world) return "unknown";
  if (world.isOverworld) {
    return `Overworld (${world.overworldPlayerX}, ${world.overworldPlayerY})`;
  }
  return `${world.mapName ?? `Map ${world.mapId}`} (${world.standardMapX}, ${world.standardMapY})`;
}

function characterName(c: PartyCharacter | undefined): string {
  return c?.name ?? "?";
}

function inventoryKey(item: InventoryItem): string {
  return item.itemInfo?.name ?? `Item ${item.itemId}`;
}

function inventoryMap(items: InventoryItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (item.quantity === 0) continue;
    const key = inventoryKey(item);
    map.set(key, (map.get(key) ?? 0) + item.quantity);
  }
  return map;
}

/**
 * Compare two FF1 state objects and return a concise diff.
 */
export function diffFF1States(before: FF1GameState, after: FF1GameState): FF1StateDiff {
  const partyDiffs: FF1StateDiff["party"] = [];
  const beforeParty = before.party ?? [];
  const afterParty = after.party ?? [];
  const len = Math.max(beforeParty.length, afterParty.length);

  for (let i = 0; i < len; i++) {
    const b = beforeParty[i];
    const a = afterParty[i];
    if (!b && !a) continue;

    const name = characterName(a ?? b);
    const changes: NonNullable<FF1StateDiff["party"]>[number] = { index: i, name };
    let hasChange = false;

    if (b?.hp !== a?.hp) {
      changes.hp = { before: b?.hp, after: a?.hp };
      hasChange = true;
    }
    if (b?.maxHp !== a?.maxHp) {
      changes.maxHp = { before: b?.maxHp, after: a?.maxHp };
      hasChange = true;
    }
    if (b?.level !== a?.level) {
      changes.level = { before: b?.level, after: a?.level };
      hasChange = true;
    }
    const beforeStatus = (b?.status?.ailments ?? []).map((s) => s.name).sort();
    const afterStatus = (a?.status?.ailments ?? []).map((s) => s.name).sort();
    if (beforeStatus.join(",") !== afterStatus.join(",")) {
      changes.status = { before: beforeStatus, after: afterStatus };
      hasChange = true;
    }

    if (hasChange) partyDiffs.push(changes);
  }

  const goldBefore = before.gold ?? 0;
  const goldAfter = after.gold ?? 0;
  const gold = goldBefore !== goldAfter
    ? { before: goldBefore, after: goldAfter, delta: goldAfter - goldBefore }
    : undefined;

  const positionBefore = formatPosition(before.world);
  const positionAfter = formatPosition(after.world);
  const position = positionBefore !== positionAfter
    ? { before: positionBefore, after: positionAfter }
    : undefined;

  const beforeItems = inventoryMap(before.inventory ?? []);
  const afterItems = inventoryMap(after.inventory ?? []);
  const inventory: FF1StateDiff["inventory"] = { added: [], removed: [], changed: [] };

  for (const [key, qty] of afterItems) {
    const prev = beforeItems.get(key) ?? 0;
    if (prev === 0) {
      const item = (after.inventory ?? []).find((i) => inventoryKey(i) === key);
      if (item) inventory.added.push(item);
    } else if (prev !== qty) {
      inventory.changed.push({ item: key, before: prev, after: qty, delta: qty - prev });
    }
  }
  for (const [key, qty] of beforeItems) {
    if (!afterItems.has(key)) {
      const item = (before.inventory ?? []).find((i) => inventoryKey(i) === key);
      if (item) inventory.removed.push(item);
    }
  }

  const ctxBefore = before.context ?? { mode: "unknown", menu: "unknown" };
  const ctxAfter = after.context ?? { mode: "unknown", menu: "unknown" };
  const menuBefore = ctxBefore.mode === "menu" ? ctxBefore.menu : undefined;
  const menuAfter = ctxAfter.mode === "menu" ? ctxAfter.menu : undefined;
  const context: FF1StateDiff["context"] = {};
  if (before.battle?.inBattle !== after.battle?.inBattle) {
    context.battle = {
      before: before.battle?.inBattle ?? false,
      after: after.battle?.inBattle ?? false,
    };
  }
  if (menuBefore !== menuAfter) {
    context.menu = { before: menuBefore, after: menuAfter };
  }
  if (before.menu?.dialogOpen !== after.menu?.dialogOpen) {
    context.dialog = {
      before: before.menu?.dialogOpen ?? false,
      after: after.menu?.dialogOpen ?? false,
    };
  }
  if (before.menu?.cursor !== after.menu?.cursor) {
    context.cursor = {
      before: before.menu?.cursor,
      after: after.menu?.cursor,
    };
  }
  const winBefore = {
    cursorMax: before.menu?.cursorMax ?? 0,
    overlay: before.menu?.menuOverlay ?? false,
  };
  const winAfter = {
    cursorMax: after.menu?.cursorMax ?? 0,
    overlay: after.menu?.menuOverlay ?? false,
  };
  if (winBefore.cursorMax !== winAfter.cursorMax || winBefore.overlay !== winAfter.overlay) {
    context.window = { before: winBefore, after: winAfter };
  }
  const shopBefore = before.menu?.enteringShop ? before.menu.shopType : undefined;
  const shopAfter = after.menu?.enteringShop ? after.menu.shopType : undefined;
  if (shopBefore !== shopAfter) {
    context.shop = { before: shopBefore, after: shopAfter };
  }
  const hasContextChange = Object.keys(context).length > 0;

  const battle = diffBattle(before, after);

  const changed = partyDiffs.length > 0 || gold !== undefined || position !== undefined ||
    inventory.added.length > 0 || inventory.removed.length > 0 || inventory.changed.length > 0 ||
    hasContextChange || battle !== undefined;

  const parts: string[] = [];
  if (gold) parts.push(`Gold: ${gold.before} -> ${gold.after} (${gold.delta >= 0 ? "+" : ""}${gold.delta})`);
  if (position) parts.push(`Position: ${position.before} -> ${position.after}`);
  for (const p of partyDiffs) {
    const details: string[] = [];
    if (p.hp) details.push(`HP ${p.hp.before ?? "?"} -> ${p.hp.after ?? "?"}`);
    if (p.level) details.push(`Lv ${p.level.before ?? "?"} -> ${p.level.after ?? "?"}`);
    if (p.status) details.push(`Status [${p.status.before.join(", ")}] -> [${p.status.after.join(", ")}]`);
    parts.push(`${p.name}: ${details.join(", ")}`);
  }
  for (const item of inventory.added) parts.push(`+${inventoryKey(item)} x${item.quantity}`);
  for (const item of inventory.removed) parts.push(`-${inventoryKey(item)} x${item.quantity}`);
  for (const item of inventory.changed) {
    parts.push(`${item.item}: ${item.before} -> ${item.after} (${item.delta >= 0 ? "+" : ""}${item.delta})`);
  }
  if (context.battle) parts.push(`Battle: ${context.battle.before} -> ${context.battle.after}`);
  if (battle?.phase) parts.push(`Phase: ${battle.phase.before ?? "?"} -> ${battle.phase.after ?? "?"}`);
  for (const q of battle?.queued ?? []) {
    parts.push(`${q.member} queued ${q.command.toUpperCase()} -> ${q.target}`);
  }
  for (const name of battle?.cleared ?? []) {
    parts.push(`${name} command cleared (round ran)`);
  }
  for (const e of battle?.enemyHp ?? []) {
    parts.push(`Enemy slot ${e.slot} (${e.name}) HP ${e.before ?? "?"} -> ${e.after ?? "?"} (${e.delta >= 0 ? "+" : ""}${e.delta})`);
  }
  if (context.menu) parts.push(`Menu: ${context.menu.before ?? "none"} -> ${context.menu.after ?? "none"}`);
  if (context.dialog) parts.push(`Dialog: ${context.dialog.before} -> ${context.dialog.after}`);
  if (context.cursor) parts.push(`Cursor: ${context.cursor.before ?? "?"} -> ${context.cursor.after ?? "?"}`);
  if (context.window) {
    parts.push(
      `Window: cursorMax ${context.window.before.cursorMax}->${context.window.after.cursorMax}, overlay ${context.window.before.overlay}->${context.window.after.overlay}`,
    );
  }
  if (context.shop) parts.push(`Shop: ${context.shop.before ?? "none"} -> ${context.shop.after ?? "none"}`);

  return {
    changed,
    party: partyDiffs.length > 0 ? partyDiffs : undefined,
    gold,
    position,
    inventory,
    context: hasContextChange ? context : undefined,
    battle,
    summary: parts.length > 0 ? parts.join("; ") : "No changes.",
  };
}
