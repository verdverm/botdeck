import {
  NES_BUTTONS,
  type ButtonStep,
  type CommandSpec,
  type GameCommand,
  type GamePlugin,
} from "@/types";
import type { Emulator } from "@/emulator/emulator";
import {
  createCpuMemoryView,
  readFF1State,
  formatFF1GameInfo,
  ADDR_DIALOG_OPEN,
  ADDR_MAPFLAGS,
  MAPFLAG_BATTLE_SCREEN,
  MAPFLAG_STANDARD,
  FF1_DIALOG_GEOMETRY,
  decodeNametableWindow,
  type FF1GameState,
  type InventoryItem,
  type KnownLocation,
  type MenuContext,
  type DialogState,
  type SpellInfo,
  type WorldState,
} from "@games/ff1-state";
import {
  press,
  pressA,
  pressB,
  pressStart,
  pressSelect,
  navigateDirection,
  navigateVertical,
  resolveMenuIndex,
  targetCursorDownPresses,
  resolveEnemySlot,
  resolveAllySlot,
  indexFromLabel,
  HOLD_FRAMES,
  GAP_FRAMES,
} from "./ff1-menu";
import {
  gotoMacro,
  reachableNamedLocations,
  type RoutePlan,
  type Vehicle,
} from "./ff1-nav";

const MAIN_MENU_LABELS = ["ITEM", "MAGIC", "WEAPON", "ARMOR", "STATUS"];
const BATTLE_MENU_LABELS = ["FIGHT", "MAGIC", "DRINK", "EQUIP", "RUN"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively remove raw byte payloads (Uint8Array and objects that consist
 * only of Uint8Arrays, such as the party `raw` aggregate) from plugin state
 * before it is serialized into a TurnRequest. TurnRequest.state is sent to
 * vermbot and persisted in every StepRecord, so it must contain only
 * structured, human-meaningful values.
 */
function sanitizeForRequest(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForRequest);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v instanceof Uint8Array) {
        continue;
      }
      if (
        k === "raw" &&
        isPlainObject(v) &&
        Object.values(v).every((child) => child instanceof Uint8Array)
      ) {
        continue;
      }
      const cleaned = sanitizeForRequest(v);
      if (cleaned !== undefined) {
        out[k] = cleaned;
      }
    }
    return out;
  }
  return value;
}

function isInventoryItem(value: unknown): value is InventoryItem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as InventoryItem).slot === "number" &&
    typeof (value as InventoryItem).quantity === "number"
  );
}

function isConsumable(item: InventoryItem): boolean {
  return item.itemInfo?.type === "consumable" && item.quantity > 0;
}

function getMenuContext(state?: Record<string, unknown>): MenuContext {
  const ff1 = state?.ff1 as { context?: { menu?: MenuContext } } | undefined;
  return ff1?.context?.menu ?? "unknown";
}

/**
 * Travel destinations the party can actually reach right now, computed from the
 * extracted overworld grid. This replaces the reader's static guess list for the
 * overworld: only named locations with a reachable entrance are offered, so the
 * agent is never told it can walk somewhere the terrain forbids.
 */
function overworldLocations(world: WorldState): KnownLocation[] {
  const from = { x: world.overworldPlayerX, y: world.overworldPlayerY };
  const vehicle = vehicleOf(world);
  return reachableNamedLocations(from, vehicle).map((loc) => ({
    id: loc.name!.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    name: loc.name!,
    mapId: loc.destMapId,
    position: { x: loc.x, y: loc.y },
    type: locationType(loc.name!),
    reachable: "reachable" as const,
    note:
      `Overworld entrance at (${loc.x},${loc.y}); reached by A* on the extracted tile grid ` +
      `with the ${vehicle} walkability mask.`,
  }));
}

/** Classify a named destination from its name, mirroring the reader's types. */
function locationType(name: string): KnownLocation["type"] {
  if (name.toLowerCase().includes("castle")) return "castle";
  if (name.toLowerCase().includes("cave") || name.toLowerCase().includes("temple") || name.toLowerCase().includes("chaos")) {
    return "dungeon";
  }
  return "town";
}

/** The reader's world block, or undefined when no FF1 state is available. */
function getWorld(state?: Record<string, unknown>): WorldState | undefined {
  return (state?.ff1 as { world?: WorldState } | undefined)?.world;
}

/**
 * Map the reader's vehicle name onto the navigation vehicle key used by the
 * walkability masks. Anything unknown is treated as foot, the conservative
 * choice: it never plans a route the party cannot physically walk.
 */
function vehicleOf(world: WorldState): Vehicle {
  const name = (world.currentVehicle ?? "Foot").toLowerCase();
  return name === "canoe" || name === "ship" || name === "airship" ? name : "foot";
}

function isInBattle(state?: Record<string, unknown>): boolean {
  const ff1 = state?.ff1 as { battle?: { inBattle?: boolean } } | undefined;
  return ff1?.battle?.inBattle ?? false;
}

function getBattleParty(state?: Record<string, unknown>): { name: string; canAct?: boolean }[] {
  const ff1 = state?.ff1 as { battle?: { party?: { name: string; canAct?: boolean }[] } } | undefined;
  return ff1?.battle?.party ?? [];
}

function getActivePartyIndex(state?: Record<string, unknown>): number | undefined {
  const ff1 = state?.ff1 as { battle?: { activePartyIndex?: number } } | undefined;
  return ff1?.battle?.activePartyIndex;
}

function getMenuCursor(state?: Record<string, unknown>): number | undefined {
  const ff1 = state?.ff1 as { menu?: { cursor?: number } } | undefined;
  const cursor = ff1?.menu?.cursor;
  return typeof cursor === "number" ? cursor : undefined;
}

interface BattleRoster {
  enemies: { slot: number; name?: string; alive?: boolean; hp?: number }[];
  cursorOrder: number[];
  party: { index: number; name?: string; alive?: boolean }[];
}

function getBattleRoster(state?: Record<string, unknown>): BattleRoster {
  const ff1 = state?.ff1 as
    | {
        battle?: {
          enemies?: { slot: number; name?: string; alive?: boolean; hp?: number }[];
          enemyCursorOrder?: number[];
          party?: { index: number; name?: string; alive?: boolean }[];
        };
      }
    | undefined;
  const enemies = ff1?.battle?.enemies ?? [];
  const cursorOrder = ff1?.battle?.enemyCursorOrder ?? [];
  return {
    enemies,
    // Older or synthetic snapshots may not expose the ROM cursor order; fall
    // back to ascending slot order so the linear model still resolves.
    cursorOrder: cursorOrder.length > 0 ? cursorOrder : enemies.map((e) => e.slot),
    party: ff1?.battle?.party ?? [],
  };
}

function getInventory(state?: Record<string, unknown>): InventoryItem[] {
  const ff1 = state?.ff1 as { inventory?: unknown } | undefined;
  const inventory = ff1?.inventory;
  return Array.isArray(inventory) ? inventory.filter(isInventoryItem) : [];
}

function getPartyNames(state?: Record<string, unknown>): string[] {
  const ff1 = state?.ff1 as { party?: { name: string }[] } | undefined;
  return ff1?.party?.map((c) => c.name) ?? [];
}

function getInventoryLabels(state?: Record<string, unknown>): string[] {
  return getInventory(state).map((it) => it.itemInfo?.name ?? `Item ${it.itemId}`);
}

function getActiveActorSpells(state?: Record<string, unknown>): SpellInfo[] {
  const ff1 = state?.ff1 as {
    party?: { spellsKnown?: SpellInfo[] }[];
    battle?: { activePartyIndex?: number };
  } | undefined;
  const index = ff1?.battle?.activePartyIndex;
  if (index === undefined) return [];
  return ff1?.party?.[index]?.spellsKnown ?? [];
}

function getActorSpellsByName(state?: Record<string, unknown>, actorName?: string): SpellInfo[] {
  const ff1 = state?.ff1 as { party?: { name?: string; spellsKnown?: SpellInfo[] }[] } | undefined;
  if (!actorName) return [];
  return ff1?.party?.find((c) => c.name?.toLowerCase() === actorName.toLowerCase())?.spellsKnown ?? [];
}

function getEnemyTargetList(state?: Record<string, unknown>): string {
  const ff1 = state?.ff1 as {
    battle?: { enemies?: { name?: string; slot: number; alive?: boolean; hp?: number }[] };
  } | undefined;
  const enemies = ff1?.battle?.enemies ?? [];
  if (enemies.length === 0) return "none";
  return enemies
    .map((e) => {
      const status = e.alive === false ? " [DEAD]" : "";
      return `${e.name ?? "enemy"} (slot ${e.slot}, HP ${e.hp ?? "?"})${status}`;
    })
    .join(", ");
}

function getConsumablesList(state?: Record<string, unknown>): string {
  const consumables = getInventory(state).filter(isConsumable);
  if (consumables.length === 0) return "none";
  return consumables.map((it) => `${it.itemInfo?.name ?? `Item ${it.itemId}`} x${it.quantity}`).join(", ");
}

function resolveNamedIndex(
  name: string,
  labels: string[],
  context: string,
): number {
  if (name === "") return 0;
  const parsed = Number(name);
  if (Number.isFinite(parsed)) return parsed;
  const fromLabel = indexFromLabel(name, labels);
  if (fromLabel !== undefined) return fromLabel;
  throw new Error(
    `${context}: cannot resolve "${name}". Provide a 0-based index` +
      (labels.length > 0 ? ` or one of: ${labels.join(", ")}` : ""),
  );
}

export class FF1GamePlugin implements GamePlugin {
  id = "ff1";
  title = "Final Fantasy I";

  private dialogCapture: {
    open: boolean;
    lastCurrent: string;
    pages: string[];
    sawBlank: boolean;
  } = { open: false, lastCurrent: "", pages: [], sawBlank: false };

  constructor(private emulator: Emulator) {}

  /**
   * The route the last `goto` compiled, kept so the step log and the UI can show
   * where the party was headed. Reset by nothing: the most recent goto wins.
   */
  private lastRoute: RoutePlan | undefined;

  /** The most recent compiled travel route, if any. */
  getLastRoute(): RoutePlan | undefined {
    return this.lastRoute;
  }

  /** Reset the per-turn dialog accumulator. Called before a macro plays. */
  resetDialogCapture(): void {
    this.dialogCapture = { open: false, lastCurrent: "", pages: [], sawBlank: false };
  }

  /** Sample one frame of dialog text, accumulating new pages while the box is open. */
  captureDialogFrame(): void {
    const mem = this.emulator.getMemory();
    if (!mem || mem.length < 0x10000) return;

    const view = createCpuMemoryView(mem);
    const open = view.u8(ADDR_DIALOG_OPEN) !== 0;
    if (!open) {
      this.dialogCapture.open = false;
      return;
    }

    const nametable = this.emulator.getNametable();
    if (!nametable) return;

    const lines = decodeNametableWindow(nametable.data, nametable.width, FF1_DIALOG_GEOMETRY);
    const current = lines.join("\n").trim();

    if (!this.dialogCapture.open) {
      // First frame of a new dialog box.
      this.dialogCapture.open = true;
      this.dialogCapture.pages = [];
      this.dialogCapture.lastCurrent = "";
      this.dialogCapture.sawBlank = false;
    }

    if (current === "") {
      this.dialogCapture.sawBlank = true;
      this.dialogCapture.lastCurrent = "";
      return;
    }

    if (this.dialogCapture.sawBlank) {
      // A blank frame followed by text indicates a new page.
      this.dialogCapture.pages.push(current);
      this.dialogCapture.sawBlank = false;
      this.dialogCapture.lastCurrent = current;
      return;
    }

    if (current !== this.dialogCapture.lastCurrent) {
      if (this.dialogCapture.pages.length === 0) {
        this.dialogCapture.pages.push(current);
      } else {
        // Update the last page in place (typewriter progression within a page).
        this.dialogCapture.pages[this.dialogCapture.pages.length - 1] = current;
      }
      this.dialogCapture.lastCurrent = current;
    }
  }

  private readCapturedDialog(): DialogState {
    const mem = this.emulator.getMemory();
    let open = false;
    if (mem && mem.length >= 0x10000) {
      const view = createCpuMemoryView(mem);
      open = view.u8(ADDR_DIALOG_OPEN) !== 0;
    }
    return {
      open,
      current: this.dialogCapture.lastCurrent,
      pages: [...this.dialogCapture.pages],
      note:
        "Dialog text is decoded from PPU nametable tiles using the verified FF1 TEXT_TABLE. " +
        "Window geometry is inferred from the disassembly and needs live ROM verification.",
    };
  }

  getMode(state?: Record<string, unknown>): string {
    if (isInBattle(state)) return "battle";
    const menu = getMenuContext(state);
    if (menu === "shop") return "shop";
    if (menu === "inn") return "inn";
    if (menu === "clinic") return "clinic";
    return "field";
  }

  availableCommands(state?: Record<string, unknown>, context?: { actor?: string }): CommandSpec[] {
    if (isInBattle(state)) {
      return this.battleCommands(state, context?.actor);
    }

    const commands: CommandSpec[] = [
      {
        name: "goto",
        description:
          "Walk the party to a known location. The location must be one of the available locations listed in the state.",
        args: '{ "location": "string" }',
      },
      {
        name: "talk_to",
        description:
          "Talk to the NPC the party is currently facing. Provide an informational target name if known.",
        args: '{ "target": "string" }',
      },
      { name: "interact", description: "Press A to talk, search, or confirm the current selection." },
      { name: "cancel", description: "Press B to cancel or go back." },
      { name: "menu", description: "Press START to open or close the main menu." },
      {
        name: "select",
        description: "Press SELECT to toggle cursor/target mode in menus.",
      },
    ];

    const menu = getMenuContext(state);
    const inMenu = menu === "main_menu" || menu === "shop" || menu === "inn" || menu === "clinic" || menu === "dialog";

    if (inMenu || menu === "town" || menu === "castle" || menu === "dungeon") {
      commands.push(
        {
          name: "menu_navigate",
          description:
            "Move the menu cursor. Use direction (up/down/left/right) and steps. For vertical lists, you may also provide an absolute target index.",
          args: '{ "direction": "string", "steps": "number" }',
        },
        { name: "menu_select", description: "Confirm the current menu selection (A)." },
        { name: "menu_cancel", description: "Cancel or close the current menu layer (B)." },
        {
          name: "dialog_advance",
          description: "Press A repeatedly to advance dialogue text.",
          args: '{ "presses": "number" }',
        },
      );
    }

    if (menu === "shop") {
      commands.push(
        {
          name: "buy",
          description: "Buy an item from the current shop. Provide the item name or 0-based index.",
          args: '{ "item": "string", "quantity": "number" }',
        },
        {
          name: "sell",
          description: "Sell an item to the current shop. Provide the item name or 0-based index.",
          args: '{ "item": "string" }',
        },
      );
    }

    if (menu === "inn") {
      commands.push({
        name: "stay",
        description: "Confirm a stay at the inn to restore the party.",
      });
    }

    if (menu === "clinic") {
      commands.push({
        name: "heal",
        description: "Confirm healing at the clinic (revive/cure poison/stone).",
      });
    }

    // field/overworld/town/castle/dungeon all support using consumable items.
    if (menu === "field" || menu === "town" || menu === "castle" || menu === "dungeon" || menu === "main_menu") {
      if (this.hasConsumable(state)) {
        commands.push({
          name: "use_item",
          description:
            `Open the ITEM menu, navigate to the named consumable item, and use it on the target party member. Available consumables: ${getConsumablesList(state)}.`,
          args: '{ "item": "string", "target": "string" }',
        });
      }
    }

    return commands;
  }

  private battleCommands(state?: Record<string, unknown>, actor?: string): CommandSpec[] {
    const actors = getBattleParty(state);
    const activeIndex = getActivePartyIndex(state);
    const activeActor = actor ?? (activeIndex !== undefined ? actors[activeIndex]?.name : undefined);
    const actorList = actors.length > 0 ? actors.map((a) => a.name).join(", ") : "any conscious party member";
    const targets = getEnemyTargetList(state);
    const consumables = getConsumablesList(state);
    const activeSpells = activeActor ? getActorSpellsByName(state, activeActor) : [];
    const spellHint = activeSpells.length > 0
      ? `Known spells: ${activeSpells.map((s) => `${s.name} (L${s.level})`).join(", ")}.`
      : "No known spells for this actor.";

    const base = activeActor
      ? `It is ${activeActor}'s turn. Each command must name an actor from: ${actorList}.`
      : `In battle, each command must name an actor from: ${actorList}.`;

    return [
      {
        name: "fight",
        description: `${base} Attack the targeted enemy with a physical blow. Valid enemy targets: ${targets}.`,
        args: '{ "actor": "string", "target": "enemy name or slot" }',
      },
      {
        name: "magic",
        description: `${base} Cast a learned spell. ${spellHint} Valid targets: ${targets} or an ally name/slot.`,
        args: '{ "actor": "string", "spell": "string", "target": "enemy name or slot | ally name" }',
      },
      {
        name: "use_item",
        description: `${base} Drink/use a consumable item in battle (DRINK menu entry). Available consumables: ${consumables}.`,
        args: '{ "actor": "string", "item": "string", "target": "string" }',
      },
      {
        name: "equip",
        description: `${base} Open the EQUIP menu for this actor in battle.`,
        args: '{ "actor": "string" }',
      },
      {
        name: "run",
        description: `${base} Attempt to flee the battle.`,
        args: '{ "actor": "string" }',
      },
      { name: "menu_navigate", description: "Move the battle menu cursor if needed.", args: '{ "direction": "string", "steps": "number" }' },
      { name: "menu_select", description: "Confirm the current battle menu selection (A)." },
      { name: "menu_cancel", description: "Cancel the current battle menu selection (B)." },
    ];
  }

  readState(): Record<string, unknown> {
    const mem = this.emulator.getMemory();
    const nametable = this.emulator.getNametable();
    let ff1: FF1GameState | undefined;
    if (mem && mem.length >= 0x10000) {
      try {
        const view = createCpuMemoryView(mem);
        ff1 = readFF1State(view, nametable ?? undefined);
      } catch {
        ff1 = undefined;
      }
    }
    if (ff1) {
      ff1.dialog = this.readCapturedDialog();
      if (ff1.world.isOverworld) {
        ff1.availableLocations = overworldLocations(ff1.world);
      }
    }
    const mode = this.getMode({ ff1 });
    return sanitizeForRequest({
      romName: this.emulator.getRomName(),
      running: this.emulator.isRunning(),
      macroActive: this.emulator.isPlayingMacro(),
      mode,
      ff1,
      gameInfo: ff1 ? formatFF1GameInfo(ff1) : "No FF1 state available.",
    }) as Record<string, unknown>;
  }

  compile(command: GameCommand): ButtonStep[] {
    switch (command.name) {
      case "press_button":
        return this.compilePressButton(command);
      case "goto":
        return this.compileGoto(command);
      case "talk_to":
        return [pressA(HOLD_FRAMES, GAP_FRAMES)];
      case "move": {
        const direction = String(command.args?.direction ?? "down").toLowerCase();
        const map: Record<string, number | undefined> = {
          up: NES_BUTTONS.UP,
          down: NES_BUTTONS.DOWN,
          left: NES_BUTTONS.LEFT,
          right: NES_BUTTONS.RIGHT,
        };
        const button = map[direction];
        if (button === undefined) return [];
        return [press(button, HOLD_FRAMES * 2, GAP_FRAMES * 2)];
      }
      case "interact":
        return [pressA(HOLD_FRAMES, GAP_FRAMES)];
      case "cancel":
      case "menu_cancel":
        return [pressB(HOLD_FRAMES, GAP_FRAMES)];
      case "menu":
        return [pressStart(HOLD_FRAMES, GAP_FRAMES)];
      case "select":
        return [pressSelect(HOLD_FRAMES, GAP_FRAMES)];
      case "menu_select":
        return [pressA()];
      case "menu_navigate":
        return this.compileMenuNavigate(command);
      case "dialog_advance":
        return this.compileDialogAdvance(command);
      case "use_item":
        return this.compileUseItem(command);
      case "buy":
        return this.compileBuy(command);
      case "sell":
        return this.compileSell(command);
      case "stay":
      case "heal":
        return this.compileConfirmSequence();
      case "fight":
      case "magic":
      case "equip":
      case "run":
        return this.compileBattleAction(command);
      default:
        return [];
    }
  }

  /**
   * Overworld travel is the only long macro: a route can run for thousands of
   * frames. A random battle or an entrance transition takes the game off the
   * field, after which the remaining d-pad presses would be spent inside the
   * battle menu or the new map. Abort on either condition, using the two
   * single-bit `mapflags` ($2D) signals rather than a full state read, since
   * this runs once per emulated frame.
   */
  macroAbort(command: GameCommand): (() => boolean) | undefined {
    if (command.name !== "goto") return undefined;
    const mem = this.emulator.getMemory();
    if (!mem || mem.length < 0x10000) return undefined;
    return () => {
      const flags = mem[ADDR_MAPFLAGS] ?? 0;
      return (flags & (MAPFLAG_BATTLE_SCREEN | MAPFLAG_STANDARD)) !== 0;
    };
  }

  private compileGoto(command: GameCommand): ButtonStep[] {
    const location = String(command.args?.location ?? "").trim();
    if (!location) throw new Error('goto: missing "location"');

    const world = getWorld(this.readState());
    if (!world || world.isStandardMap) {
      throw new Error(
        "goto: the party is not on the overworld. Exit the current building/town first; only overworld travel is pathfound.",
      );
    }

    const { steps, plan } = gotoMacro(
      location,
      { x: world.overworldPlayerX, y: world.overworldPlayerY },
      vehicleOf(world),
    );
    this.lastRoute = plan;
    return steps;
  }

  private compilePressButton(command: GameCommand): ButtonStep[] {
    const buttonName = String(command.args?.button ?? "").toLowerCase();
    const frames = Number(command.args?.frames ?? 4);
    const map: Record<string, number> = {
      a: NES_BUTTONS.A,
      b: NES_BUTTONS.B,
      start: NES_BUTTONS.START,
      select: NES_BUTTONS.SELECT,
      up: NES_BUTTONS.UP,
      down: NES_BUTTONS.DOWN,
      left: NES_BUTTONS.LEFT,
      right: NES_BUTTONS.RIGHT,
    };
    const button = map[buttonName];
    if (button === undefined) {
      throw new Error(`press_button: unknown button "${buttonName}"`);
    }
    return [{ button, holdFrames: Number.isFinite(frames) && frames > 0 ? frames : 4, gapFrames: GAP_FRAMES }];
  }

  private compileMenuNavigate(command: GameCommand): ButtonStep[] {
    const direction = String(command.args?.direction ?? "down").toLowerCase();
    const steps = Number(command.args?.steps ?? 1);
    return navigateDirection(direction, Math.max(1, steps));
  }

  private compileDialogAdvance(command: GameCommand): ButtonStep[] {
    const presses = Number(command.args?.presses ?? 3);
    const steps: ButtonStep[] = [];
    for (let i = 0; i < Math.max(1, presses); i++) {
      steps.push(pressA());
    }
    return steps;
  }

  private compileConfirmSequence(): ButtonStep[] {
    return [pressA(), pressA()];
  }

  private compileUseItem(command: GameCommand): ButtonStep[] {
    const itemName = String(command.args?.item ?? "");
    const targetName = String(command.args?.target ?? "");
    const isBattle = this.inferredInBattle();
    const steps: ButtonStep[] = [];

    if (!isBattle) {
      steps.push(pressStart(HOLD_FRAMES, GAP_FRAMES));
    }

    // Open the item/drink menu.
    const menuCursor = getMenuCursor(this.readState());
    const menuLabels = isBattle ? BATTLE_MENU_LABELS : MAIN_MENU_LABELS;
    const itemEntryLabel = isBattle ? "DRINK" : "ITEM";
    const itemEntryIndex = resolveMenuIndex(itemEntryLabel, menuLabels, menuCursor);
    steps.push(...navigateVertical(menuCursor, itemEntryIndex));
    steps.push(pressA());

    // Select the consumable.
    const inventory = getInventory(this.readState());
    const consumables = inventory.filter(isConsumable);
    const targetIndex = this.findConsumableIndexByName(consumables, itemName);
    const itemCursor = 0; // After opening the item menu, cursor resets to top.
    steps.push(...navigateVertical(itemCursor, targetIndex));
    steps.push(pressA());

    // Select the target.
    const partyNames = getPartyNames(this.readState());
    const targetIndexInParty = resolveMenuIndex(targetName, partyNames, 0);
    steps.push(...navigateVertical(0, targetIndexInParty));
    steps.push(pressA());

    return steps;
  }

  private compileBuy(command: GameCommand): ButtonStep[] {
    const itemName = String(command.args?.item ?? "");
    // Shop inventory labels are not yet read from the ROM, so names cannot be
    // resolved safely. Numeric indices are accepted; anything else fails loud.
    const targetIndex = resolveNamedIndex(itemName, [], "buy");
    const steps: ButtonStep[] = [];
    steps.push(...navigateVertical(0, targetIndex));
    steps.push(pressA(), pressA());
    return steps;
  }

  private compileSell(command: GameCommand): ButtonStep[] {
    const itemName = String(command.args?.item ?? "");
    const inventoryLabels = getInventoryLabels(this.readState());
    const targetIndex = resolveNamedIndex(itemName, inventoryLabels, "sell");
    const steps: ButtonStep[] = [];
    steps.push(...navigateVertical(0, targetIndex));
    steps.push(pressA(), pressA());
    return steps;
  }

  private compileBattleAction(command: GameCommand): ButtonStep[] {
    const name = command.name;
    const state = this.readState();
    const menuCursor = getMenuCursor(state);
    const menuIndex = this.battleMenuIndexForAction(name);
    const steps: ButtonStep[] = [];

    // Select the battle menu action.
    steps.push(...navigateVertical(menuCursor, menuIndex));
    steps.push(pressA());

    if (name === "magic") {
      // Resolve the spell against the active actor's learned spell list so
      // names like "FIRE" target the correct menu entry.
      const spellName = String(command.args?.spell ?? "");
      const spellLabels = getActiveActorSpells(state).map((s) => s.name);
      const spellIndex = resolveNamedIndex(spellName, spellLabels, "magic");
      steps.push(...navigateVertical(0, spellIndex));
      steps.push(pressA());
    }

    if (name === "fight" || name === "magic" || name === "use_item") {
      const targetName = String(command.args?.target ?? "");
      const roster = getBattleRoster(state);
      const enemySlots = roster.enemies.map((e) => e.slot);
      const aliveEnemySlots = roster.enemies.filter((e) => e.alive !== false).map((e) => e.slot);
      const aliveAllySlots = roster.party.filter((m) => m.alive !== false).map((m) => m.index);

      // Magic may target an ally (heal) or an enemy; fight/item are enemy
      // actions. Resolve the requested slot against the enemy roster first,
      // then the ally roster, and pick the matching target domain.
      const enemySlot = resolveEnemySlot(targetName, roster.enemies);
      const isEnemyTarget =
        enemySlot !== undefined &&
        (name !== "magic" || enemySlots.includes(enemySlot));

      if (name === "magic" && !isEnemyTarget) {
        const allySlot = resolveAllySlot(targetName, roster.party);
        if (allySlot === undefined || !aliveAllySlots.includes(allySlot)) {
          throw new Error(
            `magic: target "${targetName}" is not a living ally or selectable enemy. ` +
              `Allies: ${roster.party.map((m) => `${m.name} (slot ${m.index})`).join(", ") || "none"}.`,
          );
        }
        // Ally target cursor (SelectPlayerTarget) walks party index 0..3 with
        // DOWN only, resetting to the first live member on entry.
        const down = targetCursorDownPresses(allySlot, [0, 1, 2, 3], aliveAllySlots);
        if (down === undefined) {
          throw new Error(`magic: ally slot ${allySlot} is not selectable`);
        }
        steps.push(...navigateDirection("down", down));
        steps.push(pressA());
      } else {
        const resolved = isEnemyTarget ? enemySlot : undefined;
        if (targetName !== "" && resolved === undefined) {
          throw new Error(
            `${name}: target "${targetName}" is not a selectable enemy. ` +
              `Enemies: ${roster.enemies.map((e) => `${e.name ?? "enemy"} (slot ${e.slot})`).join(", ") || "none"}.`,
          );
        }
        if (resolved === undefined) {
          // No explicit target: press A immediately, which keeps the game's
          // default first-legal-target cursor stop.
          steps.push(pressA());
        } else {
          // The target cursor resets to the first alive stop on entry and moves
          // DOWN through the formation slot order (enemyCursorOrder), skipping
          // dead/empty slots, wrapping. Move from stops[0] to the requested slot.
          const down = targetCursorDownPresses(resolved, roster.cursorOrder, aliveEnemySlots);
          if (down === undefined) {
            throw new Error(
              `${name}: enemy slot ${resolved} is dead or not selectable. Alive: ${aliveEnemySlots.join(", ") || "none"}.`,
            );
          }
          steps.push(...navigateDirection("down", down));
          steps.push(pressA());
        }
      }
    }

    return steps;
  }

  private battleMenuIndexForAction(action: string): number {
    switch (action) {
      case "fight":
        return 0;
      case "magic":
        return 1;
      case "use_item":
        return 2;
      case "equip":
        return 3;
      case "run":
        return 4;
      default:
        return 0;
    }
  }

  private inferredInBattle(): boolean {
    return isInBattle(this.readState());
  }

  private hasConsumable(state: Record<string, unknown> | undefined): boolean {
    const inventory = getInventory(state);
    return inventory.some(isConsumable);
  }

  private findConsumableIndexByName(consumables: InventoryItem[], itemName: string): number {
    if (itemName === "") return 0;
    const labels = consumables.map((it) => it.itemInfo?.name ?? `Item ${it.itemId}`);
    return resolveNamedIndex(itemName, labels, "use_item");
  }
}
