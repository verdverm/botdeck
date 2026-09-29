import type { ButtonStep, CommandSpec, GameCommand } from "@/types";

/**
 * A game-specific adapter. Each game (Final Fantasy, Pokemon, ...) ships a
 * plugin that knows how to read structured state out of the running emulator
 * and how to translate a high-level command into a button macro. Keeping the
 * game smarts here is what lets the agent loop stay generic and turn-based.
 */
export interface GamePlugin {
  id: string;
  title: string;

  /** Commands the agent may choose this turn (empty = no decision needed). */
  availableCommands(): CommandSpec[];

  /** Structured game state for building the agent's context/message. */
  readState(): Record<string, unknown>;

  /**
   * Maps a chosen command to the exact button sequence to play. Unknown
   * commands should map to an empty array (a no-op) rather than throw.
   */
  compile(command: GameCommand): ButtonStep[];
}
