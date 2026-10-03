import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { makeAgentTools, toolDefinitionsForRequest, executeTool } from "./tools.ts";
import {
  createPlay,
  deletePlay,
  readPlayMemoryEntry,
  readPlayJournal,
  readPlayGoals,
  writePlayConfig,
} from "./files.ts";
import { useTempRepoRoot } from "./test-root.ts";
import type { AgentConfig } from "./files.ts";

function tmpId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const TEST_CONFIG: AgentConfig = {
  model: "small",
  maxToolRounds: 5,
  maxTokens: 1024,
  timeoutMs: 120_000,
  limits: { goals: 100, memory: 50, journal: 200, memoryCount: 3 },
};

describe("makeAgentTools", () => {
  useTempRepoRoot();

  const game = "ff1";
  let id: string;

  beforeEach(() => {
    id = tmpId("tools");
    createPlay(game, id);
    writePlayConfig(game, id, {
      id,
      game,
      agent: TEST_CONFIG,
    });
  });

  afterEach(() => {
    deletePlay(game, id);
  });

  it("definitions match tool names and required fields", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const defs = toolDefinitionsForRequest(tools);
    expect(defs.map((d) => d.name).sort()).toEqual([
      "goals_write",
      "journal_list",
      "journal_read",
      "journal_write",
      "memory_write",
    ]);
    for (const def of defs) {
      expect(def.description).toBeTruthy();
      expect(def.inputSchema).toHaveProperty("type", "object");
    }
  });

  it("memory_write stores an entry", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const tool = tools.find((t) => t.name === "memory_write")!;
    const result = tool.execute({ game, id, config: TEST_CONFIG }, {
      slug: "test",
      content: "hello memory",
    });
    expect(result.error).toBeUndefined();
    expect(readPlayMemoryEntry(game, id, "test")).toBe("hello memory");
  });

  it("memory_write rejects oversized content", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const tool = tools.find((t) => t.name === "memory_write")!;
    const result = tool.execute({ game, id, config: TEST_CONFIG }, {
      slug: "big",
      content: "x".repeat(51),
    });
    expect(result.error).toContain("exceeds");
  });

  it("memory_write keeps only the most recent entries", async () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const tool = tools.find((t) => t.name === "memory_write")!;
    for (let i = 0; i < 5; i++) {
      tool.execute({ game, id, config: TEST_CONFIG }, { slug: `m${i}`, content: `v${i}` });
      await new Promise((r) => setTimeout(r, 10));
    }
    const slugs = ["m0", "m1", "m2", "m3", "m4"];
    const present = slugs.filter((s) => {
      try {
        readPlayMemoryEntry(game, id, s);
        return true;
      } catch {
        return false;
      }
    });
    expect(present).toHaveLength(3);
    expect(present).not.toContain("m0");
    expect(present).not.toContain("m1");
  });

  it("journal_write stores and reads an entry", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const write = tools.find((t) => t.name === "journal_write")!;
    const read = tools.find((t) => t.name === "journal_read")!;
    write.execute({ game, id, config: TEST_CONFIG }, { name: "entry1", content: "dear diary" });
    const result = read.execute({ game, id, config: TEST_CONFIG }, { name: "entry1" });
    expect(result.error).toBeUndefined();
    expect(readPlayJournal(game, id, "entry1")).toBe("dear diary");
  });

  it("journal_list returns written entries", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const write = tools.find((t) => t.name === "journal_write")!;
    const list = tools.find((t) => t.name === "journal_list")!;
    write.execute({ game, id, config: TEST_CONFIG }, { name: "a", content: "first" });
    write.execute({ game, id, config: TEST_CONFIG }, { name: "b", content: "second" });
    const result = list.execute({ game, id, config: TEST_CONFIG }, {});
    expect(result.error).toBeUndefined();
    const names = (result.result as { name: string }[]).map((e) => e.name).sort();
    expect(names).toEqual(["a.md", "b.md"]);
  });

  it("goals_write overwrites goals", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const tool = tools.find((t) => t.name === "goals_write")!;
    tool.execute({ game, id, config: TEST_CONFIG }, { content: "win the game" });
    expect(readPlayGoals(game, id)).toBe("win the game");
    tool.execute({ game, id, config: TEST_CONFIG }, { content: "grind levels" });
    expect(readPlayGoals(game, id)).toBe("grind levels");
  });

  it("executeTool returns error for unknown tool", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const result = executeTool(tools, { game, id, config: TEST_CONFIG }, { name: "nope", input: {} });
    expect(result.error).toContain("unknown tool");
  });

  it("executeTool preserves call id when provided", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const result = executeTool(tools, { game, id, config: TEST_CONFIG }, {
      id: "call_123",
      name: "memory_write",
      input: { slug: "idtest", content: "x" },
    });
    expect(result.id).toBe("call_123");
  });
});
