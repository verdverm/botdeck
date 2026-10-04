import { describe, expect, it } from "vitest";
import { parseToolCallsFromText, parsedCallsToToolCalls, buildCorrectionMessage } from "./decision.ts";
import type { CommandSpec } from "./protocol.ts";

describe("parseToolCallsFromText", () => {
  it("parses the simple JSON tool_call form", () => {
    const raw = `<tool_call>{"name": "memory_write", "input": {"slug": "cornelia-inn", "content": "Cornelia inn is at the top-left."}}</tool_call>`;
    const calls = parseToolCallsFromText(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      id: "parsed_0",
      name: "memory_write",
      input: { slug: "cornelia-inn", content: "Cornelia inn is at the top-left." },
    });
  });

  it("parses the function/parameter durable-tool form", () => {
    const raw = `<tool_call><function=memory_write><parameter=slug>cornelia-inn</parameter><parameter=content>Cornelia inn is at the top-left.</parameter></function></tool_call>`;
    const calls = parseToolCallsFromText(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      id: "parsed_0",
      name: "memory_write",
      input: { slug: "cornelia-inn", content: "Cornelia inn is at the top-left." },
    });
  });

  it("parses the function/parameter command form with nested command JSON", () => {
    const raw = `<tool_call><function=fight><parameter=command>{"command":{"name":"fight","args":{"actor":"Stu","target":"slot 0"}},"reason":"focus fire"}</parameter></function></tool_call>`;
    const calls = parseToolCallsFromText(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      id: "parsed_0",
      name: "fight",
      input: { actor: "Stu", target: "slot 0" },
      reason: "focus fire",
    });
  });

  it("parses the function/parameter command form with direct parameters", () => {
    const raw = `<tool_call><function=menu_navigate><parameter=direction>down</parameter><parameter=steps>2</parameter><parameter=reason>move to the item</parameter></function></tool_call>`;
    const calls = parseToolCallsFromText(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      id: "parsed_0",
      name: "menu_navigate",
      input: { direction: "down", steps: 2 },
      reason: "move to the item",
    });
  });

  it("parses reason from the simple JSON form", () => {
    const raw = `<tool_call>{"name": "fight", "input": {"target": "slot 0", "reason": "focus fire"}}</tool_call>`;
    const calls = parseToolCallsFromText(raw);
    expect(calls[0]).toEqual({
      id: "parsed_0",
      name: "fight",
      input: { target: "slot 0" },
      reason: "focus fire",
    });
  });

  it("parses multiple calls in one response", () => {
    const raw = [
      `<tool_call><function=memory_write><parameter=slug>low-hp</parameter><parameter=content>Stu is hurt</parameter></function></tool_call>`,
      `<tool_call><function=fight><parameter=command>{"command":{"name":"fight","args":{"actor":"Stu","target":"slot 1"}},"reason":"finish the goblin"}</parameter></function></tool_call>`,
    ].join("\n");
    const calls = parseToolCallsFromText(raw);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.name).toBe("memory_write");
    expect(calls[1]!).toEqual({
      id: "parsed_1",
      name: "fight",
      input: { actor: "Stu", target: "slot 1" },
      reason: "finish the goblin",
    });
  });

  it("ignores malformed blocks", () => {
    const raw = `<tool_call>not valid json</tool_call><tool_call><function=ok><parameter=x>1</parameter></function></tool_call>`;
    const calls = parseToolCallsFromText(raw);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.name).toBe("ok");
  });

  it("returns an empty array when no markup is present", () => {
    expect(parseToolCallsFromText("just some prose")).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseToolCallsFromText("")).toEqual([]);
  });

  it("keeps the first command call when multiple command calls appear", () => {
    const raw = [
      `<tool_call><function=fight><parameter=command>{"command":{"name":"fight","args":{"actor":"Stu"}}}</parameter></function></tool_call>`,
      `<tool_call><function=move><parameter=command>{"command":{"name":"move","args":{"direction":"up"}}}</parameter></function></tool_call>`,
    ].join("\n");
    const calls = parseToolCallsFromText(raw);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.name).toBe("fight");
    expect(calls[1]!.name).toBe("move");
  });
});

describe("parsedCallsToToolCalls", () => {
  it("strips reason from the transcript representation", () => {
    const calls = [
      { id: "c1", name: "fight", input: { target: "slot 0" }, reason: "focus fire" },
    ];
    expect(parsedCallsToToolCalls(calls)).toEqual([
      { id: "c1", name: "fight", input: { target: "slot 0" } },
    ]);
  });
});

const OPTIONS: CommandSpec[] = [
  { name: "move", description: "Move", args: "{direction}" },
  { name: "fight", description: "Fight" },
];

describe("buildCorrectionMessage", () => {
  it("lists available commands and demands exactly one command tool", () => {
    const msg = buildCorrectionMessage(OPTIONS);
    expect(msg).toContain("did not call a command tool");
    expect(msg).toContain("exactly ONE command tool");
    expect(msg).toContain("move");
    expect(msg).toContain("fight");
    expect(msg).not.toContain("final answer");
  });

  it("forbids writing command JSON or XML as a substitute", () => {
    const msg = buildCorrectionMessage([]);
    expect(msg).toContain("Do not write command JSON, XML, or explanations");
  });
});
