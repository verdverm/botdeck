import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  repoPath,
  gameDir,
  playDir,
  resolveAgentConfig,
  resolvePromptConfig,
  writePlayConfig,
  createPlay,
  nextPlayId,
  readPlayConfig,
  deletePlay,
  diffPlayStates,
  listPlaySnippets,
  readPlaySnippet,
  writePlaySnippet,
  deletePlaySnippet,
  listPlayAgentSnippets,
  readPlayAgentSnippet,
  writePlayAgentSnippet,
  deletePlayAgentSnippet,
  PathEscapeError,
  FileNotFoundError,
  ValidationError,
  assertStepRecord,
  writePlayStep,
  listPlaySteps,
  readPlayStep,
  readRecentStepHistory,
} from "./files.ts";
import { useTempRepoRoot } from "./test-root.ts";

const TEST_GAME = "ff1";

function tmpPlayId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function writeGameConfig(game: string, config: Record<string, unknown>): void {
  const dir = gameDir(game);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify(config));
}

function seedGameConfig(): void {
  writeGameConfig(TEST_GAME, {
    agent: {
      model: "small",
      maxToolRounds: 25,
      maxTokens: 1024,
      timeoutMs: 120_000,
      limits: {
        goals: 1024,
        memory: 2048,
        journal: 32768,
        memoryCount: 10,
        snippets: 4096,
        snippetCount: 50,
      },
      recentHistoryLimit: 10,
    },
    prompt: {
      snippets: ["system", "commands", "state"],
    },
  });
}

describe("files", () => {
  useTempRepoRoot();
  beforeEach(() => seedGameConfig());

describe("repoPath", () => {
  it("resolves a safe path under the repo root", () => {
    expect(repoPath("games", "ff1", "config.json")).toMatch(/games\/ff1\/config\.json$/);
  });

  it("rejects .. traversal", () => {
    expect(() => repoPath("..", "secrets.txt")).toThrow(PathEscapeError);
  });

  it("rejects absolute paths outside the repo", () => {
    expect(() => repoPath("/etc", "passwd")).toThrow(PathEscapeError);
  });
});

describe("gameDir / playDir", () => {
  it("return directories inside the repo", () => {
    expect(gameDir("ff1")).toMatch(/games\/ff1$/);
    expect(playDir("ff1", "0000_dev")).toMatch(/plays\/ff1\/0000_dev$/);
  });

  it("reject unsafe segments", () => {
    expect(() => gameDir("../ff1")).toThrow(PathEscapeError);
    expect(() => playDir("ff1", "..")).toThrow(PathEscapeError);
    expect(() => playDir("ff1", "a/b")).toThrow(PathEscapeError);
  });
});

describe("resolveAgentConfig", () => {
  it("reads the game default config", () => {
    const cfg = resolveAgentConfig(TEST_GAME);
    expect(cfg.model).toBe("small");
    expect(cfg.maxToolRounds).toBe(25);
    expect(cfg.maxTokens).toBe(1024);
    expect(cfg.limits.memory).toBe(2048);
  });

  it("play config overrides the game model", () => {
    createPlay(TEST_GAME, "0000_dev");
    try {
      writePlayConfig(TEST_GAME, "0000_dev", {
        id: "0000_dev",
        game: TEST_GAME,
        agent: { model: "playmodel" },
      });
      const cfg = resolveAgentConfig(TEST_GAME, "0000_dev");
      expect(cfg.model).toBe("playmodel");
    } finally {
      deletePlay(TEST_GAME, "0000_dev");
    }
  });

  it("falls back to defaults when no game config exists", () => {
    const cfg = resolveAgentConfig("__totally_missing_game_12345");
    expect(cfg.model).toBe("small");
    expect(cfg.maxToolRounds).toBe(25);
    expect(cfg.limits.memory).toBe(2048);
  });

  it("merges limits from game and play configs", () => {
    const id = tmpPlayId("merge_limits");
    createPlay(TEST_GAME, id);
    try {
      writePlayConfig(TEST_GAME, id, {
        id,
        game: TEST_GAME,
        agent: {
          limits: {
            memory: 999,
          },
        },
      });
      const cfg = resolveAgentConfig(TEST_GAME, id);
      expect(cfg.limits.memory).toBe(999);
      expect(cfg.limits.journal).toBe(32768);
      expect(cfg.limits.goals).toBe(1024);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("play config can override maxToolRounds and maxTokens", () => {
    const id = tmpPlayId("override_nums");
    createPlay(TEST_GAME, id);
    try {
      writePlayConfig(TEST_GAME, id, {
        id,
        game: TEST_GAME,
        agent: {
          maxToolRounds: 3,
          maxTokens: 512,
        },
      });
      const cfg = resolveAgentConfig(TEST_GAME, id);
      expect(cfg.maxToolRounds).toBe(3);
      expect(cfg.maxTokens).toBe(512);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });
});

describe("resolvePromptConfig", () => {
  it("returns the play prompt snippet list when present", () => {
    createPlay(TEST_GAME, "0000_dev");
    try {
      writePlayConfig(TEST_GAME, "0000_dev", {
        id: "0000_dev",
        game: TEST_GAME,
        prompt: { snippets: ["play-system", "play-state"] },
      });
      const cfg = resolvePromptConfig(TEST_GAME, "0000_dev");
      expect(cfg.snippets).toEqual(["play-system", "play-state"]);
    } finally {
      deletePlay(TEST_GAME, "0000_dev");
    }
  });

  it("falls back to the game prompt snippets", () => {
    const cfg = resolvePromptConfig(TEST_GAME);
    expect(cfg.snippets).toContain("system");
  });

  it("uses a hardcoded default when no game config exists", () => {
    const cfg = resolvePromptConfig("__totally_missing_game_12345");
    expect(cfg.snippets).toEqual(["system", "commands", "state"]);
  });
});

describe("createPlay / deletePlay", () => {
  it("creates the expected directories and config", () => {
    const id = tmpPlayId("lifecycle");
    createPlay(TEST_GAME, id, "lifecycle test");
    try {
      const dir = playDir(TEST_GAME, id);
      expect(existsSync(dir)).toBe(true);
      expect(existsSync(`${dir}/states`)).toBe(true);
      expect(existsSync(`${dir}/steps`)).toBe(true);
      expect(existsSync(`${dir}/memory`)).toBe(true);
      expect(existsSync(`${dir}/journal`)).toBe(true);
      expect(existsSync(`${dir}/goals`)).toBe(true);
      expect(existsSync(`${dir}/snippets/user`)).toBe(true);
      expect(existsSync(`${dir}/snippets/agent`)).toBe(true);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("throws when creating a play that already exists", () => {
    const id = tmpPlayId("dup");
    createPlay(TEST_GAME, id);
    try {
      expect(() => createPlay(TEST_GAME, id)).toThrow();
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("seeds a new play config from the game config.json", () => {
    const id = tmpPlayId("seed");
    const config = createPlay(TEST_GAME, id, "seeded");
    try {
      expect(config.id).toBe(id);
      expect(config.game).toBe(TEST_GAME);
      expect(config.label).toBe("seeded");
      // Inherited from the seeded game config, not the minimal {id,game,label}.
      const agent = config.agent as { model?: string; maxTokens?: number };
      expect(agent?.model).toBe("small");
      expect(agent?.maxTokens).toBe(1024);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });
});

describe("nextPlayId", () => {
  it("returns 0000 when the game has no plays", () => {
    mkdirSync(join(repoPath("plays"), TEST_GAME), { recursive: true });
    // Remove any existing numeric plays for a clean count.
    for (const entry of readdirSync(join(repoPath("plays"), TEST_GAME))) {
      if (/^\d{4}(?:[_.-]|$)/.test(entry)) rmSync(join(repoPath("plays"), TEST_GAME, entry), { recursive: true, force: true });
    }
    expect(nextPlayId(TEST_GAME)).toBe("0000");
  });

  it("returns max + 1, zero-padded to 4", () => {
    createPlay(TEST_GAME, "0007_seed");
    createPlay(TEST_GAME, "0003_seed");
    try {
      expect(nextPlayId(TEST_GAME)).toBe("0008");
    } finally {
      deletePlay(TEST_GAME, "0007_seed");
      deletePlay(TEST_GAME, "0003_seed");
    }
  });

  it("ignores non-numeric play directories", () => {
    createPlay(TEST_GAME, "hand_named");
    try {
      expect(nextPlayId(TEST_GAME)).not.toBe("hand_named");
      expect(nextPlayId(TEST_GAME)).toMatch(/^\d{4}$/);
    } finally {
      deletePlay(TEST_GAME, "hand_named");
    }
  });
});

function minimalFF1State(gold: number): unknown {
  return {
    party: [],
    gold,
    inventory: [],
    world: {
      mapId: 0,
      mapName: "Coneria",
      isOverworld: false,
      isStandardMap: true,
      mapFlags: 0,
      tilesetId: 0,
      overworldX: 0,
      overworldY: 0,
      overworldPlayerX: 7,
      overworldPlayerY: 7,
      standardMapX: 10,
      standardMapY: 10,
      standardMapScrollX: 0,
      standardMapScrollY: 0,
      shipX: undefined,
      shipY: undefined,
      airshipX: undefined,
      airshipY: undefined,
      currentVehicle: undefined,
      ownedVehicles: [],
      vehiclesRaw: 0,
      hasCanoe: false,
      mapObjects: [],
      _note: "",
    },
    flags: {
      raw: [],
      _note: "",
    },
  };
}

describe("diffPlayStates", () => {
  it("diffs two states given filenames only", () => {
    const id = tmpPlayId("diff");
    createPlay(TEST_GAME, id);
    try {
      const dir = join(playDir(TEST_GAME, id), "states");
      writeFileSync(
        join(dir, "000001-step_before.state.json"),
        JSON.stringify({}),
      );
      writeFileSync(
        join(dir, "000001-step_before.ff1.json"),
        JSON.stringify(minimalFF1State(100)),
      );
      writeFileSync(
        join(dir, "000001-step_before.metadata.json"),
        JSON.stringify({ name: "step_before", createdAt: new Date().toISOString(), bookmarked: false }),
      );
      writeFileSync(
        join(dir, "000002-step_after.state.json"),
        JSON.stringify({}),
      );
      writeFileSync(
        join(dir, "000002-step_after.ff1.json"),
        JSON.stringify(minimalFF1State(250)),
      );
      writeFileSync(
        join(dir, "000002-step_after.metadata.json"),
        JSON.stringify({ name: "step_after", createdAt: new Date().toISOString(), bookmarked: false }),
      );

      const diff = diffPlayStates(
        TEST_GAME,
        id,
        "000001-step_before.state.json",
        "000002-step_after.state.json",
      );
      expect(diff.changed).toBe(true);
      expect(diff.gold).toEqual({ before: 100, after: 250, delta: 150 });
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("rejects full repo-relative paths", () => {
    const id = tmpPlayId("diff_path");
    createPlay(TEST_GAME, id);
    try {
      expect(() =>
        diffPlayStates(
          TEST_GAME,
          id,
          "plays/ff1/0000_dev/states/000001-step_before.state.json",
          "000002-step_after.state.json",
        ),
      ).toThrow(PathEscapeError);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("throws FileNotFoundError for missing state files", () => {
    const id = tmpPlayId("diff_missing");
    createPlay(TEST_GAME, id);
    try {
      expect(() =>
        diffPlayStates(TEST_GAME, id, "000001.state.json", "000002.state.json"),
      ).toThrow(FileNotFoundError);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });
});

describe("play snippets", () => {
  it("lists and reads snippets from the play snippets directory", () => {
    const id = tmpPlayId("snippets");
    createPlay(TEST_GAME, id);
    try {
      const dir = playDir(TEST_GAME, id);
      const snippetsDir = join(dir, "snippets", "user");
      expect(existsSync(snippetsDir)).toBe(true);
      writeFileSync(
        join(snippetsDir, "test.snippet.json"),
        JSON.stringify({
          id: "test",
          name: "Test Snippet",
          description: "A test snippet",
          game: TEST_GAME,
          play: id,
          startState: "000001-start",
          steps: [{ kind: "command", command: { name: "interact" } }],
          tags: ["test"],
        }),
      );

      const list = listPlaySnippets(TEST_GAME, id);
      expect(list.length).toBe(1);
      expect(list[0]!.id).toBe("test");
      expect(list[0]!.name).toBe("Test Snippet");

      const snippet = readPlaySnippet(TEST_GAME, id, "test");
      expect(snippet.id).toBe("test");
      expect(snippet.name).toBe("Test Snippet");
      expect(snippet.steps.length).toBe(1);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("throws FileNotFoundError for missing snippets", () => {
    const id = tmpPlayId("snippets_missing");
    createPlay(TEST_GAME, id);
    try {
      expect(() => readPlaySnippet(TEST_GAME, id, "missing")).toThrow(FileNotFoundError);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("rejects invalid snippet JSON", () => {
    const id = tmpPlayId("snippets_invalid");
    createPlay(TEST_GAME, id);
    try {
      const dir = playDir(TEST_GAME, id);
      const snippetsDir = join(dir, "snippets", "user");
      writeFileSync(
        join(snippetsDir, "bad.snippet.json"),
        JSON.stringify({ name: "Bad", steps: "not-an-array" }),
      );
      expect(() => readPlaySnippet(TEST_GAME, id, "bad")).toThrow(ValidationError);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("writes and deletes snippets", () => {
    const id = tmpPlayId("snippets_write");
    createPlay(TEST_GAME, id);
    try {
      const snippet = writePlaySnippet(TEST_GAME, id, "new", {
        name: "New Snippet",
        description: "A new snippet",
        startState: "000001-start",
        steps: [{ kind: "command", command: { name: "interact" } }],
      });
      expect(snippet.id).toBe("new");
      expect(snippet.name).toBe("New Snippet");
      expect(listPlaySnippets(TEST_GAME, id).some((s) => s.id === "new")).toBe(true);

      deletePlaySnippet(TEST_GAME, id, "new");
      expect(listPlaySnippets(TEST_GAME, id).some((s) => s.id === "new")).toBe(false);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });
});

describe("agent snippets", () => {
  it("writes, reads, lists, and deletes agent snippets", () => {
    const id = tmpPlayId("agent_snippets_crud");
    createPlay(TEST_GAME, id);
    try {
      writePlayAgentSnippet(TEST_GAME, id, "test", { content: "agent override" });
      expect(readPlayAgentSnippet(TEST_GAME, id, "test")).toBe("agent override");
      const list = listPlayAgentSnippets(TEST_GAME, id);
      expect(list.some((s) => s.name === "test")).toBe(true);
      deletePlayAgentSnippet(TEST_GAME, id, "test");
      expect(listPlayAgentSnippets(TEST_GAME, id).some((s) => s.name === "test")).toBe(false);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("enforces the agent snippet size limit", () => {
    const id = tmpPlayId("agent_snippets_size");
    createPlay(TEST_GAME, id);
    try {
      expect(() =>
        writePlayAgentSnippet(TEST_GAME, id, "big", { content: "x".repeat(4097) }),
      ).toThrow();
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("enforces the agent snippet count limit", () => {
    const id = tmpPlayId("agent_snippets_count");
    createPlay(TEST_GAME, id);
    try {
      writePlayConfig(TEST_GAME, id, {
        id,
        game: TEST_GAME,
        agent: {
          limits: { snippets: 4096, snippetCount: 2 },
        },
      });
      writePlayAgentSnippet(TEST_GAME, id, "a", { content: "a" });
      writePlayAgentSnippet(TEST_GAME, id, "b", { content: "b" });
      writePlayAgentSnippet(TEST_GAME, id, "c", { content: "c" });
      const names = listPlayAgentSnippets(TEST_GAME, id).map((s) => s.name).sort();
      expect(names).toEqual(["b", "c"]);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("rejects unsafe agent snippet names", () => {
    const id = tmpPlayId("agent_snippets_path");
    createPlay(TEST_GAME, id);
    try {
      expect(() => writePlayAgentSnippet(TEST_GAME, id, "../escape", { content: "x" })).toThrow(PathEscapeError);
      expect(() => writePlayAgentSnippet(TEST_GAME, id, "a/b", { content: "x" })).toThrow(PathEscapeError);
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });
});

describe("step persistence and recent-action history", () => {
  it("accepts a failed turn (error field) as a recorded step", () => {
    const id = tmpPlayId("step_err");
    createPlay(TEST_GAME, id);
    try {
      const record = writePlayStep(TEST_GAME, id, {
        stepId: "",
        ts: 1,
        request: { gameId: TEST_GAME, playId: `${TEST_GAME}/${id}`, state: {}, options: [] },
        response: { command: { name: "" }, reason: "" },
        command: { name: "" },
        macro: [],
        error: "turn failed (400): invalid command",
      } as never);
      expect(record.stepId).toBe("000001");
      const read = readPlayStep(TEST_GAME, id, record.stepId);
      expect(read.error).toContain("turn failed");
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });

  it("rejects a non-string error field", () => {
    expect(() =>
      assertStepRecord({
        stepId: "",
        ts: 1,
        request: { gameId: TEST_GAME, state: {}, options: [] },
        response: { command: { name: "" }, reason: "" },
        command: { name: "" },
        error: 123,
      }),
    ).toThrow(ValidationError);
  });

  it("renders failed steps in the recent-action history", () => {
    const id = tmpPlayId("step_hist");
    createPlay(TEST_GAME, id);
    try {
      writePlayStep(TEST_GAME, id, {
        stepId: "",
        ts: 1,
        request: { gameId: TEST_GAME, state: {}, options: [] },
        response: { command: { name: "interact" }, reason: "searched" },
        command: { name: "interact" },
      } as never);
      writePlayStep(TEST_GAME, id, {
        stepId: "",
        ts: 2,
        request: { gameId: TEST_GAME, state: {}, options: [] },
        response: { command: { name: "" }, reason: "" },
        command: { name: "" },
        error: "max tool rounds reached without a final command",
      } as never);
      expect(listPlaySteps(TEST_GAME, id)).toHaveLength(2);
      const history = readRecentStepHistory(TEST_GAME, id, 10);
      expect(history).toContain("- interact -> no observable state change");
      expect(history).toContain("[FAILED:");
      expect(history).toContain("max tool rounds");
    } finally {
      deletePlay(TEST_GAME, id);
    }
  });
});
});
