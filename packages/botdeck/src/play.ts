/**
 * Play-id resolution (?play=) + file-API URL builders (DESIGN.md 4, boot flow).
 *
 * All repo file access at runtime goes through the vermbot file API (/api,
 * proxied by Vite to :8787). No /@fs, no /@games, no client-side absolute paths,
 * no Vite resolve.alias used for serving files (§9).
 */

export interface PlayConfig {
  id?: string;
  game?: string;
  label?: string;
  [key: string]: unknown;
}

export const DEFAULT_PLAY = "ff1/0000_dev";

/** Read the active play id from the ?play= query param (dev-time selector). */
export function readPlayId(): string {
  if (typeof window === "undefined") return DEFAULT_PLAY;
  const fromQuery = new URLSearchParams(window.location.search).get("play");
  return fromQuery && fromQuery.length > 0 ? fromQuery : DEFAULT_PLAY;
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

/** The game is the first segment of the play id, e.g. "ff1" from "ff1/0000_dev". */
export function gameFromPlayId(playId: string): string {
  return parsePlayId(playId).game;
}

// --- file-API URL builders (§4) -------------------------------------------

function playBase(playId: string): string {
  const { game, id } = parsePlayId(playId);
  return `/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}`;
}

export function playConfigUrl(playId: string): string {
  return `${playBase(playId)}/config`;
}

/** ROM is game-scoped, not play-scoped: derived from the play's first segment. */
export function romUrl(playId: string): string {
  const { game } = parsePlayId(playId);
  return `/api/games/${encodeURIComponent(game)}/rom`;
}

export function gamesUrl(): string {
  return "/api/games";
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

// --- boot flow (§4) --------------------------------------------------------

export async function loadPlayConfig(playId: string): Promise<PlayConfig> {
  const res = await fetch(playConfigUrl(playId));
  if (!res.ok) {
    throw new Error(`config for play "${playId}" (${res.status})`);
  }
  return (await res.json()) as PlayConfig;
}

/** Fetch the ROM bytes derived from the play's game (via the file API). */
export async function loadRomBytes(playId: string): Promise<ArrayBuffer> {
  const res = await fetch(romUrl(playId));
  if (!res.ok) {
    throw new Error(`ROM for "${gameFromPlayId(playId)}" (${res.status})`);
  }
  return await res.arrayBuffer();
}
