/**
 * Builds the vermbot model client and turns a TurnRequest into a single chosen
 * GameCommand. The agent is given structured state, the list of available
 * command specs, and optionally the current frame as an image, and must output
 * one command (name + optional args) - never raw button pushes. botdeck's game
 * plugin owns the command -> button-sequence mapping.
 *
 * Transport is the linked @opencode-ai/llm OpenAICompatible provider talking to
 * the homelab vLLM (open-weights). The base URL is project-level
 * (packages/vermbot/config.json); the model comes from the play's config.json
 * "model" field; the prompt is assembled from games/<game>/prompts/ and
 * plays/<game>/<id>/prompts/ snippets via prompts.ts.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { LLM, LLMClient, Auth } from "@opencode-ai/llm";
import { RequestExecutor } from "@opencode-ai/llm/route";
import * as OpenAICompatible from "@opencode-ai/llm/providers/openai-compatible";
import type { CommandSpec, GameCommand, TurnRequest, TurnResponse } from "./protocol.ts";
import { readPlayConfig, FileNotFoundError } from "./files.ts";
import { renderPrompt } from "./prompts.ts";

// Project-level transport config (base URL), read once at startup.
const PROJECT_CONFIG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../config.json", import.meta.url)), "utf8"),
) as { baseUrl: string };

// VERMBOT_PLAY selects which play (default ff1/0000_dev); the play config's
// "model" field names the served model at the vLLM endpoint.
const PLAY = process.env.VERMBOT_PLAY ?? "ff1/0000_dev";
const [playGame, playId] = PLAY.split("/");
if (!playGame || !playId) {
  throw new Error(`VERMBOT_PLAY must be game/id, got: ${PLAY}`);
}

function readModelFromConfig(game: string, id: string): string {
  try {
    const cfg = readPlayConfig(game, id);
    if (typeof cfg["model"] === "string") return cfg["model"];
  } catch (e) {
    if (!(e instanceof FileNotFoundError)) throw e;
  }
  return "<set-model-in-config>";
}

const MODEL = readModelFromConfig(playGame, playId);

const vllm = OpenAICompatible.configure({
  baseURL: PROJECT_CONFIG.baseUrl,
  provider: "homelab-vllm",
  auth: Auth.passthrough,
  headers: {
    "X-GoModel-User-Path": `/proj/vermbot-plays-games/${playGame}/${playId}`,
  },
});
const model = vllm.model(MODEL);

const requestExecutorLayer = RequestExecutor.fetchLayer;
const llmClientLayer = LLMClient.layer.pipe(Layer.provide(requestExecutorLayer));

function coerceCommand(value: unknown, options: CommandSpec[]): GameCommand {
  const names = new Set(options.map((o) => o.name));
  if (value && typeof value === "object") {
    const obj = value as { name?: unknown; args?: unknown };
    const name = typeof obj.name === "string" ? obj.name : "";
    if (names.has(name)) {
      const args =
        obj.args && typeof obj.args === "object"
          ? (obj.args as Record<string, unknown>)
          : undefined;
      return { name, args };
    }
  }
  return options.length > 0 ? { name: options[0]!.name } : { name: "wait" };
}

function parseDecision(raw: string, options: CommandSpec[]): TurnResponse {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const obj = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
        command?: unknown;
        reason?: unknown;
      };
      return {
        command: coerceCommand(obj.command, options),
        reason: typeof obj.reason === "string" ? obj.reason : undefined,
      };
    } catch {
      // fall through to name-match below
    }
  }
  const found = options.find((o) => raw.toUpperCase().includes(o.name.toUpperCase()));
  return {
    command: found ? { name: found.name } : { name: "wait" },
    reason: raw.slice(0, 120),
  };
}

export async function decide(req: TurnRequest): Promise<TurnResponse> {
  const { system, user } = renderPrompt(req);

  const request = LLM.request({
    model,
    system,
    prompt: user,
    generation: { maxTokens: 512 },
  });

  const program = Effect.gen(function* () {
    const response = yield* LLM.generate(request);
    return response.text;
  }).pipe(Effect.provide(Layer.mergeAll(requestExecutorLayer, llmClientLayer)));

  const text = await Effect.runPromise(program);
  if (!text) {
    return { command: { name: "wait" }, reason: "no model response" };
  }
  return parseDecision(text, req.options);
}
