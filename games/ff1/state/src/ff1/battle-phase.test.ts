import { describe, expect, it } from "vitest";
import type { JsNesState } from "../nes/types.js";
import { readFF1StateFromSaveState } from "./reader.js";

// Regression fixtures: the recorded battle from plays/ff1/0000_dev/states.
// Each snapshot is labelled with the battle phase it MUST derive, verified
// against the FF1Disassembly battle loop semantics (btl_result, the
// btl_charcmdbuf queue, btl_curturn vs the 13-entry btl_turnorder, and the
// battle-screen mapflags bit). These are the states a timer-based loop
// previously missequenced (e.g. 000023 "menu returns" reads with curturn=13
// and a stale activePartyIndex; 000028 "all-fight-actions" reads with
// curturn=13 and a partly-cleared buffer and is mid-execution).
import battleStart from "../../../../../plays/ff1/0000_dev/states/000016-start-06-1-battle-start.state.json" with { type: "json" };
import menuOpen from "../../../../../plays/ff1/0000_dev/states/000017-battle-01-1-menu-open.state.json" with { type: "json" };
import stuActions from "../../../../../plays/ff1/0000_dev/states/000018-battle-01-2-stu-actions.state.json" with { type: "json" };
import riasActions from "../../../../../plays/ff1/0000_dev/states/000019-battle-01-3-rias-actions.state.json" with { type: "json" };
import zingActions from "../../../../../plays/ff1/0000_dev/states/000020-battle-01-5-zing-actions.state.json" with { type: "json" };
import jakiActions from "../../../../../plays/ff1/0000_dev/states/000021-battle-01-6-jaki-actions-plus-stu-attack.state.json" with { type: "json" };
import firstImpDeath from "../../../../../plays/ff1/0000_dev/states/000022-battle-01-7-first-imp-death.state.json" with { type: "json" };
import menuReturns from "../../../../../plays/ff1/0000_dev/states/000023-battle-02-1-menu-returns.state.json" with { type: "json" };
import allActionsSelected from "../../../../../plays/ff1/0000_dev/states/000024-battle-02-2-all-actions-selected.state.json" with { type: "json" };
import midRunning from "../../../../../plays/ff1/0000_dev/states/000025-battle-02-3-mid-running-second-imp-death.state.json" with { type: "json" };
import impAttack from "../../../../../plays/ff1/0000_dev/states/000026-battle-02-5-first-imp-attack.state.json" with { type: "json" };
import menuReturnsAgain from "../../../../../plays/ff1/0000_dev/states/000027-battle-03-1-menu-returns-again.state.json" with { type: "json" };
import allFightActions from "../../../../../plays/ff1/0000_dev/states/000028-battle-03-2-all-fight-actions.state.json" with { type: "json" };
import oneImpRemains from "../../../../../plays/ff1/0000_dev/states/000029-battle-03-3-one-imp-remains.state.json" with { type: "json" };
import riasAttacking from "../../../../../plays/ff1/0000_dev/states/000030-battle-04-1-all-actions-chosen-rias-attacking.state.json" with { type: "json" };
import successStart from "../../../../../plays/ff1/0000_dev/states/000031-battle-05-1-success-start.state.json" with { type: "json" };
import monstersPerished from "../../../../../plays/ff1/0000_dev/states/000032-battle-05-2-monsters-perished-message.state.json" with { type: "json" };
import battleStats from "../../../../../plays/ff1/0000_dev/states/000033-battle-05-3-battle-stats-results.state.json" with { type: "json" };
import battleExit from "../../../../../plays/ff1/0000_dev/states/000034-battle-05-4-battle-exit-back-on-map.state.json" with { type: "json" };
import townExit from "../../../../../plays/ff1/0000_dev/states/000041-post-battle-01-7-exit-town.state.json" with { type: "json" };

const asState = (s: unknown) => s as JsNesState;

describe("battle phase from recorded save-states", () => {
  const cases: Array<[string, unknown, "commandEntry" | "roundExecuting" | "battleEnding" | "outOfBattle"]> = [
    ["battle start", battleStart, "commandEntry"],
    ["round 1 menu open", menuOpen, "commandEntry"],
    ["Stu queued", stuActions, "roundExecuting"],
    ["Rias queued", riasActions, "roundExecuting"],
    ["Zing queued", zingActions, "roundExecuting"],
    ["Jaki queued", jakiActions, "roundExecuting"],
    ["first imp death (mid-round)", firstImpDeath, "roundExecuting"],
    ["round 2 menu returns", menuReturns, "commandEntry"],
    ["all actions selected", allActionsSelected, "roundExecuting"],
    ["mid-running second death", midRunning, "roundExecuting"],
    ["first imp attack (mid-round)", impAttack, "roundExecuting"],
    ["round 3 menu returns", menuReturnsAgain, "commandEntry"],
    ["all fight actions (stale curturn=13)", allFightActions, "roundExecuting"],
    ["one imp remains", oneImpRemains, "roundExecuting"],
    ["rias attacking", riasAttacking, "roundExecuting"],
    ["success (result set)", successStart, "battleEnding"],
    ["monsters perished", monstersPerished, "battleEnding"],
    ["battle stats", battleStats, "battleEnding"],
    ["exit back on map", battleExit, "outOfBattle"],
    ["town exit", townExit, "outOfBattle"],
  ];

  for (const [label, snapshot, expected] of cases) {
    it(`${label}: ${expected}`, () => {
      const state = readFF1StateFromSaveState(asState(snapshot));
      expect(state.battle.phase).toBe(expected);
      expect(state.battle.inBattle).toBe(expected !== "outOfBattle");
      expect(state.battle.roundExecuting).toBe(expected === "roundExecuting");
      expect(state.battle.battleOver).toBe(expected === "battleEnding" || expected === "outOfBattle");
    });
  }

  it("command entry windows expose a living next commandable member", () => {
    for (const snapshot of [battleStart, menuOpen, menuReturns, menuReturnsAgain]) {
      const state = readFF1StateFromSaveState(asState(snapshot));
      expect(state.battle.commandEntryAvailable).toBe(true);
      const next = state.battle.party[state.battle.nextCommandableIndex ?? -1];
      expect(next?.alive).toBe(true);
      expect(next?.canAct).toBe(true);
      expect(next?.pendingAction).toBeUndefined();
    }
  });

  it("mid-round states never advertise command entry", () => {
    for (const snapshot of [
      stuActions,
      riasActions,
      zingActions,
      jakiActions,
      allActionsSelected,
      allFightActions,
      riasAttacking,
    ]) {
      const state = readFF1StateFromSaveState(asState(snapshot));
      expect(state.battle.commandEntryAvailable).toBe(false);
      expect(state.battle.roundExecuting).toBe(true);
    }
  });

  it("liveness corroborates HP and KO/Stone ailments", () => {
    const state = readFF1StateFromSaveState(asState(battleStart));
    expect(state.battle.party.map((m) => m.alive)).toEqual([true, true, true, true]);
    // Queued actions are visible per member during the round.
    const queued = readFF1StateFromSaveState(asState(allActionsSelected));
    expect(queued.battle.party.filter((m) => m.pendingAction !== undefined).length).toBe(4);
    expect(queued.battle.party.every((m) => !m.canAct)).toBe(true);
  });
});
