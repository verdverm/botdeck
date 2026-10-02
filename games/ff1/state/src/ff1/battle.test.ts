import { describe, expect, it } from "vitest";
import { createCpuMemoryView } from "../nes/memory.js";
import type { JsNesState } from "../nes/types.js";
import { readFF1State, readFF1StateFromSaveState, type FF1GameState } from "./index.js";

// Known-good save states collected during live play.
import battleStart from "../../../../../plays/ff1/0000_dev/states/000016-start-06-1-battle-start.state.json" with { type: "json" };
import battleExit from "../../../../../plays/ff1/0000_dev/states/000034-battle-05-4-battle-exit-back-on-map.state.json" with { type: "json" };
import weaponShop from "../../../../../plays/ff1/0000_dev/states/000003-start-03-1-weapon-shop.state.json" with { type: "json" };
import itemShop from "../../../../../plays/ff1/0000_dev/states/000007-start-03-5-item-shop.state.json" with { type: "json" };
import clinic from "../../../../../plays/ff1/0000_dev/states/000008-start-03-6-clinic.state.json" with { type: "json" };
import inn from "../../../../../plays/ff1/0000_dev/states/000009-start-03-7-inn.state.json" with { type: "json" };
import innExit from "../../../../../plays/ff1/0000_dev/states/000040-post-battle-01-6-exit-inn.state.json" with { type: "json" };

describe("readFF1State battle and context shape", () => {
  it("populates battle fields even when not in battle", () => {
    const mem = new Uint8Array(0x10000);
    const view = createCpuMemoryView(mem);
    const state = readFF1State(view);

    expect(state.battle.inBattle).toBe(false);
    expect(state.battle.enemies).toEqual([]);
    expect(state.battle.party).toHaveLength(4);
    expect(state.battle.activePartyIndex).toBeUndefined();
  });

  it("detects battle and reads the live enemy roster", () => {
    const mem = new Uint8Array(0x10000);
    mem[0x6b86] = 0; // btl_result == 0 means battle is active
    mem[0x6c93] = 3; // btl_enemycount
    mem[0x6b7a] = 1; // btlcmd_curchar
    // Three enemy stat records at $6BD3 + slot * $14; enemy ID is at +$11.
    mem[0x6bd3 + 0 * 0x14 + 0x11] = 0x00; // Goblin
    mem[0x6bd3 + 1 * 0x14 + 0x11] = 0x01; // Goblin Guard
    mem[0x6bd3 + 2 * 0x14 + 0x11] = 0x02; // Wolf
    const view = createCpuMemoryView(mem);
    const state = readFF1State(view);

    expect(state.battle.inBattle).toBe(true);
    expect(state.battle.enemyCount).toBe(3);
    expect(state.battle.enemies).toHaveLength(3);
    expect(state.battle.enemies.map((e) => e.name)).toEqual(["Goblin", "Goblin Guard", "Wolf"]);
    expect(state.battle.activePartyIndex).toBe(1);
  });

  it("returns available locations for the overworld", () => {
    const mem = new Uint8Array(0x10000);
    const view = createCpuMemoryView(mem);
    const state = readFF1State(view);

    expect(state.world.isOverworld).toBe(true);
    const ids = state.availableLocations.map((loc) => loc.id);
    expect(ids).toContain("coneria");
    expect(ids).toContain("temple_of_fiends");
  });

  it("returns Coneria locations inside Coneria", () => {
    const mem = new Uint8Array(0x10000);
    mem[0x002d] = 0x01;
    mem[0x0048] = 0x00;
    const view = createCpuMemoryView(mem);
    const state = readFF1State(view);

    expect(state.world.isStandardMap).toBe(true);
    const ids = state.availableLocations.map((loc) => loc.id);
    expect(ids).toContain("coneria_inn");
    expect(ids).toContain("coneria_weapon_shop");
    expect(ids).toContain("coneria_castle_exit");
  });

  it("classifies the context menu by standard map type", () => {
    const mem = new Uint8Array(0x10000);
    mem[0x002d] = 0x01;
    mem[0x0048] = 0x00;
    const view = createCpuMemoryView(mem);
    expect(readFF1State(view).context.menu).toBe("town");

    mem[0x0048] = 0x08;
    expect(readFF1State(view).context.menu).toBe("castle");

    mem[0x0048] = 0x0c;
    expect(readFF1State(view).context.menu).toBe("dungeon");
  });

  it("detects shop, inn, and clinic contexts from live RAM", () => {
    const mem = new Uint8Array(0x10000);
    mem[0x002d] = 0x01;
    mem[0x0048] = 0x00;
    mem[0x0050] = 1; // entering_shop
    const view = createCpuMemoryView(mem);

    mem[0x0051] = 0; // shop_id
    mem[0x0066] = 0; // weapon shop
    expect(readFF1State(view).context.menu).toBe("shop");
    expect(readFF1State(view).context.shopType).toBe("weapon");

    mem[0x0066] = 5; // inn
    expect(readFF1State(view).context.menu).toBe("inn");

    mem[0x0066] = 4; // clinic
    expect(readFF1State(view).context.menu).toBe("clinic");
  });
});

// Minimal shape assertion to keep this test file self-contained.
function assertStateShape(state: FF1GameState) {
  expect(state.context).toBeDefined();
  expect(state.menu).toBeDefined();
  expect(state.availableLocations).toBeDefined();
}

describe("FF1GameState shape", () => {
  it("includes context and availableLocations", () => {
    const mem = new Uint8Array(0x10000);
    const view = createCpuMemoryView(mem);
    assertStateShape(readFF1State(view));
  });
});

describe("saved-state fixtures", () => {
  it("detects the end-of-battle state as not in battle", () => {
    const state = readFF1StateFromSaveState(battleExit as unknown as JsNesState);
    expect(state.battle.inBattle).toBe(false);
    expect(state.battle.enemies).toHaveLength(0);
    expect(state.menu.enteringShop).toBe(false);
  });

  it("detects an in-battle state and reads the enemy roster", () => {
    const state = readFF1StateFromSaveState(battleStart as unknown as JsNesState);
    expect(state.battle.inBattle).toBe(true);
    expect(state.battle.enemyCount).toBe(5);
    expect(state.battle.enemies).toHaveLength(5);
    expect(state.battle.enemies.every((e) => e.name === "Goblin")).toBe(true);
  });

  it("classifies shop/inn/clinic contexts from live save states", () => {
    const weapon = readFF1StateFromSaveState(weaponShop as unknown as JsNesState);
    expect(weapon.context.menu).toBe("shop");
    expect(weapon.context.shopType).toBe("weapon");
    expect(weapon.menu.enteringShop).toBe(true);

    const item = readFF1StateFromSaveState(itemShop as unknown as JsNesState);
    expect(item.context.menu).toBe("shop");
    expect(item.context.shopType).toBe("item");

    const clinicState = readFF1StateFromSaveState(clinic as unknown as JsNesState);
    expect(clinicState.context.menu).toBe("clinic");
    expect(clinicState.context.shopType).toBe("clinic");

    const innState = readFF1StateFromSaveState(inn as unknown as JsNesState);
    expect(innState.context.menu).toBe("inn");
    expect(innState.context.shopType).toBe("inn");
  });

  it("clears shop mode after leaving the inn", () => {
    const state = readFF1StateFromSaveState(innExit as unknown as JsNesState);
    expect(state.context.menu).toBe("town");
    expect(state.menu.enteringShop).toBe(false);
    expect(state.context.shopType).toBeUndefined();
  });

  it("reads shop cursor X/Y from $64/$65", () => {
    const mem = new Uint8Array(0x10000);
    mem[0x002d] = 0x01; // standard map
    mem[0x0048] = 0x00; // Coneria
    mem[0x0050] = 1; // entering_shop
    mem[0x0051] = 0; // shop_id
    mem[0x0066] = 0; // weapon shop
    mem[0x0064] = 4; // shop cursor X
    mem[0x0065] = 3; // shop cursor Y
    const view = createCpuMemoryView(mem);
    const state = readFF1State(view);
    expect(state.menu.shopCursorX).toBe(4);
    expect(state.menu.shopCursorY).toBe(3);
  });
});
