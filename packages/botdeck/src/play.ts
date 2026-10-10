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
export const DEFAULT_PLAY_ID = "0000_dev";

/** Read the active game id from the ?game= query param (dev-time selector). */
export function readGameId(): string {
  if (typeof window === "undefined") return DEFAULT_GAME;
  const fromQuery = new URLSearchParams(window.location.search).get("game");
  return fromQuery && fromQuery.length > 0 ? fromQuery : DEFAULT_GAME;
}

/** Read the active play id from the ?play= query param, defaulting to game/default. */
export function readPlayId(game: string): string {
  if (typeof window === "undefined") return `${game}/${DEFAULT_PLAY_ID}`;
  const fromQuery = new URLSearchParams(window.location.search).get("play");
  if (fromQuery && fromQuery.length > 0) return fromQuery;
  return `${game}/${DEFAULT_PLAY_ID}`;
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

/** Splash image URL, keyed by game. */
export function splashUrl(game: string): string {
  return `/api/games/${encodeURIComponent(game)}/splash`;
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

import type { CollectedState } from "@/emulator/collectState";
import type { PlayStateSort } from "@/types";
export type { PlayStateSort } from "@/types";

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

export function statesUrl(playId: string, sort?: PlayStateSort): string {
  const base = `${playBase(playId)}/states`;
  return sort ? `${base}?sort=${encodeURIComponent(sort)}` : base;
}

export function stateUrl(playId: string, filename: string): string {
  return `${playBase(playId)}/states/${encodeURIComponent(filename)}`;
}

export function snippetsUrl(playId: string): string {
  return `${playBase(playId)}/snippets/user`;
}

export function snippetUrl(playId: string, snippetId: string): string {
  return `${playBase(playId)}/snippets/user/${encodeURIComponent(snippetId)}`;
}

export function agentSnippetsUrl(playId: string): string {
  return `${playBase(playId)}/snippets/agent`;
}

export function agentSnippetUrl(playId: string, name: string): string {
  return `${playBase(playId)}/snippets/agent/${encodeURIComponent(name)}`;
}

export async function saveSnippet(
  playId: string,
  snippetId: string,
  snippet: import("@/types").PlaySnippet,
): Promise<import("@/types").PlaySnippet> {
  const res = await fetch(snippetUrl(playId, snippetId), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snippet),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`save snippet failed (${res.status}): ${body}`);
  }
  return (await res.json()) as import("@/types").PlaySnippet;
}

export async function deleteSnippet(playId: string, snippetId: string): Promise<void> {
  const res = await fetch(snippetUrl(playId, snippetId), { method: "DELETE" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`delete snippet failed (${res.status}): ${body}`);
  }
}

export async function saveAgentSnippet(
  playId: string,
  name: string,
  content: string,
): Promise<{ name: string; content: string }> {
  const res = await fetch(agentSnippetsUrl(playId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`save agent snippet failed (${res.status}): ${body}`);
  }
  return (await res.json()) as { name: string; content: string };
}

export async function deleteAgentSnippet(playId: string, name: string): Promise<void> {
  const res = await fetch(agentSnippetUrl(playId, name), { method: "DELETE" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`delete agent snippet failed (${res.status}): ${body}`);
  }
}

export async function updateStateMetadata(
  playId: string,
  filename: string,
  patch: { name?: string; bookmarked?: boolean },
): Promise<void> {
  const res = await fetch(stateUrl(playId, filename), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`update failed (${res.status})`);
  }
}

export async function deleteState(playId: string, filename: string): Promise<void> {
  const res = await fetch(stateUrl(playId, filename), {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`delete failed (${res.status})`);
  }
}

export function stepsUrl(playId: string): string {
  return `${playBase(playId)}/steps`;
}

export async function postState(
  playId: string,
  data: CollectedState,
  name?: string,
): Promise<{
  statePath?: string;
  extractedPath?: string;
  metadataPath?: string;
  ff1?: unknown;
}> {
  const res = await fetch(statesUrl(playId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data, name }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`save state failed (${res.status}): ${body}`);
  }
  return (await res.json()) as {
    statePath?: string;
    extractedPath?: string;
    metadataPath?: string;
    ff1?: unknown;
  };
}

export function diffUrl(playId: string, before: string, after: string): string {
  const base = `${playBase(playId)}/diff`;
  const params = new URLSearchParams();
  params.set("before", basename(before));
  params.set("after", basename(after));
  return `${base}?${params.toString()}`;
}

export async function fetchDiff(
  playId: string,
  before: string,
  after: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(diffUrl(playId, before, after));
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`diff failed (${res.status}): ${body}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

export async function loadPlayConfig(playId: string): Promise<PlayConfig> {
  const res = await fetch(playConfigUrl(playId));
  if (!res.ok) {
    throw new Error(`config for play "${playId}" (${res.status})`);
  }
  return (await res.json()) as PlayConfig;
}

/** A play entry returned by GET /api/plays. */
export interface PlaySummary {
  game: string;
  id: string;
}

/** List plays for a game. */
export async function listPlays(game: string): Promise<PlaySummary[]> {
  const res = await fetch(playsUrl(game));
  if (!res.ok) {
    throw new Error(`list plays for "${game}" (${res.status})`);
  }
  return (await res.json()) as PlaySummary[];
}

/**
 * Create a play. When `id` is omitted the server assigns the next
 * zero-padded numeric id (see vermbot `nextPlayId`). Returns the new config.
 */
export async function createPlay(
  game: string,
  opts?: { id?: string; label?: string },
): Promise<PlayConfig> {
  const res = await fetch(playsUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ game, ...(opts ?? {}) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`create play failed (${res.status}): ${body}`);
  }
  return (await res.json()) as PlayConfig;
}

/** Update a play's config label (rename). Other fields are left intact. */
export async function renamePlay(playId: string, label: string): Promise<PlayConfig> {
  const res = await fetch(playIdUrl(playId), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`rename play failed (${res.status}): ${body}`);
  }
  return (await res.json()) as PlayConfig;
}

/** Delete a play (removes its directory on the server). */
export async function deletePlay(playId: string): Promise<void> {
  const res = await fetch(playIdUrl(playId), { method: "DELETE" });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`delete play failed (${res.status}): ${body}`);
  }
}

/** Base URL for a single play's metadata endpoint (/api/plays/:game/:id). */
function playIdUrl(playId: string): string {
  return playBase(playId);
}
