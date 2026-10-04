import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { formatFF1StateFromUnknown } from "@games/ff1-state";
import type { CommandSpec, TurnRequest } from "./protocol.ts";
import {
  gameDir,
  playUserSnippetsDir,
  resolvePromptConfig,
  resolveAgentConfig,
  readPlayMemory,
  readPlayGoals,
  readRecentStepHistory,
  listPlayAgentSnippets,
  readPlayAgentSnippet,
  PathEscapeError,
  DEFAULT_RECENT_HISTORY_LIMIT,
  type AgentConfig,
} from "./files.ts";

export interface PromptParts {
  system: string;
  user: string;
}

function assertSnippetName(name: string): string {
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.startsWith(".")
  ) {
    throw new PathEscapeError(`snippet name: ${name}`);
  }
  return name;
}

/**
 * Resolve user/system snippet paths only: play-level overrides under
 * snippets/user/, then game defaults under games/<game>/prompts/.
 * Agent-authored snippets are a separate store under snippets/agent/ and are
 * appended to the prompt explicitly; they never shadow user/system snippets by
 * name.
 */
function resolveSnippetPath(game: string, id: string | undefined, name: string): string | undefined {
  assertSnippetName(name);
  if (id) {
    const playFile = join(playUserSnippetsDir(game, id), `${name}.md`);
    if (existsSync(playFile)) return playFile;
  }
  const gameFile = join(gameDir(game), "prompts", `${name}.md`);
  if (existsSync(gameFile)) return gameFile;
  return undefined;
}

function readSnippet(game: string, id: string | undefined, name: string): string {
  const path = resolveSnippetPath(game, id, name);
  if (!path) return "";
  return readFileSync(path, "utf8").trim();
}

function readAgentSnippets(game: string, id: string | undefined): string {
  if (!id) return "";
  const entries = listPlayAgentSnippets(game, id);
  if (entries.length === 0) return "";
  return entries
    .map((entry) => {
      const content = readPlayAgentSnippet(game, id, entry.name);
      return `### ${entry.name}\n\n${content}`;
    })
    .join("\n\n");
}

function formatCommands(options: CommandSpec[]): string {
  return options
    .map((o) => `- ${o.name}${o.args ? ` ${o.args}` : ""}: ${o.description}`)
    .join("\n");
}

function parsePlayId(
  playId: string | undefined,
  gameId: string,
): { game: string; id: string } | undefined {
  if (!playId) return undefined;
  if (playId.includes("/")) {
    const [game, id] = playId.split("/");
    if (game && id) return { game, id };
    return undefined;
  }
  return { game: gameId, id: playId };
}

interface RenderContext {
  gameId: string;
  playId: string;
  commands: string;
  stateJson: string;
  gameInfo: string;
  memory: string;
  goals: string;
  agentSnippets: string;
  userMessage: string;
  recentHistory: string;
  memoryLimit: string;
  memoryCount: string;
  goalsLimit: string;
  journalLimit: string;
  snippetLimit: string;
  snippetCount: string;
}

function buildContext(
  req: TurnRequest,
  game: string,
  id: string | undefined,
  config?: AgentConfig,
): RenderContext {
  const limits = config?.limits;
  const recentHistoryLimit = config?.recentHistoryLimit ?? DEFAULT_RECENT_HISTORY_LIMIT;
  return {
    gameId: req.gameId,
    playId: req.playId ?? "",
    commands: formatCommands(req.options),
    stateJson: JSON.stringify(req.state, null, 2),
    gameInfo: formatFF1StateFromUnknown(req.state),
    memory: id ? readPlayMemory(game, id) : "",
    goals: id ? readPlayGoals(game, id) : "",
    agentSnippets: readAgentSnippets(game, id),
    userMessage: req.userMessage ?? "",
    recentHistory: id ? readRecentStepHistory(game, id, recentHistoryLimit) : "",
    memoryLimit: String(limits?.memory ?? 2048),
    memoryCount: String(limits?.memoryCount ?? 10),
    goalsLimit: String(limits?.goals ?? 1024),
    journalLimit: String(limits?.journal ?? 32768),
    snippetLimit: String(limits?.snippets ?? 4096),
    snippetCount: String(limits?.snippetCount ?? 50),
  };
}

function renderTemplate(template: string, ctx: RenderContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (key in ctx) {
      return ctx[key as keyof RenderContext];
    }
    return "";
  });
}

function resolveModeSnippets(config: import("./files.ts").PromptConfig, mode?: string): string[] | undefined {
  if (!mode) return undefined;
  const found = config.modes?.find((m) => m.id === mode);
  return found?.promptSnippets;
}

export function renderPrompt(req: TurnRequest): PromptParts {
  const parsed = parsePlayId(req.playId, req.gameId);
  const game = parsed?.game ?? req.gameId;
  const id = parsed?.id;

  const promptConfig = resolvePromptConfig(game, id);
  const snippets = resolveModeSnippets(promptConfig, req.mode) ?? promptConfig.snippets ?? ["system", "commands", "state"];
  if (snippets.length === 0) {
    return { system: "", user: "" };
  }

  const agentConfig = id ? resolveAgentConfig(game, id) : undefined;
  const ctx = buildContext(req, game, id, agentConfig);
  // Convention: the snippet named exactly "system" becomes the system prompt;
  // every other snippet is joined in config order to form the user prompt.
  const systemIndex = snippets.indexOf("system");
  const systemSnippet = systemIndex >= 0 ? snippets[systemIndex] : undefined;
  const system = systemSnippet
    ? renderTemplate(readSnippet(game, id, systemSnippet), ctx)
    : "";
  const userParts = snippets
    .filter((_, i) => i !== systemIndex)
    .map((name) => renderTemplate(readSnippet(game, id, name), ctx))
    .filter(Boolean);

  // Agent-authored snippets are a completely separate store. They are never
  // allowed to shadow user/system snippets by name; instead they are appended
  // as their own clearly-delimited section so the agent can add turn-by-turn
  // guidance without rewriting the prompt constitution.
  if (ctx.agentSnippets) {
    userParts.push(`## Agent-authored snippets\n\n${ctx.agentSnippets}`);
  }

  if (ctx.recentHistory) {
    userParts.push(`## Recent actions\n\n${ctx.recentHistory}`);
  }

  if (ctx.userMessage) {
    userParts.push(`## Message from the user\n\n${ctx.userMessage}`);
  }

  return { system, user: userParts.join("\n\n") };
}
