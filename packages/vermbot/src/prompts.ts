import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { formatFF1StateFromUnknown } from "@games/ff1-state";
import type { CommandSpec, TurnRequest } from "./protocol.ts";
import {
  gameDir,
  playDir,
  resolvePromptConfig,
  readPlayMemory,
  readPlayGoals,
  PathEscapeError,
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

function resolveSnippetPath(game: string, id: string | undefined, name: string): string | undefined {
  assertSnippetName(name);
  if (id) {
    const playFile = join(playDir(game, id), "prompts", `${name}.md`);
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
}

function buildContext(req: TurnRequest, game: string, id: string | undefined): RenderContext {
  return {
    gameId: req.gameId,
    playId: req.playId ?? "",
    commands: formatCommands(req.options),
    stateJson: JSON.stringify(req.state, null, 2),
    gameInfo: formatFF1StateFromUnknown(req.state),
    memory: id ? readPlayMemory(game, id) : "",
    goals: id ? readPlayGoals(game, id) : "",
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

  const config = resolvePromptConfig(game, id);
  const snippets = resolveModeSnippets(config, req.mode) ?? config.snippets ?? ["system", "commands", "state"];
  if (snippets.length === 0) {
    return { system: "", user: "" };
  }

  const ctx = buildContext(req, game, id);
  // Convention: the snippet named exactly "system" becomes the system prompt;
  // every other snippet is joined in config order to form the user prompt.
  const systemIndex = snippets.indexOf("system");
  const systemSnippet = systemIndex >= 0 ? snippets[systemIndex] : undefined;
  const system = systemSnippet
    ? renderTemplate(readSnippet(game, id, systemSnippet), ctx)
    : "";
  const user = snippets
    .filter((_, i) => i !== systemIndex)
    .map((name) => renderTemplate(readSnippet(game, id, name), ctx))
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}
