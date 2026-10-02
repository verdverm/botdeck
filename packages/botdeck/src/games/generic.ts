import {
  NES_BUTTONS,
  type ButtonStep,
  type CommandSpec,
  type GameCommand,
  type GamePlugin,
} from "@/types";
import type { Emulator } from "@/emulator/emulator";

/**
 * Generic single-tap plugin. Every command maps to one button press with a
 * short hold and gap. This is the fallback when no game-specific plugin exists.
 */
export class GenericGamePlugin implements GamePlugin {
  id = "generic";
  title = "Generic";

  constructor(private emulator: Emulator) {}

  availableCommands(): CommandSpec[] {
    return [
      { name: "wait", description: "Do nothing this turn." },
      { name: "a", description: "Press the A button." },
      { name: "b", description: "Press the B button." },
      { name: "start", description: "Press the Start button." },
      { name: "select", description: "Press the Select button." },
      { name: "up", description: "Press Up on the d-pad." },
      { name: "down", description: "Press Down on the d-pad." },
      { name: "left", description: "Press Left on the d-pad." },
      { name: "right", description: "Press Right on the d-pad." },
    ];
  }

  getMode(): string {
    return "field";
  }

  readState(): Record<string, unknown> {
    return {
      romName: this.emulator.getRomName(),
      running: this.emulator.isRunning(),
      macroActive: this.emulator.isPlayingMacro(),
    };
  }

  compile(command: GameCommand): ButtonStep[] {
    const map: Record<string, number | undefined> = {
      a: NES_BUTTONS.A,
      b: NES_BUTTONS.B,
      start: NES_BUTTONS.START,
      select: NES_BUTTONS.SELECT,
      up: NES_BUTTONS.UP,
      down: NES_BUTTONS.DOWN,
      left: NES_BUTTONS.LEFT,
      right: NES_BUTTONS.RIGHT,
    };
    const button = map[command.name];
    if (button === undefined) return [];
    return [{ button, holdFrames: 4, gapFrames: 4 }];
  }
}
