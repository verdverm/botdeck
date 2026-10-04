/**
 * Battle phase helpers for the bot loop.
 *
 * These consume the *derived* battle fields the `@games/ff1-state` reader
 * produces (`phase`, `roundExecuting`, `commandEntryAvailable`, `battleOver`,
 * `nextCommandableIndex`, and per-member `alive`/`canAct`/`pendingAction`).
 *
 * The old code leaned on a single field (`canAct`) and on liveness fields the
 * reader never emitted. That was fragile: an NES battle round latches the
 * command buffer, then plays animations while stale values (btl_result, enemy
 * HP, the cleared command buffer) transiently look like a fresh command
 * window. Every judgement below corroborates several independent signals, and
 * the "unknown" (missing derived fields) case is deliberately treated as
 * "do not assume command entry" so the loop waits for a positive signal
 * rather than acting on a transient.
 */

export interface BattleMemberLike {
  index?: number;
  name?: string;
  canAct?: boolean;
  alive?: boolean;
  hp?: number;
  pendingAction?: unknown;
}

export interface BattleStateLike {
  ff1?: {
    battle?: {
      inBattle?: boolean;
      phase?: string;
      roundExecuting?: boolean;
      commandEntryAvailable?: boolean;
      battleOver?: boolean;
      nextCommandableIndex?: number;
      activePartyIndex?: number;
      party?: BattleMemberLike[];
      enemies?: { alive?: boolean; hp?: number }[];
    };
  };
}

function battle(state: BattleStateLike | undefined) {
  return state?.ff1?.battle;
}

/** True when the reader says a battle is ongoing (multi-signal in the reader). */
export function isInBattle(state: BattleStateLike | undefined): boolean {
  const b = battle(state);
  if (!b) return false;
  if (typeof b.phase === "string") return b.phase !== "outOfBattle";
  return b.inBattle === true;
}

/**
 * Battle outcome is decided (victory/defeat/flee) and the loop should stop
 * asking the agent for commands. Corroborates the derived `battleOver`/
 * `phase` with the raw `inBattle` flag so an older reader snapshot still works.
 */
export function isBattleOver(state: BattleStateLike | undefined): boolean {
  const b = battle(state);
  if (!b) return true;
  if (typeof b.phase === "string") return b.phase === "battleEnding" || b.phase === "outOfBattle";
  if (b.battleOver === true) return true;
  return b.inBattle === false;
}

/** The round's queued actions are still resolving (do NOT issue commands). */
export function isRoundExecuting(state: BattleStateLike | undefined): boolean {
  const b = battle(state);
  if (!b) return false;
  if (typeof b.phase === "string") return b.phase === "roundExecuting";
  if (typeof b.roundExecuting === "boolean") return b.roundExecuting;
  // Fallback corroboration for a raw snapshot: in battle, not over, and every
  // living member already has a queued action => the game is playing the round.
  if (b.inBattle !== true) return false;
  return allLivingMembersQueued(b.party);
}

/** Command entry is available for at least one living party member. */
export function isCommandEntryReady(state: BattleStateLike | undefined): boolean {
  const b = battle(state);
  if (!b) return false;
  if (typeof b.phase === "string") return b.phase === "commandEntry" && b.commandEntryAvailable === true;
  if (typeof b.commandEntryAvailable === "boolean") return b.commandEntryAvailable;
  if (b.inBattle !== true) return false;
  return (b.party ?? []).some((m) => m.canAct === true);
}

/** The first living member without a queued command, for command entry. */
export function nextCommandableMember(
  state: BattleStateLike | undefined,
): BattleMemberLike | undefined {
  const b = battle(state);
  if (!b) return undefined;
  const party = b.party ?? [];
  if (typeof b.nextCommandableIndex === "number") {
    const byIndex = party.find((m) => m.index === b.nextCommandableIndex);
    if (byIndex) return byIndex;
  }
  return party.find((m) => m.canAct === true && m.alive !== false);
}

/** True when every living member already has a queued action. */
export function allLivingMembersQueued(party: BattleMemberLike[] | undefined): boolean {
  if (!party || party.length === 0) return false;
  const living = party.filter((m) => m.alive !== false && (m.hp ?? 1) > 0);
  if (living.length === 0) return false;
  return living.every((m) => m.pendingAction !== undefined || m.canAct === false);
}

/**
 * Compatibility wrapper: a battle round is complete when the outcome is
 * decided or command entry is available again for a living member.
 */
export function isBattleRoundComplete(state: BattleStateLike | undefined): boolean {
  if (!isInBattle(state)) return true;
  return isBattleOver(state) || isCommandEntryReady(state);
}
