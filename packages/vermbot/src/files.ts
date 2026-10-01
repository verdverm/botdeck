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
  readFF1StateFromSaveState,
  type FF1GameState,
  type JsNesState,
} from "@games/ff1-state";

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

/** The game's system prompt: games/<game>/prompts/system.md */
export function readGamePrompt(game: string): string {
  const file = join(gameDir(game), "prompts", "system.md");
  if (!existsSync(file)) throw new FileNotFoundError(file);
  return readFileSync(file, "utf8").trim();
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
  ff1: FF1GameState;
}

export interface PlayStateEntry {
  statePath: string;
  extractedPath?: string;
  stateUrl: string;
  extractedUrl?: string;
  name: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = isNaN(d.getTime()) ? new Date() : d;
  return date.toISOString().replace(/:/g, "-").replace(/\..+$/, "");
}

function makeSlug(rom: Record<string, unknown>): string {
  const name = typeof rom.name === "string" ? rom.name : "state";
  const base = name.replace(/\.[^.]+$/, "");
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "state";
}

function uniqueFile(dir: string, prefix: string, suffix: string): string {
  let path = join(dir, `${prefix}${suffix}`);
  if (!existsSync(path)) return path;
  for (let i = 1; i < 1000; i++) {
    path = join(dir, `${prefix}-${i}${suffix}`);
    if (!existsSync(path)) return path;
  }
  throw new Error(`unable to find unique filename for ${prefix}${suffix}`);
}

export function savePlayState(
  game: string,
  id: string,
  state: CollectedState,
): SavedStateResult {
  assertSegment("game", game);
  assertSegment("id", id);

  const dir = join(playDir(game, id), "states");
  mkdirSync(dir, { recursive: true });

  const prefix = `${formatTimestamp(state.capturedAt)}_${makeSlug(state.rom)}`;

  const stateFile = uniqueFile(dir, prefix, ".state.json");
  writeFileSync(
    stateFile,
    `${JSON.stringify(toJSONSafe(state.saveState), null, 2)}\n`,
  );

  const ff1 = readFF1StateFromSaveState(state.saveState);
  const extractedFile = uniqueFile(dir, prefix, ".ff1.json");
  writeFileSync(extractedFile, `${JSON.stringify(toJSONSafe(ff1), null, 2)}\n`);

  const repoRelative = (abs: string): string => {
    const rel = abs.slice(REPO_ROOT.length);
    return rel.startsWith("/") ? rel.slice(1) : rel;
  };

  return {
    statePath: repoRelative(stateFile),
    extractedPath: repoRelative(extractedFile),
    ff1,
  };
}

export function listPlayStates(game: string, id: string): PlayStateEntry[] {
  assertSegment("game", game);
  assertSegment("id", id);
  const dir = join(playDir(game, id), "states");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".state.json"))
    .map((d) => {
      const name = d.name.replace(/\.state\.json$/, "");
      const extractedName = `${name}.ff1.json`;
      const hasExtracted = existsSync(join(dir, extractedName));
      const statePath = `plays/${game}/${id}/states/${d.name}`;
      const extractedPath = hasExtracted
        ? `plays/${game}/${id}/states/${extractedName}`
        : undefined;
      return {
        statePath,
        extractedPath,
        stateUrl: `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/states/${encodeURIComponent(d.name)}`,
        extractedUrl: hasExtracted
          ? `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/states/${encodeURIComponent(extractedName)}`
          : undefined,
        name,
      };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function readPlayState(game: string, id: string, filename: string): unknown {
  assertSegment("game", game);
  assertSegment("id", id);
  if (!/[\w.-]+\.(state|ff1)\.json$/.test(filename)) {
    throw new PathEscapeError(filename);
  }
  const file = join(playDir(game, id), "states", filename);
  if (!existsSync(file)) throw new FileNotFoundError(file);
  return JSON.parse(readFileSync(file, "utf8"));
}
