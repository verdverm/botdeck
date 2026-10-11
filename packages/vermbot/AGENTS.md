# AGENTS

vermbot is the Node half of botdeck: the agent loop that plays turn-based NES
games, the HTTP front door, and the repo-rooted file API. The browser package
(packages/botdeck) owns the emulator, the game plugin, and the macro compiler;
this package owns the model call, the prompts, the tool-use loop, and all disk
IO. botdeck reaches the file API through the /api proxy of its Vite dev server
(target http://localhost:8787, the default VERMBOT_PORT).

References: the root DESIGN.md sections 4 (file API) and 10 (agent loop) are
the repo-wide source of truth; games/<game>/AGENTS.md covers per-game prompts,
commands, and config. This doc describes the vermbot package itself.

## Module map

- src/server.ts - HTTP server on Node built-in http. CORS preflight, GET
  /health and GET /api/health, POST /api/turn, and the full route table under
  /api/games and /api/plays. Request bodies are capped at 8 MiB. Errors map
  from the files.ts sentinel classes to status codes: FileNotFoundError to
  404, PathEscapeError to 400, AlreadyExistsError to 409, ValidationError to
  400, anything else to 500. /api/turn itself returns 200 with
  command name "" plus an error string instead of an error status, so
  botdeck can record failed turns like any other step.
- src/agent.ts - The turn loop. decide(request) is what /api/turn calls.
  Steps: renderPrompt (prompts.ts), resolveAgentConfig (files.ts),
  makeAgentTools (tools.ts), then runDecideLoop, which calls the model up to
  maxToolRounds rounds. Transport is the vendored opencode llm client
  (@opencode-ai/llm) in OpenAI-compatible mode, pointed at config.json
  baseUrl, with the per-play user-path header and a per-request model id and
  timeout from the resolved agent config.
- src/decision.ts - Parser for pseudo-tool-call markup in raw model text for
  inference stacks that emit text instead of native tool-call events. Both
  observed vLLM shapes are handled: a bare JSON object after a tool-call
  opening tag, and the function/parameter markup form. Command payloads are
  normalized so the call input holds only the command arguments plus an
  optional reason. Also provides buildCorrectionMessage, the retry prompt
  sent when a round produced no command call.
- src/validate.ts - Semantic validation of the chosen command against the
  structured game state sent in the TurnRequest. Checks: the command is
  actually advertised in this mode's options, the actor matches the battle
  actor, spells are known to the actor and have charges, enemy targets exist
  by slot (with counter and name fallbacks), items are in inventory, item
  targets resolve, and press_button frames sit in 1 to 600 with default 4.
  On failure it returns an error plus a correction message listing valid
  options, which the loop sends back for the next round.
- src/tools.ts - Tool registry for the agent. Durable play-resource tools:
  journal_list, journal_read, journal_write, memory_write (slug or id or
  name accepted), goals_write, and the agent snippet store tools
  snippet_list, snippet_read, snippet_write, snippet_delete, all persisted
  through files.ts and bounded by the config limits. Command tools are
  generated per turn from the TurnRequest CommandSpec list; the args JSON
  hint string is parsed and converted to a JSON Schema so command choices
  arrive as structured tool calls, plus an optional reason string in every
  schema.
- src/prompts.ts - Prompt assembly and the browser prompt-context bundle.
  Combination rules: the agent-authored snippet block, the Recent actions
  section, and one-shot user messages are always appended to the user prompt
  and never configurable into the system side. Also exports
  buildPromptTemplateBundle, which hands botdeck's markdown tab the resolved
  config, limits, disk-derived context values, and each template's effective
  plus raw per-layer content.
- src/protocol.ts - Wire protocol mirrored in packages/botdeck/src/types.ts:
  NES_BUTTONS (jsnes-compatible button indices), ButtonStep, GameCommand,
  CommandSpec, TurnRequest, TurnResponse, TurnTranscript and its rounds,
  ToolSpec, ToolCall, ToolResult, StepRecord, and the isValidTurnRequest
  guard. botdeck is a browser app, so the mirror stays hand-maintained.
- src/files.ts - All repo file IO and path safety, plus config resolution
  (readGameConfig, writeGameConfig, readPlayConfig, writePlayConfig,
  resolveAgentConfig, resolvePromptConfig), play CRUD / createPlay seeding
  and nextPlayId auto-numbering, save states with sidecars, step records,
  memory, journal, goals, and the user and agent snippet stores.
- src/test-root.ts - Vitest fixture useTempRepoRoot that points setRepoRoot
  at a temp directory for each test and restores the real root afterward;
  shared by the unit test files.
- config.json - Transport config read once at module load. One field today:
  baseUrl for the OpenAI-compatible vLLM endpoint.

Dependencies: @opencode-ai/llm (linked vendored tree .extern/opencode, which
needs its deps installed once), effect 4 beta (request pipeline and Schema
decoding of agent config), @games/ff1-state (state extraction and diffing,
shared with botdeck), and zod.

## Turn lifecycle

1. botdeck POSTs a TurnRequest to /api/turn: gameId, optional playId as
   game/id, mode id, the structured state object, optional screenshot data
   URL, the turn's available CommandSpec options, optional actor during
   battle, and an optional one-shot userMessage.
2. parsePlayId resolves the play. An id without a slash falls back to
   VERMBOT_PLAY, which defaults to ff1/0000_dev.
3. resolveAgentConfig merges the agent block from games/<game>/config.json
   with the play's config.json field by field; tools whitelists merge as a
   union. Built-in defaults when a game has no config: model "small",
   maxToolRounds 25, maxTokens 1024, timeoutMs 120000, limits goals 1024,
   memory 2048, journal 32768, memoryCount 10, snippets 4096, snippetCount
   50, and recentHistoryLimit 10 (DEFAULT_RECENT_HISTORY_LIMIT).
4. renderPrompt builds the system and user prompts from the game's mode
   config; if the requested mode is unknown, both come back empty.
5. makeAgentTools builds durable tools filtered by the whitelist plus one
   command tool per advertised CommandSpec. Command tools bypass the
   whitelist since the agent must always be able to act.
6. runDecideLoop sends the tool definitions and messages to the model.
   Native tool-call events are preferred; otherwise decision.ts parses
   markup out of the text.
7. Each round: durable tool calls execute immediately, even in rounds whose
   command fails validation, and the slug/name-keyed writers make repeated
   calls idempotent across retries. If a command tool was called,
   validateCommand grounds it against the state; a failure sends the
   correction as a user message and retries. No command call sends a
   straightforward correction. Exhausting maxToolRounds without a valid
   command ends the turn with command name "" and an error string.
8. A valid command ends the turn. The TurnResponse returns the chosen
   GameCommand, a reason (tool arg or parser metadata), the rendered prompt,
   the raw model text, and a TurnTranscript with one round per LLM call
   (assistant text, tool calls and their results, and any parseError,
   validationError, or correction).
9. botdeck compiles the command into a ButtonStep macro through its game
   plugin, plays it, snapshots before and after states, and persists the
   StepRecord via POST /api/plays/:game/:id/steps.

## Prompt assembly

- The system and user split is config-owned. Each mode in prompt.modes
  declares ordered systemSnippets and userSnippets lists; the ff1 config
  ships overworld, interior, shop, and battle modes.
- Two shadowing layers resolve snippets: the play override at
  plays/<game>/<id>/snippets/user/<name>.md wins, otherwise the game default
  at games/<game>/prompts/<name>.md. A missing snippet contributes nothing.
- Snippets are templates with double-brace placeholders rendered over a
  context: commands (formatted CommandSpec list), stateJson and gameInfo
  (structured state plus its human-readable summary via
  formatFF1StateFromUnknown), memory, goals, agentSnippets, userMessage,
  recentHistory, gameId, playId, and the numeric limits so templates can
  state their own budget.
- Mode overrides merge by id when a play redefines a mode: non-empty snippet
  lists replace, empty lists inherit the game's ordering, and play-only
  modes append.
- Recent actions comes from readRecentStepHistory in files.ts: the most
  recent recentHistoryLimit steps, each summarized purely from state-derived
  truth. The step's before and after ff1 sidecars are diffed via
  diffPlayStates, and if the agent's claimed target slot diverges from the
  slot the game actually latched, the line flags TARGET DRIFT with both
  slots. Steps without persisted sidecars simply summarize with no diff.

## File API

The play directory shape (states, steps, memory, journal, goals,
snippets/user, snippets/agent, config.json) is the DESIGN.md section 4
contract, seeded by createPlay. POST /api/plays assigns the next zero-padded
four-digit id when omitted, scanning for existing four-digit numeric
directory prefixes.

Route groups (JSON bodies unless noted binary):

- Games: GET /api/games (directories with a game.nes or guide), GET/PUT
  /api/games/:game/config, GET /api/games/:game/rom (octet-stream) and
  /splash (png), GET/PUT/DELETE /api/games/:game/prompts/:name for the game
  prompt template layer.
- Plays: GET/POST /api/plays (list filters with game param), GET/PATCH/DELETE
  /api/plays/:game/:id (PATCH shallow-merges config fields), GET/PUT
  .../config.
- States: POST .../states saves a state, accepting either a base64-encoded
  collected-state payload or a raw save-state JSON object; the next
  six-digit id is used, and state, ff1 extraction, and metadata sidecars are
  written together. GET .../states lists with sort of newest, oldest,
  name (a-z), or name (z-a). GET .../states/:file reads a sidecar. PATCH
  updates name or bookmarked metadata. DELETE removes a state and its
  sidecars. GET .../diff?before and after diffs two ff1 sidecars.
- Memory, journal, goals: list/write/read/delete endpoints for memory and
  journal markdown entries (POST may pass slug or name, or label from which
  one is derived), plus GET/PUT .../goals (overwrites goals/goals.md).
  Writes enforce character limits and memory evicts oldest entries past
  memoryCount.
- Prompt surface: GET .../prompt-context returns buildPromptTemplateBundle.
  GET/PUT/DELETE .../prompts/:name edits the play template override layer.
  GET .../snippets/user and .../snippets/agent list; GET/PUT (user) or
  GET/POST/DELETE (agent) operate on individual entries. User snippets are
  replay JSON records (.snippet.json); agent snippets are the markdown store
  the agent tools read and write.
- Steps: GET/POST .../steps (assertStepRecord guards the StepRecord body;
  a missing stepId is auto-filled with the next zero-padded six-digit id,
  and a collision is a 409) and GET .../steps/:stepId.

## Path safety

repoPath is the single choke point: it resolves under the current repo root
(overridable by setRepoRoot in tests) and throws PathEscapeError on any
escape. gameDir and playDir assert their segments, and every filename route
(memory slug, journal name, snippet id, prompt name, state file,
stepId) regex-gates or segment-asserts against traversal, absolute paths,
slashes or backslashes, NUL, and in the template cases a leading dot.

## Tests and commands

Package scripts run with pnpm --filter vermbot COMMAND, from the repo root:

- dev (also root alias dev:vermbot) - tsx watch src/server.ts.
- start - tsx src/server.ts without watch.
- test - vitest unit runs; test:watch, test:coverage, and test:integration
  (agent.integration.test.ts with its own config) exist too.
- bench - vitest bench, covering protocol.bench.ts.
- typecheck, lint, lint:fix.

server.ts presently has no dedicated test file; unit suites cover files,
prompts, tools, agent (loop mechanics), decision, validate, and protocol.
Root-level pnpm dev runs both packages in parallel, and workspace-wide
pnpm test, pnpm typecheck, pnpm bench work as in README.

## Environment and config

- VERMBOT_PORT, default 8787, is the listen port.
- VERMBOT_PLAY, default ff1/0000_dev, is the game/id fallback for TurnRequest
  playIds that are missing or unqualified.
- packages/vermbot/config.json baseUrl points at the homelab vLLM provider;
  there are no hosted provider keys in this package.

## Rules

- Every disk write and read goes through files.ts helpers, and every path is
  built from repoPath, gameDir, playDir, or their assertSegment-built
  helpers. No direct fs or path joins with URL-derived strings elsewhere.
- /api/turn never touches disk. Persistence is always an explicit
  play-resource write (steps, states, memory, journal, goals, snippets) or
  one of the agent's durable tools inside a turn.
- The agent must end each turn by choosing exactly one advertised command
  tool (or the press_button escape hatch). Raw button sequences as a command
  shape are botdeck's job; vermbot only validates the choice and never
  compiles macros.
- Keep protocol.ts and packages/botdeck/src/types.ts in lockstep; every turn
  or step field crosses the boundary as JSON, and both sides hand-write the
  mirror.
- Keep src/ game-agnostic: per-game behavior lives in games/<game> (prompt
  snippets, agent and prompt config, guide) plus workspace packages such as
  @games/ff1-state. The turn route, prompt assembly, and validate read
  whatever structured state botdeck sends.
