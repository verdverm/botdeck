import { describe, expect, it } from "vitest";
import { formatFF1GameInfo } from "./format.js";
import type { FF1GameState } from "./types.js";

function makeState(overrides: Partial<FF1GameState> = {}): FF1GameState {
  return {
    party: [
      { index: 0, name: "Stu", classId: 0, level: 1, hp: 35, maxHp: 35, equipment: {} } as unknown as FF1GameState["party"][0],
      { index: 1, name: "Rias", classId: 1, level: 1, hp: 28, maxHp: 28, equipment: {} } as unknown as FF1GameState["party"][0],
      { index: 2, name: "Zing", classId: 2, level: 1, hp: 20, maxHp: 20, equipment: {} } as unknown as FF1GameState["party"][0],
      { index: 3, name: "Jaki", classId: 3, level: 1, hp: 25, maxHp: 25, equipment: {} } as unknown as FF1GameState["party"][0],
    ],
    gold: 0,
    inventory: [],
    world: {
      mapId: 0,
      mapName: "World Map",
      isOverworld: true,
      isStandardMap: false,
      mapFlags: 0,
      tilesetId: 0,
      overworldX: 0,
      overworldY: 0,
      standardMapX: 0,
      standardMapY: 0,
      standardMapScrollX: 0,
      standardMapScrollY: 0,
      ownedVehicles: [],
      vehiclesRaw: 0,
      hasCanoe: false,
      mapObjects: [],
      _note: "",
    },
    flags: {
      raw: new Uint8Array(0),
      _note: "",
    },
    battle: {
      inBattle: true,
      enemyCount: 2,
      enemies: [
        { slot: 0, id: 0, name: "Goblin", hp: 10, maxHp: undefined, alive: true, position: { row: 0, col: 0 } },
        { slot: 1, id: 1, name: "Wolf", hp: 15, maxHp: undefined, alive: true, position: { row: 0, col: 1 } },
      ],
      party: [
        { index: 0, name: "Stu", alive: true, canAct: false, pendingAction: { command: "attack", target: { kind: "enemy", slot: 1 } }, position: { row: 0, col: 0 } },
        { index: 1, name: "Rias", alive: true, canAct: true, pendingAction: undefined, position: { row: 0, col: 1 } },
        { index: 2, name: "Zing", alive: true, canAct: false, pendingAction: { command: "magic", effect: 4, target: { kind: "all_enemies" } }, position: { row: 1, col: 0 } },
        { index: 3, name: "Jaki", alive: true, canAct: false, pendingAction: { command: "drink", item: 3, target: { kind: "player", slot: 0 } }, position: { row: 1, col: 1 } },
      ],
      phase: "roundExecuting",
      roundExecuting: true,
      commandEntryAvailable: false,
      battleOver: false,
      nextCommandableIndex: undefined,
      activePartyIndex: 1,
      note: "",
    },
    context: { mode: "battle", menu: "battle", note: "" },
    menu: { inMenu: false, cursorMax: 0, windowId: 0, menuOverlay: false, enteringShop: false, dialogOpen: false, note: "" },
    availableLocations: [],
    ...overrides,
  } as FF1GameState;
}

describe("formatFF1GameInfo battle section", () => {
  it("shows queued attack actions with enemy target", () => {
    const info = formatFF1GameInfo(makeState());
    expect(info).toContain("Stu: alive, cannot act");
    expect(info).toContain("[queued: ATTACK -> Wolf (slot 1)]");
  });

  it("shows queued magic actions with spell and target", () => {
    const info = formatFF1GameInfo(makeState());
    expect(info).toContain("Zing: alive, cannot act");
    expect(info).toContain("[queued: MAGIC FIRE -> all enemies]");
  });

  it("shows queued drink/item actions with consumable and ally target", () => {
    const info = formatFF1GameInfo(makeState());
    expect(info).toContain("Jaki: alive, cannot act");
    expect(info).toContain("[queued: DRINK Potion -> Stu (slot 0)]");
  });

  it("omits queued action text when a member has no pending action", () => {
    const info = formatFF1GameInfo(makeState());
    expect(info).toContain("Rias: alive, can act");
    expect(info).not.toMatch(/Rias:.*queued/);
  });

  it("surfaces the derived battle phase", () => {
    const info = formatFF1GameInfo(makeState());
    expect(info).toContain("ROUND EXECUTING");
  });

  it("keeps dead markers on enemies while showing queued actions", () => {
    const state = makeState();
    state.battle.enemies[0]!.alive = false;
    const info = formatFF1GameInfo(state);
    expect(info).toContain("Goblin (slot 0, HP 10) [DEAD]");
    expect(info).toContain("[queued: ATTACK -> Wolf (slot 1)]");
  });
});
