import { describe, expect, it } from "vitest";
import {
  isBattleOver,
  isCommandEntryReady,
  isInBattle,
  isRoundExecuting,
  nextCommandableMember,
  allLivingMembersQueued,
  type BattleStateLike,
} from "./battle-helpers";

function member(overrides: {
  index?: number;
  name?: string;
  canAct?: boolean;
  alive?: boolean;
  hp?: number;
  pendingAction?: unknown;
} = {}) {
  return { index: 0, name: "M", canAct: true, alive: true, hp: 20, pendingAction: undefined, ...overrides };
}

type BattleLike = NonNullable<NonNullable<BattleStateLike["ff1"]>["battle"]>;

function state(battle: BattleLike): BattleStateLike {
  return { ff1: { battle } };
}

describe("derived-phase reads (reader emits phase)", () => {
  it("commandEntry: ready, not executing, not over", () => {
    const s = state({
      phase: "commandEntry",
      commandEntryAvailable: true,
      roundExecuting: false,
      battleOver: false,
      nextCommandableIndex: 1,
      party: [member({ index: 0, name: "Stu", canAct: false, pendingAction: { command: "attack" } }), member({ index: 1, name: "Rias" })],
    });
    expect(isInBattle(s)).toBe(true);
    expect(isCommandEntryReady(s)).toBe(true);
    expect(isRoundExecuting(s)).toBe(false);
    expect(isBattleOver(s)).toBe(false);
    expect(nextCommandableMember(s)?.name).toBe("Rias");
  });

  it("roundExecuting: not ready", () => {
    const s = state({
      phase: "roundExecuting",
      commandEntryAvailable: false,
      roundExecuting: true,
      battleOver: false,
      party: [member({ canAct: false, pendingAction: { command: "attack" } })],
    });
    expect(isInBattle(s)).toBe(true);
    expect(isRoundExecuting(s)).toBe(true);
    expect(isCommandEntryReady(s)).toBe(false);
    expect(isBattleOver(s)).toBe(false);
  });

  it("battleEnding: battle over", () => {
    const s = state({ phase: "battleEnding", battleOver: true, commandEntryAvailable: false, roundExecuting: false, party: [] });
    expect(isBattleOver(s)).toBe(true);
    expect(isInBattle(s)).toBe(true);
    expect(isCommandEntryReady(s)).toBe(false);
  });

  it("outOfBattle: not in battle, over", () => {
    const s = state({ phase: "outOfBattle", battleOver: true, party: [] });
    expect(isInBattle(s)).toBe(false);
    expect(isBattleOver(s)).toBe(true);
  });

  it("unknown phase is never reported as command-ready", () => {
    // Robustness against a transient/partial reader snapshot: without a
    // positive commandEntry signal the loop must not call the agent.
    const s = state({ party: [member()] });
    expect(isCommandEntryReady(s)).toBe(false);
  });
});

describe("raw fallback reads (older snapshot, no phase field)", () => {
  it("detects round-executing from every living member queued", () => {
    const s = state({
      inBattle: true,
      party: [
        member({ canAct: false, pendingAction: { command: "attack" } }),
        member({ index: 1, canAct: false, pendingAction: { command: "attack" } }),
      ],
    });
    expect(isRoundExecuting(s)).toBe(true);
    expect(isCommandEntryReady(s)).toBe(false);
    expect(isBattleOver(s)).toBe(false);
  });

  it("detects command-entry from a member that can act", () => {
    const s = state({
      inBattle: true,
      party: [member({ canAct: false, pendingAction: { command: "attack" } }), member({ index: 1, name: "Rias", canAct: true })],
    });
    expect(isCommandEntryReady(s)).toBe(true);
    expect(nextCommandableMember(s)?.name).toBe("Rias");
  });

  it("treats inBattle=false as over", () => {
    expect(isBattleOver(state({ inBattle: false, party: [] }))).toBe(true);
  });

  it("nextCommandableMember falls back to first alive+canAct member", () => {
    const s = state({
      inBattle: true,
      party: [member({ index: 0, canAct: false, alive: false, hp: 0 }), member({ index: 1, name: "Zing", canAct: true })],
    });
    expect(nextCommandableMember(s)?.name).toBe("Zing");
  });
});

describe("allLivingMembersQueued", () => {
  it("ignores dead members", () => {
    const party = [member({ canAct: false, pendingAction: { command: "attack" } }), member({ index: 1, alive: false, hp: 0, canAct: false })];
    expect(allLivingMembersQueued(party)).toBe(true);
  });

  it("is false when a living member has no queued action", () => {
    const party = [member({ canAct: false, pendingAction: { command: "attack" } }), member({ index: 1, canAct: true })];
    expect(allLivingMembersQueued(party)).toBe(false);
  });

  it("is false for an empty roster", () => {
    expect(allLivingMembersQueued([])).toBe(false);
  });
});
