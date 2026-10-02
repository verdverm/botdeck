import { describe, expect, it } from "vitest";
import { createCpuMemoryView } from "../nes/memory.js";
import { readFF1State, type FF1GameState } from "./index.js";

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

  it("detects battle when the placeholder battle flag is set", () => {
    const mem = new Uint8Array(0x10000);
    mem[0x6a00] = 1;
    mem[0x6a01] = 3;
    mem[0x6a80] = 1;
    const view = createCpuMemoryView(mem);
    const state = readFF1State(view);

    expect(state.battle.inBattle).toBe(true);
    expect(state.battle.enemyCount).toBe(3);
    expect(state.battle.enemies).toHaveLength(3);
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
});

// Minimal shape assertion to keep this test file self-contained.
function assertStateShape(state: FF1GameState) {
  expect(state.context).toBeDefined();
  expect(state.availableLocations).toBeDefined();
}

describe("FF1GameState shape", () => {
  it("includes context and availableLocations", () => {
    const mem = new Uint8Array(0x10000);
    const view = createCpuMemoryView(mem);
    assertStateShape(readFF1State(view));
  });
});
