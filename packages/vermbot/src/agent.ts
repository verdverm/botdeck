/**
 * Builds the vermbot model client and turns a TurnRequest into a single chosen
 * GameCommand. The agent is given structured state, the list of available
 * command specs, and optionally the current frame as an image, and must end its
 * turn by calling exactly one command tool. botdeck's game plugin owns the
 * command -> button-sequence mapping.
 *
 * Transport is the linked @opencode-ai/llm OpenAICompatible provider talking to
 * the homelab vLLM (open-weights). The base URL is configured once at module
 * load from project-level config (packages/vermbot/config.json); the model is
 * selected per request from the resolved agent config, which merges the game's
 * config.json and the play's config.json. The prompt is assembled from
 * games/<game>/prompts/ and plays/<game>/<id>/snippets/user/ overrides via prompts.ts.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Duration, Effect, Layer } from "effect";
import { LLM, LLMClient, Auth, Message, ToolDefinition, ToolCallPart, type LLMResponse } from "@opencode-ai/llm";
import { RequestExecutor } from "@opencode-ai/llm/route";
import * as OpenAICompatible from "@opencode-ai/llm/providers/openai-compatible";
import type { TurnRequest, TurnResponse, TurnTranscript, ToolCall } from "./protocol.ts";
import { resolveAgentConfig } from "./files.ts";
import { renderPrompt } from "./prompts.ts";
import { makeAgentTools, toolDefinitionsForRequest, executeTool, executeDurableCalls } from "./tools.ts";
import { parseToolCallsFromText, parsedCallsToToolCalls, buildCorrectionMessage } from "./decision.ts";
import { validateCommand } from "./validate.ts";

// Project-level transport config (base URL), read once at startup.
const PROJECT_CONFIG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../config.json", import.meta.url)), "utf8"),
) as { baseUrl: string };

const vllm = OpenAICompatible.configure({
  baseURL: PROJECT_CONFIG.baseUrl,
  provider: "homelab-vllm",
  auth: Auth.passthrough,
});

const requestExecutorLayer = RequestExecutor.fetchLayer;
const llmClientLayer = LLMClient.layer.pipe(Layer.provide(requestExecutorLayer));

const [DEFAULT_GAME, DEFAULT_ID] = (process.env.VERMBOT_PLAY ?? "ff1/0000_dev").split("/");
if (!DEFAULT_GAME || !DEFAULT_ID) {
  throw new Error(`VERMBOT_PLAY must be game/id, got: ${process.env.VERMBOT_PLAY ?? "ff1/0000_dev"}`);
}

function parsePlayId(rawPlayId: string | undefined): { game: string; id: string } {
  if (rawPlayId && rawPlayId.includes("/")) {
    const [game, id] = rawPlayId.split("/");
    if (game && id) return { game, id };
  }
  return { game: DEFAULT_GAME, id: rawPlayId ?? DEFAULT_ID };
}

interface ParsedCall {
  id: string;
  name: string;
  input?: Record<string, unknown>;
  reason?: string;
}

function toolCallsFromResponse(response: LLMResponse): ParsedCall[] {
  const native = response.toolCalls.filter((event) => event.type === "tool-call");
  if (native.length > 0) {
    return native.map((event) => ({
      id: event.id,
      name: event.name,
      input: typeof event.input === "object" && event.input !== null && !Array.isArray(event.input)
        ? (event.input as Record<string, unknown>)
        : undefined,
    }));
  }
  return parseToolCallsFromText(response.text);
}

function buildToolRequest(
  model: ReturnType<typeof vllm.model>,
  system: string,
  messages: ReturnType<typeof Message.user>[],
  toolDefinitions: ReturnType<typeof ToolDefinition.make>[],
  config: { maxTokens: number },
  userPath: string,
) {
  return LLM.request({
    model,
    system,
    messages,
    tools: toolDefinitions,
    generation: { maxTokens: config.maxTokens },
    http: { headers: { "X-GoModel-User-Path": userPath } },
  });
}

function callsToToolCalls(calls: ParsedCall[]): ToolCall[] {
  return parsedCallsToToolCalls(calls);
}

export async function decide(req: TurnRequest): Promise<TurnResponse> {
  const { system, user } = renderPrompt(req);
  const prompt = { system, user };
  const { game, id } = parsePlayId(req.playId);
  const config = resolveAgentConfig(game, id);
  const tools = makeAgentTools({ game, id, config }, req.options);
  const commandToolNames = new Set(tools.filter((t) => t.isCommand).map((t) => t.name));
  const toolDefinitions = toolDefinitionsForRequest(tools).map((t) =>
    ToolDefinition.make({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }),
  );

  const model = vllm.model(config.model);

  const userPath = `/proj/vermbot-plays-games/${game}/${id}`;

  const transcript: TurnTranscript = { system, user, rounds: [] };
  let messages = [Message.user(user)];
  let request = buildToolRequest(model, system, messages, toolDefinitions, config, userPath);

  for (let round = 0; round < config.maxToolRounds; round++) {
    const program = Effect.gen(function* () {
      const response = yield* LLM.generate(request);
      return response;
    }).pipe(Effect.provide(Layer.mergeAll(requestExecutorLayer, llmClientLayer)));

    const response = await Effect.runPromise(
      Effect.timeout(program, Duration.millis(config.timeoutMs)),
    );
    const calls = toolCallsFromResponse(response);

    if (calls.length === 0) {
      const correction = buildCorrectionMessage(req.options);
      const canRetry = round < config.maxToolRounds - 1;
      transcript.rounds.push({
        assistantText: response.text,
        parseError: "no command tool call found",
        correction: canRetry ? correction : undefined,
      });
      if (!canRetry) {
        return {
          command: { name: "" },
          error: "max tool rounds reached without a final command",
          prompt,
          raw: response.text,
          transcript,
        };
      }
      messages = [...messages, Message.user(correction)];
      request = buildToolRequest(model, system, messages, toolDefinitions, config, userPath);
      continue;
    }

    const toolCalls = callsToToolCalls(calls);

    // If the model called a command tool, that ends the turn - but only after
    // the command passes semantic validation against the actual game state.
    // The first command call wins; any accompanying durable calls are still
    // executed so their side effects land.
    const commandCall = calls.find((call) => commandToolNames.has(call.name));
    if (commandCall) {
      const { args, reason } = extractCommandDecision(commandCall);
      const attemptedCommand = { name: commandCall.name, args };
      const validation = validateCommand(attemptedCommand, req);
      if (validation) {
        const canRetry = round < config.maxToolRounds - 1;
        transcript.rounds.push({
          assistantText: response.text,
          toolCalls,
          validationError: validation.error,
          correction: canRetry ? validation.correction : undefined,
        });
        if (!canRetry) {
          return {
            command: { name: "" },
            error: validation.error,
            prompt,
            raw: response.text,
            transcript,
          };
        }
        messages = [...messages, Message.user(validation.correction)];
        request = buildToolRequest(model, system, messages, toolDefinitions, config, userPath);
        continue;
      }

      const durableResults = executeDurableCalls(calls, tools, { game, id, config }, commandToolNames);
      transcript.rounds.push({
        assistantText: response.text,
        toolCalls,
        toolResults: durableResults,
      });
      return {
        command: attemptedCommand,
        reason: reason ?? "selected via command tool",
        prompt,
        raw: response.text,
        transcript,
      };
    }

    const assistantContent = calls.map((call) =>
      ToolCallPart.make({
        id: call.id,
        name: call.name,
        input: call.input,
      }),
    );

    const toolResults = calls.map((call) => executeTool(tools, { game, id, config }, call));

    transcript.rounds.push({
      assistantText: response.text,
      toolCalls,
      toolResults,
    });

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

    request = buildToolRequest(model, system, messages, toolDefinitions, config, userPath);
  }

  return {
    command: { name: "" },
    error: "max tool rounds reached without a final command",
    prompt,
    transcript,
  };
}

function extractCommandDecision(commandCall: ParsedCall): {
  args: Record<string, unknown> | undefined;
  reason: string | undefined;
} {
  let reason = commandCall.reason;
  let args = commandCall.input;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    if (typeof args.reason === "string") {
      reason = args.reason;
    }
    args = omitKeys(args, ["reason"]);
    if (args && "command" in args && typeof args.command === "object" && args.command !== null) {
      const cmd = args.command as Record<string, unknown>;
      if (typeof cmd.reason === "string") reason = cmd.reason;
      if ("args" in cmd && typeof cmd.args === "object" && cmd.args !== null && !Array.isArray(cmd.args)) {
        args = cmd.args as Record<string, unknown>;
      } else {
        args = omitKeys(cmd, ["name", "reason"]);
      }
    }
  }
  return { args: args && Object.keys(args).length > 0 ? args : undefined, reason };
}

function omitKeys(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.includes(k)) result[k] = v;
  }
  return result;
}
