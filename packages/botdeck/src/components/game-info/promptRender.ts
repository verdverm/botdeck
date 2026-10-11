/**
 * Browser mirror of vermbot's `prompts.ts` render logic.
 *
 * The markdown tab renders prompts live against the current emulator state on
 * the ~0.2s refresh cadence, without running a turn. To keep the output byte-
 * identical to what the backend would send, this mirrors `buildContext`,
 * `renderTemplate`, mode-snippet resolution, and the system/user assembly in
 * `renderPrompt`. The disk-derived context pieces (memory, goals, agent
 * snippets, recent history, limits) and each template's shadowed content come
 * from the `prompt-context` bundle; the state-dependent pieces (commands,
 * stateJson, gameInfo, userMessage) are computed from the live snapshot here.
 */

import { formatFF1StateFromUnknown } from "@games/ff1-state";
import type { CommandSpec, PromptTemplateBundle, TemplateSource } from "@/types";

export interface RenderContext {
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

export interface LivePromptInput {
  gameId: string;
  playId: string;
  mode: string;
  state: Record<string, unknown>;
  options: CommandSpec[];
  userMessage: string;
}

function formatCommands(options: CommandSpec[]): string {
  return options
    .map((o) => `- ${o.name}${o.args ? ` ${o.args}` : ""}: ${o.description}`)
    .join("\n");
}

/** Mirrors `buildContext` in prompts.ts, mixing live + bundled context. */
export function buildRenderContext(
  input: LivePromptInput,
  bundle: PromptTemplateBundle,
): RenderContext {
  return {
    gameId: input.gameId,
    playId: input.playId,
    commands: formatCommands(input.options),
    stateJson: JSON.stringify(input.state, null, 2),
    gameInfo: formatFF1StateFromUnknown(input.state),
    memory: bundle.context.memory,
    goals: bundle.context.goals,
    agentSnippets: bundle.context.agentSnippets,
    userMessage: input.userMessage,
    recentHistory: bundle.context.recentHistory,
    memoryLimit: bundle.limits.memoryLimit,
    memoryCount: bundle.limits.memoryCount,
    goalsLimit: bundle.limits.goalsLimit,
    journalLimit: bundle.limits.journalLimit,
    snippetLimit: bundle.limits.snippetLimit,
    snippetCount: bundle.limits.snippetCount,
  };
}

/** Mirrors `renderTemplate` in prompts.ts: {{key}} -> value, unknown -> "". */
export function renderTemplate(template: string, ctx: RenderContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    key in ctx ? ctx[key as keyof RenderContext] : "",
  );
}

/**
 * Mirrors `resolveModeSnippets` from prompts.ts: return the mode's snippet
 * list, or undefined when no matching mode exists in the resolved config.
 * There is no default fallback - a missing mode means a config error.
 */
export function resolveSnippetsForMode(
  bundle: PromptTemplateBundle,
  mode: string,
): string[] | undefined {
  const found = bundle.prompt.modes?.find((m) => m.id === mode);
  return found?.promptSnippets;
}

function templateContent(bundle: PromptTemplateBundle, name: string): string {
  const t: TemplateSource | undefined = bundle.templates.find((x) => x.name === name);
  // The backend trims each snippet on read; mirror that so joins match.
  return (t?.content ?? "").trim();
}

/** Render a single snippet template with the live context. */
export function renderSnippet(
  name: string,
  bundle: PromptTemplateBundle,
  ctx: RenderContext,
): string {
  return renderTemplate(templateContent(bundle, name), ctx);
}

export interface PromptParts {
  system: string;
  user: string;
}

/**
 * Mirrors `renderPrompt` assembly for the given live input + bundle. The
 * snippet named exactly "system" becomes the system prompt; the rest join, in
 * order, into the user prompt, then the fixed appended sections follow.
 */
export function assemblePrompt(
  input: LivePromptInput,
  bundle: PromptTemplateBundle,
): PromptParts {
  const snippets = resolveSnippetsForMode(bundle, input.mode);
  if (!snippets || snippets.length === 0) return { system: "", user: "" };

  const ctx = buildRenderContext(input, bundle);

  const systemIndex = snippets.indexOf("system");
  const system =
    systemIndex >= 0 ? renderSnippet("system", bundle, ctx) : "";

  const userParts = snippets
    .filter((_, i) => i !== systemIndex)
    .map((name) => renderSnippet(name, bundle, ctx))
    .filter(Boolean);

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
