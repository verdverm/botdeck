import { describe, expect, it, vi } from "vitest";
import { FF1GamePlugin } from "./ff1";
import type { Emulator } from "@/emulator/emulator";
import type { FF1GameState } from "@games/ff1-state";

function makeEmulator(): Emulator {
  return {
    getMemory: vi.fn(() => new Uint8Array(0x10000)),
    getRomName: vi.fn(() => "ff1"),
    isRunning: vi.fn(() => true),
    isPlayingMacro: vi.fn(() => false),
  } as unknown as Emulator;
}

function baseState(context: "field" | "battle" | "menu" = "field", menu: string = "field"): Record<string, unknown> {
  return {
    ff1: {
      context: { mode: context, menu },
      battle: {
        inBattle: context === "battle",
        enemyCount: context === "battle" ? 2 : 0,
        enemies: context === "battle" ? [{ slot: 0, name: "enemy_1" }] : [],
        party: [
          { index: 0, name: "Stu", canAct: true },
          { index: 1, name: "Rias", canAct: true },
          { index: 2, name: "Zing", canAct: true },
          { index: 3, name: "Jaki", canAct: true },
        ],
        activePartyIndex: 0,
      },
      availableLocations: context === "battle"
        ? []
        : [{ id: "coneria_inn", name: "Coneria Inn", type: "inn" }],
    } as unknown as FF1GameState,
  };
}

describe("FF1GamePlugin", () => {
  it("advertises field commands on the field", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const options = plugin.availableCommands(baseState("field"));
    const names = options.map((o) => o.name);

    expect(names).toContain("goto");
    expect(names).toContain("talk_to");
    expect(names).toContain("interact");
    expect(names).not.toContain("move");
    expect(names).not.toContain("enter_shop");
    expect(names).not.toContain("heal_at_inn");
    expect(names).not.toContain("fight");
  });

  it("advertises battle commands in battle", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const options = plugin.availableCommands(baseState("battle", "battle"));
    const names = options.map((o) => o.name);

    expect(names).toContain("fight");
    expect(names).toContain("magic");
    expect(names).toContain("use_item");
    expect(names).toContain("run");
    expect(names).not.toContain("goto");
    expect(names).not.toContain("talk_to");
  });

  it("advertises menu actions when in a shop", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const options = plugin.availableCommands(baseState("menu", "shop"));
    const names = options.map((o) => o.name);

    expect(names).toContain("buy");
    expect(names).toContain("sell");
    expect(names).not.toContain("stay");
  });

  it("advertises inn stay when at an inn", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const options = plugin.availableCommands(baseState("menu", "inn"));
    const names = options.map((o) => o.name);

    expect(names).toContain("stay");
    expect(names).not.toContain("buy");
    expect(names).not.toContain("sell");
  });

  it("compiles goto to a single A press (first pass)", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const macro = plugin.compile({ name: "goto", args: { location: "coneria_inn" } });

    expect(macro).toHaveLength(1);
    expect(macro[0]?.button).toBe(0);
  });

  it("compiles battle actions to a stub sequence", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const macro = plugin.compile({ name: "fight", args: { actor: "Stu", target: "enemy_1" } });

    expect(macro.length).toBeGreaterThan(0);
  });
});
