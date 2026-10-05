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
import {
  LLM,
  LLMClient,
  Auth,
  Message,
  ToolDefinition,
  ToolCallPart,
  type LLMResponse,
  type LLMRequest,
} from "@opencode-ai/llm";
import { RequestExecutor } from "@opencode-ai/llm/route";
import * as OpenAICompatible from "@opencode-ai/llm/providers/openai-compatible";
import type { TurnRequest, TurnResponse, TurnTranscript, TurnTranscriptRound, ToolResult } from "./protocol.ts";
import type { AgentConfig } from "./files.ts";
import { resolveAgentConfig } from "./files.ts";
import { renderPrompt } from "./prompts.ts";
import { makeAgentTools, toolDefinitionsForRequest, executeTool, executeDurableCalls, type AgentTool } from "./tools.ts";
import {
  parseToolCallsFromText,
  parsedCallsToToolCalls,
  buildCorrectionMessage,
  extractCommandArgs,
  type ParsedToolCall,
} from "./decision.ts";
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

export function toolCallsFromResponse(response: LLMResponse): ParsedToolCall[] {
  const native = response.toolCalls.filter((event) => event.type === "tool-call");
  if (native.length > 0) {
    return native.map((event) => ({
      id: event.id,
      name: event.name,
      input: typeof event.input === "object" && event.input !== null && !Array.isArray(event.input)
        ? (event.input as Record<string, unknown>)
        : undefined,
      reason: undefined,
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

function buildAssistantContent(text: string, calls: ParsedToolCall[]) {
  const parts: Array<ReturnType<typeof Message.text> | ReturnType<typeof ToolCallPart.make>> = [];
  if (text.trim().length > 0) parts.push(Message.text(text));
  for (const call of calls) {
    parts.push(ToolCallPart.make({ id: call.id, name: call.name, input: call.input }));
  }
  return parts;
}

function buildToolResultMessage(result: ToolResult) {
  return Message.tool({
    id: result.id,
    name: result.name,
    result: result.error ? { type: "error", value: result.error } : result.result,
    resultType: result.error ? "error" : undefined,
  });
}

export async function runDecideLoop(
  req: TurnRequest,
  deps: {
    generate: (request: LLMRequest) => Promise<LLMResponse>;
    config: AgentConfig;
    tools: AgentTool[];
    toolDefinitions: ReturnType<typeof ToolDefinition.make>[];
    system: string;
    user: string;
    userPath: string;
  },
): Promise<TurnResponse> {
  const { generate, config, tools, toolDefinitions, system, user, userPath } = deps;
  const prompt = { system, user };
  const { game, id } = parsePlayId(req.playId);
  const ctx = { game, id, config };
  const commandToolNames = new Set(tools.filter((t) => t.isCommand).map((t) => t.name));
  const model = vllm.model(config.model);

  const transcript: TurnTranscript = { system, user, rounds: [] };
  let messages = [Message.user(user)];
  let request = buildToolRequest(model, system, messages, toolDefinitions, config, userPath);

  for (let round = 0; round < config.maxToolRounds; round++) {
    const response = await generate(request);
    const calls = toolCallsFromResponse(response);

    const commandCall = calls.find((call) => commandToolNames.has(call.name));
    let validation = undefined;
    let attemptedCommand = undefined;
    let commandReason = undefined;
    if (commandCall) {
      const { args, reason } = extractCommandArgs(commandCall.input);
      commandReason = reason ?? commandCall.reason;
      attemptedCommand = { name: commandCall.name, args };
      validation = validateCommand(attemptedCommand, req);
    }

    // Durable calls are executed even on rounds where the command fails
    // validation, so a model's memory/journal notes still land. The play
    // writers are name/slug-keyed overwrites, so a repeated call across retry
    // rounds within one turn is idempotent rather than duplicating entries.
    const durableResults = executeDurableCalls(calls, tools, ctx, commandToolNames);

    const messageResults: ToolResult[] = calls.map((call) => {
      if (commandCall && call.id === commandCall.id) {
        if (validation) {
          return { id: call.id, name: call.name, result: null, error: validation.error };
        }
        return { id: call.id, name: call.name, result: { accepted: true, command: call.name } };
      }
      return executeTool(tools, ctx, call);
    });

    const assistantContent = buildAssistantContent(response.text, calls);
    messages = [...messages, Message.assistant(assistantContent), ...messageResults.map(buildToolResultMessage)];

    const roundEntry: TurnTranscriptRound = {
      assistantText: response.text,
      toolCalls: parsedCallsToToolCalls(calls),
      toolResults: durableResults,
    };

    if (!commandCall && calls.length === 0) {
      const correction = buildCorrectionMessage(req.options);
      const canRetry = round < config.maxToolRounds - 1;
      roundEntry.parseError = "no command tool call found";
      roundEntry.correction = canRetry ? correction : undefined;
      transcript.rounds.push(roundEntry);
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

    if (commandCall) {
      if (validation) {
        const canRetry = round < config.maxToolRounds - 1;
        roundEntry.validationError = validation.error;
        roundEntry.correction = canRetry ? validation.correction : undefined;
        transcript.rounds.push(roundEntry);
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

      transcript.rounds.push(roundEntry);
      transcript.rounds.push({
        assistantText: "Turn ended with valid command tool call.",
      });
      return {
        command: attemptedCommand!,
        reason: commandReason ?? "selected via command tool",
        prompt,
        raw: response.text,
        transcript,
      };
    }

    transcript.rounds.push(roundEntry);
    request = buildToolRequest(model, system, messages, toolDefinitions, config, userPath);
  }

  return {
    command: { name: "" },
    error: "max tool rounds reached without a final command",
    prompt,
    transcript,
  };
}

export async function decide(req: TurnRequest): Promise<TurnResponse> {
  const { system, user } = renderPrompt(req);
  const { game, id } = parsePlayId(req.playId);
  const config = resolveAgentConfig(game, id);
  const tools = makeAgentTools({ game, id, config }, req.options);
  const toolDefinitions = toolDefinitionsForRequest(tools).map((t) =>
    ToolDefinition.make({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }),
  );

  const userPath = `/proj/vermbot-plays-games/${game}/${id}`;

  return runDecideLoop(req, {
    generate: (request) =>
      Effect.runPromise(
        Effect.timeout(
          Effect.gen(function* () {
            return yield* LLM.generate(request);
          }).pipe(Effect.provide(Layer.mergeAll(requestExecutorLayer, llmClientLayer))),
          Duration.millis(config.timeoutMs),
        ),
      ),
    config,
    tools,
    toolDefinitions,
    system,
    user,
    userPath,
  });
}
