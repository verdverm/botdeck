import { describe, expect, it } from "vitest";
import { coerceCommand, parseDecision } from "./decision.ts";
import type { CommandSpec } from "./protocol.ts";

const OPTIONS: CommandSpec[] = [
  { name: "move", description: "Move", args: "{direction}" },
  { name: "fight", description: "Fight" },
];

describe("coerceCommand", () => {
  it("accepts a valid command with args", () => {
    expect(coerceCommand({ name: "move", args: { direction: "up" } }, OPTIONS)).toEqual({
      name: "move",
      args: { direction: "up" },
    });
  });

  it("accepts a valid command without args", () => {
    expect(coerceCommand({ name: "fight" }, OPTIONS)).toEqual({ name: "fight" });
  });

  it("returns null for an unknown command name", () => {
    expect(coerceCommand({ name: "invalid" }, OPTIONS)).toBeNull();
  });

  it("returns null when options is empty", () => {
    expect(coerceCommand({ name: "move" }, [])).toBeNull();
  });

  it("returns null when value is not an object", () => {
    expect(coerceCommand("move", OPTIONS)).toBeNull();
    expect(coerceCommand(null, OPTIONS)).toBeNull();
  });
});

describe("parseDecision", () => {
  it("parses a JSON object with command and reason", () => {
    const raw = `{"command":{"name":"move","args":{"direction":"down"}},"reason":"going south"}`;
    const res = parseDecision(raw, OPTIONS);
    expect(res.command).toEqual({ name: "move", args: { direction: "down" } });
    expect(res.reason).toBe("going south");
    expect(res.raw).toBe(raw);
  });

  it("finds a JSON object embedded in prose", () => {
    const raw = `Okay, I will move. {"command":{"name":"move","args":{"direction":"up"}},"reason":"north"} Done.`;
    const res = parseDecision(raw, OPTIONS);
    expect(res.command).toEqual({ name: "move", args: { direction: "up" } });
  });

  it("falls back to name matching in raw text", () => {
    const res = parseDecision("I think we should FIGHT now", OPTIONS);
    expect(res.command).toEqual({ name: "fight" });
    expect(res.reason).toBe("I think we should FIGHT now".slice(0, 120));
  });

  it("returns an error response when no command is found", () => {
    const res = parseDecision("just some unrelated text", OPTIONS);
    expect(res.command).toEqual({ name: "" });
    expect(res.error).toContain("No valid command");
  });

  it("returns an error response for malformed JSON", () => {
    const res = parseDecision(`{"command": broken`, OPTIONS);
    expect(res.command).toEqual({ name: "" });
    expect(res.error).toContain("No valid command");
  });

  it("preserves the prompt in the response", () => {
    const prompt = { system: "sys", user: "usr" };
    const res = parseDecision(`{"command":{"name":"move"}}`, OPTIONS, prompt);
    expect(res.prompt).toEqual(prompt);
  });
});
