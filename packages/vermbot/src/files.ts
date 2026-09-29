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
