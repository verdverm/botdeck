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

// A minimal FF1GameState snapshot builder, shaped exactly as the extracted
// `.ff1.json` sidecar the file API's diff step reads. Only the battle command
// buffer fields the recent-action derivation consumes are populated.
function battleSnapshot(
  queued: { member: string; command: string; target: { kind: string; slot?: number } }[],
  opts: { inBattle?: boolean; phase?: string } = {},
): unknown {
  const partyNames = ["Stu", "Rias", "Zing", "Jaki"];
  return {
    battle: {
      inBattle: opts.inBattle ?? true,
      phase: opts.phase ?? "commandEntry",
      enemyCount: 2,
      enemies: [
        { slot: 0, name: "Goblin", hp: 8, alive: true },
        { slot: 1, name: "Imp", hp: 8, alive: true },
      ],
      party: partyNames.map((name, index) => {
        const q = queued.find((x) => x.member === name);
        return {
          index,
          name,
          alive: true,
          canAct: !q,
          pendingAction: q ? { command: q.command, target: q.target } : undefined,
        };
      }),
    },
    party: partyNames.map((name, index) => ({ index, name, hp: 50 })),
  };
}

// Persist a before/after pair of ff1 sidecars plus a step referencing them, so
// the recent-actions section is rendered purely from the state diff.
function writeStepWithDiff(
  game: string,
  id: string,
  stepId: string,
  command: { name: string; args?: Record<string, unknown> },
  before: unknown,
  after: unknown,
): void {
  const stepsDir = join(playDir(game, id), "steps");
  const statesDir = join(playDir(game, id), "states");
  mkdirSync(stepsDir, { recursive: true });
  mkdirSync(statesDir, { recursive: true });
  const base = `step_${stepId}`;
  writeFileSync(join(statesDir, `${base}_before.ff1.json`), JSON.stringify(before));
  writeFileSync(join(statesDir, `${base}_after.ff1.json`), JSON.stringify(after));
  writeFileSync(
    join(stepsDir, `${stepId}.step.json`),
    JSON.stringify({
      stepId,
      ts: 1,
      request: { gameId: game, state: {}, options: [] },
      response: { command, reason: "MODEL CLAIM SHOULD NOT APPEAR" },
      command,
      stateBefore: `plays/${game}/${id}/states/${base}_before.state.json`,
      stateAfter: `plays/${game}/${id}/states/${base}_after.state.json`,
    }),
  );
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
  // Modes are the only source of a snippet list; tests use a single "field"
  // mode. Renderers pass `mode: "field"` on the TurnRequest to select it.
  const mode = { id: "field", label: "Field", promptSnippets: snippets };
  writeFileSync(configPath, JSON.stringify({ ...existing, prompt: { modes: [mode] } }));
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
      mode: "field",
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
    const req: TurnRequest = {
      mode: "field", gameId: game, state: {}, options: [] };
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
    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
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
    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
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
      mode: "field",
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
      JSON.stringify({ id, game, prompt: { modes: [] } }),
    );
    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
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
    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toBe("yes");
  });

  it("rejects unsafe snippet names", () => {
    setSnippetList(game, id, ["../escape"]);
    writeGamePrompts(game, {
      system: "sys",
    });
    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
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
    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
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
    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
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
      mode: "field",
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
    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).not.toContain("Message from the user");
  });

  it("appends state-derived recent steps as a compact history section", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "sys",
      state: "user body",
    });
    // Step 1: the command buffer latched Stu's attack on enemy slot 0.
    writeStepWithDiff(
      game,
      id,
      "000001",
      { name: "fight", args: { actor: "Stu", target: "Goblin (slot 0)" } },
      battleSnapshot([]),
      battleSnapshot([{ member: "Stu", command: "attack", target: { kind: "enemy", slot: 0 } }]),
    );
    // Step 2: nothing observable changed.
    writeStepWithDiff(
      game,
      id,
      "000002",
      { name: "menu" },
      battleSnapshot([{ member: "Stu", command: "attack", target: { kind: "enemy", slot: 0 } }]),
      battleSnapshot([{ member: "Stu", command: "attack", target: { kind: "enemy", slot: 0 } }]),
    );

    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toContain("## Recent actions");
    // Derived from the before/after battle-command-buffer diff, not the model.
    expect(user).toContain("Stu queued ATTACK -> Goblin (enemy slot 0)");
    expect(user).toContain("menu -> no observable state change");
    expect(user.indexOf("fight(")).toBeLessThan(user.indexOf("menu ->"));
    // The model's reason text must never leak into the section.
    expect(user).not.toContain("MODEL CLAIM SHOULD NOT APPEAR");
  });

  it("flags target drift between the claimed target and the latched target", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, { system: "sys", state: "user body" });
    // The agent asked slot 0; the game latched slot 1 (the macro-navigation bug).
    writeStepWithDiff(
      game,
      id,
      "000001",
      { name: "fight", args: { actor: "Stu", target: "Goblin (slot 0)" } },
      battleSnapshot([]),
      battleSnapshot([{ member: "Stu", command: "attack", target: { kind: "enemy", slot: 1 } }]),
    );
    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toContain("TARGET DRIFT: asked slot 0, landed slot 1");
    expect(user).not.toContain("MODEL CLAIM SHOULD NOT APPEAR");
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
        prompt: { modes: [{ id: "field", label: "Field", promptSnippets: ["system", "state"] }] },
      }),
    );
    writeStepWithDiff(
      game,
      id,
      "000001",
      { name: "interact" },
      battleSnapshot([]),
      battleSnapshot([{ member: "Stu", command: "attack", target: { kind: "enemy", slot: 0 } }]),
    );

    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    expect(user).toContain("Recent actions");
    expect(user).toContain("Stu queued ATTACK");
  });

  it("respects recentHistoryLimit when rendering step history", () => {
    setSnippetList(game, id, ["system", "state"]);
    writeGamePrompts(game, {
      system: "sys",
      state: "user body",
    });
    writeFileSync(
      join(playDir(game, id), "config.json"),
      JSON.stringify({ id, game, agent: { recentHistoryLimit: 1 }, prompt: { modes: [{ id: "field", label: "Field", promptSnippets: ["system", "state"] }] } }),
    );
    writeStepWithDiff(
      game,
      id,
      "000001",
      { name: "interact", args: { note: "first" } },
      battleSnapshot([]),
      battleSnapshot([{ member: "Rias", command: "attack", target: { kind: "enemy", slot: 2 } }]),
    );
    writeStepWithDiff(
      game,
      id,
      "000002",
      { name: "dialog_advance", args: { note: "second" } },
      battleSnapshot([]),
      battleSnapshot([{ member: "Zing", command: "attack", target: { kind: "enemy", slot: 1 } }]),
    );

    const req: TurnRequest = {
      mode: "field", gameId: game, playId: `${game}/${id}`, state: {}, options: [] };
    const { user } = renderPrompt(req);
    // Only the latest step is included (limit 1), derived from its state diff.
    expect(user).toContain("Zing queued ATTACK -> Imp (enemy slot 1)");
    expect(user).not.toContain("Rias queued ATTACK");
  });
});
