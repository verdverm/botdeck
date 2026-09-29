# vermbot-plays-games

An experiment in agentic gaming.

Inspired by https://github.com/christianmat/jev-pokemon

## Tech Stack

- [.extern/jsnes](https://github.com/bfirsh/jsnes) | https://jsnes.org/
- [.extern/opencode](https://github.com/anomalyco/opencode) `packages/llm` (`@opencode-ai/llm`) - OpenAI-compatible LLM client
- [../opencode](https://github.com/anomalyco/opencode) | https://opencode.ai/docs
- pnpm workspaces, node runtime
- react / tailwind, only in-house components

## Components

See [DESIGN.md](./DESIGN.md) for the authoritative architecture.

- ./packages/botdeck: browser UI - the single emulator core, dashboard, and agent loop (game top-left, game state bot-left, agent info right). The human-only controls (gamepad, debounced keyboard, ROM picker, save/load, collect-state viewer) live here after the humdeck merge.
- ./packages/vermbot: node - the agent plus the HTTP front door: `/api/turn` (decision) and the repo-rooted file API (`/api/games`, `/api/plays`, config read/write) backed by node `fs`
- ./games/<game>: per-ROM data (game.nes is gitignored), guide/, future RAM maps / command tables
- ./plays/<game>/<id>: per-run config.json, states/, steps/

## Architecture

The system is built around turn-based play (Final Fantasy, Pokemon). The
emulator always runs at 60fps; the agent simply provides no input while it
"thinks", like a human deliberating over a menu, then issues a high-level
command that is translated into a button macro with human-like timing.

Data flow per turn:

1. botdeck reads game state via a GamePlugin
2. botdeck composes a turn request (structured state + optional screenshot + available commands)
3. botdeck POSTs the request to vermbot's `/api/turn`
4. vermbot asks the model and returns a chosen GameCommand
5. botdeck's GamePlugin compiles the command into a sequence of button presses
6. the emulator plays the sequence out frame-by-frame, then the next turn begins

Layers:

- botdeck owns the emulator, the render loop, the macro timing, and the game plugin interface (`GamePlugin`: `readState`, `availableCommands`, `compile`)
- vermbot owns the agent (a model prompt built from the command catalog, returning `{command, reason}`, coerced to a valid option) and the file API over repo `fs`
- games own the smarts per title: RAM/state readers and command-to-button-sequence mappings (e.g. "travel to destination", "use healing potion")

The shared protocol types (`GameCommand`, `ButtonStep`, `CommandSpec`,
`TurnRequest`, `TurnResponse`) are mirrored in botdeck and vermbot: botdeck is
a browser app and vermbot stays Node-only.

## Local dependencies

jsnes and the opencode LLM client are vendored under .extern/ and consumed via
pnpm `link:` workspace deps:

- botdeck links `.extern/jsnes` (consumed as ESM source, no separate build step)
- vermbot links `.extern/opencode/packages/llm` as `@opencode-ai/llm`; install its deps once inside the vendored tree:
  - `cd .extern/opencode && bun install --filter @opencode-ai/llm...`

## Running

Requires node 24 / pnpm. Install once with `pnpm install`.

- `pnpm dev:vermbot` - agent + file API on :8787. The agent talks to the homelab vLLM endpoint (open-weights): base URL is project-level in `packages/vermbot/config.json`, the model comes from the `model` field in the play's config.json. No hosted/proprietary provider keys.
- `pnpm dev:botdeck` - dashboard on :5173 (proxies `/api` to :8787). Open `http://localhost:5173/?play=ff1/0000_dev` (default play if no `?play=`); the emulator auto-loads the ROM derived from the play's game via the file API.

`pnpm build` and `pnpm typecheck` run across all packages.

## Open items

- No game plugin yet: only a generic single-tap placeholder exists in botdeck. Real Final Fantasy / Pokemon state readers and command macros (packages/games/...) still need to be written
- games/ and plays/ are declared workspace globs but have no packages yet (the on-disk `games/` and `plays/` are data dirs, not packages)
- The turn loop has only been exercised against the generic plugin; an end-to-end live turn needs a browser plus a reachable model endpoint
- Step persistence (steps/ + states/ file API endpoints) and state-change detection are DESIGN.md targets, not yet implemented
- WebRTC read-only broadcasting (DESIGN.md §7) is unbuilt and currently out of scope


## Ideas

- write post-first-town setup in the config, script to automate play
- start and getting to that point or "game genie" like capability to set starting equipment / money? (i.e. just write the starting save file directly?)
- perhaps just one emulator, where we can do manual input and/or use the agent (like user wants to play but have a bot grind levels only)
- we can then have different views or tabs in the UI, less code base

## Todos

- [x] Add '@' import alias to botdeck vite.config + tsconfig
- [x] Port collectState onto Emulator core; add power/save/load/reset to Emulator wrapper
- [x] Expand useEmulator: loadRom, reset, buttonDown/Up, save/load, collect, romName, power
- [x] Add botdeck components: Gamepad, RomPicker, StateViewer (+ json-edit-react dep)
- [x] Rewrite botdeck App.tsx to unified UI (game+state+agent+gamepad+collect) and keyboard input
- [x] Rewrite all botdeck ../ imports to @/
- [x] Remove humdeck package + dev:humdeck script; update README
- [x] typecheck + build botdeck
- [x] vermbot file API: /api/games, /api/plays (CRUD), config read/write over repo fs
- [ ] Steps/states file API endpoints (DESIGN.md 4/5) and step persistence
- [ ] State-change detection (DESIGN.md 8) to drive the loop instead of a timer
- [ ] WebRTC read-only broadcast + signaling (DESIGN.md 7)