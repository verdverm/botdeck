/**
 * botdeck <-> vermbot protocol (server side; mirrored in botdeck's types.ts).
 *
 * Turn-based model: the agent reasons in high-level GameCommands (never raw
 * button pushes). botdeck's game plugin advertises the available command specs
 * each turn, and the agent must pick one; the plugin then compiles it into a
 * button macro played out with human-like timing.
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
  /** Optional play id (game/id) used to resolve prompt config and snippets. */
  playId?: string;
  /** Active agent mode (field/battle/shop/inn/clinic); drives prompt snippet selection. */
  mode?: string;
  /** Structured game state prepared by the plugin. */
  state: Record<string, unknown>;
  /** Optional PNG data URL of the current frame. */
  screenshot?: string;
  /** Commands the agent may choose this turn. */
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

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema describing the tool's input arguments. */
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

/** One persisted turn of the agent loop (mirrored in botdeck types.ts). */
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

/** Type guard: confirms a value is a well-formed TurnRequest. */
export function isValidTurnRequest(value: unknown): value is TurnRequest {
  if (!value || typeof value !== "object") return false;
  const req = value as Partial<TurnRequest>;
  if (typeof req.gameId !== "string" || req.gameId.length === 0) return false;
  if (typeof req.playId !== "undefined" && typeof req.playId !== "string") return false;
  if (!req.state || typeof req.state !== "object") return false;
  if (!Array.isArray(req.options)) return false;
  return req.options.every(
    (o) =>
      o &&
      typeof o === "object" &&
      typeof (o as CommandSpec).name === "string" &&
      typeof (o as CommandSpec).description === "string",
  );
}
