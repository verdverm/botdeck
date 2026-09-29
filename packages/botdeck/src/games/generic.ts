import type { GamePlugin } from "@/games/plugin";
import type { ButtonStep, CommandSpec, GameCommand } from "@/types";

/** NES button names -> jsnes controller indices. */
const BUTTON_INDEX: Record<string, number> = {
  a: 0,
  b: 1,
  select: 2,
  start: 3,
  up: 4,
  down: 5,
  left: 6,
  right: 7,
};

const GENERIC_COMMANDS: CommandSpec[] = [
  { name: "press_up", description: "Tap up on the d-pad" },
  { name: "press_down", description: "Tap down on the d-pad" },
  { name: "press_left", description: "Tap left on the d-pad" },
  { name: "press_right", description: "Tap right on the d-pad" },
  { name: "press_a", description: "Tap the A button" },
  { name: "press_b", description: "Tap the B button" },
  { name: "press_start", description: "Tap Start" },
  { name: "press_select", description: "Tap Select" },
  { name: "wait", description: "Do nothing this turn" },
];

/**
 * Placeholder plugin used until a real game adapter (Final Fantasy, Pokemon,
 * ...) ships. Its "mapping" is the trivial single-tap case; a real plugin
 * replaces `compile` with multi-step macros like navigating a menu.
 *
 * Reading state from RAM is out of scope here: the generic plugin reports
 * that it cannot, so vermbot falls back to the screenshot.
 */
export class GenericGamePlugin implements GamePlugin {
  readonly id = "generic";
  readonly title = "Generic (single taps)";

  availableCommands(): CommandSpec[] {
    return GENERIC_COMMANDS;
  }

  readState(): Record<string, unknown> {
    return { note: "generic plugin exposes no structured state" };
  }

  compile(command: GameCommand): ButtonStep[] {
    if (command.name === "wait") return [];
    const key = command.name.replace(/^press_/, "");
    const button = BUTTON_INDEX[key];
    if (button === undefined) return [];
    return [{ button }];
  }
}
