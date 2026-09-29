/**
 * HTTP front door for vermbot (DESIGN.md 4, 10).
 *
 * Routes (all JSON unless noted):
 *   POST   /api/turn                        - agent decision (was /turn)
 *   GET    /api/games                       - list games
 *   GET    /api/games/:game/rom             - ROM binary
 *   GET    /api/plays?game=<game>           - list plays
 *   POST   /api/plays                       - create play
 *   GET    /api/plays/:game/:id             - play metadata
 *   PATCH  /api/plays/:game/:id             - update config fields
 *   DELETE /api/plays/:game/:id             - remove play
 *   GET    /api/plays/:game/:id/config      - read config.json
 *   PUT    /api/plays/:game/:id/config      - write config.json
 *   GET    /health
 *
 * Node built-in http keeps the sketch free of deps; swap once the shape settles.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { decide } from "./agent.ts";
import type { TurnRequest } from "./protocol.ts";
import {
  readRom,
  listGames,
  listPlays,
  readPlayConfig,
  writePlayConfig,
  createPlay,
  deletePlay,
  FileNotFoundError,
  PathEscapeError,
  AlreadyExistsError,
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
  const payload = JSON.stringify(body);
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

  if (req.method === "GET" && url.pathname === "/health") {
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
