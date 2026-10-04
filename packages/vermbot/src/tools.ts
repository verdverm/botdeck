/**
 * Agent tool registry.
 *
 * Durable play-resource tools (journal/memory/goals) are registered here.
 * Command tools are generated dynamically from the CommandSpecs sent by botdeck
 * in each TurnRequest, so the agent's final choice can arrive as a structured
 * tool call rather than fragile text parsing. A basic raw button-press tool is
 * also provided for exceptional cases, but normal play should use high-level
 * commands.
 */

import {
  listPlayJournal,
  readPlayJournal,
  writePlayJournal,
  writePlayMemory,
  writePlayGoals,
  listPlayAgentSnippets,
  readPlayAgentSnippet,
  writePlayAgentSnippet,
  deletePlayAgentSnippet,
  ValidationError,
  type AgentConfig,
} from "./files.ts";
import { NES_BUTTONS } from "./protocol.ts";
import type { CommandSpec, ToolResult } from "./protocol.ts";

export interface ToolContext {
  game: string;
  id: string;
  config: AgentConfig;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (ctx: ToolContext, input: unknown) => ToolResult;
  /**
   * Command tools are generated from the turn's available commands and represent
   * the agent's final decision. They are not executed through the tool loop;
   * agent.ts treats them as the chosen GameCommand.
   */
  isCommand?: boolean;
}

function toolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function requireString(input: unknown, field: string): string {
  if (input && typeof input === "object" && typeof (input as Record<string, unknown>)[field] === "string") {
    return (input as Record<string, unknown>)[field] as string;
  }
  throw new ValidationError(`missing or invalid field: ${field}`);
}

function okResult(name: string, value: unknown): ToolResult {
  return { id: toolCallId(), name, result: value };
}

function errorResult(name: string, message: string): ToolResult {
  return { id: toolCallId(), name, result: null, error: message };
}

function resolveMemorySlug(input: unknown): string {
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const v = obj.slug ?? obj.id ?? obj.name;
    if (typeof v === "string" && v.length > 0) return v;
  }
  throw new ValidationError("memory_write requires a slug/id/name field");
}

const DURABLE_TOOLS: AgentTool[] = [
  {
    name: "journal_list",
    description: "List the play's journal entries.",
    inputSchema: { type: "object", properties: {}, required: [] },
    execute: (ctx) => {
      try {
        return okResult("journal_list", listPlayJournal(ctx.game, ctx.id));
      } catch (e) {
        return errorResult("journal_list", e instanceof Error ? e.message : String(e));
      }
    },
  },
  {
    name: "journal_read",
    description: "Read one journal entry by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the journal entry file (without .md)." },
      },
      required: ["name"],
    },
    execute: (ctx, input) => {
      try {
        const name = requireString(input, "name");
        return okResult("journal_read", readPlayJournal(ctx.game, ctx.id, name));
      } catch (e) {
        return errorResult("journal_read", e instanceof Error ? e.message : String(e));
      }
    },
  },
  {
    name: "journal_write",
    description: "Write a journal entry. Input: { \"name\": \"...\", \"content\": \"...\" }.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the journal entry file (without .md)." },
        content: { type: "string", description: "Journal entry content." },
      },
      required: ["name", "content"],
    },
    execute: (ctx, input) => {
      try {
        const name = requireString(input, "name");
        const content = requireString(input, "content");
        const maxChars = ctx.config.limits.journal;
        writePlayJournal(ctx.game, ctx.id, name, { content, maxChars });
        return okResult("journal_write", { written: content.length });
      } catch (e) {
        return errorResult("journal_write", e instanceof Error ? e.message : String(e));
      }
    },
  },
  {
    name: "memory_write",
    description: "Write a short-term memory entry. Input: { \"slug\": \"...\", \"content\": \"...\" }.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Identifier for the memory entry (becomes <slug>.md)." },
        id: { type: "string", description: "Alternative identifier for the memory entry." },
        name: { type: "string", description: "Alternative identifier for the memory entry." },
        content: { type: "string", description: "Memory content." },
      },
      required: ["content"],
    },
    execute: (ctx, input) => {
      try {
        const slug = resolveMemorySlug(input);
        const content = requireString(input, "content");
        const maxChars = ctx.config.limits.memory;
        writePlayMemory(ctx.game, ctx.id, slug, { content, maxChars });
        return okResult("memory_write", { slug, written: content.length });
      } catch (e) {
        return errorResult("memory_write", e instanceof Error ? e.message : String(e));
      }
    },
  },
  {
    name: "goals_write",
    description: "Overwrite the play's goals. Input: { \"content\": \"...\" }.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "New goals content." },
      },
      required: ["content"],
    },
    execute: (ctx, input) => {
      try {
        const content = requireString(input, "content");
        const maxChars = ctx.config.limits.goals;
        writePlayGoals(ctx.game, ctx.id, { content, maxChars });
        return okResult("goals_write", { written: content.length });
      } catch (e) {
        return errorResult("goals_write", e instanceof Error ? e.message : String(e));
      }
    },
  },
  {
    name: "press_button",
    description:
      "Press and/or hold a single NES button. Use only when no high-level command applies. Buttons: a, b, start, select, up, down, left, right.",
    inputSchema: {
      type: "object",
      properties: {
        button: { type: "string", description: "Button name: a, b, start, select, up, down, left, right." },
        frames: { type: "number", description: "How many frames to hold the button (default 4)." },
      },
      required: ["button"],
    },
    isCommand: true,
    execute: (_, input) => {
      try {
        const button = requireString(input, "button").toLowerCase();
        const frames = typeof (input as Record<string, unknown>).frames === "number"
          ? (input as Record<string, unknown>).frames as number
          : 4;
        const map: Record<string, number> = {
          a: NES_BUTTONS.A,
          b: NES_BUTTONS.B,
          start: NES_BUTTONS.START,
          select: NES_BUTTONS.SELECT,
          up: NES_BUTTONS.UP,
          down: NES_BUTTONS.DOWN,
          left: NES_BUTTONS.LEFT,
          right: NES_BUTTONS.RIGHT,
        };
        const index = map[button];
        if (index === undefined) {
          return errorResult("press_button", `unknown button: ${button}`);
        }
        return okResult("press_button", { button, index, frames });
      } catch (e) {
        return errorResult("press_button", e instanceof Error ? e.message : String(e));
      }
    },
  },
  {
    name: "snippet_list",
    description:
      "List the agent-authored prompt snippets for this play. This only sees the agent's own snippet store; user/system game and play prompts are never returned.",
    inputSchema: { type: "object", properties: {}, required: [] },
    execute: (ctx) => {
      try {
        return okResult("snippet_list", listPlayAgentSnippets(ctx.game, ctx.id));
      } catch (e) {
        return errorResult("snippet_list", e instanceof Error ? e.message : String(e));
      }
    },
  },
  {
    name: "snippet_read",
    description:
      "Read one agent-authored prompt snippet by name. This only reads from the agent's own snippet store; user/system game and play prompts cannot be read here.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Snippet name (without .md)." },
      },
      required: ["name"],
    },
    execute: (ctx, input) => {
      try {
        const name = requireString(input, "name");
        return okResult("snippet_read", readPlayAgentSnippet(ctx.game, ctx.id, name));
      } catch (e) {
        return errorResult("snippet_read", e instanceof Error ? e.message : String(e));
      }
    },
  },
  {
    name: "snippet_write",
    description:
      "Write an agent-authored prompt snippet. Input: { \"name\": \"...\", \"content\": \"...\" }. Agent snippets are stored separately from user/system game and play prompts; they never shadow them by name. Instead, all agent snippets are appended to the assembled prompt as a clearly-delimited section.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Snippet name (without .md)." },
        content: { type: "string", description: "Markdown snippet content." },
      },
      required: ["name", "content"],
    },
    execute: (ctx, input) => {
      try {
        const name = requireString(input, "name");
        const content = requireString(input, "content");
        writePlayAgentSnippet(ctx.game, ctx.id, name, { content });
        return okResult("snippet_write", { name, written: content.length });
      } catch (e) {
        return errorResult("snippet_write", e instanceof Error ? e.message : String(e));
      }
    },
  },
  {
    name: "snippet_delete",
    description: "Delete an agent-authored prompt snippet by name.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Snippet name (without .md)." },
      },
      required: ["name"],
    },
    execute: (ctx, input) => {
      try {
        const name = requireString(input, "name");
        deletePlayAgentSnippet(ctx.game, ctx.id, name);
        return okResult("snippet_delete", { deleted: name });
      } catch (e) {
        return errorResult("snippet_delete", e instanceof Error ? e.message : String(e));
      }
    },
  },
];

function jsonValueToSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    return {
      type: "array",
      items: value.length > 0 ? jsonValueToSchema(value[0]) : {},
    };
  }
  if (typeof value === "object") {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      properties[k] = jsonValueToSchema(v);
      required.push(k);
    }
    return { type: "object", properties, required };
  }
  if (value === "string") return { type: "string" };
  if (value === "number") return { type: "number" };
  if (value === "boolean") return { type: "boolean" };
  return { type: typeof value };
}

function argsStringToSchema(args: string | undefined): Record<string, unknown> {
  if (!args) return { type: "object", properties: {} };
  try {
    const parsed = JSON.parse(args);
    return jsonValueToSchema(parsed);
  } catch {
    throw new Error(`CommandSpec.args is not valid JSON: ${args}`);
  }
}

export function makeCommandTools(options: CommandSpec[]): AgentTool[] {
  return options.map((spec) => ({
    name: spec.name,
    description: spec.description,
    inputSchema: argsStringToSchema(spec.args),
    isCommand: true,
    execute: (_, input) => okResult(spec.name, { selected: true, input }),
  }));
}

function toolIsAllowed(name: string, whitelist: readonly string[] | undefined): boolean {
  if (!whitelist) return true;
  return whitelist.includes(name);
}

export function makeAgentTools(
  ctx: ToolContext,
  options: CommandSpec[] = [],
): AgentTool[] {
  const whitelist = ctx.config.tools;
  // The whitelist controls durable tools and is merged from game + play configs.
  // Command tools are derived from the turn's available commands and are always
  // exposed so the agent can act, regardless of the whitelist.
  const allowedDurable = DURABLE_TOOLS.filter((t) => toolIsAllowed(t.name, whitelist));
  const commandTools = makeCommandTools(options);
  return [...allowedDurable, ...commandTools];
}

export function toolDefinitionsForRequest(tools: AgentTool[]): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}> {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export function executeTool(
  tools: AgentTool[],
  ctx: ToolContext,
  call: { id?: string; name: string; input?: unknown },
): ToolResult {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) {
    return {
      id: call.id ?? toolCallId(),
      name: call.name,
      result: null,
      error: `unknown tool: ${call.name}`,
    };
  }
  const result = tool.execute(ctx, call.input);
  return { ...result, id: call.id ?? result.id };
}

/**
 * Execute every tool call that is not a terminal command call. This ensures
 * durable side effects (memory/journal/goals writes) land even when the model
 * emits them in the same assistant turn as the final command decision.
 */
export function executeDurableCalls(
  calls: Array<{ id?: string; name: string; input?: unknown }>,
  tools: AgentTool[],
  ctx: ToolContext,
  commandToolNames: Set<string>,
): ToolResult[] {
  const results: ToolResult[] = [];
  for (const call of calls) {
    if (!commandToolNames.has(call.name)) {
      results.push(executeTool(tools, ctx, call));
    }
  }
  return results;
}
