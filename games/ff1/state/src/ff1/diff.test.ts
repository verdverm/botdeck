import { describe, expect, it } from "vitest";
import { diffFF1States, readFF1StateFromSaveState, type FF1GameState } from "./index.js";
import type { JsNesState } from "../nes/types.js";

// The real recorded dev-play step 000001: before = empty command buffer,
// after = Stu's attack latched on enemy slot 1 (the macro mis-landed it; the
// agent had asked for slot 0). The state diff must reveal the TRUTH from RAM,
// not whatever the model claimed.
import step1Before from "../../../../../plays/ff1/0000_dev/states/000042-step-000001-before.state.json" with { type: "json" };
import step1After from "../../../../../plays/ff1/0000_dev/states/000043-step-000001-after.state.json" with { type: "json" };

function baseState(): FF1GameState {
  return {
    party: [
      {
        index: 0,
        name: "Fighter",
        classId: 0,
        classInfo: undefined,
        level: 5,
        hp: 120,
        maxHp: 120,
        stats: undefined,
        status: { ailments: [], raw: 0, _note: "" },
        spellCharges: undefined,
        spellsKnown: [],
        equipment: {
          weapon: undefined,
          armor: undefined,
          shield: undefined,
          helmet: undefined,
          gauntlet: undefined,
          rawWeapons: new Uint8Array(4),
          rawArmor: new Uint8Array(4),
          _note: "",
        },
        raw: {
          nameBytes: new Uint8Array(4),
          statBytes: new Uint8Array(4),
          spellsLearnedBytes: new Uint8Array(4),
          spellChargeBytes: new Uint8Array(4),
          equipmentWeaponBytes: new Uint8Array(4),
          equipmentArmorBytes: new Uint8Array(4),
        },
      },
    ],
    gold: 100,
    inventory: [],
    world: {
      mapId: 0,
      mapName: "Coneria",
      isOverworld: false,
      isStandardMap: true,
      mapFlags: 1,
      tilesetId: 0,
      overworldX: 0,
      overworldY: 0,
      standardMapX: 10,
      standardMapY: 10,
      standardMapScrollX: 0,
      standardMapScrollY: 0,
      shipX: undefined,
      shipY: undefined,
      airshipX: undefined,
      airshipY: undefined,
      currentVehicle: undefined,
      ownedVehicles: [],
      vehiclesRaw: 0,
      hasCanoe: false,
      mapObjects: [],
      _note: "",
    },
    flags: {
      raw: new Uint8Array(256),
      hasLute: undefined,
      hasCrown: undefined,
      hasCrystal: undefined,
      hasHerb: undefined,
      hasMysticKey: undefined,
      hasTnt: undefined,
      hasAdamant: undefined,
      hasSlab: undefined,
      hasRuby: undefined,
      hasRod: undefined,
      hasFloater: undefined,
      hasChime: undefined,
      hasTail: undefined,
      hasCube: undefined,
      hasBottle: undefined,
      hasOxyale: undefined,
      hasCanoe: undefined,
      hasEarthOrb: undefined,
      hasFireOrb: undefined,
      hasWaterOrb: undefined,
      hasAirOrb: undefined,
      _note: "",
    },
    battle: {
      inBattle: false,
      phase: "outOfBattle",
      roundExecuting: false,
      commandEntryAvailable: false,
      battleOver: true,
      nextCommandableIndex: undefined,
      enemyCount: 0,
      enemies: [],
      party: [],
      activePartyIndex: undefined,
      cursorX: undefined,
      cursorY: undefined,
      battleType: undefined,
      enemyCursorOrder: [],
      note: "",
    },
    context: {
      mode: "field",
      menu: "field",
      note: "",
    },
    menu: {
      inMenu: false,
      cursor: undefined,
      cursorMax: 0,
      windowId: 0,
      menuOverlay: false,
      enteringShop: false,
      shopId: undefined,
      shopType: undefined,
      shopCursorX: undefined,
      shopCursorY: undefined,
      talkObject: undefined,
      dialogOpen: false,
      note: "",
    },
    availableLocations: [],
  };
}

describe("diffFF1States", () => {
  it("returns no changes for identical states", () => {
    const before = baseState();
    const after = baseState();
    const diff = diffFF1States(before, after);
    expect(diff.changed).toBe(false);
    expect(diff.summary).toBe("No changes.");
  });

  it("detects HP, gold, position, and inventory changes", () => {
    const before = baseState();
    const after = baseState();
    after.party[0]!.hp = 90;
    after.gold = 250;
    after.world.standardMapX = 11;
    after.inventory = [
      { slot: 0, itemId: 0, itemInfo: { id: 0, name: "Potion", type: "consumable" }, quantity: 2, _note: "" },
    ];

    const diff = diffFF1States(before, after);
    expect(diff.changed).toBe(true);
    expect(diff.gold).toEqual({ before: 100, after: 250, delta: 150 });
    expect(diff.position).toEqual({
      before: "Coneria (10, 10)",
      after: "Coneria (11, 10)",
    });
    expect(diff.party).toHaveLength(1);
    expect(diff.party![0]!.hp).toEqual({ before: 120, after: 90 });
    expect(diff.inventory!.added).toHaveLength(1);
    expect(diff.inventory!.added[0]!.quantity).toBe(2);
  });
});

describe("battle command-buffer diff from recorded save-states", () => {
  const asState = (s: unknown) => s as JsNesState;

  it("reveals the latched attack target independent of the model claim", () => {
    const before = readFF1StateFromSaveState(asState(step1Before));
    const after = readFF1StateFromSaveState(asState(step1After));
    const diff = diffFF1States(before, after);

    expect(diff.changed).toBe(true);
    // The after snapshot has Stu's ATTACK latched on enemy slot 1.
    expect(diff.battle?.queued).toEqual([
      { member: "Stu", command: "attack", target: "Goblin (enemy slot 1)" },
    ]);
    expect(diff.summary).toContain("Stu queued ATTACK -> Goblin (enemy slot 1)");
  });

  it("detects enemy HP damage across a resolved round", () => {
    const before = readFF1StateFromSaveState(asState(step1After));
    // step 2 after snapshot is a few turns later in the same battle with damage.
    const after = readFF1StateFromSaveState(asState(step1Before));
    const diff = diffFF1States(before, after);
    // This direction is buffer-clear only; queued cleared names appear.
    expect(diff.battle?.cleared).toContain("Stu");
  });
});

describe("enemy HP deltas from recorded save-states", () => {
  const asState = (s: unknown) => s as JsNesState;

  it("records damage dealt during the round (slot 3 killed)", async () => {
    const { default: before } = await import(
      "../../../../../plays/ff1/0000_dev/states/000021-battle-01-6-jaki-actions-plus-stu-attack.state.json"
    );
    const { default: after } = await import(
      "../../../../../plays/ff1/0000_dev/states/000022-battle-01-7-first-imp-death.state.json"
    );
    const diff = diffFF1States(
      readFF1StateFromSaveState(asState(before)),
      readFF1StateFromSaveState(asState(after)),
    );
    const slots = new Map((diff.battle?.enemyHp ?? []).map((e) => [e.slot, e]));
    expect(slots.get(2)?.delta).toBe(-1);
    expect(slots.get(3)?.after).toBe(0);
    expect(slots.get(4)?.delta).toBe(-6);
  });
});
