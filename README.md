# vermbot-plays-games

An experiment in agentic gaming.

Inspired by https://github.com/christianmat/jev-pokemon

## Tech Stack

- [.extern/jsnes](https://github.com/bfirsh/jsnes) | https://jsnes.org/
- [.extern/adk-js](https://github.com/google/adk-js) | https://adk.dev/
- [../opencode](https://github.com/anomalyco/opencode) | https://opencode.ai/docs
- pnpm workspaces, node runtime
- react / tailwind, only in-house components

## Components

- ./packages/botdeck: emulator/dashboard - game in top-left, game state in bot-left, agent info right-half
- ./packages/humdeck: human-only jsnes UI (canvas, keyboard/gamepad, ROM loader) for verifying the emulator subsystem in isolation, no agent involved
- ./packages/vermbot: the agent loop that plays the game, given available options, game info, maybe image; outputs the option to take, not direct button pushes
- ./packages/games/...: game specific data handling and context preparation, opencode plugins
- ./packages/plays/...: run specific settings, references, guides

## Architecture

The system is built around turn-based play (Final Fantasy, Pokemon). The
emulator always runs at 60fps; the agent simply provides no input while it
"thinks", like a human deliberating over a menu, then issues a high-level
command that is translated into a button macro with human-like timing.

Data flow per turn:

1. botdeck reads game state via a GamePlugin
2. botdeck composes a turn request (structured state + optional screenshot + available commands)
3. botdeck POSTs the request to vermbot's `/turn`
4. vermbot runs its ADK agent and returns a chosen GameCommand
5. botdeck's GamePlugin compiles the command into a sequence of button presses
6. the emulator plays the sequence out frame-by-frame, then the next turn begins

Layers:

- botdeck owns the emulator, the render loop, the macro timing, and the game plugin interface (`GamePlugin`: `readState`, `availableCommands`, `compile`)
- vermbot owns the agent: a model prompt built from the command catalog, returning `{command, reason}`, coerced to a valid option
- games own the smarts per title: RAM/state readers and command-to-button-sequence mappings (e.g. "travel to destination", "use healing potion")
- humdeck exercises the emulator alone, with no agent, to confirm the core subsystems work

The shared protocol types (`GameCommand`, `ButtonStep`, `CommandSpec`,
`TurnRequest`, `TurnResponse`) are mirrored in botdeck and vermbot: botdeck is
a browser app and vermbot stays Node-only.

## Local dependencies

jsnes and adk-js are vendored under .extern/ and consumed via pnpm `link:`
workspace deps:

- botdeck and humdeck link `.extern/jsnes` (consumed as ESM source, no separate build step)
- vermbot links `.extern/adk-js/core` as `@google/adk`; the vendored core must be built once for types to resolve:
  - `cd .extern/adk-js && npm install --ignore-scripts && npm run build --workspace core`

## Running

Requires node 24 / pnpm. Install once with `pnpm install`.

- `pnpm dev:humdeck` - human-only emulator UI on :5174 (load a .nes ROM)
- `pnpm dev:vermbot` - agent server on :8787 (set `GEMINI_API_KEY`; optionally `VERMBOT_MODEL`)
- `pnpm dev:botdeck` - dashboard on :5173 (proxies `/api` to :8787; set the ROM/plugin in `src/App.tsx`)

`pnpm build` and `pnpm typecheck` run across all packages.

## Open items

- No game plugin yet: only a generic single-tap placeholder exists in botdeck. Real Final Fantasy / Pokemon state readers and command macros (packages/games/...) still need to be written
- games/ and plays/ are declared workspace globs but have no packages yet
- The turn loop has only been exercised against the generic plugin; an end-to-end live turn needs a browser plus a valid GEMINI_API_KEY
- vermbot's model call path and humdeck's live browser session have not been run end-to-end (typecheck, build, and server error handling are covered)


## Ideas

- write post-first-town setup in the config, script to automate play
- start and getting to that point or "game genie" like capability to set starting equipment / money? (i.e. just write the starting save file directly?)
- perhaps just one emulator, where we can do manual input and/or use the agent (like user wants to play but have a bot grind levels only)
- we can then have different views or tabs in the UI, less code base

## Todos

- [x] Add '@' import alias to botdeck vite.config + tsconfig
- [ ] Port collectState onto Emulator core; add power/save/load/reset to Emulator wrapper
- [ ] Expand useEmulator: loadRom, reset, buttonDown/Up, save/load, collect, romName, power
- [ ] Add botdeck components: Gamepad, RomPicker, StateViewer (+ json-edit-react dep)
- [ ] Rewrite botdeck App.tsx to unified UI (game+state+agent+gamepad+collect) and keyboard input
- [ ] Rewrite all botdeck ../ imports to @/
- [ ] Remove humdeck package + dev:humdeck script; update README
- [ ] typecheck + build botdeck