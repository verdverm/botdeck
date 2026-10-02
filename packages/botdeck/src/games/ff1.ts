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
  type FF1GameState,
  type InventoryItem,
  type MenuContext,
} from "@games/ff1-state";

const HOLD_FRAMES = 4;
const GAP_FRAMES = 4;
const MENU_GAP_FRAMES = 12;

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

export class FF1GamePlugin implements GamePlugin {
  id = "ff1";
  title = "Final Fantasy I";

  constructor(private emulator: Emulator) {}

  getMode(state?: Record<string, unknown>): string {
    if (isInBattle(state)) return "battle";
    const menu = getMenuContext(state);
    if (menu === "shop") return "shop";
    if (menu === "inn") return "inn";
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
      { name: "wait", description: "Do nothing this turn." },
    ];

    const menu = getMenuContext(state);
    if (menu === "shop") {
      commands.push(
        {
          name: "buy",
          description: "Buy an item from the current shop.",
          args: '{ "item": "string", "quantity": number }',
        },
        {
          name: "sell",
          description: "Sell an item to the current shop.",
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

    if (menu === "main_menu" || menu === "field") {
      if (this.hasConsumable(state)) {
        commands.push({
          name: "use_item",
          description:
            "Open the ITEM menu, navigate to the named consumable item, and use it on the target party member.",
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
    const actorList = actors.length > 0
      ? actors.map((a) => a.name).join(", ")
      : "any conscious party member";
    const base = activeActor
      ? `It is ${activeActor}'s turn. Each command must name an actor from: ${actorList}.`
      : `In battle, each command must name an actor from: ${actorList}.`;
    return [
      {
        name: "fight",
        description: `${base} Attack the targeted enemy with a physical blow.`,
        args: '{ "actor": "string", "target": "enemy_1 | enemy_2 | ..." }',
      },
      {
        name: "magic",
        description: `${base} Cast a learned spell. Only mages with charges can cast.`,
        args: '{ "actor": "string", "spell": "string", "target": "enemy_1 | enemy_2 | ... | ally_name" }',
      },
      {
        name: "use_item",
        description: `${base} Drink/use a consumable item in battle (maps to the DRINK menu entry).`,
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
      { name: "wait", description: "Wait for the battle animation or enemy turn to resolve." },
    ];
  }

  readState(): Record<string, unknown> {
    const mem = this.emulator.getMemory();
    let ff1: FF1GameState | undefined;
    if (mem && mem.length >= 0x10000) {
      try {
        const view = createCpuMemoryView(mem);
        ff1 = readFF1State(view);
      } catch {
        ff1 = undefined;
      }
    }
    const mode = this.getMode({ ff1 });
    return {
      romName: this.emulator.getRomName(),
      running: this.emulator.isRunning(),
      macroActive: this.emulator.isPlayingMacro(),
      mode,
      ff1,
      gameInfo: ff1 ? formatFF1GameInfo(ff1) : "No FF1 state available.",
    };
  }

  compile(command: GameCommand): ButtonStep[] {
    switch (command.name) {
      case "wait":
        return [];
      case "goto":
        return this.compileGoto(command);
      case "talk_to":
        return [{ button: NES_BUTTONS.A, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
      case "interact":
        return [{ button: NES_BUTTONS.A, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
      case "cancel":
        return [{ button: NES_BUTTONS.B, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
      case "menu":
        return [{ button: NES_BUTTONS.START, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
      case "select":
        return [{ button: NES_BUTTONS.SELECT, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
      case "use_item":
        return this.compileUseItem(command);
      case "buy":
      case "sell":
      case "stay":
        return this.compileMenuConfirm();
      case "fight":
      case "magic":
      case "equip":
      case "run":
        return this.compileBattleAction(command);
      default:
        return [];
    }
  }

  private compileGoto(command: GameCommand): ButtonStep[] {
    const location = String(command.args?.location ?? "");
    void location;
    // First pass: goto is compiled as a single A press. The agent should use it
    // when already standing in front of a door, exit, or NPC that leads to the
    // named location. Real A* pathfinding is future work.
    return [{ button: NES_BUTTONS.A, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
  }

  private compileMenuConfirm(): ButtonStep[] {
    const press = (button: number, hold = HOLD_FRAMES, gap = MENU_GAP_FRAMES): ButtonStep => ({
      button,
      holdFrames: hold,
      gapFrames: gap,
    });
    // First pass: a deterministic confirm sequence. Shop/inn menus need the
    // cursor to already be on the right option; navigation is future work.
    return [press(NES_BUTTONS.A), press(NES_BUTTONS.A)];
  }

  private compileBattleAction(command: GameCommand): ButtonStep[] {
    const press = (button: number, hold = HOLD_FRAMES, gap = MENU_GAP_FRAMES): ButtonStep => ({
      button,
      holdFrames: hold,
      gapFrames: gap,
    });
    void command;
    // First pass: battle actions are stubbed as a short menu navigation
    // sequence. The actor/target/spell arguments are accepted for the agent's
    // benefit but are not yet translated into cursor movement.
    return [press(NES_BUTTONS.A), press(NES_BUTTONS.A), press(NES_BUTTONS.A)];
  }

  private hasConsumable(state: Record<string, unknown> | undefined): boolean {
    const ff1 = state?.ff1 as { inventory?: unknown } | undefined;
    const inventory = ff1?.inventory;
    if (!Array.isArray(inventory)) return false;
    return inventory.some(isInventoryItem) && inventory.some(isConsumable);
  }

  private findConsumableIndex(state: FF1GameState | undefined, itemName: string): number {
    if (!state) return -1;
    const normalized = itemName.toLowerCase();
    return state.inventory.findIndex(
      (it) =>
        isInventoryItem(it) &&
        isConsumable(it) &&
        (it.itemInfo?.name?.toLowerCase() === normalized || String(it.itemId) === itemName),
    );
  }

  private compileUseItem(command: GameCommand): ButtonStep[] {
    const press = (button: number, hold = HOLD_FRAMES, gap = MENU_GAP_FRAMES): ButtonStep => ({
      button,
      holdFrames: hold,
      gapFrames: gap,
    });

    const itemName = String(command.args?.item ?? "");
    const mem = this.emulator.getMemory();
    let targetIndex = 0;
    if (mem && mem.length >= 0x10000) {
      try {
        const view = createCpuMemoryView(mem);
        targetIndex = this.findConsumableIndex(readFF1State(view), itemName);
      } catch {
        targetIndex = -1;
      }
    }

    const steps: ButtonStep[] = [press(NES_BUTTONS.START), press(NES_BUTTONS.A)];
    if (targetIndex > 0) {
      for (let i = 0; i < targetIndex; i++) {
        steps.push(press(NES_BUTTONS.DOWN));
      }
    }
    steps.push(press(NES_BUTTONS.A), press(NES_BUTTONS.A));
    return steps;
  }
}
