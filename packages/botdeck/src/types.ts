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

export interface AgentMode {
  id: string;
  label: string;
  promptSnippets: string[];
  autoAdvance?: boolean;
}

export interface TurnRequest {
  gameId: string;
  playId?: string;
  /** Active agent mode (field/battle/shop/inn/clinic); drives prompt snippet selection. */
  mode?: string;
  state: Record<string, unknown>;
  screenshot?: string;
  options: CommandSpec[];
  /** In battle, the party member whose turn is being decided. */
  actor?: string;
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
  availableCommands(state?: Record<string, unknown>, context?: { actor?: string }): CommandSpec[];
  readState(): Record<string, unknown>;
  /** Current agent mode for this plugin state (field/battle/shop/inn). */
  getMode(state?: Record<string, unknown>): string;
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

export interface PlaySnippet {
  id: string;
  name: string;
  description: string;
  game: string;
  play: string;
  startState: string;
  steps: SnippetStep[];
  expectedEndState?: string;
  tags?: string[];
}

export type SnippetStep =
  | { kind: "command"; command: GameCommand }
  | { kind: "macro"; buttonSteps: ButtonStep[] }
  | { kind: "wait"; frames: number };
