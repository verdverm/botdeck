import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { makeAgentTools, toolDefinitionsForRequest, executeTool, executeDurableCalls, makeCommandTools } from "./tools.ts";
import {
  createPlay,
  deletePlay,
  playDir,
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
  limits: { goals: 100, memory: 50, journal: 200, memoryCount: 3, snippets: 200, snippetCount: 3 },
};

const ALL_DURABLES = [
  "goals_write",
  "journal_list",
  "journal_read",
  "journal_write",
  "memory_write",
  "press_button",
  "snippet_delete",
  "snippet_list",
  "snippet_read",
  "snippet_write",
];

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

  it("definitions match durable tool names and required fields", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const defs = toolDefinitionsForRequest(tools);
    expect(defs.map((d) => d.name).sort()).toEqual(ALL_DURABLES);
    for (const def of defs) {
      expect(def.description).toBeTruthy();
      expect(def.inputSchema).toHaveProperty("type", "object");
    }
  });

  it("includes command tools derived from command specs", () => {
    const options = [
      { name: "interact", description: "Interact" },
      { name: "fight", description: "Attack", args: '{ "target": "string" }' },
    ];
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG }, options);
    const defs = toolDefinitionsForRequest(tools);
    const names = defs.map((d) => d.name);
    expect(names).toContain("interact");
    expect(names).toContain("fight");
    const fight = defs.find((d) => d.name === "fight");
    expect(fight?.inputSchema).toEqual({
      type: "object",
      properties: { target: { type: "string" } },
      required: ["target"],
    });
  });

  it("filters durable tools by whitelist", () => {
    const config: AgentConfig = { ...TEST_CONFIG, tools: ["memory_write", "press_button"] };
    const tools = makeAgentTools({ game, id, config });
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["memory_write", "press_button"]);
  });

  it("always includes command tools regardless of whitelist", () => {
    const options = [
      { name: "interact", description: "Interact" },
      { name: "fight", description: "Attack" },
    ];
    const config: AgentConfig = { ...TEST_CONFIG, tools: ["memory_write"] };
    const tools = makeAgentTools({ game, id, config }, options);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["fight", "interact", "memory_write"]);
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

  it("press_button is a command tool and validates known buttons", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const tool = tools.find((t) => t.name === "press_button")!;
    expect(tool.isCommand).toBe(true);
    const result = tool.execute({ game, id, config: TEST_CONFIG }, { button: "a", frames: 6 });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ button: "a", index: 0, frames: 6 });
  });

  it("press_button rejects unknown buttons", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const tool = tools.find((t) => t.name === "press_button")!;
    const result = tool.execute({ game, id, config: TEST_CONFIG }, { button: "z" });
    expect(result.error).toContain("unknown button");
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

  it("executeDurableCalls runs only non-command calls", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const commandNames = new Set(["fight"]);
    const results = executeDurableCalls(
      [
        { id: "c1", name: "fight", input: { target: "enemy_1" } },
        { id: "c2", name: "memory_write", input: { slug: "side", content: "note" } },
      ],
      tools,
      { game, id, config: TEST_CONFIG },
      commandNames,
    );
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe("memory_write");
    expect(readPlayMemoryEntry(game, id, "side")).toBe("note");
  });

  it("snippet_write stores and reads an agent snippet", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const write = tools.find((t) => t.name === "snippet_write")!;
    const read = tools.find((t) => t.name === "snippet_read")!;
    write.execute({ game, id, config: TEST_CONFIG }, { name: "test", content: "agent note" });
    const result = read.execute({ game, id, config: TEST_CONFIG }, { name: "test" });
    expect(result.error).toBeUndefined();
    expect(result.result).toBe("agent note");
  });

  it("snippet_list returns written snippets", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const write = tools.find((t) => t.name === "snippet_write")!;
    const list = tools.find((t) => t.name === "snippet_list")!;
    write.execute({ game, id, config: TEST_CONFIG }, { name: "a", content: "first" });
    write.execute({ game, id, config: TEST_CONFIG }, { name: "b", content: "second" });
    const result = list.execute({ game, id, config: TEST_CONFIG }, {});
    expect(result.error).toBeUndefined();
    const names = (result.result as { name: string }[]).map((e) => e.name).sort();
    expect(names).toEqual(["a", "b"]);
  });

  it("snippet_list only sees agent snippets, not user/system prompts", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const write = tools.find((t) => t.name === "snippet_write")!;
    const list = tools.find((t) => t.name === "snippet_list")!;
    write.execute({ game, id, config: TEST_CONFIG }, { name: "agent-note", content: "agent" });
    // Write a user/system snippet with the same name in the play user snippets directory.
    const playUserSnippetsDir = join(playDir(game, id), "snippets", "user");
    mkdirSync(playUserSnippetsDir, { recursive: true });
    writeFileSync(join(playUserSnippetsDir, "agent-note.md"), "user system prompt");
    const result = list.execute({ game, id, config: TEST_CONFIG }, {});
    expect(result.error).toBeUndefined();
    const names = (result.result as { name: string }[]).map((e) => e.name);
    expect(names).toEqual(["agent-note"]);
  });

  it("snippet_delete removes an agent snippet", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const write = tools.find((t) => t.name === "snippet_write")!;
    const del = tools.find((t) => t.name === "snippet_delete")!;
    const read = tools.find((t) => t.name === "snippet_read")!;
    write.execute({ game, id, config: TEST_CONFIG }, { name: "gone", content: "x" });
    del.execute({ game, id, config: TEST_CONFIG }, { name: "gone" });
    const result = read.execute({ game, id, config: TEST_CONFIG }, { name: "gone" });
    expect(result.error).toBeTruthy();
  });

  it("snippet_write rejects oversized content", () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const write = tools.find((t) => t.name === "snippet_write")!;
    const result = write.execute({ game, id, config: TEST_CONFIG }, {
      name: "big",
      content: "x".repeat(201),
    });
    expect(result.error).toContain("exceeds");
  });

  it("snippet_write keeps only the most recent snippets", async () => {
    const tools = makeAgentTools({ game, id, config: TEST_CONFIG });
    const write = tools.find((t) => t.name === "snippet_write")!;
    for (let i = 0; i < 5; i++) {
      write.execute({ game, id, config: TEST_CONFIG }, { name: `s${i}`, content: `v${i}` });
      await new Promise((r) => setTimeout(r, 10));
    }
    const list = tools.find((t) => t.name === "snippet_list")!;
    const result = list.execute({ game, id, config: TEST_CONFIG }, {});
    const names = (result.result as { name: string }[]).map((e) => e.name).sort();
    expect(names).toHaveLength(3);
    expect(names).not.toContain("s0");
    expect(names).not.toContain("s1");
  });
});

describe("makeCommandTools", () => {
  it("creates command tools with generated schemas", () => {
    const options = [
      { name: "interact", description: "Interact" },
      { name: "fight", description: "Attack", args: '{ "target": "string" }' },
      { name: "buy", description: "Buy", args: '{ "item": "string", "quantity": "number" }' },
    ];
    const tools = makeCommandTools(options);
    expect(tools.map((t) => t.name)).toEqual(["interact", "fight", "buy"]);
    expect(tools.every((t) => t.isCommand)).toBe(true);
    const buy = tools.find((t) => t.name === "buy")!;
    expect(buy.inputSchema).toEqual({
      type: "object",
      properties: {
        item: { type: "string" },
        quantity: { type: "number" },
      },
      required: ["item", "quantity"],
    });
  });

  it("throws when a command spec has unparseable args", () => {
    const options = [{ name: "weird", description: "Weird", args: "not json" }];
    expect(() => makeCommandTools(options)).toThrow("CommandSpec.args is not valid JSON");
  });

  it("parses the FF1 command specs into real schemas", () => {
    const options = [
      { name: "menu_navigate", description: "Navigate", args: '{ "direction": "string", "steps": "number" }' },
      { name: "buy", description: "Buy", args: '{ "item": "string", "quantity": "number" }' },
      { name: "dialog_advance", description: "Dialog", args: '{ "presses": "number" }' },
    ];
    const tools = makeCommandTools(options);
    const navigate = tools.find((t) => t.name === "menu_navigate")!;
    expect(navigate.inputSchema).toEqual({
      type: "object",
      properties: {
        direction: { type: "string" },
        steps: { type: "number" },
      },
      required: ["direction", "steps"],
    });
    const buy = tools.find((t) => t.name === "buy")!;
    expect(buy.inputSchema).toHaveProperty(["properties", "quantity", "type"], "number");
    expect(buy.inputSchema).toHaveProperty(["properties", "item", "type"], "string");
  });
});
