# DESIGN

> Design document for `vermbot-plays-games`, an experiment in agentic gaming: a
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
4. vermbot asks the model and returns a chosen `GameCommand`.
5. botdeck's `GamePlugin` compiles the command into a `ButtonStep[]` macro.
6. the emulator plays the sequence frame-by-frame, then the next turn begins.
7. (new) the resulting step is persisted to the play directory via the file API.

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

- **Read-only viewing is WebRTC, with the host being the browser tab that runs
  the emulator.** The operator's botdeck captures its game canvas and a
  read-only data feed and broadcasts them to viewers over `RTCPeerConnection`;
  vermbot handles only signaling (SDP/ICE), not the media. Viewers have no
  input path at all - they watch the frame, the structured state, and the agent
  log. See §7. This is a direct consequence of the browser-emulator decision:
  each stream originates from a human tab, not the server.

---

## 3. Repository layout (git-tracked)

```
vermbot-plays-games/
  games/<game>/          # one entry per ROM/game
    game.nes             # the ROM (gitignored - binary, see .gitignore)
    guide/               # walkthrough/reference data for the game
    ...                  # future game code (RAM maps, command tables)
  plays/<game>/<id>/     # many plays share one game/ROM
    config.json          # run settings (label, options; NO rom path - derived)
    states/              # N save states + collected snapshots
    steps/               # per-turn agent artifacts (see §5)
    ...                  # arbitrary run output the game/agent produces
  packages/
    botdeck/             # browser: emulator + dashboard + agent loop (the UI)
    vermbot/             # node: agent + HTTP front door + file API
    games/<game>/        # game plugins (state reader + command compiler) [planned]
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

The ROM endpoint is game-scoped, not play-scoped: one ROM, many plays.

### Plays (CRUD)

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`    | `/api/plays?game=<game>` | List plays (for a game, or all). |
| `POST`   | `/api/plays` | Create a play. Body `{ game, id, label? }`. |
| `GET`    | `/api/plays/:game/:id` | Read play metadata (config + counts). |
| `PATCH`  | `/api/plays/:game/:id` | Update config fields. |
| `DELETE` | `/api/plays/:game/:id` | Remove the play directory. |

### Play artifacts (all scoped under `:game/:id`)

Config:

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`  | `/api/plays/:game/:id/config` | Read `config.json`. |
| `PUT`  | `/api/plays/:game/:id/config` | Write `config.json`. |

States - **N per play** (each "Collect state" press, each checkpoint):

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`    | `/api/plays/:game/:id/states` | List state descriptors. |
| `POST`   | `/api/plays/:game/:id/states` | Append a state. Body = snapshot. |
| `GET`    | `/api/plays/:game/:id/states/:stateId` | Read one state. |
| `DELETE` | `/api/plays/:game/:id/states/:stateId` | Remove one state. |

Steps - **one per agent-loop iteration** (see §5):

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`    | `/api/plays/:game/:id/steps` | List captured steps. |
| `POST`   | `/api/plays/:game/:id/steps` | Append one step. |
| `GET`    | `/api/plays/:game/:id/steps/:stepId` | Read one step. |

### boot flow (botdeck)

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
// draft - finalize during implementation (see Open Questions §13)
interface StepRecord {
  stepId: string;            // sequence/timestamp handle
  ts: number;
  request: TurnRequest;      // getState output: state + screenshot + options
  response: TurnResponse;    // process output: chosen command + reason
  command: GameCommand;
  // putMoves output:
  macro?: ButtonStep[];      // the compiled button sequence
  stateBefore?: string;      // stateId or save snapshot
  stateAfter?: string;
}
```

Each `collectState` press (a human checkpoint) and each step both live under the
play directory; whether they share one collection is an open question (§13).

---

## 6. Turn protocol (shared types)

`ButtonStep`, `GameCommand`, `CommandSpec`, `TurnRequest`, `TurnResponse` are
defined in `packages/vermbot/src/protocol.ts` and mirrored in
`packages/botdeck/src/types.ts` (botdeck is browser-side and cannot import the
node-only llm client). Keep them byte-for-byte aligned; a real change edits both.

NES button indices (`packages/botdeck/src/types.ts`) match jsnes `Controller`:
A=0, B=1, SELECT=2, START=3, UP=4, DOWN=5, LEFT=6, RIGHT=7.

`GamePlugin` interface (per game, in `packages/games/<game>/`):

```ts
interface GamePlugin {
  id: string;
  title: string;
  availableCommands(): CommandSpec[];   // advertised each turn
  readState(): Record<string, unknown>;  // from live emulator RAM/screen
  compile(command: GameCommand): ButtonStep[]; // command -> button macro
}
```

Only a `GenericGamePlugin` (single-tap placeholders) exists so far. Real FF1
RAM readers and command macros are not yet written.

---

## 7. Read-only WebRTC broadcasting

Goal: let an operator stream a live play to viewers (a home page / shared link)
in **read-only** mode - they see the game, the structured state, and the agent's
decisions, but cannot send any input.

### Why the host is a browser tab

The emulator lives in botdeck (browser, §2), so the authoritative frame buffer
is `canvas.captureStream()`-able there. Making the operator's tab the WebRTC
**host** (sender) avoids moving emulation server-side and keeps one emulator
implementation. vermbot therefore does **signaling only** - it brokers
SDP/ICE between host and viewers over WebSocket; it never touches media.

### Topology

```
vermbot signaling (:8787, /api/ws)      WebRTC (P2P, SRTP)
   host tab  ------------------  viewer tab(s)
     ^                              (read-only)
     | canvas.captureStream() -> video track
     + gamepad/state/log          -> datachannel track
```

- **Host**: the botdeck tab that owns the emulator + agent loop. Captures the
  `GameScreen` canvas as a `MediaStreamTrack` (video) and opens an
  `RTCPeerConnection` with an `RTCDataChannel` for the read-only feed.
- **Viewers**: a lightweight botdeck mode (no emulator, no loop). They render
  the incoming video track to a `<video>` element and apply data-channel
  messages to the same `GameStatePanel` / `AgentPanel` components.

### Two tracks

| Track | Transport | Content |
| ----- | --------- | ------- |
| Video | `captureStream()` -> `RTCRtpSender` | The live NES frame, encoded by the browser. No extra deps. |
| Data  | `RTCDataChannel` (ordered, reliable) | Structured snapshots + agent decisions. |

The data channel carries the same objects the UI already renders, so viewer
panels are the operator's panels fed over the wire instead of from local RAM:

```ts
// draft messages sent on the host datachannel
type LiveMessage =
  | { type: "state";  seq: number; state: Record<string, unknown> }   // readState output
  | { type: "turn";   seq: number; turn: number; command: GameCommand; reason?: string }
  | { type: "phase";  seq: number; phase: Phase }
  | { type: "reset";  seq: number };                                   // viewer resyncs
```

Read-only is **structural**, not a UI hide: the viewer build has no `buttonDown`
/ `buttonUp` / ROM-loader wiring, so there is literally no input path to
misuse.

### Signaling protocol (vermbot)

A single WebSocket endpoint on vermbot relays SDP/ICE, served at `/api/ws` so
it rides the same path prefix botdeck already proxies (with `ws: true` on that
Vite proxy rule - the current `/api` proxy does not yet forward websockets).
vermbot assigns each stream a topic id (the play id works: `ff1/0000_dev`);
host publishes, viewers subscribe.

```
client -> server:  { type: "join",  topic, role: "host" | "viewer", peerId }
server -> client:  { type: "peer",  peerId }                 // notify host a viewer joined
server -> host:    { type: "signal", from, sdp }             // viewer offer (or host offer)
server -> *:       { type: "signal", from, sdp | candidate } // relay SDP/ICE verbatim
server -> client:  { type: "leave", peerId }
```

Negotiation: the **viewer creates the offer** (WebRTC `RTCPeerConnection`
offerer role) and sends an offer with no tracks (receive-only); the host answers
with its tracks attached. A viewer joining mid-broadcast just repeats this
handshake; the host adds the new `RTCPeerConnection` to its fan-out set and the
data channel sends a `{type:"state"}` snapshot on connect so the viewer isn't
blank. Note the SDP offerer (viewer) and the media sender (host) are opposite
sides here; the join `role` field ("host" | "viewer") is a participant kind,
independent from who offers.

### Lifecycle & limits

- Host tab closed / navigated away -> all viewers drop (no server-side fallback
  media; the source was the tab). Reopening the host lets viewers reconnect.
- Fan-out is bounded by the host's encoder + bandwidth; keep viewer count small
  (a handful). This is a demo/observation feature, not a CDN.
- NAT traversal needs a STUN server (and TURN for symmetric-NAT viewers);
  configured on the `RTCPeerConnection` iceServers, not stored in git.
- Media is ephemeral and **not persisted** - durable capture stays with the
  file API's steps/states (§4, §5), independent of who happened to be watching.

---

## 8. State-change detection

The loop, persistence, and broadcast all want to know when the game actually
*changed* rather than firing blindly at 60fps. jsnes provides **no generic
"game state changed" event**; the only hooks are on the `NES` constructor
(`NESOptions`, `.extern/jsnes/src/nes.d.ts:13-17`):

| Hook | Fires | Value for change detection |
| ---- | ----- | -------------------------- |
| `onFrame(buffer)` | every emulated frame, full 256x240 `Uint32Array` | the clock; pixel-level, not semantic |
| `onBatteryRamWrite(addr,val)` | per byte, **only save-RAM ($6000-$7FFF)**, mapper-wired (only mapper0/5 emit it in the vendored tree) | detects in-game *saves*, not general state |
| `onStatusUpdate(string)` | lifecycle text ("Ready to load a ROM.") | not useful |
| `onAudioSample(l,r)` | audio samples | not useful |

There is no CPU-write or PPU-change event. `collectState` already works around
this by **polling** `cpu.mem` for the SRAM window. So "state changed" must be
**derived**, anchored to the per-frame `onFrame` callback (the Emulator already
fan-outs frames to listeners; see `packages/botdeck/src/emulator/emulator.ts`).

Design: a single `onStateChanged` source of truth in `useEmulator`, computed
each frame, that the loop, step persistence (§5), and broadcaster (§7) subscribe
to.

```ts
type ChangeKind = "screen" | "state" | "save";
interface StateChange {
  kind: ChangeKind;
  seq: number;                 // monotonic, shared ordering
  frame: number;               // emulated frame index it fired on
  state?: Record<string, unknown>; // present for kind "state"
  address?: number;            // present for kind "save"
}
```

Derivation rules:

- **screen** - hash (or region-of-interest diff, e.g. the message/menu box) the
  `onFrame` buffer vs the previous; differs => screen changed. Cheap rolling
  hash, not a full-pixel compare every frame.
- **state** - on each frame, `plugin.readState()` and deep-diff vs last; a
  difference => a semantic state event (the agent's "the game responded").
- **save** - `onBatteryRamWrite` fired => a real in-game save occurred.

Settling (no change for N frames, default ~12 = 200ms) is the signal that the
macro's effect has played out.

How each consumer uses it:

- **Agent loop** (`useBotLoop`): instead of a fixed `thinkDelayMs` poll, advance
  to the next turn only when the screen/state settles after a macro plays. This
  is more faithful to turn-based than a timer, and naturally waits out animation.
- **Step persistence** (§5): gate a `POST /steps` on an actual change, so
  no-op/wait turns and steady-state 60fps re-renders don't spam the play dir.
- **WebRTC data channel** (§7): video already carries pixels over its own
  track; emit `{type:"state"}` on the data channel **only on change**, not every
  frame. Keeps the feed small and viewers in sync.
- **Auto-checkpoint**: on `save`, snapshot emulator state to `states/` without a
  manual Collect press (pairs with the `onBatteryRamWrite` signal).

Cost note: `readState()` runs every frame; keep it to the few RAM addresses the
plugin actually needs, and let it be a no-op stub for the generic plugin.

---

## 9. Conventions

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
  (`optimizeDeps.exclude: ["jsnes"]`); no separate build step.
- The turn model never pauses the emulator; no input = "thinking".
- The single core is the custom `Emulator` (RAF loop, frame-counted macros),
  not `jsnes.Browser` (`Browser` is only used by the to-be-removed humdeck).

### Naming

- Prefer existing names from the codebase over inventing new ones in docs and
  APIs. `collectState`, `getState`, `readState`, `compile`, `ButtonStep`,
  `GameCommand` are canonical. Do not rename to fit a diagram.

---

## 10. Component inventory (post-merge)

- **botdeck** (browser, Vite SPA, :5173)
  - `emulator/Emulator` - the single NES core (frame-synced loop + macro).
  - `hooks/useEmulator` - boots Emulator, renders to canvas, owns
    `onStateChanged` (§8); exposes loadRom/reset/buttonDown/Up/save/load/
    collect/romName/power.
  - `hooks/useBotLoop` - the turn loop (change-driven; reads state, POSTs
    /api/turn, plays, persists the step).
  - `hooks/useBroadcast` [planned] - WebRTC host side (§7).
  - `games/*` - `GamePlugin` implementations (generic placeholder now).
  - `components/` - `GameScreen`, `Gamepad`, `RomPicker`, `StateViewer`,
    `AgentPanel`, `GameStatePanel`, `ControlBar`, `SaveControls`.
  - `play.ts` - play-id resolution (`?play=`) + file-API URL builders (§4).
  - `viewer` mode - read-only entry that renders an incoming stream, no
    emulator/loop/input (§7).
- **vermbot** (node, tsx, :8787)
  - `server.ts` - HTTP front door: `/api/turn`, `/api/games`, `/api/plays`,
    file handlers, `/health`, `/api/ws` signaling.
  - `agent.ts` - model decision via `@opencode-ai/llm`'s OpenAICompatible
    provider, configured for the **homelab vLLM** (open-weights): base URL is
    project-level (`packages/vermbot/config.json`), model comes from the play's
    config.json. No hosted/proprietary model providers.
  - `files.ts` [planned] - repo-rooted fs helpers for games/ and plays/ (§4).
  - `signal.ts` [planned] - WebSocket SDP/ICE relay (§7).
- **packages/games/<game>** [planned] - per-title plugins + data (opencode
  plugins per README).
- **.extern** - vendored jsnes + opencode llm.

---

## 11. Running (dev)

Requires node 24 / pnpm. `pnpm install` once.

- `pnpm dev:vermbot` - agent + file API + signaling on :8787. The agent talks to
  the homelab vLLM endpoint (open-weights): base URL is project-level in
  `packages/vermbot/config.json`, model comes from the play's config.json.
  No hosted/proprietary provider keys.
- `pnpm dev:botdeck` - dashboard on :5173 (proxies `/api` -> :8787).

Then open `http://localhost:5173/?play=ff1/0000_dev` (default play if no
`?play=`). The emulator auto-loads the ROM derived from the play's game via the
file API. `pnpm build` and `pnpm typecheck` run across all packages.

The vendored llm client needs its deps installed once:
`cd .extern/opencode && bun install --filter @opencode-ai/llm...`.

---

## 12. Status / gaps

- **Merge + file API done.** humdeck is removed; botdeck now owns the single
  `Emulator` core plus the folded-in human controls (`Gamepad`, `RomPicker`,
  `StateViewer`, `SaveControls`, `collectState`, debounced keyboard). vermbot
  exposes the file API (§4: games, ROM, plays CRUD, config read/write) over
  repo-rooted `fs`, and botdeck boots via `/api` (`play.ts` builders, no `/@fs`
  or `/@games`).
- Step persistence (§5) and the `states/` + `steps/` endpoints are not yet
  implemented; the play dir is created with `states/` and `steps/` subdirs.
- State-change detection (§8) is not yet implemented; the loop still advances on
  a fixed `thinkDelayMs` timer.
- No real game plugin yet (only the generic single-tap placeholder).
- `packages/games/*` and `packages/plays/*` workspace globs are declared but
  empty; the on-disk `games/` and `plays/` are data dirs, not packages.
- The turn loop has only been exercised against the generic plugin; no
  end-to-end live turn has run.
- WebRTC is unbuilt and currently out of scope; signaling endpoint, host hook,
  and viewer mode are planned.

---

## 13. Open questions (need user decision before implementation)

Each carries a **proposed default** so work can start if left unanswered; flip
any of these before implementation.

1. **States vs steps.** Save-states (playbook checkpoints, human `collectState`
   presses) and steps (agent turns) have different producers.
   *Proposed default:* two collections under the play dir (`states/` and
   `steps/`) as in §4/§5; a step may reference a `stateId` for
   before/after but does not itself become a named state.

2. **`:stateId` scheme.**
   *Proposed default:* monotonic sequence (`000012`) as the id, with an
   optional human `label` field for checkpoints (`before_boss`). Same scheme for
   `:stepId`.

3. **Persistence ownership / who POSTs a step.** botdeck (browser) drives the
   emulator and reads live state; vermbot owns disk.
   *Proposed default:* botdeck is the sole writer of steps - after playing the
   macro it `POST`s the completed `StepRecord`. `/turn` stays read-only with
   respect to disk (it decides, it does not persist); persistence is an explicit
   step POST. Keeps the turn endpoint pure and the play dir authoritative from
   the side that saw the frames.

4. **Viewer mode location.** A separate botdeck route/query flag (`?view=`) vs a
   distinct package.
   *Proposed default:* a mode inside botdeck (`?play=<id>&view=readonly`), since
   it reuses the same panels and just omits the emulator/loop/input.
