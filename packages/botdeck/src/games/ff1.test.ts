import { describe, expect, it, vi } from "vitest";
import { FF1GamePlugin } from "./ff1";
import { NES_BUTTONS } from "@/types";
import type { Emulator } from "@/emulator/emulator";
import { ADDR_DIALOG_OPEN } from "@games/ff1-state";
import type { FF1GameState } from "@games/ff1-state";

function makeNametable(): { data: Uint8Array; width: number; height: number } {
  return { data: new Uint8Array(64 * 64).fill(0xff), width: 64, height: 64 };
}

function makeEmulator(): Emulator {
  return {
    getMemory: vi.fn(() => new Uint8Array(0x10000)),
    getNametable: vi.fn(() => makeNametable()),
    getRomName: vi.fn(() => "ff1"),
    isRunning: vi.fn(() => true),
    isPlayingMacro: vi.fn(() => false),
  } as unknown as Emulator;
}

function baseState(context: "field" | "battle" | "menu" = "field", menu: string = "field", cursor = 0): Record<string, unknown> {
  const battleParty = [
    { index: 0, name: "Stu", canAct: true, position: { row: 0, col: 0 } },
    { index: 1, name: "Rias", canAct: true, position: { row: 0, col: 1 } },
    { index: 2, name: "Zing", canAct: true, position: { row: 1, col: 0 } },
    { index: 3, name: "Jaki", canAct: true, position: { row: 1, col: 1 } },
  ];
  return {
    ff1: {
      context: { mode: context, menu },
      menu: { cursor },
      party: battleParty.map((m) => ({ ...m, classId: 0, classInfo: undefined, equipment: {} })),
      battle: {
        inBattle: context === "battle",
        enemyCount: context === "battle" ? 2 : 0,
        enemies: context === "battle" ? [{ slot: 0, name: "enemy_1", position: { row: 0, col: 0 } }] : [],
        party: battleParty,
        activePartyIndex: 0,
        cursorX: undefined,
        cursorY: undefined,
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
    expect(names).not.toContain("fight");
  });

  it("advertises battle commands in battle", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const options = plugin.availableCommands(baseState("battle", "battle"));
    const names = options.map((o) => o.name);

    expect(names).toContain("fight");
    expect(names).toContain("magic");
    expect(names).toContain("use_item");
    expect(names).toContain("equip");
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
    expect(names).toContain("menu_navigate");
    expect(names).toContain("menu_select");
    expect(names).not.toContain("stay");
  });

  it("advertises inn stay when at an inn", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const options = plugin.availableCommands(baseState("menu", "inn"));
    const names = options.map((o) => o.name);

    expect(names).toContain("stay");
    expect(names).toContain("menu_navigate");
    expect(names).not.toContain("buy");
    expect(names).not.toContain("sell");
  });

  it("advertises clinic heal when at a clinic", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const options = plugin.availableCommands(baseState("menu", "clinic"));
    const names = options.map((o) => o.name);

    expect(names).toContain("heal");
    expect(names).toContain("menu_navigate");
    expect(names).not.toContain("buy");
    expect(names).not.toContain("stay");
  });

  it("compiles press_button to the requested NES button", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const macro = plugin.compile({ name: "press_button", args: { button: "b", frames: 6 } });

    expect(macro).toHaveLength(1);
    expect(macro[0]?.button).toBe(NES_BUTTONS.B);
    expect(macro[0]?.holdFrames).toBe(6);
  });

  it("compiles goto to a single A press (first pass)", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const macro = plugin.compile({ name: "goto", args: { location: "coneria_inn" } });

    expect(macro).toHaveLength(1);
    expect(macro[0]?.button).toBe(NES_BUTTONS.A);
  });

  it("compiles menu_navigate to direction presses", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const macro = plugin.compile({ name: "menu_navigate", args: { direction: "down", steps: 3 } });

    expect(macro).toHaveLength(3);
    expect(macro.every((s) => s.button === NES_BUTTONS.DOWN)).toBe(true);
  });

  it("compiles dialog_advance with default presses", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const macro = plugin.compile({ name: "dialog_advance" });

    expect(macro).toHaveLength(3);
    expect(macro.every((s) => s.button === NES_BUTTONS.A)).toBe(true);
  });

  it("compiles menu_select and menu_cancel", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    expect(plugin.compile({ name: "menu_select" })[0]?.button).toBe(NES_BUTTONS.A);
    expect(plugin.compile({ name: "menu_cancel" })[0]?.button).toBe(NES_BUTTONS.B);
  });

  it("compiles stay and heal as confirm sequences", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    expect(plugin.compile({ name: "stay" })).toHaveLength(2);
    expect(plugin.compile({ name: "heal" })).toHaveLength(2);
  });

  it("compiles fight to menu navigation plus target confirm", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const macro = plugin.compile({ name: "fight", args: { actor: "Stu", target: "enemy_1" } });

    expect(macro.length).toBeGreaterThan(1);
    expect(macro[macro.length - 1]?.button).toBe(NES_BUTTONS.A);
  });

  it("compiles run to RUN menu entry", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const macro = plugin.compile({ name: "run", args: { actor: "Stu" } });

    // Cursor starts at 0 (FIGHT), so run (index 4) needs 4 down presses + A.
    expect(macro.length).toBeGreaterThan(1);
    expect(macro[macro.length - 1]?.button).toBe(NES_BUTTONS.A);
  });

  it("reports dialog state from the nametable when the dialog flag is set", () => {
    const emulator = makeEmulator();
    const mem = new Uint8Array(0x10000);
    mem[ADDR_DIALOG_OPEN] = 1;
    vi.mocked(emulator.getMemory).mockReturnValue(mem);

    const plugin = new FF1GamePlugin(emulator);
    plugin.resetDialogCapture();
    plugin.captureDialogFrame();
    const state = plugin.readState();

    const dialog = (state.ff1 as { dialog?: { open: boolean; pages: string[] } } | undefined)?.dialog;
    expect(dialog?.open).toBe(true);
    expect(dialog?.pages.length).toBe(0);
  });

  it("rejects buy by name because shop inventory labels are unavailable", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    expect(() => plugin.compile({ name: "buy", args: { item: "Potion" } })).toThrow("buy");
  });

  it("resolves sell and use_item by inventory name and rejects unknown names", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const state = baseState("menu", "shop");
    (state.ff1 as FF1GameState).inventory = [
      { slot: 0, itemId: 0, itemInfo: { id: 0, name: "Potion", type: "consumable" }, quantity: 3 },
      { slot: 1, itemId: 1, itemInfo: { id: 1, name: "Tent", type: "consumable" }, quantity: 2 },
    ];
    vi.spyOn(plugin, "readState").mockReturnValue(state);

    const sellMacro = plugin.compile({ name: "sell", args: { item: "Tent" } });
    expect(sellMacro.filter((s) => s.button === NES_BUTTONS.DOWN).length).toBeGreaterThanOrEqual(1);

    expect(() => plugin.compile({ name: "sell", args: { item: "Ether" } })).toThrow("sell");

    const useMacro = plugin.compile({ name: "use_item", args: { item: "Potion", target: "Stu" } });
    expect(useMacro.some((s) => s.button === NES_BUTTONS.A)).toBe(true);
    expect(() => plugin.compile({ name: "use_item", args: { item: "Ether", target: "Stu" } })).toThrow("use_item");
  });

  it("resolves magic spells by the active actor's learned spell names", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const state = baseState("battle", "battle");
    const battle = (state.ff1 as FF1GameState).battle;
    const party = (state.ff1 as FF1GameState).party;
    party[0] = {
      ...party[0]!,
      spellsKnown: [
        { id: 0, name: "FIRE", level: 1, school: "black", slot: 1 },
        { id: 1, name: "CURE", level: 1, school: "white", slot: 1 },
      ],
    };
    battle.activePartyIndex = 0;
    vi.spyOn(plugin, "readState").mockReturnValue(state);

    const macro = plugin.compile({ name: "magic", args: { actor: "Stu", spell: "CURE", target: "Stu" } });
    expect(macro.filter((s) => s.button === NES_BUTTONS.DOWN).length).toBeGreaterThanOrEqual(1);
    expect(() => plugin.compile({ name: "magic", args: { actor: "Stu", spell: "LIT", target: "Stu" } })).toThrow("magic");
  });

  it("readState contains no raw Uint8Array byte payloads", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const state = plugin.readState();

    function findUint8Arrays(value: unknown, path: string, out: string[]): void {
      if (value instanceof Uint8Array) {
        out.push(path);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((v, i) => findUint8Arrays(v, `${path}[${i}]`, out));
      } else if (typeof value === "object" && value !== null) {
        for (const [k, v] of Object.entries(value)) {
          findUint8Arrays(v, `${path}.${k}`, out);
        }
      }
    }

    const paths: string[] = [];
    findUint8Arrays(state, "state", paths);
    expect(paths).toEqual([]);

    const json = JSON.stringify(state);
    expect(json).not.toMatch(/"_rawBytes":\s*\{["0-9,:]+\}/);
    expect(json).not.toMatch(/"rawBytes":\s*\{["0-9,:]+\}/);
    expect(json).not.toMatch(/"rawWeapons":\s*\{["0-9,:]+\}/);
    expect(json).not.toMatch(/"rawArmor":\s*\{["0-9,:]+\}/);
    expect(json).not.toMatch(/"raw":\s*\{["0-9,:]+\}/);
  });
});
