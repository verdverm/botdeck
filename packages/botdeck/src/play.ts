/**
 * Play-id resolution (?play=) + file-API URL builders (DESIGN.md 4, boot flow).
 *
 * All repo file access at runtime goes through the vermbot file API (/api,
 * proxied by Vite to :8787). No /@fs, no /@games, no client-side absolute paths,
 * no Vite resolve.alias used for serving files (§9).
 */

// --- game / ROM ------------------------------------------------------------
// The frontend ALWAYS loads a ROM through the game ROM endpoint: the ROM is
// game-scoped, not play-scoped.

export const DEFAULT_GAME = "ff1";

/** Read the active game id from the ?game= query param (dev-time selector). */
export function readGameId(): string {
  if (typeof window === "undefined") return DEFAULT_GAME;
  const fromQuery = new URLSearchParams(window.location.search).get("game");
  return fromQuery && fromQuery.length > 0 ? fromQuery : DEFAULT_GAME;
}

export function gamesUrl(): string {
  return "/api/games";
}

/** A game entry returned by GET /api/games. */
export interface GameSummary {
  game: string;
  hasRom: boolean;
  hasGuide: boolean;
}

/** Streamed ROM binary, keyed by game. */
export function romUrl(game: string): string {
  return `/api/games/${encodeURIComponent(game)}/rom`;
}

/** Fetch the ROM bytes for a game (via the file API). */
export async function loadRomBytes(game: string): Promise<ArrayBuffer> {
  const res = await fetch(romUrl(game));
  if (!res.ok) {
    throw new Error(`ROM for "${game}" (${res.status})`);
  }
  return await res.arrayBuffer();
}

// --- plays / config (separate concern, not the ROM boot) -------------------

export interface PlayConfig {
  id?: string;
  game?: string;
  label?: string;
  [key: string]: unknown;
}

export interface PlayRef {
  game: string;
  id: string;
}

/** Split a play id like "ff1/0000_dev" into its two path segments. */
export function parsePlayId(playId: string): PlayRef {
  const [game, id] = playId.split("/");
  if (!game || !id) {
    throw new Error(`invalid play id "${playId}" (expected "game/id")`);
  }
  return { game, id };
}

function playBase(playId: string): string {
  const { game, id } = parsePlayId(playId);
  return `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}`;
}

export function playConfigUrl(playId: string): string {
  return `${playBase(playId)}/config`;
}

export function playsUrl(game?: string): string {
  return game
    ? `/api/plays?game=${encodeURIComponent(game)}`
    : "/api/plays";
}

export function statesUrl(playId: string): string {
  return `${playBase(playId)}/states`;
}

export function stepsUrl(playId: string): string {
  return `${playBase(playId)}/steps`;
}

export async function loadPlayConfig(playId: string): Promise<PlayConfig> {
  const res = await fetch(playConfigUrl(playId));
  if (!res.ok) {
    throw new Error(`config for play "${playId}" (${res.status})`);
  }
  return (await res.json()) as PlayConfig;
}
