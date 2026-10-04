import type { ToolCall, CommandSpec } from "./protocol.ts";

export interface ParsedToolCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  reason?: string;
}

/**
 * Parse pseudo-tool-call markup from raw assistant text into canonical tool
 * calls. This is the pragmatic bridge for inference stacks that do not surface
 * native tool_call events: vLLM may emit either of the XML forms below, and
 * this parser normalizes both into the same call shape used by agent.ts.
 *
 * Supported forms:
 *
 * 1. Simple JSON block:
 *    <tool_call>{"name": "memory_write", "input": {"slug": "x", "content": "y"}}</tool_call>
 *
 * 2. Function/parameter block (the observed vLLM template):
 *    <tool_call><function=memory_write><parameter=slug>x</parameter><parameter=content>y</parameter></function></tool_call>
 *
 *    For command tools the model may emit:
 *    <tool_call><function=fight><parameter=command>{"command":{"name":"fight","args":{"target":"slot 0"}},"reason":"focus fire"}</parameter></function></tool_call>
 *
 *    The parser extracts the inner command args and the reason, so the call
 *    input contains only the command arguments.
 */
export function parseToolCallsFromText(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];

  const simpleRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = simpleRegex.exec(text)) !== null) {
    const body = (match[1] as string).trim();
    if (body.startsWith("<function=")) continue;
    try {
      const obj = JSON.parse(body) as { name?: unknown; input?: unknown; reason?: unknown };
      if (typeof obj.name === "string") {
        let input: Record<string, unknown> | undefined;
        let reason: string | undefined;
        if (obj.input && typeof obj.input === "object" && !Array.isArray(obj.input)) {
          const inputObj = obj.input as Record<string, unknown>;
          const { reason: inputReason, ...rest } = inputObj;
          input = rest;
          if (typeof inputReason === "string") reason = inputReason;
        }
        if (typeof obj.reason === "string") reason = obj.reason;
        calls.push({ id: `parsed_${calls.length}`, name: obj.name, input, reason });
      }
    } catch {
      // ignore malformed simple blocks
    }
  }

  const funcRegex = /<tool_call>\s*<function=([a-zA-Z0-9_]+)>([\s\S]*?)<\/function>\s*<\/tool_call>/g;
  while ((match = funcRegex.exec(text)) !== null) {
    const name = match[1] as string;
    const body = match[2] as string;
    const params: Record<string, unknown> = {};
    let commandValue: unknown;
    let reason: string | undefined;

    const paramRegex = /<parameter=([a-zA-Z0-9_]+)>([\s\S]*?)<\/parameter>/g;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(body)) !== null) {
      const key = paramMatch[1] as string;
      const rawValue = (paramMatch[2] as string).trim();
      let value: unknown = rawValue;
      if (rawValue.length > 0) {
        try {
          value = JSON.parse(rawValue);
        } catch {
          // keep as string
        }
      }
      if (key === "reason") {
        reason = typeof value === "string" ? value : JSON.stringify(value);
      } else if (key === "command") {
        commandValue = value;
      } else {
        params[key] = value;
      }
    }

    const { args, reason: cmdReason } = extractCommandArgs(commandValue);
    const input = { ...args, ...params };
    calls.push({
      id: `parsed_${calls.length}`,
      name,
      input: Object.keys(input).length > 0 ? input : undefined,
      reason: reason ?? cmdReason,
    });
  }

  return calls;
}

function extractCommandArgs(value: unknown): { args?: Record<string, unknown>; reason?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const obj = value as Record<string, unknown>;
  let reason: string | undefined;
  if (typeof obj.reason === "string") reason = obj.reason;

  if ("command" in obj && typeof obj.command === "object" && obj.command !== null) {
    const cmd = obj.command as Record<string, unknown>;
    if (typeof cmd.reason === "string") reason = cmd.reason;
    if ("args" in cmd && typeof cmd.args === "object" && cmd.args !== null && !Array.isArray(cmd.args)) {
      return { args: { ...(cmd.args as Record<string, unknown>) }, reason };
    }
    return { args: omitKeys(cmd, ["name", "reason"]), reason };
  }

  if ("args" in obj && typeof obj.args === "object" && obj.args !== null && !Array.isArray(obj.args)) {
    return { args: { ...(obj.args as Record<string, unknown>) }, reason };
  }

  return { args: omitKeys(obj, ["name", "reason"]), reason };
}

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.includes(k)) result[k] = v;
  }
  return result;
}

/**
 * Convert parsed text calls into the canonical ToolCall shape used in
 * transcripts. Reason is preserved on the parsed object but is not part of the
 * tool-call transcript (it becomes the TurnResponse.reason).
 */
export function parsedCallsToToolCalls(calls: ParsedToolCall[]): ToolCall[] {
  return calls.map((call) => ({
    id: call.id,
    name: call.name,
    input: call.input,
  }));
}

export function buildCorrectionMessage(options: CommandSpec[]): string {
  const list = options.map((o) => `- ${o.name}: ${o.description}`).join("\n");
  return [
    "Your previous response did not call a command tool.",
    "Available commands this turn are:",
    list,
    "You must end your turn by calling exactly ONE command tool from the list above. Do not write command JSON, XML, or explanations as a substitute for a tool call.",
  ].join("\n");
}
