/**
 * Builds the vermbot LlmAgent and turns a TurnRequest into a single chosen
 * GameCommand. The agent is given structured state, the list of available
 * command specs, and optionally the current frame as an image, and must output
 * one command (name + optional args) - never raw button pushes. botdeck's game
 * plugin owns the command -> button-sequence mapping.
 */

import {LlmAgent, InMemoryRunner} from "@google/adk";
import type {CommandSpec, GameCommand, TurnRequest, TurnResponse} from "./protocol.ts";
import {readPlayConfig, FileNotFoundError} from "./files.ts";

// Reuse adk's own genai Content type via its method signature so vermbot never
// references the (potentially different) top-level @google/genai copy.
type StepMessage = Parameters<InMemoryRunner["runEphemeral"]>[0]["newMessage"];

// Model comes from the play's config.json, not a hardcoded default.
// VERMBOT_PLAY selects which play (default ff1/0000_dev); the config's "model"
// field points at the homelab vLLM (open-weights).
const PLAY = process.env.VERMBOT_PLAY ?? "ff1/0000_dev";
const MODEL = readModelFromConfig(PLAY);

function readModelFromConfig(playId: string): string {
  try {
    const [game, id] = playId.split("/");
    if (!game || !id) return "<set-model-in-config>";
    const cfg = readPlayConfig(game, id);
    if (typeof cfg["model"] === "string") return cfg["model"];
  } catch (e) {
    if (!(e instanceof FileNotFoundError)) throw e;
  }
  return "<set-model-in-config>";
}

function buildInstruction(options: CommandSpec[]): string {
  const catalog = options
    .map((o) => `- ${o.name}${o.args ? ` ${o.args}` : ""}: ${o.description}`)
    .join("\n");
  return [
    "You are vermbot, an agent that plays turn-based NES games (e.g. Final",
    "Fantasy, Pokemon). You take one turn at a time and are NOT in a fast",
    "action loop, so prefer meaningful progress over frantic tapping.",
    "You are given the current game state, optionally the screen as an image,",
    "and this list of available commands:",
    catalog,
    "Choose exactly ONE command from that list. Reply with JSON only:",
    '{"command": {"name": "<one name>", "args": {...}}, "reason": "<short why>"}',
    "Omit args if the command takes none. Never invent a command outside the list.",
  ].join("\n");
}

const runner = new InMemoryRunner({
  agent: new LlmAgent({
    name: "vermbot",
    description: "Picks the next high-level command for a turn-based game.",
    model: MODEL,
  }),
});

function buildMessage(req: TurnRequest, instruction: string): StepMessage {
  const parts: StepMessage["parts"] = [
    { text: instruction },
    { text: `Game: ${req.gameId}` },
    { text: `State:\n${JSON.stringify(req.state, null, 2)}` },
  ];
  if (req.screenshot) {
    const match = /^data:(image\/\w+);base64,(.+)$/.exec(req.screenshot);
    if (match) {
      parts.push({
        inlineData: { mimeType: match[1] ?? "image/png", data: match[2] ?? "" },
      });
    }
  }
  return { role: "user", parts };
}

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
  try {
    const obj = JSON.parse(raw) as {
      command?: unknown;
      reason?: unknown;
    };
    return {
      command: coerceCommand(obj.command, options),
      reason: typeof obj.reason === "string" ? obj.reason : undefined,
    };
  } catch {
    const found = options.find((o) => raw.toUpperCase().includes(o.name.toUpperCase()));
    return {
      command: found ? { name: found.name } : { name: "wait" },
      reason: raw.slice(0, 120),
    };
  }
}

export async function decide(req: TurnRequest): Promise<TurnResponse> {
  const instruction = buildInstruction(req.options);
  let text = "";
  for await (const event of runner.runEphemeral({
    userId: "vermbot",
    newMessage: buildMessage(req, instruction),
  })) {
    const content = event.content;
    if (!content?.parts) continue;
    const joined = content.parts
      .map((p) => p.text)
      .filter((t): t is string => typeof t === "string")
      .join("");
    if (joined) text = joined;
  }
  if (!text) {
    return { command: { name: "wait" }, reason: "no model response" };
  }
  return parseDecision(text, req.options);
}
