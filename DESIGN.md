# DESIGN

> Design document for `botdeck`, an experiment in agentic gaming: a
> model plays turn-based NES games (Final Fantasy, Pokemon) through an emulator,
> reasoning in high-level game commands rather than raw button pushes.
>
> This document is the source of truth for architecture, data layout, and
> conventions. It supersedes the sketch notes in `README.md` where the two
> differ.

---

## 1. Core idea

The system is built around **turn-based play**. The emulator always runs at
60fps; the agent provides no input while it "thinks" (like a human deliberating
over a menu), then issues one high-level `GameCommand`. A game-specific plugin
compiles that command into a sequence of button presses played out with
human-like timing, frame-locked to the emulator. The game then advances one
"turn" and the loop repeats.

Data flow per turn:

1. botdeck reads game state via a `GamePlugin` (browser, from the live emulator).
2. botdeck composes a `TurnRequest` (structured state + optional screenshot +
   available commands).
3. botdeck POSTs the request to vermbot's `/api/turn`.
4. vermbot assembles the prompt from game and optional per-play snippets, then
   asks the model.
5. The model may call memory/journal/goals tools across `maxToolRounds` before
   emitting a final command.
6. vermbot returns a `TurnResponse` with the chosen `GameCommand`, reason,
   rendered prompts, and raw output.
7. botdeck's `GamePlugin` compiles the command into a `ButtonStep[]` macro.
8. The emulator plays the sequence frame-by-frame.
9. botdeck snapshots before/after states and persists the completed
   `StepRecord` to the play directory via the file API.

---

## 2. Decisions made in this design pass

These were resolved during design review and are now fixed:

- **One emulator, in the browser.** `humdeck` and `botdeck` previously each
  owned a different NES core (`jsnes.Browser` vs a custom `Emulator` wrapper).
  They are merged into **botdeck** on the custom `Emulator` (frame-synced RAF
  loop + button-macro playback), because the agent's command→button timing must
  stay locked to emulated frames. `humdeck`'s features (gamepad, debounced
  keyboard, ROM picker, save/load, `collectState` + `StateViewer`) fold into
  botdeck; the `humdeck` package is removed.

- **All repo file IO lives on the node server (vermbot), not the browser.**
  The play directory must be both **read and written** (config, N save states,
  per-step agent artifacts, guides) with normal node `fs`, git-tracked,
  run-from-repo in dev. A browser `fetch()` is read-only and cannot write into
  the repo, so file access must be server-owned. botdeck talks to it over the
  existing `/api` proxy. The agent (same process) gets in-process `fs` to the
  same directory for free.

  Consequence to respect: the emulator is in the browser but the durable data
  model is on the server. State that must persist (a collected snapshot, a save
  state, a step's inputs/outputs) crosses the boundary via `POST` to the file
  API. The live emulator frame/state is browser-local; only what is explicitly
  persisted is written to disk.

- **The ROM is per-game, not per-play.** Many plays share one ROM. The API and
  directory layout reflect this (see §4).

- **Import paths use a module alias (`@/` -> `src/`), never brittle
  `../../` chains.** Moving a file must not break its imports.

- **Prompts are snippets, not monolithic files.** Each game ships a
  `prompts/` directory of markdown templates. A play may override individual
  snippets by shadowing them in `plays/<game>/<id>/prompts/`. The snippet list
  and order come from `prompt.snippets` in the resolved config (play overrides
  game). Snippet names are safe file basenames only.

---

## 3. Repository layout (git-tracked)

```
botdeck/
  games/<game>/          # one entry per ROM/game
    game.nes             # the ROM (gitignored - binary, see .gitignore)
    splash.png           # optional dashboard splash image
    config.json          # default agent + prompt config for the game
    guide/               # walkthrough/reference data for the game
    prompts/             # markdown prompt snippets (system, commands, state, ...)
    state/               # optional workspace package that reads live game state
  plays/<game>/<id>/     # many plays share one game/ROM
    config.json          # run settings (label, options; NO rom path - derived)
    states/              # N save states + extracted snapshots
    steps/               # per-turn agent artifacts (see §5)
    memory/              # short-term memory entries the agent may write
    journal/             # long-form learnings the agent may write
    goals/               # current goals
    prompts/             # optional per-play prompt overrides
  packages/
    botdeck/             # browser: emulator + dashboard + agent loop (the UI)
    vermbot/             # node: agent + HTTP front door + file API
  .extern/               # vendored jsnes + opencode llm (linked deps)
```

Git policy:

- The repo **is** the working directory in dev; run everything from it.
- `games/` and `plays/` are fully tracked (guides, configs, code, states,
  steps) so history is preserved in git.
- `.nes` ROMs are **gitignored** (large binary, legally encumbered); only the
  path is tracked by convention (`games/<game>/game.nes`), never the bytes.
- `node_modules/`, `dist/`, build output, `.env`, logs are ignored.

---

## 4. The file API (vermbot)

vermbot (`:8787`, proxied as `/api` by botdeck's Vite dev server) exposes REST
endpoints backed by node `fs` rooted at the repo. All bodies are JSON unless
noted binary. The `:game` and `:id` path params split the play id
`ff1/0000_dev` into its two segments (no slash inside a single param).

Path safety: every handler must resolve the requested path and reject anything
that escapes the repo root (no `..`, no absolute path injection). This is the
one place "made-up path components" are forbidden - the URL always maps onto a
real repo folder.

### Games

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`  | `/api/games` | List games (those with a `game.nes` and/or `guide/`). |
| `GET`  | `/api/games/:game/rom` | Stream the ROM binary (`application/octet-stream`). |
| `GET`  | `/api/games/:game/splash` | Stream the splash PNG (`image/png`). |

The ROM endpoint is game-scoped, not play-scoped: one ROM, many plays.

### Plays (CRUD)

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`    | `/api/plays?game=<game>` | List plays (for a game, or all). |
| `POST`   | `/api/plays` | Create a play. Body `{ game, id, label? }`. |
| `GET`    | `/api/plays/:game/:id` | Read play metadata (`config.json`). |
| `PATCH`  | `/api/plays/:game/:id` | Update config fields. |
| `DELETE` | `/api/plays/:game/:id` | Remove the play directory. |

### Play config

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`  | `/api/plays/:game/:id/config` | Read `config.json`. |
| `PUT`  | `/api/plays/:game/:id/config` | Write `config.json`. |

### States

Each "Collect state" press or checkpoint produces a state entry with up to three
sidecars: `.state.json` (jsNES save state), `.ff1.json` (extracted FF1 game
state), and `.metadata.json` (name, createdAt, bookmarked).

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`    | `/api/plays/:game/:id/states` | List state descriptors (sort=`newest`\|oldest\|name (a-z)\|name (z-a)). |
| `POST`   | `/api/plays/:game/:id/states` | Append a state. Body `{ data, name? }`; `data` is base64 or JSON snapshot. |
| `GET`    | `/api/plays/:game/:id/states/:file` | Read one state/sidecar file. |
| `PATCH`  | `/api/plays/:game/:id/states/:file` | Update metadata (`name`, `bookmarked`). |
| `DELETE` | `/api/plays/:game/:id/states/:file` | Remove one state and its sidecars. |

### Memory, journal, goals

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`    | `/api/plays/:game/:id/memory` | List memory entries. |
| `POST`   | `/api/plays/:game/:id/memory` | Write a memory entry (`{ slug?, content, label? }`; `slug` or `label` derives the file name). |
| `GET`    | `/api/plays/:game/:id/memory/:slug` | Read one memory entry. |
| `DELETE` | `/api/plays/:game/:id/memory/:slug` | Remove one memory entry. |
| `GET`    | `/api/plays/:game/:id/journal` | List journal entries. |
| `POST`   | `/api/plays/:game/:id/journal` | Write a journal entry (`name`, `content`). |
| `GET`    | `/api/plays/:game/:id/journal/:name` | Read one journal entry. |
| `DELETE` | `/api/plays/:game/:id/journal/:name` | Remove one journal entry. |
| `GET`    | `/api/plays/:game/:id/goals` | Read current goals. |
| `PUT`    | `/api/plays/:game/:id/goals` | Overwrite goals. |

### Steps

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`    | `/api/plays/:game/:id/steps` | List captured steps. |
| `POST`   | `/api/plays/:game/:id/steps` | Append one step. |
| `GET`    | `/api/plays/:game/:id/steps/:stepId` | Read one step. |

### Boot flow (botdeck)

```
readPlayId()  // ?play=ff1/0000_dev (default ff1/0000_dev)
  -> GET /api/plays/:game/:id/config
  -> GET /api/games/:game/rom          // game derived from play's first segment
  -> emulator.loadROM(bytes)
```

The play id determines the game; the game determines the ROM. No `rom` field in
config, no `/@fs`, no absolute client-side paths.

---

## 5. Step model (the persisted agent loop)

A **step** is one full turn of the loop, persisted so a play is a replayable,
inspectable history. Its shape mirrors the loop's phases:

```ts
interface StepRecord {
  stepId: string;            // monotonic zero-padded sequence, e.g. "000042"
  ts: number;                // client timestamp when the turn started
  request: TurnRequest;      // state + screenshot + available commands
  response: TurnResponse;    // chosen command + reason + prompt + raw output
  command: GameCommand;      // final command echoed from response
  macro?: ButtonStep[];      // compiled button sequence played by botdeck
  stateBefore?: string;      // repo-relative path to saved before state
  stateAfter?: string;       // repo-relative path to saved after state
}
```

botdeck is the sole writer of steps. After the macro finishes it snapshots the
emulator, `POST`s the completed `StepRecord`, and appends the turn to the local
log. `/api/turn` stays read-only with respect to disk; persistence is an
explicit `POST /steps`.

---

## 6. Prompt assembly

Prompts are built from markdown snippets under `games/<game>/prompts/`. The
resolved config (play overrides game) provides `prompt.snippets`, an ordered
list of snippet names. The snippet named exactly `system` becomes the system
prompt; every other snippet is rendered and joined to form the user prompt.

Rendering uses simple `{{key}}` substitution against a context built from the
`TurnRequest`:

| Key | Value |
| --- | ----- |
| `gameId` | `request.gameId` |
| `playId` | `request.playId` |
| `commands` | Formatted list of available commands |
| `stateJson` | `JSON.stringify(request.state)` |
| `gameInfo` | Human-readable FF1 summary from `@games/ff1-state` |
| `memory` | Concatenated current memory entries |
| `goals` | Current goals text |

A play may shadow any game snippet by placing a file with the same name in
`plays/<game>/<id>/prompts/`. This lets a single play specialize instructions,
goals framing, or tool descriptions without forking the game prompts.

---

## 7. Agent tool-use loop

vermbot resolves agent settings by merging the game's `config.json` and the
play's `config.json` under the `agent` key:

```ts
interface AgentConfig {
  model: string;
  maxToolRounds: number;
  maxTokens: number;
  limits: {
    goals: number;
    memory: number;
    journal: number;
    memoryCount: number;
  };
}
```

The model is asked with a system prompt, user prompt, and tool definitions.
After each response vermbot checks for tool calls:

- Native `tool-call` events from the LLM provider are preferred.
- As a fallback, vermbot parses `<tool_call>{ "name": ..., "input": ... }</tool_call>`
  blocks from the raw text.

Tool results are appended to the message list and the request is re-sent, up to
`maxToolRounds`. Once the model returns without tool calls, the final text is
parsed into a `TurnResponse`. If no valid command is found, the response falls
back to `{ name: "wait" }`.

### Tools

The agent currently exposes:

- `journal_list` / `journal_read` / `journal_write` - long-form play log.
- `memory_write` - short-term, always-included memory (limited by `memory` chars
  and `memoryCount` entries).
- `goals_write` - overwrite the current goals.

All writes land under `plays/<game>/<id>/{journal,memory,goals}/` and enforce
size limits from the resolved config.

---

## 8. Turn protocol (shared types)

`ButtonStep`, `GameCommand`, `CommandSpec`, `TurnRequest`, `TurnResponse`,
`StepRecord`, `ToolSpec`, `ToolCall`, and `ToolResult` are defined in
`packages/vermbot/src/protocol.ts` and mirrored in
`packages/botdeck/src/types.ts` (botdeck is browser-side and cannot import the
node-only llm client). Keep them byte-for-byte aligned; a real change edits both.

NES button indices (`packages/botdeck/src/types.ts`) match jsnes `Controller`:
A=0, B=1, SELECT=2, START=3, UP=4, DOWN=5, LEFT=6, RIGHT=7.

`GamePlugin` interface (per game):

```ts
interface GamePlugin {
  id: string;
  title: string;
  availableCommands(): CommandSpec[];   // advertised each turn
  readState(): Record<string, unknown>;  // from live emulator RAM/screen
  compile(command: GameCommand): ButtonStep[]; // command -> button macro
}
```

Only a `GenericGamePlugin` (single-tap placeholders) and an FF1 state reader
exist today. Real FF1 command compilers (menu navigation, travel, combat) are
not yet written.

---

## 9. Macro playback

The custom `Emulator` (`packages/botdeck/src/emulator/emulator.ts`) runs a
frame-synced `requestAnimationFrame` loop. At the lowest level a macro is a list
of `ButtonStep`s:

```ts
interface ButtonStep {
  button: number;
  holdFrames?: number;
  gapFrames?: number;
}
```

`runMacro` queues the steps and, on each emulated frame, advances the macro
state machine: hold the button for `holdFrames`, release, wait `gapFrames`, then
press the next button. Defaults are two frames each. The macro promise resolves
when all steps complete; resetting, stopping, or loading a ROM cancels the macro
and releases any held button.

`ButtonStep[]` is the frame-accurate target, but macros are also intended to be
named, reusable high-level constructs. A game plugin can statically define common
sequences (e.g., "open menu", "use first item", "flee battle") and dynamically
generate context-aware sequences (e.g., A* walking to a destination compiled into
held d-pad segments, or adaptive combat sequences that pick spells based on
current enemy state). The `GamePlugin.compile(command)` method is the boundary
where a high-level `GameCommand` becomes concrete `ButtonStep`s.

---

## 10. FF1 state reader

`@games/ff1-state` (`games/ff1/state/`) reads Final Fantasy I state from live
jsNES CPU memory or from a jsNES save-state object. It exposes:

- Party characters (stats, HP, status, spells, equipment).
- Inventory (consumables and key items).
- Gold.
- World state (overworld/standard map, position, vehicles, map objects).
- Game flags (raw `$6200` page; decoded progression flags are still TODO).

`formatFF1StateFromUnknown` produces a human-readable summary for the prompt's
`gameInfo` context. The reader is linked into both botdeck (to display state in
the UI) and vermbot (to render prompts and persist extracted snapshots).

---

## 11. WebRTC broadcasting (outline)

Goal: let an operator stream a live play to viewers in **read-only** mode - they
see the game frame, structured state, and agent decisions, but have no input
path.

Because the emulator lives in the browser, the authoritative frame buffer is the
botdeck canvas. The operator tab would be the WebRTC sender; vermbot would act
only as a signaling relay for SDP/ICE. Viewers would run a lightweight botdeck
mode with no emulator or input wiring.

Key unknowns and constraints:

- NAT traversal requires STUN/TURN configuration outside git.
- Fan-out is bounded by the host tab's encoder and upstream bandwidth; expect
  only a handful of viewers.
- Signaling would ride `/api/ws` and needs the Vite proxy to forward websockets.
- The data channel should carry state snapshots and turn events only on change,
  not every frame.
- No server-side media fallback; if the host tab closes, the stream ends.

This feature is further out and currently unbuilt. See `TODO.md`.

---

## 12. Conventions

### Imports

- Use a module alias: `@/...` maps to `src/...` (configured in each package's
  `vite.config.ts` `resolve.alias` + `tsconfig.json` `paths`). Example:
  `import { Emulator } from "@/emulator/emulator"`.
- No `../../..` chains for intra-package imports. Cross-package code goes
  through published/link deps, not relative path climbing.
- The file-serving mechanism (`/api/...`) is separate from the module alias;
  never `fetch` a module-alias path.
- **No `resolve.alias` for serving repo files.** Vite `alias` only rewrites
  import specifiers at build time; it adds no HTTP route, so a runtime `fetch`
  of an aliased path returns the SPA `index.html` (verified empirically). All
  repo file access at runtime goes through the vermbot file API (§4). This is
  the resolved form of the earlier `/@fs` / `/@games` exploration: drop those.

### Emulator

- jsnes is consumed as ESM source via the `link:../../.extern/jsnes` dep
  (`optimizeDeps.exclude: ["jsnes", "@games/ff1-state"]`); no separate build step.
- The turn model never pauses the emulator; no input = "thinking".
- The single core is the custom `Emulator` (RAF loop, frame-counted macros).

### Naming

- Prefer existing names from the codebase over inventing new ones in docs and
  APIs. `collectState`, `getState`, `readState`, `compile`, `ButtonStep`,
  `GameCommand` are canonical. Do not rename to fit a diagram.

---

## 13. Component inventory

- **botdeck** (browser, Vite SPA, :5173)
  - `emulator/Emulator` - the single NES core (frame-synced loop + macro).
  - `emulator/collectState` - snapshots jsNES CPU RAM, save RAM, ROM header,
    and save state.
  - `hooks/useEmulator` - boots Emulator, renders to canvas, exposes
    loadRom/reset/buttonDown/Up/save/load/collect/romName/power.
  - `hooks/useBotLoop` - the turn loop (reads state, POSTs `/api/turn`, plays
    the macro, persists the step, auto-run scheduler).
  - `games/*` - `GamePlugin` implementations (`GenericGamePlugin` now).
  - `components/` - `GameScreen`, `Gamepad`, `RomPicker`, `SaveControls`,
    `LoadMenu`, `GameInfoPanel` (+ `game-info/*` tabs).
  - `play.ts` - play-id resolution (`?play=`) + file-API URL builders (§4).
- **vermbot** (node, tsx, :8787)
  - `server.ts` - HTTP front door: `/api/turn`, `/api/games`, `/api/plays`,
    file handlers, `/health`.
  - `agent.ts` - model decision via `@opencode-ai/llm`'s OpenAICompatible
    provider, configured for the **homelab vLLM** (open-weights): base URL is
    project-level (`packages/vermbot/config.json`), model comes from the play's
    `config.json`. No hosted/proprietary model providers.
  - `prompts.ts` - snippet resolution, template rendering, per-play overrides.
  - `tools.ts` - memory/journal/goals tool definitions and execution.
  - `files.ts` - repo-rooted `fs` helpers for games/ and plays/.
- **@games/ff1-state** (`games/ff1/state/`) - FF1 RAM/save-state reader and
  human-readable formatter.
- **.extern** - vendored jsnes + opencode llm.

---

## 14. Running (dev)

See `README.md` for install, setup, run, build, and test commands.
