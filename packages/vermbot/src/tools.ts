/**
 * Memory/journal/goals tools exposed to the LLM during a turn.
 *
 * The agent can read and write these durable play resources before emitting a
 * final game command. All writes are repo-rooted under
 * plays/<game>/<id>/{memory,journal,goals}/ and enforce default size limits.
 */

import {
  readPlayMemory,
  readPlayJournal,
  readPlayGoals,
  writePlayMemory,
  writePlayJournal,
  writePlayGoals,
  ValidationError,
} from "./files.ts";
import type { ToolResult } from "./protocol.ts";

export interface ToolContext {
  game: string;
  id: string;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (ctx: ToolContext, input: unknown) => ToolResult;
}

const DEFAULT_LIMITS = {
  goals: 1024,
  memory: 2048,
  journal: 32768,
} as const;

function toolCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function requireString(input: unknown, field: string): string {
  if (input && typeof input === "object" && typeof (input as Record<string, unknown>)[field] === "string") {
    return (input as Record<string, unknown>)[field] as string;
  }
  throw new ValidationError(`missing or invalid field: ${field}`);
}

function optionalString(input: unknown, field: string): string | undefined {
  if (input && typeof input === "object") {
    const value = (input as Record<string, unknown>)[field];
    if (value === undefined) return undefined;
    if (typeof value === "string") return value;
  }
  throw new ValidationError(`invalid field: ${field}`);
}

function okResult(name: string, value: unknown): ToolResult {
  return { id: toolCallId(), name, result: value };
}

function errorResult(name: string, message: string): ToolResult {
  return { id: toolCallId(), name, result: null, error: message };
}

function readTool(
  name: string,
  description: string,
  read: (game: string, id: string) => string,
): AgentTool {
  return {
    name,
    description,
    inputSchema: { type: "object", properties: {}, required: [] },
    execute: (ctx) => {
      try {
        return okResult(name, read(ctx.game, ctx.id));
      } catch (e) {
        return errorResult(name, e instanceof Error ? e.message : String(e));
      }
    },
  };
}

export function makeAgentTools(ctx: ToolContext): AgentTool[] {
  return [
    readTool("memory_read", "Read the play's short-term memory file.", readPlayMemory),
    {
      name: "memory_write",
      description: `Overwrite the play's short-term memory. Max ${DEFAULT_LIMITS.memory} characters.`,
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "New memory content." },
        },
        required: ["content"],
      },
      execute: (ctx, input) => {
        try {
          const content = requireString(input, "content");
          writePlayMemory(ctx.game, ctx.id, { content, maxChars: DEFAULT_LIMITS.memory });
          return okResult("memory_write", { written: content.length });
        } catch (e) {
          return errorResult("memory_write", e instanceof Error ? e.message : String(e));
        }
      },
    },
    readTool("journal_read", "Read the play's journal file.", readPlayJournal),
    {
      name: "journal_write",
      description: `Append (or overwrite) the play's journal. Max ${DEFAULT_LIMITS.journal} characters per write.`,
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string", description: "Journal entry or full journal content." },
          mode: {
            type: "string",
            enum: ["append", "overwrite"],
            description: "append adds a timestamped entry; overwrite replaces the whole file.",
          },
        },
        required: ["content"],
      },
      execute: (ctx, input) => {
        try {
          const content = requireString(input, "content");
          const mode = optionalString(input, "mode");
          const result = writePlayJournal(ctx.game, ctx.id, {
            content,
            mode: mode === "overwrite" ? "overwrite" : "append",
            maxChars: DEFAULT_LIMITS.journal,
          });
          return okResult("journal_write", { written: content.length, total: result.length });
        } catch (e) {
          return errorResult("journal_write", e instanceof Error ? e.message : String(e));
        }
      },
    },
    readTool("goals_read", "Read the play's current goals file.", readPlayGoals),
    {
      name: "goals_write",
      description: `Overwrite the play's goals. Max ${DEFAULT_LIMITS.goals} characters.`,
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
          writePlayGoals(ctx.game, ctx.id, { content, maxChars: DEFAULT_LIMITS.goals });
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
