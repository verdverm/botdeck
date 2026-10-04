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
});
