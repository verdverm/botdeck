/**
 * Memory/journal/goals tools exposed to the LLM during a turn.
 *
 * The agent can read and write these durable play resources before emitting a
 * final game command. All writes are repo-rooted under
 * plays/<game>/<id>/{memory,journal,goals}/ and enforce size limits from the
 * resolved agent config.
 */

import {
  listPlayJournal,
  readPlayJournal,
  writePlayJournal,
  writePlayMemory,
  writePlayGoals,
  ValidationError,
  type AgentConfig,
} from "./files.ts";
import type { ToolResult } from "./protocol.ts";

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

export function makeAgentTools(ctx: ToolContext): AgentTool[] {
  const limits = ctx.config.limits;
  return [
    {
      name: "journal_list",
      description: "List the play's journal entries.",
      inputSchema: { type: "object", properties: {}, required: [] },
      execute: () => {
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
      execute: (_, input) => {
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
      description: `Write a journal entry. Input: { "name": "...", "content": "..." }. Max ${limits.journal} characters per entry.`,
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the journal entry file (without .md)." },
          content: { type: "string", description: "Journal entry content." },
        },
        required: ["name", "content"],
      },
      execute: (_, input) => {
        try {
          const name = requireString(input, "name");
          const content = requireString(input, "content");
          writePlayJournal(ctx.game, ctx.id, name, { content, maxChars: limits.journal });
          return okResult("journal_write", { written: content.length });
        } catch (e) {
          return errorResult("journal_write", e instanceof Error ? e.message : String(e));
        }
      },
    },
    {
      name: "memory_write",
      description: `Write a short-term memory entry. Input: { "slug": "...", "content": "..." }. Accepts slug/id/name. Max ${limits.memory} characters per entry; only the ${limits.memoryCount} most recently modified entries are kept.`,
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
      execute: (_, input) => {
        try {
          const slug = resolveMemorySlug(input);
          const content = requireString(input, "content");
          writePlayMemory(ctx.game, ctx.id, slug, { content, maxChars: limits.memory });
          return okResult("memory_write", { slug, written: content.length });
        } catch (e) {
          return errorResult("memory_write", e instanceof Error ? e.message : String(e));
        }
      },
    },
    {
      name: "goals_write",
      description: `Overwrite the play's goals. Input: { "content": "..." }. Max ${limits.goals} characters.`,
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "New goals content." },
        },
        required: ["content"],
      },
      execute: (_, input) => {
        try {
          const content = requireString(input, "content");
          writePlayGoals(ctx.game, ctx.id, { content, maxChars: limits.goals });
          return okResult("goals_write", { written: content.length });
        } catch (e) {
          return errorResult("goals_write", e instanceof Error ? e.message : String(e));
        }
      },
    },
  ];
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
