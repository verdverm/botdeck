import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  repoPath,
  gameDir,
  playDir,
  resolveAgentConfig,
  resolvePromptConfig,
  writePlayConfig,
  createPlay,
  deletePlay,
  PathEscapeError,
} from "./files.ts";

const TEST_GAME = "ff1";

function tmpPlayId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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
    expect(cfg.maxToolRounds).toBe(5);
    expect(cfg.maxTokens).toBe(1024);
    expect(cfg.limits.memory).toBe(2048);
  });

  it("play config overrides the game model", () => {
    const cfg = resolveAgentConfig(TEST_GAME, "0000_dev");
    expect(cfg.model).toBe("small");
  });

  it("falls back to defaults when no game config exists", () => {
    const cfg = resolveAgentConfig("__totally_missing_game_12345");
    expect(cfg.model).toBe("small");
    expect(cfg.maxToolRounds).toBe(5);
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
    const cfg = resolvePromptConfig(TEST_GAME, "0000_dev");
    expect(cfg.snippets).toContain("system");
    expect(cfg.snippets).toContain("commands");
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
});
