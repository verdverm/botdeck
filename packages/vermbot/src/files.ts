/**
 * Repo-rooted filesystem helpers for the file API (DESIGN.md 4).
 *
 * All repo file IO lives here on the node server; botdeck (browser) reaches it
 * over /api. The agent process gets these same helpers for free.
 *
 * Path safety is enforced in one place: repoPath() rejects anything that would
 * escape the repo root (.. traversal, absolute injection). Every handler builds
 * its path through here or through the segment helpers, so the URL always maps
 * onto a real repo folder.
 */

import { Buffer } from "node:buffer";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  diffFF1States,
  readFF1StateFromSaveState,
  type FF1GameState,
  type FF1StateDiff,
  type JsNesState,
} from "@games/ff1-state";
import type {
  ButtonStep,
  GameCommand,
  TurnRequest,
  TurnResponse,
} from "./protocol.ts";

// This file lives at <repo>/packages/vermbot/src, so the repo root is three up.
const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "../../..");

export const GAMES_DIR = join(REPO_ROOT, "games");
export const PLAYS_DIR = join(REPO_ROOT, "plays");

/** Resolve `...segments` under the repo root, refusing any escape. */
export function repoPath(...segments: string[]): string {
  const abs = resolve(REPO_ROOT, ...segments);
  if (abs !== REPO_ROOT && !abs.startsWith(REPO_ROOT + "/")) {
    throw new PathEscapeError(segments.join("/"));
  }
  return abs;
}

export class PathEscapeError extends Error {
  constructor(segment: string) {
    super(`path escapes repo root: ${segment}`);
    this.name = "PathEscapeError";
  }
}

/** A play id is "game/id"; both segments must be safe single path parts. */
function assertSegment(name: string, value: string): string {
  if (
    value === "" ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new PathEscapeError(`${name}=${value}`);
  }
  return value;
}

export function gameDir(game: string): string {
  assertSegment("game", game);
  return repoPath("games", game);
}

export function playDir(game: string, id: string): string {
  assertSegment("game", game);
  assertSegment("id", id);
  return repoPath("plays", game, id);
}

export function readRom(game: string): Uint8Array {
  const file = join(gameDir(game), "game.nes");
  if (!existsSync(file)) throw new FileNotFoundError(file);
  return new Uint8Array(readFileSync(file));
}

export function readSplash(game: string): Uint8Array {
  const file = join(gameDir(game), "splash.png");
  if (!existsSync(file)) throw new FileNotFoundError(file);
  return new Uint8Array(readFileSync(file));
}

export interface GameInfo {
  game: string;
  hasRom: boolean;
  hasGuide: boolean;
}

export function listGames(): GameInfo[] {
  if (!existsSync(GAMES_DIR)) return [];
  return readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => ({
      game: d.name,
      hasRom: existsSync(join(GAMES_DIR, d.name, "game.nes")),
      hasGuide: existsSync(join(GAMES_DIR, d.name, "guide")),
    }))
    .filter((g) => g.hasRom || g.hasGuide)
    .sort((a, b) => a.game.localeCompare(b.game));
}

export interface PromptConfig {
  snippets?: string[];
  modes?: AgentMode[];
}

export interface AgentMode {
  id: string;
  label: string;
  promptSnippets: string[];
  autoAdvance?: boolean;
}

export function readGameConfig(game: string): Record<string, unknown> {
  const file = join(gameDir(game), "config.json");
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGameCommand(value: unknown): value is GameCommand {
  return isPlainObject(value) && typeof value.name === "string";
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entry"
  );
}

function isAgentMode(value: unknown): value is AgentMode {
  if (!isPlainObject(value)) return false;
  if (typeof value.id !== "string" || value.id === "") return false;
  if (typeof value.label !== "string") return false;
  const snippets = value.promptSnippets;
  if (!Array.isArray(snippets) || !snippets.every((s) => typeof s === "string")) return false;
  return true;
}

function extractPromptConfig(config: Record<string, unknown> | undefined): PromptConfig | undefined {
  if (!config) return undefined;
  const prompt = config["prompt"];
  if (!isPlainObject(prompt)) return undefined;
  const snippets = prompt["snippets"];
  const modes = prompt["modes"];
  const out: PromptConfig = {};
  if (Array.isArray(snippets) && snippets.every((s) => typeof s === "string")) {
    out.snippets = snippets;
  }
  if (Array.isArray(modes) && modes.every(isAgentMode)) {
    out.modes = modes;
  }
  if (out.snippets || out.modes) return out;
  return undefined;
}

export function resolvePromptConfig(game: string, id?: string): PromptConfig {
  if (id) {
    try {
      const play = extractPromptConfig(readPlayConfig(game, id));
      if (play) return play;
    } catch (e) {
      if (!(e instanceof FileNotFoundError)) throw e;
    }
  }
  const gameCfg = extractPromptConfig(readGameConfig(game));
  if (gameCfg) return gameCfg;
  return { snippets: ["system", "commands", "state"] };
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface AgentLimits {
  goals: number;
  memory: number;
  journal: number;
  memoryCount: number;
}

export interface AgentConfig {
  model: string;
  maxToolRounds: number;
  maxTokens: number;
  /** Per-provider-turn timeout in milliseconds. */
  timeoutMs: number;
  limits: AgentLimits;
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  model: "small",
  maxToolRounds: 5,
  maxTokens: 1024,
  timeoutMs: 120_000,
  limits: { goals: 1024, memory: 2048, journal: 32768, memoryCount: 10 },
};

function extractAgentConfig(
  config: Record<string, unknown> | undefined,
): Partial<AgentConfig> | undefined {
  if (!config) return undefined;
  const agent = config["agent"];
  if (!isPlainObject(agent)) return undefined;
  const limitsRaw = agent["limits"];
  const limits = isPlainObject(limitsRaw) ? limitsRaw : undefined;
  const out: Partial<AgentConfig> = {};
  if (typeof agent["model"] === "string") out.model = agent["model"];
  if (typeof agent["maxToolRounds"] === "number") out.maxToolRounds = agent["maxToolRounds"];
  if (typeof agent["maxTokens"] === "number") out.maxTokens = agent["maxTokens"];
  if (typeof agent["timeoutMs"] === "number") out.timeoutMs = agent["timeoutMs"];
  if (limits) {
    out.limits = {
      goals: numberOrDefault(limits["goals"], DEFAULT_AGENT_CONFIG.limits.goals),
      memory: numberOrDefault(limits["memory"], DEFAULT_AGENT_CONFIG.limits.memory),
      journal: numberOrDefault(limits["journal"], DEFAULT_AGENT_CONFIG.limits.journal),
      memoryCount: numberOrDefault(limits["memoryCount"], DEFAULT_AGENT_CONFIG.limits.memoryCount),
    };
  }
  return out;
}

export function resolveAgentConfig(game: string, id?: string): AgentConfig {
  const gameCfg = extractAgentConfig(readGameConfig(game));
  let playCfg: Partial<AgentConfig> | undefined;
  if (id) {
    try {
      playCfg = extractAgentConfig(readPlayConfig(game, id));
    } catch (e) {
      if (!(e instanceof FileNotFoundError)) throw e;
    }
  }
  const mergeLimits = (base?: AgentLimits, override?: AgentLimits): AgentLimits => ({
    goals: override?.goals ?? base?.goals ?? DEFAULT_AGENT_CONFIG.limits.goals,
    memory: override?.memory ?? base?.memory ?? DEFAULT_AGENT_CONFIG.limits.memory,
    journal: override?.journal ?? base?.journal ?? DEFAULT_AGENT_CONFIG.limits.journal,
    memoryCount: override?.memoryCount ?? base?.memoryCount ?? DEFAULT_AGENT_CONFIG.limits.memoryCount,
  });
  const merged: Partial<AgentConfig> = { ...gameCfg, ...playCfg };
  return {
    model: merged.model ?? DEFAULT_AGENT_CONFIG.model,
    maxToolRounds: merged.maxToolRounds ?? DEFAULT_AGENT_CONFIG.maxToolRounds,
    maxTokens: merged.maxTokens ?? DEFAULT_AGENT_CONFIG.maxTokens,
    timeoutMs: merged.timeoutMs ?? DEFAULT_AGENT_CONFIG.timeoutMs,
    limits: mergeLimits(gameCfg?.limits, playCfg?.limits),
  };
}

function readPlayTextFile(game: string, id: string, ...segments: string[]): string {
  const file = join(playDir(game, id), ...segments);
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf8").trim();
}

export function readPlayMemory(game: string, id: string): string {
  const entries = listPlayMemory(game, id);
  if (entries.length === 0) return "";
  const dir = playDir(game, id);
  return entries
    .map((entry) => ({
      ...entry,
      mtime: statSync(join(dir, entry.path)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .map((entry) => {
      const slug = entry.name.replace(/\.md$/, "");
      const content = readFileSync(join(dir, entry.path), "utf8");
      return `## ${slug}\n\n${content}`;
    })
    .join("\n\n");
}

export function readPlayJournal(game: string, id: string, name: string): string {
  assertSegment("name", name);
  return readPlayTextFile(game, id, "journal", `${name}.md`);
}

export function readPlayGoals(game: string, id: string): string {
  return readPlayTextFile(game, id, "goals", "goals.md");
}

export interface WritePlayTextOptions {
  content: string;
  maxChars?: number;
}

export function writePlayMemory(
  game: string,
  id: string,
  slug: string,
  options: WritePlayTextOptions,
): string {
  assertSegment("slug", slug);
  const cfg = resolveAgentConfig(game, id);
  const maxChars = options.maxChars ?? cfg.limits.memory;
  if (options.content.length > maxChars) {
    throw new ValidationError(
      `memory entry exceeds ${maxChars} characters (${options.content.length})`,
    );
  }
  const dir = join(playDir(game, id), "memory");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${slug}.md`);
  writeFileSync(file, options.content);
  enforceMemoryCount(game, id, cfg.limits.memoryCount);
  return options.content;
}

function enforceMemoryCount(game: string, id: string, limit: number): void {
  const entries = listPlayMemory(game, id);
  if (entries.length <= limit) return;
  const dir = playDir(game, id);
  const withMtime = entries.map((entry) => ({
    ...entry,
    mtime: statSync(join(dir, entry.path)).mtimeMs,
  }));
  withMtime.sort((a, b) => a.mtime - b.mtime);
  const toDelete = withMtime.slice(0, withMtime.length - limit);
  for (const entry of toDelete) {
    rmSync(join(dir, entry.path));
  }
}

export type WriteJournalOptions = WritePlayTextOptions;

export function writePlayJournal(
  game: string,
  id: string,
  name: string,
  options: WriteJournalOptions,
): string {
  assertSegment("name", name);
  const cfg = resolveAgentConfig(game, id);
  const maxChars = options.maxChars ?? cfg.limits.journal;
  if (options.content.length > maxChars) {
    throw new ValidationError(
      `journal entry exceeds ${maxChars} characters (${options.content.length})`,
    );
  }
  const dir = join(playDir(game, id), "journal");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.md`);
  writeFileSync(file, options.content);
  return options.content;
}

export function writePlayGoals(
  game: string,
  id: string,
  options: WritePlayTextOptions,
): string {
  const cfg = resolveAgentConfig(game, id);
  const maxChars = options.maxChars ?? cfg.limits.goals;
  if (options.content.length > maxChars) {
    throw new ValidationError(
      `goals exceeds ${maxChars} characters (${options.content.length})`,
    );
  }
  const dir = join(playDir(game, id), "goals");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "goals.md");
  writeFileSync(file, options.content);
  return options.content;
}

export interface ResourceEntry {
  name: string;
  path: string;
}

function listPlayResourceDir(
  game: string,
  id: string,
  resource: string,
): ResourceEntry[] {
  const dir = join(playDir(game, id), resource);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => ({ name: d.name, path: `${resource}/${d.name}` }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listPlayMemory(game: string, id: string): ResourceEntry[] {
  return listPlayResourceDir(game, id, "memory");
}

export function listPlayJournal(game: string, id: string): ResourceEntry[] {
  return listPlayResourceDir(game, id, "journal");
}

export function listPlayGoals(game: string, id: string): ResourceEntry[] {
  return listPlayResourceDir(game, id, "goals");
}

export interface MemoryEntry {
  slug: string;
  mtime: number;
  preview: string;
  path: string;
  url: string;
}

export function listPlayMemoryEntries(game: string, id: string): MemoryEntry[] {
  assertSegment("game", game);
  assertSegment("id", id);
  const dir = join(playDir(game, id), "memory");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => {
      const slug = d.name.replace(/\.md$/, "");
      const file = join(dir, d.name);
      const mtime = statSync(file).mtimeMs;
      const content = readFileSync(file, "utf8");
      const preview = content.slice(0, 120).replace(/\s+/g, " ").trim();
      return {
        slug,
        mtime,
        preview,
        path: `plays/${game}/${id}/memory/${d.name}`,
        url: `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/memory/${encodeURIComponent(slug)}`,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export function readPlayMemoryEntry(game: string, id: string, slug: string): string {
  assertSegment("slug", slug);
  const file = join(playDir(game, id), "memory", `${slug}.md`);
  if (!existsSync(file)) throw new FileNotFoundError(file);
  return readFileSync(file, "utf8");
}

export function deletePlayMemory(game: string, id: string, slug: string): void {
  assertSegment("slug", slug);
  const file = join(playDir(game, id), "memory", `${slug}.md`);
  if (!existsSync(file)) throw new FileNotFoundError(file);
  rmSync(file);
}

export interface JournalEntry {
  name: string;
  mtime: number;
  preview: string;
  path: string;
  url: string;
}

export function listPlayJournalEntries(game: string, id: string): JournalEntry[] {
  assertSegment("game", game);
  assertSegment("id", id);
  const dir = join(playDir(game, id), "journal");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".md"))
    .map((d) => {
      const name = d.name.replace(/\.md$/, "");
      const file = join(dir, d.name);
      const mtime = statSync(file).mtimeMs;
      const content = readFileSync(file, "utf8");
      const preview = content.slice(0, 120).replace(/\s+/g, " ").trim();
      return {
        name,
        mtime,
        preview,
        path: `plays/${game}/${id}/journal/${d.name}`,
        url: `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/journal/${encodeURIComponent(name)}`,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function deletePlayJournal(game: string, id: string, name: string): void {
  assertSegment("name", name);
  const file = join(playDir(game, id), "journal", `${name}.md`);
  if (!existsSync(file)) throw new FileNotFoundError(file);
  rmSync(file);
}

export interface StepRecord {
  stepId: string;
  ts: number;
  request: TurnRequest;
  response: TurnResponse;
  command: GameCommand;
  macro?: ButtonStep[];
  stateBefore?: string;
  stateAfter?: string;
}

export interface StepDescriptor {
  stepId: string;
  ts: number;
  commandName: string;
  path: string;
  url: string;
}

const STEP_FILE_RE = /^(\w[\w.-]*)\.step\.json$/;

export function assertStepRecord(body: unknown): StepRecord {
  if (!isPlainObject(body)) {
    throw new ValidationError("body must be a JSON object");
  }
  const { stepId, ts, request, response, command, macro, stateBefore, stateAfter } = body;
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    throw new ValidationError("ts must be a number");
  }
  if (!isPlainObject(request)) {
    throw new ValidationError("request must be an object");
  }
  if (!isPlainObject(response)) {
    throw new ValidationError("response must be an object");
  }
  if (!isGameCommand(command)) {
    throw new ValidationError("command must be an object with a string name");
  }
  if (typeof stepId !== "undefined" && typeof stepId !== "string") {
    throw new ValidationError("stepId must be a string if provided");
  }
  if (typeof stateBefore !== "undefined" && typeof stateBefore !== "string") {
    throw new ValidationError("stateBefore must be a string if provided");
  }
  if (typeof stateAfter !== "undefined" && typeof stateAfter !== "string") {
    throw new ValidationError("stateAfter must be a string if provided");
  }
  if (typeof macro !== "undefined" && !Array.isArray(macro)) {
    throw new ValidationError("macro must be an array if provided");
  }
  return body as unknown as StepRecord;
}

function nextStepId(dir: string): string {
  let max = 0;
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const m = entry.name.match(/^([\w.-]+)\.step\.json$/);
      if (m) {
        const prefix = m[1] ?? "";
        const n = /^\d+$/.test(prefix) ? parseInt(prefix, 10) : 0;
        if (n > max) max = n;
      }
    }
  }
  return String(max + 1).padStart(6, "0");
}

export function writePlayStep(game: string, id: string, input: StepRecord): StepRecord {
  assertSegment("game", game);
  assertSegment("id", id);
  const dir = join(playDir(game, id), "steps");
  mkdirSync(dir, { recursive: true });
  const stepId = input.stepId || nextStepId(dir);
  assertSegment("stepId", stepId);
  if (!STEP_FILE_RE.test(`${stepId}.step.json`)) {
    throw new ValidationError(`invalid stepId: ${stepId}`);
  }
  const file = join(dir, `${stepId}.step.json`);
  if (existsSync(file)) {
    throw new AlreadyExistsError(file);
  }
  const record: StepRecord = { ...input, stepId };
  writeFileSync(file, `${JSON.stringify(toJSONSafe(record), null, 2)}\n`);
  return record;
}

export function listPlaySteps(game: string, id: string): StepDescriptor[] {
  assertSegment("game", game);
  assertSegment("id", id);
  const dir = join(playDir(game, id), "steps");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".step.json"))
    .map((d) => {
      const stepId = d.name.replace(/\.step\.json$/, "");
      const file = join(dir, d.name);
      const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
      const ts = isPlainObject(raw) && typeof raw.ts === "number" ? raw.ts : 0;
      const commandName =
        isPlainObject(raw) && isGameCommand(raw.command)
          ? raw.command.name
          : "unknown";
      return {
        stepId,
        ts,
        commandName,
        path: `plays/${game}/${id}/steps/${d.name}`,
        url: `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`,
      };
    })
    .sort((a, b) => a.stepId.localeCompare(b.stepId));
}

export function readPlayStep(game: string, id: string, stepId: string): StepRecord {
  assertSegment("game", game);
  assertSegment("id", id);
  assertSegment("stepId", stepId);
  const file = join(playDir(game, id), "steps", `${stepId}.step.json`);
  if (!existsSync(file)) throw new FileNotFoundError(file);
  return JSON.parse(readFileSync(file, "utf8")) as StepRecord;
}

export function readPlayConfig(game: string, id: string): Record<string, unknown> {
  const file = join(playDir(game, id), "config.json");
  if (!existsSync(file)) throw new FileNotFoundError(file);
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

export function writePlayConfig(
  game: string,
  id: string,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const dir = playDir(game, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  return config;
}

export function createPlay(
  game: string,
  id: string,
  label?: string,
): Record<string, unknown> {
  const dir = playDir(game, id);
  if (existsSync(dir)) throw new AlreadyExistsError(dir);
  mkdirSync(join(dir, "states"), { recursive: true });
  mkdirSync(join(dir, "steps"), { recursive: true });
  mkdirSync(join(dir, "memory"), { recursive: true });
  mkdirSync(join(dir, "journal"), { recursive: true });
  mkdirSync(join(dir, "goals"), { recursive: true });
  mkdirSync(join(dir, "snippets"), { recursive: true });
  const config = { id, game, ...(label ? { label } : {}) };
  writePlayConfig(game, id, config);
  return config;
}

export function deletePlay(game: string, id: string): void {
  const dir = playDir(game, id);
  if (!existsSync(dir)) throw new FileNotFoundError(dir);
  rmSync(dir, { recursive: true, force: true });
}

export function listPlays(game?: string): { game: string; id: string }[] {
  const roots = game ? [assertSegment("game", game)] : existsSync(PLAYS_DIR) ? readdirSync(PLAYS_DIR) : [];
  const out: { game: string; id: string }[] = [];
  for (const g of roots) {
    const gameRoot = join(PLAYS_DIR, g);
    if (!existsSync(gameRoot) || !statSync(gameRoot).isDirectory()) continue;
    for (const id of readdirSync(gameRoot)) {
      if (statSync(join(gameRoot, id)).isDirectory()) out.push({ game: g, id });
    }
  }
  return out.sort((a, b) => `${a.game}/${a.id}`.localeCompare(`${b.game}/${b.id}`));
}

export class FileNotFoundError extends Error {
  constructor(path: string) {
    super(`not found: ${path}`);
    this.name = "FileNotFoundError";
  }
}

export class AlreadyExistsError extends Error {
  constructor(path: string) {
    super(`already exists: ${path}`);
    this.name = "AlreadyExistsError";
  }
}

export interface CollectedState {
  capturedAt: string;
  rom: Record<string, unknown>;
  saveRam: number[];
  saveState: JsNesState;
}

export interface SavedStateResult {
  statePath: string;
  extractedPath: string;
  metadataPath: string;
  ff1: FF1GameState;
}

export interface PlayStateMetadata {
  name: string;
  createdAt: string;
  bookmarked: boolean;
}

export interface PlayStateEntry {
  filename: string;
  statePath: string;
  extractedPath?: string;
  metadataPath?: string;
  stateUrl: string;
  extractedUrl?: string;
  metadataUrl?: string;
  name: string;
  createdAt: string;
  bookmarked: boolean;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((v) => typeof v === "number");
}

export function assertCollectedState(body: unknown): CollectedState {
  if (!isPlainObject(body)) {
    throw new ValidationError("body must be a JSON object");
  }
  const { capturedAt, rom, saveRam, saveState } = body;
  if (typeof capturedAt !== "string" || capturedAt === "") {
    throw new ValidationError("capturedAt must be a non-empty string");
  }
  if (!isPlainObject(rom)) {
    throw new ValidationError("rom must be an object");
  }
  if (!isNumberArray(saveRam)) {
    throw new ValidationError("saveRam must be an array of numbers");
  }
  if (!isPlainObject(saveState)) {
    throw new ValidationError("saveState must be an object");
  }
  return { capturedAt, rom, saveRam, saveState: saveState as unknown as JsNesState };
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function toJSONSafe(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Array.from(value);
  }
  if (Array.isArray(value)) {
    return value.map(toJSONSafe);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toJSONSafe(v);
    }
    return out;
  }
  return value;
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = isNaN(d.getTime()) ? new Date() : d;
  return date.toISOString().replace(/:/g, "-").replace(/\..+$/, "");
}

export interface SaveStateInput {
  data: unknown;
  name?: string;
}

function looksLikeCollectedState(value: unknown): value is Record<string, unknown> {
  return (
    isPlainObject(value) &&
    typeof value.capturedAt === "string" &&
    isPlainObject(value.saveState)
  );
}

function decodeStateData(data: unknown): unknown {
  if (typeof data !== "string") return data;
  const trimmed = data.trim();
  // Try base64 first; if it decodes to valid JSON, use that.
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    // Otherwise treat the string as raw JSON text.
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new ValidationError("data must be a base64 or JSON snapshot");
    }
  }
}

function normalizeToCollectedState(data: unknown): CollectedState {
  const decoded = decodeStateData(data);
  if (looksLikeCollectedState(decoded)) {
    return assertCollectedState(decoded);
  }
  // Treat as a raw jsNES save-state snapshot.
  return {
    capturedAt: new Date().toISOString(),
    rom: {},
    saveRam: [],
    saveState: decoded as JsNesState,
  };
}

export function assertSaveStateBody(body: unknown): SaveStateInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("body must be a JSON object");
  }
  const { data, name } = body;
  if (data === undefined) {
    throw new ValidationError("data is required");
  }
  return {
    data,
    name: typeof name === "string" ? name : undefined,
  };
}

function nextStateId(dir: string): string {
  let max = 0;
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const m = entry.name.match(/^(\d{6})\b.*\.state\.json$/);
      if (m) {
        const n = parseInt(m[1]!, 10);
        if (n > max) max = n;
      }
    }
  }
  return String(max + 1).padStart(6, "0");
}

export function savePlayState(
  game: string,
  id: string,
  input: SaveStateInput,
): SavedStateResult {
  assertSegment("game", game);
  assertSegment("id", id);

  const state = normalizeToCollectedState(input.data);
  const name = input.name;
  const dir = join(playDir(game, id), "states");
  mkdirSync(dir, { recursive: true });

  const stateId = nextStateId(dir);
  const nameSlug = name ? slugify(name) : "";
  const prefix = nameSlug ? `${stateId}-${nameSlug}` : stateId;

  const stateFile = join(dir, `${prefix}.state.json`);
  writeFileSync(
    stateFile,
    `${JSON.stringify(toJSONSafe(state.saveState), null, 2)}\n`,
  );

  const ff1 = readFF1StateFromSaveState(state.saveState);
  const extractedFile = join(dir, `${prefix}.ff1.json`);
  writeFileSync(extractedFile, `${JSON.stringify(toJSONSafe(ff1), null, 2)}\n`);

  const metadataFile = join(dir, `${prefix}.metadata.json`);
  const metadata: PlayStateMetadata = {
    name: name ?? "",
    createdAt: state.capturedAt,
    bookmarked: false,
  };
  writeFileSync(metadataFile, `${JSON.stringify(toJSONSafe(metadata), null, 2)}\n`);

  const repoRelative = (abs: string): string => {
    const rel = abs.slice(REPO_ROOT.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  };

  return {
    statePath: repoRelative(stateFile),
    extractedPath: repoRelative(extractedFile),
    metadataPath: repoRelative(metadataFile),
    ff1,
  };
}

export type PlayStateSort = "newest" | "oldest" | "name (a-z)" | "name (z-a)";

export interface PlaySnippet {
  id: string;
  name: string;
  description: string;
  game: string;
  play: string;
  startState: string;
  steps: SnippetStep[];
  expectedEndState?: string;
  tags?: string[];
}

export type SnippetStep =
  | { kind: "command"; command: GameCommand }
  | { kind: "macro"; buttonSteps: ButtonStep[] }
  | { kind: "wait"; frames: number };

const SNIPPET_FILE_RE = /^[\w.-]+\.snippet\.json$/;

function isButtonStep(value: unknown): value is ButtonStep {
  if (!isPlainObject(value)) return false;
  if (!Number.isInteger(value.button)) return false;
  if (value.holdFrames !== undefined && typeof value.holdFrames !== "number") return false;
  if (value.gapFrames !== undefined && typeof value.gapFrames !== "number") return false;
  return true;
}

function isSnippetStep(value: unknown): value is SnippetStep {
  if (!isPlainObject(value)) return false;
  const kind = value.kind;
  if (kind === "wait") return typeof value.frames === "number";
  if (kind === "macro") {
    return Array.isArray(value.buttonSteps) && value.buttonSteps.every(isButtonStep);
  }
  if (kind === "command" || kind === undefined) {
    return isGameCommand(value.command);
  }
  return false;
}

function assertSnippet(body: unknown, id: string, game: string, play: string): PlaySnippet {
  if (!isPlainObject(body)) {
    throw new ValidationError("snippet must be a JSON object");
  }
  const { name, description, startState, steps, expectedEndState, tags } = body;
  if (typeof name !== "string" || name === "") {
    throw new ValidationError("snippet.name must be a non-empty string");
  }
  if (typeof description !== "string") {
    throw new ValidationError("snippet.description must be a string");
  }
  if (typeof startState !== "string" || startState === "") {
    throw new ValidationError("snippet.startState must be a non-empty string");
  }
  if (!Array.isArray(steps) || !steps.every(isSnippetStep)) {
    throw new ValidationError("snippet.steps must be an array of valid snippet steps");
  }
  if (typeof expectedEndState !== "undefined" && typeof expectedEndState !== "string") {
    throw new ValidationError("snippet.expectedEndState must be a string if provided");
  }
  if (typeof tags !== "undefined" && !(Array.isArray(tags) && tags.every((t) => typeof t === "string"))) {
    throw new ValidationError("snippet.tags must be an array of strings if provided");
  }
  return {
    id,
    name,
    description,
    game,
    play,
    startState,
    steps: steps as SnippetStep[],
    expectedEndState,
    tags,
  };
}

export interface SnippetDescriptor {
  id: string;
  name: string;
  path: string;
  url: string;
}

export function listPlaySnippets(game: string, id: string): SnippetDescriptor[] {
  assertSegment("game", game);
  assertSegment("id", id);
  const dir = join(playDir(game, id), "snippets");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && SNIPPET_FILE_RE.test(d.name))
    .map((d) => {
      const snippetId = d.name.replace(/\.snippet\.json$/, "");
      const file = join(dir, d.name);
      let name = snippetId;
      try {
        const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
        if (isPlainObject(parsed) && typeof parsed.name === "string") {
          name = parsed.name;
        }
      } catch {
        // ignore malformed snippet when listing
      }
      return {
        id: snippetId,
        name,
        path: `plays/${game}/${id}/snippets/${d.name}`,
        url: `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/snippets/${encodeURIComponent(snippetId)}`,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function readPlaySnippet(game: string, id: string, snippetId: string): PlaySnippet {
  assertSegment("game", game);
  assertSegment("id", id);
  assertSegment("snippetId", snippetId);
  if (!SNIPPET_FILE_RE.test(`${snippetId}.snippet.json`)) {
    throw new PathEscapeError(snippetId);
  }
  const file = join(playDir(game, id), "snippets", `${snippetId}.snippet.json`);
  if (!existsSync(file)) throw new FileNotFoundError(file);
  const body = JSON.parse(readFileSync(file, "utf8")) as unknown;
  return assertSnippet(body, snippetId, game, id);
}

export function writePlaySnippet(
  game: string,
  id: string,
  snippetId: string,
  body: unknown,
): PlaySnippet {
  assertSegment("game", game);
  assertSegment("id", id);
  assertSegment("snippetId", snippetId);
  if (!SNIPPET_FILE_RE.test(`${snippetId}.snippet.json`)) {
    throw new PathEscapeError(snippetId);
  }
  const snippet = assertSnippet(body, snippetId, game, id);
  const dir = join(playDir(game, id), "snippets");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${snippetId}.snippet.json`);
  writeFileSync(file, JSON.stringify(snippet, null, 2));
  return snippet;
}

export function deletePlaySnippet(game: string, id: string, snippetId: string): void {
  assertSegment("game", game);
  assertSegment("id", id);
  assertSegment("snippetId", snippetId);
  if (!SNIPPET_FILE_RE.test(`${snippetId}.snippet.json`)) {
    throw new PathEscapeError(snippetId);
  }
  const file = join(playDir(game, id), "snippets", `${snippetId}.snippet.json`);
  if (!existsSync(file)) throw new FileNotFoundError(file);
  rmSync(file);
}

function readMetadata(dir: string, base: string): PlayStateMetadata | undefined {
  const file = join(dir, `${base}.metadata.json`);
  if (!existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (
      isPlainObject(parsed) &&
      typeof parsed.name === "string" &&
      typeof parsed.createdAt === "string"
    ) {
      return {
        name: parsed.name,
        createdAt: parsed.createdAt,
        bookmarked: parsed.bookmarked === true,
      };
    }
  } catch {
    // ignore malformed metadata
  }
  return undefined;
}

function parseTimestampFromFilename(name: string): number {
  // Filenames are built from formatTimestamp: 2026-10-01T02-19-44_ff1
  const isoLike = name.split("_")[0] ?? name;
  // Convert only the time portion's '-' to ':' while keeping the date '-'.
  const iso = isoLike.replace(/T(\d{2})-(\d{2})-(\d{2})$/, "T$1:$2:$3");
  const d = new Date(iso);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function listPlayStates(
  game: string,
  id: string,
  sort: PlayStateSort = "newest",
): PlayStateEntry[] {
  assertSegment("game", game);
  assertSegment("id", id);
  const dir = join(playDir(game, id), "states");
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".state.json"))
    .map((d) => {
      const base = d.name.replace(/\.state\.json$/, "");
      const extractedName = `${base}.ff1.json`;
      const metadataName = `${base}.metadata.json`;
      const hasExtracted = existsSync(join(dir, extractedName));
      const hasMetadata = existsSync(join(dir, metadataName));
      const metadata = readMetadata(dir, base);
      const createdAt = metadata?.createdAt ?? new Date(parseTimestampFromFilename(base)).toISOString();
      const displayName = metadata?.name ?? base;
      const bookmarked = metadata?.bookmarked ?? false;
      const statePath = `plays/${game}/${id}/states/${d.name}`;
      const extractedPath = hasExtracted
        ? `plays/${game}/${id}/states/${extractedName}`
        : undefined;
      const metadataPath = hasMetadata
        ? `plays/${game}/${id}/states/${metadataName}`
        : undefined;
      return {
        filename: d.name,
        statePath,
        extractedPath,
        metadataPath,
        stateUrl: `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/states/${encodeURIComponent(d.name)}`,
        extractedUrl: hasExtracted
          ? `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/states/${encodeURIComponent(extractedName)}`
          : undefined,
        metadataUrl: hasMetadata
          ? `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/states/${encodeURIComponent(metadataName)}`
          : undefined,
        name: displayName,
        createdAt,
        bookmarked,
      };
    });

  switch (sort) {
    case "name (a-z)":
      return entries.sort((a, b) => a.name.localeCompare(b.name));
    case "name (z-a)":
      return entries.sort((a, b) => b.name.localeCompare(a.name));
    case "oldest":
      return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "newest":
    default:
      return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

const STATE_FILE_RE = /^[\w.-]+\.(state|ff1|metadata)\.json$/;

export function readPlayState(game: string, id: string, filename: string): unknown {
  assertSegment("game", game);
  assertSegment("id", id);
  if (!STATE_FILE_RE.test(filename)) {
    throw new PathEscapeError(filename);
  }
  const file = join(playDir(game, id), "states", filename);
  if (!existsSync(file)) throw new FileNotFoundError(file);
  return JSON.parse(readFileSync(file, "utf8"));
}

function ff1Filename(filename: string): string {
  const base = filename.replace(/\.(state|ff1|metadata)\.json$/, "");
  return `${base}.ff1.json`;
}

export function diffPlayStates(
  game: string,
  id: string,
  beforeFilename: string,
  afterFilename: string,
): FF1StateDiff {
  assertSegment("game", game);
  assertSegment("id", id);
  if (!STATE_FILE_RE.test(beforeFilename)) {
    throw new PathEscapeError(beforeFilename);
  }
  if (!STATE_FILE_RE.test(afterFilename)) {
    throw new PathEscapeError(afterFilename);
  }
  const beforeFile = join(playDir(game, id), "states", ff1Filename(beforeFilename));
  const afterFile = join(playDir(game, id), "states", ff1Filename(afterFilename));
  if (!existsSync(beforeFile)) throw new FileNotFoundError(beforeFile);
  if (!existsSync(afterFile)) throw new FileNotFoundError(afterFile);
  const before = JSON.parse(readFileSync(beforeFile, "utf8")) as FF1GameState;
  const after = JSON.parse(readFileSync(afterFile, "utf8")) as FF1GameState;
  return diffFF1States(before, after);
}

function stateBaseFromFilename(filename: string): string | undefined {
  const m = filename.match(/^([\w.-]+)\.state\.json$/);
  return m?.[1];
}

export function deletePlayState(game: string, id: string, filename: string): void {
  assertSegment("game", game);
  assertSegment("id", id);
  const base = stateBaseFromFilename(filename);
  if (!base) throw new PathEscapeError(filename);
  const dir = join(playDir(game, id), "states");
  const suffixes = [".state.json", ".ff1.json", ".metadata.json"];
  let removed = 0;
  for (const suffix of suffixes) {
    const file = join(dir, `${base}${suffix}`);
    if (existsSync(file)) {
      rmSync(file);
      removed++;
    }
  }
  if (removed === 0) throw new FileNotFoundError(join(dir, `${base}.state.json`));
}

export function updatePlayStateMetadata(
  game: string,
  id: string,
  filename: string,
  patch: { name?: string; bookmarked?: boolean },
): PlayStateMetadata {
  assertSegment("game", game);
  assertSegment("id", id);
  const base = stateBaseFromFilename(filename);
  if (!base) throw new PathEscapeError(filename);
  const dir = join(playDir(game, id), "states");
  const stateFile = join(dir, `${base}.state.json`);
  if (!existsSync(stateFile)) throw new FileNotFoundError(stateFile);

  const metadataFile = join(dir, `${base}.metadata.json`);
  let existing: PlayStateMetadata = {
    name: "",
    createdAt: new Date().toISOString(),
    bookmarked: false,
  };
  if (existsSync(metadataFile)) {
    const parsed = JSON.parse(readFileSync(metadataFile, "utf8")) as unknown;
    if (
      isPlainObject(parsed) &&
      typeof parsed.name === "string" &&
      typeof parsed.createdAt === "string"
    ) {
      existing = {
        name: parsed.name,
        createdAt: parsed.createdAt,
        bookmarked: parsed.bookmarked === true,
      };
    }
  } else {
    existing.createdAt = new Date(parseTimestampFromFilename(base)).toISOString();
  }

  const updated: PlayStateMetadata = {
    name: typeof patch.name === "string" ? patch.name : existing.name,
    createdAt: existing.createdAt,
    bookmarked:
      typeof patch.bookmarked === "boolean" ? patch.bookmarked : existing.bookmarked,
  };
  writeFileSync(metadataFile, `${JSON.stringify(toJSONSafe(updated), null, 2)}\n`);
  return updated;
}
