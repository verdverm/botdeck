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
  /** Snippet names concatenated (in order) to form the system prompt. */
  systemSnippets: string[];
  /** Snippet names concatenated (in order) to form the user prompt. */
  userSnippets: string[];
  autoAdvance?: boolean;
}

export interface TurnRequest {
  gameId: string;
  playId?: string;
  /** Active agent mode (overworld/interior/shop/battle); drives prompt snippet selection. */
  mode?: string;
  state: Record<string, unknown>;
  screenshot?: string;
  options: CommandSpec[];
  /** In battle, the party member whose turn is being decided. */
  actor?: string;
  /** Optional message from the user injected for this turn only. */
  userMessage?: string;
}

export interface TurnTranscriptRound {
  /** Raw assistant text emitted in this round. */
  assistantText: string;
  /** Tool calls requested by the assistant in this round (if any). */
  toolCalls?: ToolCall[];
  /** Tool results returned to the assistant in this round (if any). */
  toolResults?: ToolResult[];
  /** If the assistant's final-text output could not be parsed into a command, the error message. */
  parseError?: string;
  /** If the assistant called a command tool but the command failed semantic validation, the error message. */
  validationError?: string;
  /** Optional follow-up message sent to the model after a parse or validation error. */
  correction?: string;
}

export interface TurnTranscript {
  /** Rendered system prompt. */
  system?: string;
  /** Rendered user prompt. */
  user?: string;
  /** One entry per LLM round (tool or final-text). */
  rounds: TurnTranscriptRound[];
}

export interface TurnResponse {
  command: GameCommand;
  reason?: string;
  /** If present, the turn did not produce a valid command and the loop should surface this instead of executing. */
  error?: string;
  /** The rendered system + user prompts sent to the model (for UI inspection). */
  prompt?: { system?: string; user?: string };
  /** Raw text output from the model before parsing/coercion. */
  raw?: string;
  /** Full message/tool-call transcript for UI inspection. */
  transcript?: TurnTranscript;
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
  /** Set when the turn failed (agent error, validation, macro compile); still recorded as history. */
  error?: string;
}

export interface GamePlugin {
  id: string;
  title: string;
  availableCommands(state?: Record<string, unknown>, context?: { actor?: string }): CommandSpec[];
  readState(): Record<string, unknown>;
  /** Current agent mode for this plugin state (overworld/interior/shop/battle). */
  getMode(state?: Record<string, unknown>): string;
  compile(command: GameCommand): ButtonStep[];
  /**
   * Optional per-frame abort predicate for the macro about to play.
   *
   * Long macros (overworld travel) assume the game stays in the mode the
   * command was compiled for. A random battle, a town entrance, or any other
   * transition invalidates the rest of the sequence, so the plugin can return a
   * cheap predicate that the emulator checks once per frame. Returning
   * undefined means "play the macro to completion".
   */
  macroAbort?(command: GameCommand): (() => boolean) | undefined;
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
  /** Optional saved-state filename to load before running. When omitted, the snippet runs against the currently loaded emulator state. */
  startState?: string;
  steps: SnippetStep[];
  expectedEndState?: string;
  tags?: string[];
}

export type SnippetStep =
  | { kind: "command"; command: GameCommand }
  | { kind: "macro"; buttonSteps: ButtonStep[] }
  | { kind: "wait"; frames: number };

export interface SnippetRunResult {
  beforePath?: string;
  afterPath?: string;
  diff?: Record<string, unknown>;
}

// --- markdown tab: agent memory / journal / goals / prompt templates -------
// These mirror the vermbot `files.ts` / `prompts.ts` shapes returned over the
// file API. AgentMode (prompt group) is already declared above with the turn
// protocol types.

/** A memory/journal entry as listed by GET .../memory | .../journal. */
export interface MemoryEntry {
  slug: string;
  mtime: number;
  preview: string;
  path: string;
  url: string;
}

export interface JournalEntry {
  name: string;
  mtime: number;
  preview: string;
  path: string;
  url: string;
}

/** A prompt template file listed at either the game or play layer. */
export interface PromptTemplateEntry {
  name: string;
  level: "game" | "play";
  path: string;
  url: string;
}

/** One resolved template inside a prompt-context bundle, with both layers. */
export interface TemplateSource {
  name: string;
  content: string;
  source: "play" | "game" | "none";
  gameContent: string | null;
  playContent: string | null;
}

/** The resolved prompt config (modes only) shared with the backend. */
export interface PromptConfig {
  modes?: AgentMode[];
}

/** GET .../prompt-context bundle: everything the browser needs to render. */
export interface PromptTemplateBundle {
  game: string;
  id: string | undefined;
  prompt: PromptConfig;
  limits: {
    memoryLimit: string;
    memoryCount: string;
    goalsLimit: string;
    journalLimit: string;
    snippetLimit: string;
    snippetCount: string;
    recentHistoryLimit: number;
  };
  context: {
    memory: string;
    goals: string;
    agentSnippets: string;
    recentHistory: string;
  };
  templates: TemplateSource[];
}
