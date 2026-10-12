import { describe, expect, it, vi } from "vitest";
import { FF1GamePlugin } from "./ff1";
import { OW_STEP_GAP_FRAMES, OW_STEP_HOLD_FRAMES } from "./ff1-nav";
import { NES_BUTTONS } from "@/types";
import type { Emulator } from "@/emulator/emulator";
import { ADDR_DIALOG_OPEN } from "@games/ff1-state";
import type { FF1GameState } from "@games/ff1-state";

function makeNametable(): { data: Uint8Array; width: number; height: number } {
  return { data: new Uint8Array(64 * 64).fill(0xff), width: 64, height: 64 };
}

/**
 * Stub emulator with overworld RAM bytes set: $0027/$0028 scroll, so the
 * navigation compiler sees a real party position.
 */
function makeEmulator(
  scrollX?: number,
  scrollY?: number,
  options: { standardMap?: boolean; battle?: boolean; smX?: number; smY?: number } = {},
): Emulator {
  const mem = new Uint8Array(0x10000);
  if (scrollX !== undefined) mem[0x0027] = scrollX;
  if (scrollY !== undefined) mem[0x0028] = scrollY;
  // mapflags ($2D): bit 0 = standard map, bit 1 = battle screen.
  mem[0x002d] = (options.standardMap ? 0x01 : 0) | (options.battle ? 0x02 : 0);
  // SM party tile ($68/$69). The authoritative camera origin is the scroll
  // at $29/$2A; the player tile is scroll + 7. Keep all three consistent.
  if (options.smX !== undefined) {
    mem[0x0068] = options.smX;
    mem[0x0029] = (options.smX - 7) & 0x3f;
  }
  if (options.smY !== undefined) {
    mem[0x0069] = options.smY;
    mem[0x002a] = (options.smY - 7) & 0x3f;
  }
  let lastRoute: unknown = undefined;
  return {
    getMemory: vi.fn(() => mem),
    getNametable: vi.fn(() => makeNametable()),
    getRomName: vi.fn(() => "ff1"),
    isRunning: vi.fn(() => true),
    isPlayingMacro: vi.fn(() => false),
    getMacroProgress: vi.fn(() => undefined),
    wasMacroInterrupted: vi.fn(() => false),
    getLastRoute: vi.fn(() => lastRoute),
    setLastRoute: vi.fn((route: unknown) => {
      lastRoute = route;
    }),
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
        enemies: context === "battle"
          ? [
              { slot: 0, name: "Imp", alive: true, position: { row: 0, col: 0 } },
              { slot: 1, name: "Goblin", alive: true, position: { row: 0, col: 1 } },
            ]
          : [],
        enemyCursorOrder: context === "battle" ? [1, 0, 2, 4, 3, 5, 7, 6, 8] : [],
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

  it("advertises generic menu nav at an inn (no distinct mode)", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const options = plugin.availableCommands(baseState("menu", "inn"));
    const names = options.map((o) => o.name);

    expect(names).toContain("menu_navigate");
    expect(names).toContain("menu_select");
    expect(names).not.toContain("stay");
    expect(names).not.toContain("buy");
    expect(names).not.toContain("sell");
  });

  it("advertises generic menu nav at a clinic (no distinct mode)", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const options = plugin.availableCommands(baseState("menu", "clinic"));
    const names = options.map((o) => o.name);

    expect(names).toContain("menu_navigate");
    expect(names).toContain("menu_select");
    expect(names).not.toContain("heal");
    expect(names).not.toContain("buy");
    expect(names).not.toContain("stay");
  });

  it("does not advertise menu navigation while walking on the field", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    for (const menu of ["field", "town", "castle", "dungeon"]) {
      const options = plugin.availableCommands(baseState("field", menu));
      const names = options.map((o) => o.name);
      expect(names).toContain("goto");
      expect(names).toContain("talk_to");
      expect(names).not.toContain("menu_navigate");
      expect(names).not.toContain("dialog_advance");
    }
  });

  it("does not advertise field commands while in a menu or dialog", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    for (const menu of ["main_menu", "shop", "inn", "clinic", "dialog"]) {
      const options = plugin.availableCommands(baseState(menu === "dialog" ? "field" : "menu", menu));
      const names = options.map((o) => o.name);
      expect(names).toContain("menu_navigate");
      expect(names).not.toContain("goto");
      expect(names).not.toContain("grind");
      expect(names).not.toContain("talk_to");
    }
  });

  it("compiles press_button to the requested NES button", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const macro = plugin.compile({ name: "press_button", args: { button: "b", frames: 6 } });

    expect(macro).toHaveLength(1);
    expect(macro[0]?.button).toBe(NES_BUTTONS.B);
    expect(macro[0]?.holdFrames).toBe(6);
  });

  it("aborts a goto macro when the mapflags byte changes (battle, entrance, exit)", () => {
    const mem = new Uint8Array(0x10000);
    mem[0x0027] = 146;
    mem[0x0028] = 158;
    const emulator = makeEmulator(146, 158);
    vi.mocked(emulator.getMemory).mockReturnValue(mem);
    const plugin = new FF1GamePlugin(emulator);

    // Stale battle RAM from an earlier battle: btl_result and enemy data stay
    // nonzero on the overworld. The predicate must ignore it - only the
    // mapflags byte decides.
    mem[0x6b86] = 0x01; // btl_result leftover
    mem[0x6c93] = 0x05; // enemy count leftover
    mem[0x6bd3 + 0x02] = 0x01; // enemy HP leftover

    const abort = plugin.macroAbort!({ name: "goto", args: { location: "Coneria" } });
    expect(abort).toBeDefined();
    // Overworld walking (flags=0): no abort despite the stale battle bytes.
    expect(abort!()).toBe(false);

    mem[0x002d] = 0x02; // transition: battle swirl or map entrance/exit
    expect(abort!()).toBe(true);

    mem[0x002d] = 0x01; // settled inside a standard map
    expect(abort!()).toBe(true);

    mem[0x002d] = 0x00; // back to the initial value: no abort
    expect(abort!()).toBe(false);
  });

  it("aborts an in-town goto when the party leaves the standard map", () => {
    const mem = new Uint8Array(0x10000);
    mem[0x002d] = 0x01; // inside a standard map
    const emulator = makeEmulator(146, 158);
    vi.mocked(emulator.getMemory).mockReturnValue(mem);
    const plugin = new FF1GamePlugin(emulator);

    const abort = plugin.macroAbort!({ name: "goto", args: { location: "exit" } });
    // Walking around town: flags stay 1, no abort.
    expect(abort!()).toBe(false);
    // Exit teleport or dungeon battle: the byte moves through 2.
    mem[0x002d] = 0x02;
    expect(abort!()).toBe(true);
  });

  it("does not abort macros that are not travel", () => {
    const plugin = new FF1GamePlugin(makeEmulator(146, 158));
    expect(plugin.macroAbort!({ name: "interact" })).toBeUndefined();
  });

  it("lists only locations the party can actually reach, with entrances", () => {
    const state = new FF1GamePlugin(makeEmulator(146, 158)).readState();
    const ff1 = state.ff1 as { availableLocations: { name: string; position?: { x: number; y: number } }[] };
    const names = ff1.availableLocations.map((l) => l.name);

    // Reachable on foot from the Corneria area.
    expect(names).toContain("Coneria");
    expect(names).toContain("Temple of Fiends");
    // Gaia is on an island in the north-west: no foot route from Corneria.
    expect(names).not.toContain("Gaia");
    // Every offered destination carries a real entrance coordinate.
    for (const loc of ff1.availableLocations) expect(loc.position).toBeDefined();
  });

  it("compiles goto into one d-pad press per tile", () => {
    // Scroll (146,158) is the recorded dev-start position just outside
    // Coneria; the party tile is scroll + 7.
    const plugin = new FF1GamePlugin(makeEmulator(146, 158));
    const macro = plugin.compile({ name: "goto", args: { location: "Coneria" } });

    const plan = plugin.getLastRoute()!;
    expect(plan.location.name).toBe("Coneria");
    // The goal is whichever of the location's doors is nearest the party.
    expect(plan.location.warpTiles.map(([x, y]) => `${x},${y}`)).toContain(`${plan.goal.x},${plan.goal.y}`);

    expect(macro.length).toBe(plan.tiles);
    for (const step of macro) {
      // Travel is direction presses only, never an A press.
      expect([NES_BUTTONS.UP, NES_BUTTONS.DOWN, NES_BUTTONS.LEFT, NES_BUTTONS.RIGHT]).toContain(step.button);
      expect(step.holdFrames).toBe(OW_STEP_HOLD_FRAMES);
      expect(step.gapFrames).toBe(OW_STEP_GAP_FRAMES);
    }
  });

  it("fails goto loudly for an unknown location", () => {
    const plugin = new FF1GamePlugin(makeEmulator(146, 158));
    expect(() => plugin.compile({ name: "goto", args: { location: "coneria_inn" } })).toThrow(/unknown location/);
  });

  it("fails goto loudly when a standard-map doorway name is unknown", () => {
    const plugin = new FF1GamePlugin(makeEmulator(146, 158, { standardMap: true, smX: 12, smY: 6 }));
    expect(() => plugin.compile({ name: "goto", args: { location: "coneria_inn" } })).toThrow(/no such doorway/);
  });

  it("compiles goto inside a town to the nearest exit doorway", () => {
    // In a town goto exits via the out-of-map warp void; SM coords (12,6) is
    // a walkable town tile (the fountain/promenade plaza). SM coords (0,0)
    // would be a wall tile, which is exactly the case the throw covers.
    const plugin = new FF1GamePlugin(makeEmulator(146, 158, { standardMap: true, smX: 12, smY: 6 }));
    const macro = plugin.compile({ name: "goto", args: { location: "exit" } });
    const plan = plugin.getLastRoute()!;
    expect(plan.mapId).toBe(0);
    expect(macro.length).toBe(plan.tiles);
    expect(macro.length).toBeGreaterThan(0);
    for (const step of macro) {
      expect([NES_BUTTONS.UP, NES_BUTTONS.DOWN, NES_BUTTONS.LEFT, NES_BUTTONS.RIGHT]).toContain(step.button);
    }
  });

  it("compiles grind to the approach route plus a random walk", () => {
    const plugin = new FF1GamePlugin(makeEmulator(146, 158));
    const macro = plugin.compile({ name: "grind", args: { x: 154, y: 162, distance: 3 } });
    expect(macro.length).toBeGreaterThan(0);
    for (const step of macro) {
      expect([NES_BUTTONS.UP, NES_BUTTONS.DOWN, NES_BUTTONS.LEFT, NES_BUTTONS.RIGHT]).toContain(step.button);
    }
  });

  it("fails grind loudly on bad args", () => {
    const plugin = new FF1GamePlugin(makeEmulator(146, 158));
    expect(() => plugin.compile({ name: "grind", args: { x: 10, y: 10 } })).toThrow(/distance/);
  });

  it("compiles grind inside a standard map to the SM path plus random walk", () => {
    const plugin = new FF1GamePlugin(makeEmulator(146, 158, { standardMap: true, smX: 12, smY: 6 }));
    const macro = plugin.compile({ name: "grind", args: { x: 12, y: 14, distance: 3 } });
    expect(macro.length).toBeGreaterThan(0);
    for (const step of macro) {
      expect([NES_BUTTONS.UP, NES_BUTTONS.DOWN, NES_BUTTONS.LEFT, NES_BUTTONS.RIGHT]).toContain(step.button);
    }
    const plan = plugin.getLastRoute()!;
    expect(plan.mapId).toBe(0);
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

  it("returns no macro for the removed stay/heal commands", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    expect(plugin.compile({ name: "stay" })).toHaveLength(0);
    expect(plugin.compile({ name: "heal" })).toHaveLength(0);
  });

  it("compiles fight to menu navigation plus linear target-cursor navigation", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    vi.spyOn(plugin, "readState").mockReturnValue(baseState("battle", "battle"));

    // enemyCursorOrder = [1,0,...]: cursor enters on slot 1 (the first stop),
    // so targeting slot 1 needs zero target-cursor DOWN presses, then confirm.
    const macro = plugin.compile({ name: "fight", args: { actor: "Stu", target: "Goblin (slot 1)" } });
    expect(macro.filter((s) => s.button === NES_BUTTONS.DOWN)).toHaveLength(0);
    expect(macro[macro.length - 1]?.button).toBe(NES_BUTTONS.A);
    expect(macro.some((s) => s.button === NES_BUTTONS.LEFT)).toBe(false);

    const toSlot0 = plugin.compile({ name: "fight", args: { actor: "Stu", target: "Imp (slot 0)" } });
    // menu DOWN (to MAGIC index would be wrong for fight) - fight is menu index 0,
    // so the only DOWN presses are the target-cursor presses: slot0 = 1 stop past slot1.
    expect(toSlot0.filter((s) => s.button === NES_BUTTONS.DOWN).length).toBe(1);
  });

  it("off-by-one regression: targeting 'slot 0' lands on enemy slot 0, not slot 1", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    vi.spyOn(plugin, "readState").mockReturnValue(baseState("battle", "battle"));
    const macro = plugin.compile({ name: "fight", args: { actor: "Stu", target: "Imp (slot 0)" } });
    expect(macro[macro.length - 1]?.button).toBe(NES_BUTTONS.A);
    // No LEFT/RIGHT (the old grid model emitted them and mis-landed the target).
    expect(macro.some((s) => s.button === NES_BUTTONS.LEFT || s.button === NES_BUTTONS.RIGHT)).toBe(false);
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

  it("compiles talk_to to walk adjacent to the NPC, face them, and press A", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const state = baseState("field", "town");
    (state.ff1 as FF1GameState).world = {
      isStandardMap: true,
      mapId: 0,
      standardMapScrollX: 5,
      standardMapScrollY: 63,
      mapObjects: [{ index: 0, id: 1, physicalX: 13, physicalY: 6 }],
    } as unknown as FF1GameState["world"];
    vi.spyOn(plugin, "readState").mockReturnValue(state);

    const macro = plugin.compile({ name: "talk_to", args: { target: "object 0" } });

    // Should walk one tile east, face east (toward the NPC), then press A.
    expect(macro.filter((s) => s.button === NES_BUTTONS.RIGHT).length).toBe(1);
    expect(macro.filter((s) => s.button === NES_BUTTONS.A).length).toBe(1);
    expect(macro.some((s) => s.button === NES_BUTTONS.LEFT)).toBe(false);
  });

  it("avoids walking through other objects when pathing to an NPC", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const state = baseState("field", "town");
    (state.ff1 as FF1GameState).world = {
      isStandardMap: true,
      mapId: 0,
      standardMapScrollX: 5,
      standardMapScrollY: 63,
      mapObjects: [
        { index: 0, id: 1, physicalX: 13, physicalY: 6 },
        { index: 1, id: 2, physicalX: 12, physicalY: 7 }, // blocks the direct south route
      ],
    } as unknown as FF1GameState["world"];
    vi.spyOn(plugin, "readState").mockReturnValue(state);

    const macro = plugin.compile({ name: "talk_to", args: { target: "object 0" } });

    // Direct route east (13,6) should still work; it does not pass through (12,7).
    expect(macro.filter((s) => s.button === NES_BUTTONS.RIGHT).length).toBe(1);
    expect(macro.filter((s) => s.button === NES_BUTTONS.A).length).toBe(1);
  });

  it("paths talk_to through a locked door when the Mystic Key is held", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const state = baseState("field", "town");
    (state.ff1 as FF1GameState).flags = { hasMysticKey: true } as unknown as FF1GameState["flags"];
    (state.ff1 as FF1GameState).world = {
      isStandardMap: true,
      mapId: 8, // Coneria Castle
      standardMapScrollX: 5, // player tile x = 12
      standardMapScrollY: 9, // player tile y = 16
      mapObjects: [{ index: 0, id: 1, physicalX: 12, physicalY: 12 }],
    } as unknown as FF1GameState["world"];
    vi.spyOn(plugin, "readState").mockReturnValue(state);

    const macro = plugin.compile({ name: "talk_to", args: { target: "object 0" } });

    // Route: up through the locked door at (12,14), stand at (12,13), face up, press A.
    expect(macro.filter((s) => s.button === NES_BUTTONS.UP).length).toBeGreaterThanOrEqual(1);
    expect(macro.filter((s) => s.button === NES_BUTTONS.A).length).toBe(1);
  });

  it("refuses talk_to through a locked door without the Mystic Key", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const state = baseState("field", "town");
    (state.ff1 as FF1GameState).flags = { hasMysticKey: false } as unknown as FF1GameState["flags"];
    (state.ff1 as FF1GameState).world = {
      isStandardMap: true,
      mapId: 8,
      standardMapScrollX: 5,
      standardMapScrollY: 9,
      mapObjects: [{ index: 0, id: 1, physicalX: 12, physicalY: 12 }],
    } as unknown as FF1GameState["world"];
    vi.spyOn(plugin, "readState").mockReturnValue(state);

    expect(() => plugin.compile({ name: "talk_to", args: { target: "object 0" } })).toThrow("talk_to: cannot reach");
  });

  it("paths talk_to through an always-open room door", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const state = baseState("field", "town");
    (state.ff1 as FF1GameState).world = {
      isStandardMap: true,
      mapId: 24, // Coneria Castle 2F
      standardMapScrollX: 5, // player tile x = 12
      standardMapScrollY: 11, // player tile y = 18
      mapObjects: [{ index: 0, id: 1, physicalX: 12, physicalY: 6 }],
    } as unknown as FF1GameState["world"];
    vi.spyOn(plugin, "readState").mockReturnValue(state);

    const macro = plugin.compile({ name: "talk_to", args: { target: "object 0" } });

    // Route: up through the doorway at (12,8), stand at (12,7), face up, press A.
    expect(macro.filter((s) => s.button === NES_BUTTONS.UP).length).toBeGreaterThanOrEqual(1);
    expect(macro.filter((s) => s.button === NES_BUTTONS.A).length).toBe(1);
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

    // CURE is the second learned spell (level 1, column 1), so the macro
    // moves right once after opening the magic menu, not down.
    const macro = plugin.compile({ name: "magic", args: { actor: "Stu", spell: "CURE", target: "Stu" } });
    expect(macro.filter((s) => s.button === NES_BUTTONS.RIGHT).length).toBe(1);
    expect(macro.filter((s) => s.button === NES_BUTTONS.DOWN).length).toBe(1); // MAGIC menu entry
    expect(() => plugin.compile({ name: "magic", args: { actor: "Stu", spell: "LIT", target: "Stu" } })).toThrow("magic");
  });

  it("navigates the magic menu grid by level and learned slot", () => {
    const plugin = new FF1GamePlugin(makeEmulator());
    const state = baseState("battle", "battle");
    const battle = (state.ff1 as FF1GameState).battle;
    const party = (state.ff1 as FF1GameState).party;
    // 3 spells per level: level 1 has FIRE/LIT/CURE, level 2 has ICE/HARM/SLOW.
    party[0] = {
      ...party[0]!,
      spellsKnown: [
        { id: 0, name: "FIRE", level: 1, school: "black", slot: 1 },
        { id: 1, name: "LIT", level: 1, school: "black", slot: 2 },
        { id: 2, name: "CURE", level: 1, school: "white", slot: 1 },
        { id: 3, name: "ICE", level: 2, school: "black", slot: 1 },
        { id: 4, name: "HARM", level: 2, school: "white", slot: 1 },
        { id: 5, name: "SLOW", level: 2, school: "white", slot: 2 },
      ],
    };
    battle.activePartyIndex = 0;
    vi.spyOn(plugin, "readState").mockReturnValue(state);

    // ICE is the first spell of level 2 -> one DOWN (past the level 1 row).
    const ice = plugin.compile({ name: "magic", args: { actor: "Stu", spell: "ICE", target: "Goblin (slot 1)" } });
    expect(ice.filter((s) => s.button === NES_BUTTONS.DOWN).length).toBe(2); // MAGIC menu entry + level 2
    expect(ice.filter((s) => s.button === NES_BUTTONS.RIGHT).length).toBe(0);

    // SLOW is the third spell of level 2 -> one DOWN, two RIGHT.
    const slow = plugin.compile({ name: "magic", args: { actor: "Stu", spell: "SLOW", target: "Goblin (slot 1)" } });
    expect(slow.filter((s) => s.button === NES_BUTTONS.DOWN).length).toBe(2);
    expect(slow.filter((s) => s.button === NES_BUTTONS.RIGHT).length).toBe(2);
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
