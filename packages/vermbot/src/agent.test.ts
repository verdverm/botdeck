import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ToolDefinition, type LLMRequest } from "@opencode-ai/llm";
import { runDecideLoop, toolCallsFromResponse } from "./agent.ts";
import { makeAgentTools, toolDefinitionsForRequest } from "./tools.ts";
import {
  createPlay,
  deletePlay,
  gameDir,
  playDir,
  writePlayConfig,
  readPlayMemoryEntry,
} from "./files.ts";
import { useTempRepoRoot } from "./test-root.ts";
import type { LLMResponse } from "@opencode-ai/llm";
import type { TurnRequest } from "./protocol.ts";
import type { AgentConfig } from "./files.ts";

function makeResponse(
  text: string,
  calls: Array<{ id: string; name: string; input?: Record<string, unknown> }> = [],
): LLMResponse {
  return {
    text,
    toolCalls: calls.map((c) => ({ type: "tool-call" as const, ...c })),
  } as unknown as LLMResponse;
}

function tmpName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const TEST_CONFIG: AgentConfig = {
  model: "small",
  maxToolRounds: 5,
  maxTokens: 1024,
  timeoutMs: 120_000,
  limits: { goals: 100, memory: 200, journal: 200, memoryCount: 10, snippets: 200, snippetCount: 10 },
  recentHistoryLimit: 10,
};

function writeGamePrompts(game: string) {
  const dir = join(gameDir(game), "prompts");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "system.md"), "You are playing {{gameId}}.");
  writeFileSync(join(dir, "commands.md"), "{{commands}}");
}

function setupPlay(game: string, id: string, config: AgentConfig) {
  mkdirSync(gameDir(game), { recursive: true });
  writeFileSync(join(gameDir(game), "config.json"), JSON.stringify({}));
  writeGamePrompts(game);
  createPlay(game, id);
  writePlayConfig(game, id, { id, game, agent: config });
}

function buildTools(options: TurnRequest["options"], config: AgentConfig, game: string, id: string) {
  const tools = makeAgentTools({ game, id, config }, options);
  const toolDefinitions = toolDefinitionsForRequest(tools).map((t) =>
    ToolDefinition.make({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }),
  );
  return { tools, toolDefinitions };
}

describe("toolCallsFromResponse", () => {
  it("extracts native tool calls with name and input", () => {
    const response = makeResponse("Let me write that down.", [
      { id: "call_1", name: "memory_write", input: { slug: "low-hp", content: "Stu is hurt" } },
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
    const response = makeResponse(
      '<tool_call><function=memory_write><parameter=slug>low-hp</parameter><parameter=content>Stu is hurt</parameter></function></tool_call>',
    );

    const calls = toolCallsFromResponse(response);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "memory_write",
      input: { slug: "low-hp", content: "Stu is hurt" },
    });
  });
});

describe("runDecideLoop", () => {
  useTempRepoRoot();

  let game: string;
  let id: string;

  beforeEach(() => {
    game = tmpName("game");
    id = tmpName("play");
  });

  afterEach(() => {
    try {
      deletePlay(game, id);
    } catch {
      // ignore
    }
  });

  it("ends on a valid command tool call and appends a final assistant transcript round", async () => {
    setupPlay(game, id, { ...TEST_CONFIG, maxToolRounds: 1 });
    const req: TurnRequest = {
      gameId: game,
      playId: `${game}/${id}`,
      state: {},
      options: [{ name: "interact", description: "Press A" }],
    };
    const config = { ...TEST_CONFIG, maxToolRounds: 1 };
    const { tools, toolDefinitions } = buildTools(req.options, config, game, id);

    const response = makeResponse("I will interact.", [
      { id: "c1", name: "interact", input: { reason: "open dialog" } },
    ]);

    const res = await runDecideLoop(req, {
      generate: async () => response,
      config,
      tools,
      toolDefinitions,
      system: "sys",
      user: "user",
      userPath: "/test",
    });

    expect(res.error).toBeUndefined();
    expect(res.command).toEqual({ name: "interact" });
    expect(res.reason).toBe("open dialog");
    expect(res.transcript?.rounds).toHaveLength(2);
    expect(res.transcript?.rounds[0]!.assistantText).toBe("I will interact.");
    expect(res.transcript?.rounds[0]!.toolCalls).toEqual([
      { id: "c1", name: "interact", input: { reason: "open dialog" } },
    ]);
    expect(res.transcript?.rounds[1]!.assistantText).toBe("Turn ended with valid command tool call.");
  });

  it("executes durable calls on validation-failure rounds and preserves assistant/tool/user alternation", async () => {
    setupPlay(game, id, { ...TEST_CONFIG, maxToolRounds: 2 });
    const req: TurnRequest = {
      gameId: game,
      playId: `${game}/${id}`,
      mode: "battle",
      state: {
        ff1: {
          party: [{ index: 0, name: "Stu" }],
          battle: {
            inBattle: true,
            party: [{ index: 0, name: "Stu", canAct: true }],
            enemies: [{ slot: 0, name: "Goblin", alive: true, hp: 10 }],
            activePartyIndex: 0,
          },
        },
      },
      options: [
        { name: "fight", description: "Attack", args: '{ "actor": "string", "target": "string" }' },
      ],
    };
    const config = { ...TEST_CONFIG, maxToolRounds: 2 };
    const { tools, toolDefinitions } = buildTools(req.options, config, game, id);

    const responses: LLMResponse[] = [
      makeResponse("Trying to fight.", [
        { id: "d1", name: "memory_write", input: { slug: "note", content: "hello" } },
        { id: "c1", name: "fight", input: { actor: "Stu", target: "Dragon" } },
      ]),
      makeResponse("Fixed target.", [
        { id: "c2", name: "fight", input: { actor: "Stu", target: "Goblin" } },
      ]),
    ];
    const capturedRequests: LLMRequest[] = [];
    const generate = async (request: LLMRequest) => {
      capturedRequests.push(request);
      return responses[capturedRequests.length - 1]!;
    };

    const res = await runDecideLoop(req, {
      generate,
      config,
      tools,
      toolDefinitions,
      system: "sys",
      user: "user",
      userPath: "/test",
    });

    expect(res.error).toBeUndefined();
    expect(res.command).toEqual({ name: "fight", args: { actor: "Stu", target: "Goblin" } });
    expect(res.transcript?.rounds).toHaveLength(3);

    const firstRound = res.transcript?.rounds[0]!;
    expect(firstRound.validationError).toContain("Dragon");
    expect(firstRound.correction).toBeTruthy();
    expect(firstRound.toolResults?.some((r) => r.name === "memory_write")).toBe(true);

    expect(readPlayMemoryEntry(game, id, "note")).toBe("hello");

    const secondRequest = capturedRequests[1]!;
    const messages = secondRequest.messages;
    expect(messages[0]!.role).toBe("user");
    expect(messages[1]!.role).toBe("assistant");
    expect(messages[2]!.role).toBe("tool");
    expect(messages[3]!.role).toBe("tool");
    expect(messages[4]!.role).toBe("user");
  });

  it("returns an error when max tool rounds are exhausted without a valid command", async () => {
    setupPlay(game, id, { ...TEST_CONFIG, maxToolRounds: 1 });
    const req: TurnRequest = {
      gameId: game,
      playId: `${game}/${id}`,
      state: {},
      options: [{ name: "interact", description: "Press A" }],
    };
    const config = { ...TEST_CONFIG, maxToolRounds: 1 };
    const { tools, toolDefinitions } = buildTools(req.options, config, game, id);

    const res = await runDecideLoop(req, {
      generate: async () => makeResponse("Just talking."),
      config,
      tools,
      toolDefinitions,
      system: "sys",
      user: "user",
      userPath: "/test",
    });

    expect(res.error).toBe("max tool rounds reached without a final command");
    expect(res.transcript?.rounds[0]!.parseError).toBe("no command tool call found");
  });

  it("allows press_button to end a turn when no high-level command applies", async () => {
    setupPlay(game, id, { ...TEST_CONFIG, maxToolRounds: 1 });
    const req: TurnRequest = {
      gameId: game,
      playId: `${game}/${id}`,
      state: {},
      options: [],
    };
    const config = { ...TEST_CONFIG, maxToolRounds: 1 };
    const { tools, toolDefinitions } = buildTools(req.options, config, game, id);

    const res = await runDecideLoop(req, {
      generate: async () =>
        makeResponse("Pressing A.", [{ id: "c1", name: "press_button", input: { button: "a" } }]),
      config,
      tools,
      toolDefinitions,
      system: "sys",
      user: "user",
      userPath: "/test",
    });

    expect(res.error).toBeUndefined();
    expect(res.command).toEqual({ name: "press_button", args: { button: "a" } });
    expect(res.transcript?.rounds).toHaveLength(2);
  });
});
