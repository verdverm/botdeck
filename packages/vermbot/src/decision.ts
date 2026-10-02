import type { CommandSpec, GameCommand, TurnResponse } from "./protocol.ts";

export function coerceCommand(value: unknown, options: CommandSpec[]): GameCommand {
  const names = new Set(options.map((o) => o.name));
  if (value && typeof value === "object") {
    const obj = value as { name?: unknown; args?: unknown };
    const name = typeof obj.name === "string" ? obj.name : "";
    if (names.has(name)) {
      const args =
        obj.args && typeof obj.args === "object"
          ? (obj.args as Record<string, unknown>)
          : undefined;
      return { name, args };
    }
  }
  return options.length > 0 ? { name: options[0]!.name } : { name: "wait" };
}

export function parseDecision(
  raw: string,
  options: CommandSpec[],
  prompt?: { system?: string; user?: string },
): TurnResponse {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const obj = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
        command?: unknown;
        reason?: unknown;
      };
      return {
        command: coerceCommand(obj.command, options),
        reason: typeof obj.reason === "string" ? obj.reason : undefined,
        prompt,
        raw,
      };
    } catch {
      // fall through to name-match below
    }
  }
  const found = options.find((o) => raw.toUpperCase().includes(o.name.toUpperCase()));
  return {
    command: found ? { name: found.name } : { name: "wait" },
    reason: raw.slice(0, 120),
    prompt,
    raw,
  };
}
