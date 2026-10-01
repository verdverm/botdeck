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
  args?: string;
}

export interface TurnRequest {
  gameId: string;
  playId?: string;
  state: Record<string, unknown>;
  screenshot?: string;
  options: CommandSpec[];
}

export interface TurnResponse {
  command: GameCommand;
  reason?: string;
  /** The rendered system + user prompts sent to the model (for UI inspection). */
  prompt?: { system?: string; user?: string };
  /** Raw text output from the model before parsing/coercion. */
  raw?: string;
}

export interface StepRecord {
  stepId: string;
  ts: number;
  request: TurnRequest;
  response: TurnResponse;
  command: GameCommand;
  macro?: ButtonStep[];
  stateBefore?: string;
  stateAfter?: string;
}

export interface GamePlugin {
  id: string;
  title: string;
  availableCommands(): CommandSpec[];
  readState(): Record<string, unknown>;
  compile(command: GameCommand): ButtonStep[];
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
}

export interface ToolResult {
  id: string;
  name: string;
  result: unknown;
  error?: string;
}

export interface PlayStateMetadata {
  name: string;
  createdAt: string;
  bookmarked: boolean;
}

export interface PlayStateEntry {
  filename: string;
  statePath: string;
  extractedPath?: string;
  metadataPath?: string;
  stateUrl: string;
  extractedUrl?: string;
  metadataUrl?: string;
  name: string;
  createdAt: string;
  bookmarked: boolean;
}

export type PlayStateSort = "newest" | "oldest" | "name (a-z)" | "name (z-a)";
