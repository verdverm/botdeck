/**
 * botdeck <-> vermbot protocol (server side; mirrored in botdeck's types.ts).
 *
 * Turn-based model: the agent reasons in high-level GameCommands (never raw
 * button pushes). botdeck's game plugin advertises the available command specs
 * each turn, and the agent must pick one; the plugin then compiles it into a
 * button macro played out with human-like timing.
 */

export interface ButtonStep {
  button: number;
  holdFrames?: number;
  gapFrames?: number;
}

export interface GameCommand {
  name: string;
  args?: Record<string, unknown>;
}

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
  /** Commands the agent may choose this turn. */
  options: CommandSpec[];
}

export interface TurnResponse {
  command: GameCommand;
  reason?: string;
}
