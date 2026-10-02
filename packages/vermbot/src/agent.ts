/**
 * Builds the vermbot model client and turns a TurnRequest into a single chosen
 * GameCommand. The agent is given structured state, the list of available
 * command specs, and optionally the current frame as an image, and must output
 * one command (name + optional args) - never raw button pushes. botdeck's game
 * plugin owns the command -> button-sequence mapping.
 *
 * Transport is the linked @opencode-ai/llm OpenAICompatible provider talking to
 * the homelab vLLM (open-weights). The base URL is configured once at module
 * load from project-level config (packages/vermbot/config.json); the model is
 * selected per request from the resolved agent config, which merges the game's
 * config.json and the play's config.json. The prompt is assembled from
 * games/<game>/prompts/ and plays/<game>/<id>/prompts/ snippets via prompts.ts.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { LLM, LLMClient, Auth, Message, ToolDefinition, ToolCallPart, type LLMResponse } from "@opencode-ai/llm";
import { RequestExecutor } from "@opencode-ai/llm/route";
import * as OpenAICompatible from "@opencode-ai/llm/providers/openai-compatible";
import type { TurnRequest, TurnResponse } from "./protocol.ts";
import { resolveAgentConfig } from "./files.ts";
import { renderPrompt } from "./prompts.ts";
import { makeAgentTools, toolDefinitionsForRequest, executeTool } from "./tools.ts";
import { parseDecision } from "./decision.ts";

// Project-level transport config (base URL), read once at startup.
const PROJECT_CONFIG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../config.json", import.meta.url)), "utf8"),
) as { baseUrl: string };

// VERMBOT_PLAY selects which play (default ff1/0000_dev); used only as a fallback
// when a turn request does not include a playId.
const PLAY = process.env.VERMBOT_PLAY ?? "ff1/0000_dev";
const [playGame, playId] = PLAY.split("/");
if (!playGame || !playId) {
  throw new Error(`VERMBOT_PLAY must be game/id, got: ${PLAY}`);
}

const vllm = OpenAICompatible.configure({
  baseURL: PROJECT_CONFIG.baseUrl,
  provider: "homelab-vllm",
  auth: Auth.passthrough,
  headers: {
    "X-GoModel-User-Path": `/proj/vermbot-plays-games/${playGame}/${playId}`,
  },
});

const requestExecutorLayer = RequestExecutor.fetchLayer;
const llmClientLayer = LLMClient.layer.pipe(Layer.provide(requestExecutorLayer));

function parsePlayId(rawPlayId: string | undefined): { game: string; id: string } {
  if (rawPlayId && rawPlayId.includes("/")) {
    const [game, id] = rawPlayId.split("/");
    if (game && id) return { game, id };
  }
  return { game: playGame, id: rawPlayId ?? playId };
}

function toolCallsFromResponse(response: LLMResponse): Array<{
  id: string;
  name: string;
  input: unknown;
}> {
  const native = response.toolCalls.filter((event) => event.type === "tool-call");
  if (native.length > 0) {
    return native.map((event) => ({ id: event.id, name: event.name, input: event.input }));
  }
  return parseToolCallsFromText(response.text);
}

function parseToolCallsFromText(text: string): Array<{ id: string; name: string; input: unknown }> {
  const calls: Array<{ id: string; name: string; input: unknown }> = [];
  const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[1] as string) as { name?: unknown; input?: unknown };
      if (typeof obj.name === "string") {
        calls.push({ id: `parsed_${calls.length}`, name: obj.name, input: obj.input });
      }
    } catch {
      // ignore malformed blocks
    }
  }
  return calls;
}

export async function decide(req: TurnRequest): Promise<TurnResponse> {
  const { system, user } = renderPrompt(req);
  const prompt = { system, user };
  const { game, id } = parsePlayId(req.playId);
  const config = resolveAgentConfig(game, id);
  const tools = makeAgentTools({ game, id, config });
  const toolDefinitions = toolDefinitionsForRequest(tools).map((t) =>
    ToolDefinition.make({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }),
  );

  const model = vllm.model(config.model);

  let messages = [Message.user(user)];
  let request = LLM.request({
    model,
    system,
    messages,
    tools: toolDefinitions,
    generation: { maxTokens: config.maxTokens },
  });

  for (let round = 0; round < config.maxToolRounds; round++) {
    const program = Effect.gen(function* () {
      const response = yield* LLM.generate(request);
      return response;
    }).pipe(Effect.provide(Layer.mergeAll(requestExecutorLayer, llmClientLayer)));

    const response = await Effect.runPromise(program);
    const calls = toolCallsFromResponse(response);

    if (calls.length === 0) {
      return parseDecision(response.text, req.options, prompt);
    }

    const assistantContent = calls.map((call) =>
      ToolCallPart.make({
        id: call.id,
        name: call.name,
        input: call.input,
      }),
    );

    const toolResults = calls.map((call) => executeTool(tools, { game, id, config }, call));

    messages = [
      ...messages,
      Message.assistant(assistantContent),
      ...toolResults.map((result) =>
        Message.tool({
          id: result.id,
          name: result.name,
          result: result.error ? { type: "error", value: result.error } : result.result,
          resultType: result.error ? "error" : undefined,
        }),
      ),
    ];

    request = LLM.request({
      model,
      system,
      messages,
      tools: toolDefinitions,
      generation: { maxTokens: config.maxTokens },
    });
  }

  return {
    command: { name: "wait" },
    reason: "max tool rounds reached without a final command",
    prompt,
  };
}
