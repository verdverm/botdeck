import { describe, expect, it } from "vitest";
import { toolCallsFromResponse } from "./agent.ts";
import type { LLMResponse } from "@opencode-ai/llm";

function makeResponse(events: Array<{ type: string; [key: string]: unknown }>): LLMResponse {
  const toolCalls = events.filter((e) => e.type === "tool-call");
  const textDeltas = events.filter((e) => e.type === "text-delta");
  const text = textDeltas.map((e) => String(e.text ?? "")).join("");
  return {
    text,
    toolCalls: toolCalls as unknown as LLMResponse["toolCalls"],
  } as unknown as LLMResponse;
}

describe("toolCallsFromResponse", () => {
  it("extracts native tool calls with name and input", () => {
    const response = makeResponse([
      { type: "text-delta", id: "t1", text: "Let me write that down." },
      { type: "tool-call", id: "call_1", name: "memory_write", input: { slug: "low-hp", content: "Stu is hurt" } },
    ]);

    const calls = toolCallsFromResponse(response);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      id: "call_1",
      name: "memory_write",
      input: { slug: "low-hp", content: "Stu is hurt" },
    });
  });

  it("falls back to parsing text markup when no native tool calls are present", () => {
    const response = makeResponse([
      {
        type: "text-delta",
        id: "t1",
        text: '<tool_call><function=memory_write><parameter=slug>low-hp</parameter><parameter=content>Stu is hurt</parameter></function></tool_call>',
      },
    ]);

    const calls = toolCallsFromResponse(response);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "memory_write",
      input: { slug: "low-hp", content: "Stu is hurt" },
    });
  });
});
