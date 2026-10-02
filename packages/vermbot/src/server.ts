/**
 * HTTP front door for vermbot (DESIGN.md 4, 10).
 *
 * Routes (all JSON unless noted):
 *   POST   /api/turn                        - agent decision (was /turn)
 *   GET    /api/games                       - list games
 *   GET    /api/games/:game/rom             - ROM binary
 *   GET    /api/games/:game/splash          - splash PNG
 *   GET    /api/plays?game=<game>           - list plays
 *   POST   /api/plays                       - create play
 *   GET    /api/plays/:game/:id             - play metadata
 *   PATCH  /api/plays/:game/:id             - update config fields
 *   DELETE /api/plays/:game/:id             - remove play
 *   GET    /api/plays/:game/:id/config      - read config.json
 *   PUT    /api/plays/:game/:id/config      - write config.json
 *   POST   /api/plays/:game/:id/states      - save state + extract FF1 state
 *   GET    /api/plays/:game/:id/states       - list states (sort=newest|oldest|name (a-z)|name (z-a))
 *   GET    /api/plays/:game/:id/states/:file - read state / ff1 / metadata
 *   GET    /api/plays/:game/:id/diff?before=<file>&after=<file> - diff two FF1 state sidecars
 *   PATCH  /api/plays/:game/:id/states/:file - update metadata (name, bookmarked)
 *   DELETE /api/plays/:game/:id/states/:file - delete state + sidecars
 *   GET    /api/plays/:game/:id/memory      - list memory entries
 *   POST   /api/plays/:game/:id/memory      - write memory entry
 *   GET    /api/plays/:game/:id/memory/:slug - read memory entry
 *   DELETE /api/plays/:game/:id/memory/:slug - remove memory entry
 *   GET    /api/plays/:game/:id/journal     - list journal entries
 *   POST   /api/plays/:game/:id/journal     - write journal entry
 *   GET    /api/plays/:game/:id/journal/:name - read journal entry
 *   DELETE /api/plays/:game/:id/journal/:name - remove journal entry
 *   GET    /api/plays/:game/:id/goals       - read goals
 *   PUT    /api/plays/:game/:id/goals       - write goals
 *   GET    /api/plays/:game/:id/steps       - list steps
 *   POST   /api/plays/:game/:id/steps       - append step
 *   GET    /api/plays/:game/:id/steps/:stepId - read step
 *   GET    /api/health
 *
 * Node built-in http keeps the sketch free of deps; swap once the shape settles.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { decide } from "./agent.ts";
import type { TurnRequest } from "./protocol.ts";
import {
  readRom,
  readSplash,
  listGames,
  listPlays,
  readPlayConfig,
  writePlayConfig,
  createPlay,
  deletePlay,
  savePlayState,
  listPlayStates,
  readPlayState,
  deletePlayState,
  updatePlayStateMetadata,
  assertSaveStateBody,
  listPlayMemoryEntries,
  readPlayMemoryEntry,
  writePlayMemory,
  deletePlayMemory,
  listPlayJournalEntries,
  readPlayJournal,
  writePlayJournal,
  deletePlayJournal,
  readPlayGoals,
  writePlayGoals,
  listPlaySteps,
  readPlayStep,
  writePlayStep,
  assertStepRecord,
  diffPlayStates,
  listPlaySnippets,
  readPlaySnippet,
  writePlaySnippet,
  deletePlaySnippet,
  slugify,
  formatTimestamp,
  FileNotFoundError,
  PathEscapeError,
  AlreadyExistsError,
  ValidationError,
  type PlayStateSort,
} from "./files.ts";

const PORT = Number(process.env.VERMBOT_PORT ?? 8787);

// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, (_key, value) =>
    value instanceof Uint8Array ? Array.from(value) : value,
  );
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
  });
  res.end(payload);
}

function binary(res: ServerResponse, data: Uint8Array): void {
  res.writeHead(200, {
    "content-type": "application/octet-stream",
    "content-length": data.length,
    "access-control-allow-origin": "*",
  });
  res.end(Buffer.from(data));
}

function png(res: ServerResponse, data: Uint8Array): void {
  res.writeHead(200, {
    "content-type": "image/png",
    "content-length": data.length,
    "access-control-allow-origin": "*",
  });
  res.end(Buffer.from(data));
}

// ---------------------------------------------------------------------------

/* Route helpers: each returns true if it handled the request. */

async function handleTurn(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (req.method !== "POST") return false;
  const url = new URL(req.url ?? "/", `http://localhost`);
  if (url.pathname !== "/api/turn") return false;
  try {
    const body = await readBody(req);
    const request = JSON.parse(body) as TurnRequest;
    const decision = await decide(request);
    json(res, 200, decision);
  } catch (err) {
    json(res, 500, { command: { name: "wait" }, reason: String(err) });
  }
  return true;
}

function handleGames(
  _req: IncomingMessage,
  res: ServerResponse,
  segments: string[],
): boolean {
  // segments = ["api", "games", ...]
  if (segments[1] !== "games") return false;

  if (segments.length === 2) {
    json(res, 200, listGames());
    return true;
  }

  // /api/games/:game/rom
  if (segments.length === 4 && segments[3] === "rom") {
    const game = segments[2]!;
    try {
      binary(res, readRom(game));
    } catch (err) {
      if (err instanceof FileNotFoundError) json(res, 404, { error: String(err) });
      else if (err instanceof PathEscapeError) json(res, 400, { error: String(err) });
      else json(res, 500, { error: String(err) });
    }
    return true;
  }

  // /api/games/:game/splash
  if (segments.length === 4 && segments[3] === "splash") {
    const game = segments[2]!;
    try {
      png(res, readSplash(game));
    } catch (err) {
      if (err instanceof FileNotFoundError) json(res, 404, { error: String(err) });
      else if (err instanceof PathEscapeError) json(res, 400, { error: String(err) });
      else json(res, 500, { error: String(err) });
    }
    return true;
  }

  return false;
}

async function handlePlays(
  req: IncomingMessage,
  res: ServerResponse,
  segments: string[],
  url: URL,
): Promise<boolean> {
  // segments = ["api", "plays", ...]
  if (segments[1] !== "plays") return false;

  const sendError = (err: unknown): void => {
    if (err instanceof FileNotFoundError) json(res, 404, { error: String(err) });
    else if (err instanceof PathEscapeError) json(res, 400, { error: String(err) });
    else if (err instanceof AlreadyExistsError) json(res, 409, { error: String(err) });
    else json(res, 500, { error: String(err) });
  };

  // GET /api/plays?game=<game>
  if (segments.length === 2 && req.method === "GET") {
    const game = url.searchParams.get("game") ?? undefined;
    json(res, 200, listPlays(game));
    return true;
  }

  // POST /api/plays  { game, id, label? }
  if (segments.length === 2 && req.method === "POST") {
    try {
      const body = await readBody(req);
      const { game, id, label } = JSON.parse(body) as {
        game: string;
        id: string;
        label?: string;
      };
      const config = createPlay(game, id, label);
      json(res, 201, config);
    } catch (err) {
      sendError(err);
    }
    return true;
  }

  // /api/plays/:game/:id  (GET | PATCH | DELETE)
  if (segments.length === 4) {
    const game = segments[2]!;
    const id = segments[3]!;

    if (req.method === "GET") {
      try {
        json(res, 200, readPlayConfig(game, id));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "PATCH") {
      try {
        const body = await readBody(req);
        const patch = JSON.parse(body) as Record<string, unknown>;
        const existing = readPlayConfig(game, id);
        json(res, 200, writePlayConfig(game, id, { ...existing, ...patch }));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "DELETE") {
      try {
        deletePlay(game, id);
        json(res, 204, { ok: true });
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/config  (GET | PUT)
  if (segments.length === 5 && segments[4] === "config") {
    const game = segments[2]!;
    const id = segments[3]!;

    if (req.method === "GET") {
      try {
        json(res, 200, readPlayConfig(game, id));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "PUT") {
      try {
        const body = await readBody(req);
        const config = JSON.parse(body) as Record<string, unknown>;
        json(res, 200, writePlayConfig(game, id, config));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/diff?before=<file>&after=<file>
  if (segments.length === 5 && segments[4] === "diff") {
    const game = segments[2]!;
    const id = segments[3]!;

    if (req.method === "GET") {
      try {
        const before = url.searchParams.get("before") ?? "";
        const after = url.searchParams.get("after") ?? "";
        if (!before || !after) {
          json(res, 400, { error: "before and after query params are required" });
          return true;
        }
        const diff = diffPlayStates(game, id, before, after);
        json(res, 200, diff);
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/states (GET | POST)
  if (segments.length === 5 && segments[4] === "states") {
    const game = segments[2]!;
    const id = segments[3]!;

    if (req.method === "GET") {
      try {
        const raw = url.searchParams.get("sort");
        const sort: PlayStateSort =
          raw === "newest" || raw === "oldest" || raw === "name (a-z)" || raw === "name (z-a)"
            ? raw
            : "newest";
        json(res, 200, listPlayStates(game, id, sort));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const input = assertSaveStateBody(JSON.parse(body));
        const result = savePlayState(game, id, input);
        json(res, 201, result);
      } catch (err) {
        if (err instanceof ValidationError) json(res, 400, { error: String(err) });
        else sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/snippets (GET)
  if (segments.length === 5 && segments[4] === "snippets") {
    const game = segments[2]!;
    const id = segments[3]!;

    if (req.method === "GET") {
      try {
        json(res, 200, listPlaySnippets(game, id));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/snippets/:snippetId (GET | PUT | DELETE)
  if (segments.length === 6 && segments[4] === "snippets") {
    const game = segments[2]!;
    const id = segments[3]!;
    const snippetId = segments[5]!;

    if (req.method === "GET") {
      try {
        json(res, 200, readPlaySnippet(game, id, snippetId));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "PUT") {
      try {
        const body = await readBody(req);
        const snippet = writePlaySnippet(game, id, snippetId, JSON.parse(body));
        json(res, 200, snippet);
      } catch (err) {
        if (err instanceof ValidationError) json(res, 400, { error: String(err) });
        else sendError(err);
      }
      return true;
    }

    if (req.method === "DELETE") {
      try {
        deletePlaySnippet(game, id, snippetId);
        json(res, 204, undefined);
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/states/:filename (GET | PATCH | DELETE)
  if (segments.length === 6 && segments[4] === "states") {
    const game = segments[2]!;
    const id = segments[3]!;
    const filename = segments[5]!;

    if (req.method === "GET") {
      try {
        json(res, 200, readPlayState(game, id, filename));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "PATCH") {
      try {
        const body = await readBody(req);
        const patch = JSON.parse(body) as { name?: string; bookmarked?: boolean };
        const updated = updatePlayStateMetadata(game, id, filename, patch);
        json(res, 200, updated);
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "DELETE") {
      try {
        deletePlayState(game, id, filename);
        json(res, 204, { ok: true });
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/memory (GET | POST)
  if (segments.length === 5 && segments[4] === "memory") {
    const game = segments[2]!;
    const id = segments[3]!;

    if (req.method === "GET") {
      try {
        json(res, 200, listPlayMemoryEntries(game, id));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const { slug, content, label } = JSON.parse(body) as {
          slug?: string;
          content: string;
          label?: string;
        };
        if (typeof content !== "string") {
          throw new ValidationError("content must be a string");
        }
        const derivedSlug = slug || slugify(label || content);
        writePlayMemory(game, id, derivedSlug, { content });
        json(res, 201, { slug: derivedSlug, content });
      } catch (err) {
        if (err instanceof ValidationError) json(res, 400, { error: String(err) });
        else sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/memory/:slug (GET | DELETE)
  if (segments.length === 6 && segments[4] === "memory") {
    const game = segments[2]!;
    const id = segments[3]!;
    const slug = segments[5]!;

    if (req.method === "GET") {
      try {
        json(res, 200, { slug, content: readPlayMemoryEntry(game, id, slug) });
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "DELETE") {
      try {
        deletePlayMemory(game, id, slug);
        json(res, 204, { ok: true });
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/journal (GET | POST)
  if (segments.length === 5 && segments[4] === "journal") {
    const game = segments[2]!;
    const id = segments[3]!;

    if (req.method === "GET") {
      try {
        json(res, 200, listPlayJournalEntries(game, id));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const { name, content, label } = JSON.parse(body) as {
          name?: string;
          content: string;
          label?: string;
        };
        if (typeof content !== "string") {
          throw new ValidationError("content must be a string");
        }
        const derivedName =
          name || (label ? `${formatTimestamp(new Date().toISOString())}_${slugify(label)}` : formatTimestamp(new Date().toISOString()));
        writePlayJournal(game, id, derivedName, { content });
        json(res, 201, { name: derivedName, content });
      } catch (err) {
        if (err instanceof ValidationError) json(res, 400, { error: String(err) });
        else sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/journal/:name (GET | DELETE)
  if (segments.length === 6 && segments[4] === "journal") {
    const game = segments[2]!;
    const id = segments[3]!;
    const name = segments[5]!;

    if (req.method === "GET") {
      try {
        json(res, 200, { name, content: readPlayJournal(game, id, name) });
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "DELETE") {
      try {
        deletePlayJournal(game, id, name);
        json(res, 204, { ok: true });
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/goals (GET | PUT)
  if (segments.length === 5 && segments[4] === "goals") {
    const game = segments[2]!;
    const id = segments[3]!;

    if (req.method === "GET") {
      try {
        json(res, 200, { content: readPlayGoals(game, id) });
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "PUT") {
      try {
        const body = await readBody(req);
        const { content } = JSON.parse(body) as { content: string };
        if (typeof content !== "string") {
          throw new ValidationError("content must be a string");
        }
        writePlayGoals(game, id, { content });
        json(res, 200, { content });
      } catch (err) {
        if (err instanceof ValidationError) json(res, 400, { error: String(err) });
        else sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/steps (GET | POST)
  if (segments.length === 5 && segments[4] === "steps") {
    const game = segments[2]!;
    const id = segments[3]!;

    if (req.method === "GET") {
      try {
        json(res, 200, listPlaySteps(game, id));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const input = assertStepRecord(JSON.parse(body));
        const record = writePlayStep(game, id, input);
        json(res, 201, record);
      } catch (err) {
        if (err instanceof ValidationError) json(res, 400, { error: String(err) });
        else sendError(err);
      }
      return true;
    }

    return false;
  }

  // /api/plays/:game/:id/steps/:stepId (GET)
  if (segments.length === 6 && segments[4] === "steps") {
    const game = segments[2]!;
    const id = segments[3]!;
    const stepId = segments[5]!;

    if (req.method === "GET") {
      try {
        json(res, 200, readPlayStep(game, id, stepId));
      } catch (err) {
        sendError(err);
      }
      return true;
    }

    return false;
  }

  return false;
}

// ---------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://localhost`);

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
    json(res, 200, { ok: true });
    return;
  }

  const segments = url.pathname.split("/").filter(Boolean);

  try {
    if (await handleTurn(req, res)) return;
    if (handleGames(req, res, segments)) return;
    if (await handlePlays(req, res, segments, url)) return;
  } catch (err) {
    json(res, 500, { error: String(err) });
    return;
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`vermbot listening on http://localhost:${PORT}`);
});
