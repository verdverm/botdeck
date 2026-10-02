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
} from "@games/ff1-state";

const HOLD_FRAMES = 4;
const GAP_FRAMES = 4;
const MENU_GAP_FRAMES = 12;

const DIRECTION_BUTTONS: Record<string, number> = {
  up: NES_BUTTONS.UP,
  down: NES_BUTTONS.DOWN,
  left: NES_BUTTONS.LEFT,
  right: NES_BUTTONS.RIGHT,
};

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

export class FF1GamePlugin implements GamePlugin {
  id = "ff1";
  title = "Final Fantasy I";

  constructor(private emulator: Emulator) {}

  availableCommands(state?: Record<string, unknown>): CommandSpec[] {
    const commands: CommandSpec[] = [
      { name: "wait", description: "Do nothing this turn." },
      {
        name: "move",
        description: "Move one step on the map.",
        args: '{ "direction": "up" | "down" | "left" | "right" }',
      },
      { name: "interact", description: "Press A to talk, search, or confirm." },
      { name: "cancel", description: "Press B to cancel or go back." },
      { name: "menu", description: "Press START to open or close the menu." },
      {
        name: "select",
        description: "Press SELECT to toggle cursor/target mode in menus.",
      },
    ];

    if (this.hasConsumable(state)) {
      commands.push({
        name: "use_item",
        description:
          "Open the ITEM menu, navigate to the first consumable item, and attempt to use it on the lead party member.",
      });
    }

    return commands;
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
    return {
      romName: this.emulator.getRomName(),
      running: this.emulator.isRunning(),
      macroActive: this.emulator.isPlayingMacro(),
      ff1,
      gameInfo: ff1 ? formatFF1GameInfo(ff1) : "No FF1 state available.",
    };
  }

  compile(command: GameCommand): ButtonStep[] {
    switch (command.name) {
      case "wait":
        return [];
      case "move": {
        const direction = String(command.args?.direction ?? "down").toLowerCase();
        const button = DIRECTION_BUTTONS[direction];
        if (button === undefined) return [];
        return [{ button, holdFrames: HOLD_FRAMES * 2, gapFrames: GAP_FRAMES * 2 }];
      }
      case "interact":
        return [{ button: NES_BUTTONS.A, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
      case "cancel":
        return [{ button: NES_BUTTONS.B, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
      case "menu":
        return [{ button: NES_BUTTONS.START, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
      case "select":
        return [{ button: NES_BUTTONS.SELECT, holdFrames: HOLD_FRAMES, gapFrames: GAP_FRAMES }];
      case "use_item":
        return this.compileUseItem();
      default:
        return [];
    }
  }

  private hasConsumable(state: Record<string, unknown> | undefined): boolean {
    const ff1 = state?.ff1 as { inventory?: unknown } | undefined;
    const inventory = ff1?.inventory;
    if (!Array.isArray(inventory)) return false;
    return inventory.some(isInventoryItem) && inventory.some(isConsumable);
  }

  private firstConsumableIndex(state: FF1GameState | undefined): number {
    if (!state) return 0;
    const idx = state.inventory.findIndex(isConsumable);
    return idx >= 0 ? idx : 0;
  }

  private compileUseItem(): ButtonStep[] {
    const press = (button: number, hold = HOLD_FRAMES, gap = MENU_GAP_FRAMES): ButtonStep => ({
      button,
      holdFrames: hold,
      gapFrames: gap,
    });

    const mem = this.emulator.getMemory();
    let targetIndex = 0;
    if (mem && mem.length >= 0x10000) {
      try {
        const view = createCpuMemoryView(mem);
        targetIndex = this.firstConsumableIndex(readFF1State(view));
      } catch {
        targetIndex = 0;
      }
    }

    const steps: ButtonStep[] = [press(NES_BUTTONS.START), press(NES_BUTTONS.A)];
    for (let i = 0; i < targetIndex; i++) {
      steps.push(press(NES_BUTTONS.DOWN));
    }
    steps.push(press(NES_BUTTONS.A), press(NES_BUTTONS.A));
    return steps;
  }
}
