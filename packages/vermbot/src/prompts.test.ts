import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { renderPrompt } from "./prompts.ts";
import { gameDir, playDir, createPlay, deletePlay } from "./files.ts";
import { useTempRepoRoot } from "./test-root.ts";
import type { TurnRequest } from "./protocol.ts";

function tmpName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function writeGamePrompts(game: string, files: Record<string, string>): void {
  const dir = join(gameDir(game), "prompts");
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, `${name}.md`), content);
  }
}

function writePlayPrompts(game: string, id: string, files: Record<string, string>): void {
  const dir = join(playDir(game, id), "snippets", "user");
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, `${name}.md`), content);
  }
}

function setSnippetList(game: string, id: string | undefined, snippets: string[]): void {
  const configPath = id ? join(playDir(game, id), "config.json") : join(gameDir(game), "config.json");
  const existing = id
    ? { id, game }
    : {};
  writeFileSync(configPath, JSON.stringify({ ...existing, prompt: { snippets } }));
}

describe("renderPrompt", () => {
  useTempRepoRoot();

  let game: string;
  let id: string;

  beforeEach(() => {
    game = tmpName("promptgame");
    id = tmpName("promptplay");
    mkdirSync(gameDir(game), { recursive: true });
    writeFileSync(join(gameDir(game), "config.json"), JSON.stringify({}));
    createPlay(game, id);
  });

  afterEach(() => {
    deletePlay(game, id);
    rmSync(gameDir(game), { recursive: true, force: true });
  });

  it("uses the system snippet as the system prompt", () => {
    setSnippetList(game, undefined, ["system", "state"]);
    writeGamePrompts(game, {
      system: "You are playing {{gameId}}.",
      state: "State: {{stateJson}}",
    });
    const req: TurnRequest = {
      gameId: game,
      state: {},
      options: [],
    };
    const { system, user } = renderPrompt(req);
    expect(system).toBe(`You are playing ${game}.`);
    expect(user).toContain("State:");
  });

  it("joins non-system snippets into the user prompt", () => {
    setSnippetList(game, undefined, ["system", "a", "b"]);
    writeGamePrompts(game, {
      system: "sys",
      a: "first",
      b: "second",
    });
    const req: TurnRequest = { gameId: game, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toBe("first\n\nsecond");
  });

  it("play snippets shadow game snippets", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "game system",
      state: "game state",
    });
    writePlayPrompts(game, id, {
      system: "play system",
    });
    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { system, user } = renderPrompt(req);
    expect(system).toBe("play system");
    expect(user).toBe("game state");
  });

  it("agent snippets do not shadow user/system snippets and are appended separately", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "game system",
      state: "game state",
    });
    writePlayPrompts(game, id, {
      system: "play system",
    });
    const agentDir = join(playDir(game, id), "snippets", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "system.md"), "agent system");
    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { system, user } = renderPrompt(req);
    expect(system).toBe("play system");
    expect(user).toContain("game state");
    expect(user).toContain("Agent-authored snippets");
    expect(user).toContain("agent system");
  });

  it("substitutes commands, state, gameId, and playId", () => {
    setSnippetList(game, id, ["system", "commands", "state"]);
    writeGamePrompts(game, {
      system: "Game: {{gameId}}",
      commands: "{{commands}}",
      state: "{{stateJson}}",
    });
    const req: TurnRequest = {
      gameId: game,
      playId: `${game}/${id}`,
      state: { hp: 10 },
      options: [{ name: "interact", description: "press A" }],
    };
    const { system, user } = renderPrompt(req);
    expect(system).toBe(`Game: ${game}`);
    expect(user).toContain("- interact: press A");
    expect(user).toContain('"hp": 10');
  });

  it("returns empty parts when snippet list is empty", () => {
    writeFileSync(
      join(playDir(game, id), "config.json"),
      JSON.stringify({ id, game, prompt: { snippets: [] } }),
    );
    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { system, user } = renderPrompt(req);
    expect(system).toBe("");
    expect(user).toBe("");
  });

  it("skips missing snippets without throwing", () => {
    setSnippetList(game, id, ["system", "exists", "missing"]);
    writeGamePrompts(game, {
      system: "sys",
      exists: "yes",
    });
    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toBe("yes");
  });

  it("rejects unsafe snippet names", () => {
    setSnippetList(game, id, ["../escape"]);
    writeGamePrompts(game, {
      system: "sys",
    });
    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    expect(() => renderPrompt(req)).toThrow();
  });

  it("appends agent snippets in sorted order after configured user snippets", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "sys",
      state: "user body",
    });
    const agentDir = join(playDir(game, id), "snippets", "agent");
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, "zebra.md"), "last agent note");
    writeFileSync(join(agentDir, "alpha.md"), "first agent note");
    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user.indexOf("user body")).toBeLessThan(user.indexOf("Agent-authored snippets"));
    expect(user.indexOf("### alpha")).toBeLessThan(user.indexOf("### zebra"));
  });

  it("omits the agent snippets section when no agent snippets exist", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "sys",
      state: "user body",
    });
    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toBe("user body");
  });

  it("appends the user message as a clearly marked section at the end of the user prompt", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "sys",
      state: "user body",
    });
    const req: TurnRequest = {
      gameId: game,
      playId: `${game}/${id}`,
      state: {},
      options: [],
      userMessage: "Stop spamming interact",
    };
    const { user } = renderPrompt(req);
    expect(user).toContain("user body");
    expect(user).toContain("Message from the user");
    expect(user).toContain("Stop spamming interact");
    expect(user.indexOf("user body")).toBeLessThan(user.indexOf("Message from the user"));
  });

  it("omits the user message section when no user message is provided", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "sys",
      state: "user body",
    });
    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).not.toContain("Message from the user");
  });

  it("appends recent persisted steps as a compact history section", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "sys",
      state: "user body",
    });
    const stepsDir = join(playDir(game, id), "steps");
    mkdirSync(stepsDir, { recursive: true });
    const step1 = {
      stepId: "000001",
      ts: 1,
      request: { gameId: game, state: {}, options: [] },
      response: { command: { name: "interact" }, reason: "searched the tile" },
      command: { name: "interact" },
    };
    const step2 = {
      stepId: "000002",
      ts: 2,
      request: { gameId: game, state: {}, options: [] },
      response: { command: { name: "dialog_advance" }, reason: "advanced dialog" },
      command: { name: "dialog_advance" },
    };
    writeFileSync(join(stepsDir, "000001.step.json"), JSON.stringify(step1));
    writeFileSync(join(stepsDir, "000002.step.json"), JSON.stringify(step2));

    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toContain("Recent actions");
    expect(user).toContain("interact: searched the tile");
    expect(user).toContain("dialog_advance: advanced dialog");
    expect(user.indexOf("interact:")).toBeLessThan(user.indexOf("dialog_advance:"));
  });

  it("renders step history when the game agent config omits recentHistoryLimit", () => {
    // Regression: the committed game configs predate recentHistoryLimit. The
    // strict AgentConfig schema must not require it, otherwise resolveAgentConfig
    // throws on every turn and the model never sees any history at runtime.
    writeGamePrompts(game, {
      system: "sys",
      state: "user body",
    });
    writeFileSync(
      join(gameDir(game), "config.json"),
      JSON.stringify({
        agent: {
          model: "small",
          maxToolRounds: 5,
          maxTokens: 512,
          timeoutMs: 1000,
          limits: { goals: 1024, memory: 2048, journal: 8192, memoryCount: 10, snippets: 4096, snippetCount: 50 },
          tools: ["memory_write"],
        },
        prompt: { snippets: ["system", "state"] },
      }),
    );
    const stepsDir = join(playDir(game, id), "steps");
    mkdirSync(stepsDir, { recursive: true });
    writeFileSync(
      join(stepsDir, "000001.step.json"),
      JSON.stringify({
        stepId: "000001",
        ts: 1,
        request: { gameId: game, state: {}, options: [] },
        response: { command: { name: "interact" }, reason: "searched the tile" },
        command: { name: "interact" },
      }),
    );

    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toContain("Recent actions");
    expect(user).toContain("interact: searched the tile");
  });

  it("respects recentHistoryLimit when rendering step history", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "sys",
      state: "user body",
    });
    writeFileSync(
      join(playDir(game, id), "config.json"),
      JSON.stringify({ id, game, agent: { recentHistoryLimit: 1 }, prompt: { snippets: ["system", "state"] } }),
    );
    const stepsDir = join(playDir(game, id), "steps");
    mkdirSync(stepsDir, { recursive: true });
    const step1 = {
      stepId: "000001",
      ts: 1,
      request: { gameId: game, state: {}, options: [] },
      response: { command: { name: "interact" }, reason: "first" },
      command: { name: "interact" },
    };
    const step2 = {
      stepId: "000002",
      ts: 2,
      request: { gameId: game, state: {}, options: [] },
      response: { command: { name: "dialog_advance" }, reason: "second" },
      command: { name: "dialog_advance" },
    };
    writeFileSync(join(stepsDir, "000001.step.json"), JSON.stringify(step1));
    writeFileSync(join(stepsDir, "000002.step.json"), JSON.stringify(step2));

    const req: TurnRequest = { gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toContain("dialog_advance: second");
    expect(user).not.toContain("interact: first");
  });
});
