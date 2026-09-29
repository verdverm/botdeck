/**
 * botdeck <-> vermbot protocol (browser side mirror of packages/vermbot/src/protocol.ts).
 *
 * Turn-based model: the agent reasons in high-level GameCommands (never raw
 * button pushes), and the game plugin maps each command to a button sequence
 * that botdeck plays out with human-like timing while the emulator keeps
 * rendering at 60fps.
 */

/** NES controller button indices (matches jsnes Controller constants). */
export const NES_BUTTONS = {
  A: 0,
  B: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
} as const;

export type NesButtonName = keyof typeof NES_BUTTONS;
export type NesButtonIndex = (typeof NES_BUTTONS)[NesButtonName];

/**
 * One macro step: press `button` for `holdFrames`, release, then idle for
 * `gapFrames` before the next step. Frame counts (not ms) so sequences stay
 * synced to emulation regardless of host speed.
 */
export interface ButtonStep {
  button: number;
  holdFrames?: number;
  gapFrames?: number;
}

/** A high-level decision, e.g. { name: "moveTo", args: { destination: "inn" } }. */
export interface GameCommand {
  name: string;
  args?: Record<string, unknown>;
}

/** A command the agent is allowed to pick, advertised each turn. */
export interface CommandSpec {
  name: string;
  description: string;
  /** JSON-ish hint of expected args, shown to the agent. */
  args?: string;
}

export interface TurnRequest {
  gameId: string;
  /** Structured game state prepared by the plugin. */
  state: Record<string, unknown>;
  /** Optional PNG data URL of the current frame. */
  screenshot?: string;
  /** Commands available this turn. */
  options: CommandSpec[];
}

export interface TurnResponse {
  command: GameCommand;
  reason?: string;
}
