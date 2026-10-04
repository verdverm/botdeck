import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AgentTab } from "./AgentTab";
import type { TurnResponse, TurnTranscript } from "@/types";

function makeResponse(transcript: TurnTranscript): TurnResponse {
  return {
    command: { name: "fight", args: { actor: "Stu", target: "Goblin" } },
    reason: "test",
    transcript,
  };
}

describe("AgentTab transcript rendering", () => {
  afterEach(() => cleanup());

  it("renders tool calls with their name and input alongside their results", () => {
    const transcript: TurnTranscript = {
      rounds: [
        {
          assistantText: "",
          toolCalls: [
            { id: "call_1", name: "memory_write", input: { slug: "low-hp", content: "Stu is hurt" } },
          ],
          toolResults: [{ id: "call_1", name: "memory_write", result: { written: 11 } }],
        },
      ],
    };

    render(<AgentTab lastResponse={makeResponse(transcript)} messages={[]} />);

    expect(screen.getByText(/\(called tools\)/)).toBeInTheDocument();
    expect(screen.getByTestId("tool-call-bubble")).toHaveTextContent("tool call: memory_write");
    expect(screen.getByText(/"slug": "low-hp"/)).toBeInTheDocument();
    expect(screen.getByTestId("tool-result-bubble")).toHaveTextContent("tool result: memory_write");
  });

  it("renders text-fallback-parsed tool calls as visible bubbles", () => {
    const transcript: TurnTranscript = {
      rounds: [
        {
          assistantText: '<tool_call>{"name":"memory_write","input":{"slug":"x","content":"y"}}</tool_call>',
          toolCalls: [{ id: "parsed_0", name: "memory_write", input: { slug: "x", content: "y" } }],
          toolResults: [{ id: "parsed_0", name: "memory_write", result: { written: 1 } }],
        },
      ],
    };

    render(<AgentTab lastResponse={makeResponse(transcript)} messages={[]} />);

    expect(screen.getByTestId("tool-call-bubble")).toHaveTextContent("tool call: memory_write");
    expect(screen.getByText(/"slug": "x"/)).toBeInTheDocument();
    expect(screen.getByTestId("tool-result-bubble")).toHaveTextContent("tool result: memory_write");
  });
});
