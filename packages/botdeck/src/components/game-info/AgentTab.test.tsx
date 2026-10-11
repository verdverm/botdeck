import { describe, expect, it, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

  it("renders validation errors and their correction prompts", () => {
    const transcript: TurnTranscript = {
      rounds: [
        {
          assistantText: "I will fight.",
          toolCalls: [{ id: "c1", name: "fight", input: { actor: "Stu", target: "Dragon" } }],
          validationError: "Target \"Dragon\" is not valid for fight.",
          correction: "Valid targets: Goblin.",
        },
      ],
    };

    render(<AgentTab lastResponse={makeResponse(transcript)} messages={[]} />);

    expect(screen.getByText("validation error")).toBeInTheDocument();
    expect(screen.getByText(/Target "Dragon"/)).toBeInTheDocument();
    expect(screen.getByText("retry prompt")).toBeInTheDocument();
    expect(screen.getByText(/Valid targets: Goblin./)).toBeInTheDocument();
  });

  it("captures the pending user message input and notifies the parent", () => {
    const onChange = vi.fn();
    render(<AgentTab pendingMessage="" onPendingMessageChange={onChange} messages={[]} />);

    const input = screen.getByPlaceholderText("optional message from the user for the next turn...");
    fireEvent.change(input, { target: { value: "Stop spamming interact" } });

    expect(onChange).toHaveBeenCalledWith("Stop spamming interact");
  });

  it("renders the user message in the prompt transcript", () => {
    const response: TurnResponse = {
      command: { name: "dialog_advance" },
      reason: "test",
      prompt: {
        system: "sys",
        user: "## Message from the user\n\nStop spamming interact",
      },
    };

    render(<AgentTab lastResponse={response} messages={[]} />);

    expect(screen.getByText(/## Message from the user/)).toBeInTheDocument();
    expect(screen.getByText(/Stop spamming interact/)).toBeInTheDocument();
  });

  it("shows a Run button in auto mode and starts auto-run on click", () => {
    const onAutoRunChange = vi.fn();
    render(
      <AgentTab
        runMode="auto"
        autoRun={false}
        onAutoRunChange={onAutoRunChange}
        messages={[]}
      />,
    );

    const runButton = screen.getByTestId("agent-run-action");
    expect(runButton).toHaveTextContent("Run");
    fireEvent.click(runButton);
    expect(onAutoRunChange).toHaveBeenCalledWith(true);
  });

  it("shows a Stop button while auto-running and aborts on click", () => {
    const onAbort = vi.fn();
    render(
      <AgentTab
        runMode="auto"
        autoRun={true}
        onAbort={onAbort}
        messages={[]}
      />,
    );

    const stopButton = screen.getByTestId("agent-stop-action");
    expect(stopButton).toHaveTextContent("Stop");
    fireEvent.click(stopButton);
    expect(onAbort).toHaveBeenCalled();
  });

  it("shows a Step button in step mode and steps on click", () => {
    const onStep = vi.fn();
    render(<AgentTab runMode="step" onStep={onStep} messages={[]} />);

    const stepButton = screen.getByTestId("agent-step-action");
    expect(stepButton).toHaveTextContent("Step");
    fireEvent.click(stepButton);
    expect(onStep).toHaveBeenCalled();
  });

  it("shows a Stop button while a snippet is running and stops the snippet on click", () => {
    const onStopSnippet = vi.fn();
    render(
      <AgentTab
        runMode="auto"
        snippetRunning={true}
        onStopSnippet={onStopSnippet}
        messages={[]}
      />,
    );

    const stopButton = screen.getByTestId("agent-stop-action");
    expect(stopButton).toHaveTextContent("Stop");
    fireEvent.click(stopButton);
    expect(onStopSnippet).toHaveBeenCalled();
  });

  it("shows a Stop button while the agent is busy in step mode", () => {
    const onAbort = vi.fn();
    render(
      <AgentTab
        runMode="step"
        isThinking={true}
        onAbort={onAbort}
        messages={[]}
      />,
    );

    const stopButton = screen.getByTestId("agent-stop-action");
    expect(stopButton).toHaveTextContent("Stop");
    fireEvent.click(stopButton);
    expect(onAbort).toHaveBeenCalled();
  });

  it("shows the idle pill when nothing is running", () => {
    render(<AgentTab messages={[]} />);
    expect(screen.getByText("idle")).toBeInTheDocument();
  });

  it("shows the thinking pill only while awaiting the LLM", () => {
    render(<AgentTab isThinking={true} messages={[]} />);
    expect(screen.getByText("thinking")).toBeInTheDocument();
  });

  it("shows the battling pill while a battle animates, not thinking", () => {
    render(<AgentTab isThinking={true} isBattling={true} messages={[]} />);
    expect(screen.getByText("battling")).toBeInTheDocument();
    expect(screen.queryByText("thinking")).not.toBeInTheDocument();
  });

  it("prefers the playing-macro pill over battling", () => {
    render(
      <AgentTab isThinking={true} isBattling={true} isPlayingMacro={true} messages={[]} />,
    );
    expect(screen.getByText("playing macro")).toBeInTheDocument();
    expect(screen.queryByText("battling")).not.toBeInTheDocument();
  });
});
