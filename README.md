# botdeck

An experiment and framework for agentic gaming.

Inspired by https://github.com/christianmat/jev-pokemon

**Why?** Context and harness engineering is interesting and this is a fun way to learn evals and build a different kind of harness. Final Fantasy 1 was the first game I ever bought as a child (at a garage sale). After watching Jev play Pokemon, I wanted to try something similar with open weight models running on my homelab. Then scope creep happened.

## Overview

- wrap retro game emulators in a custom harness for agents
- automated agentic play or human in the loop spectrum (give hint, grind levels for me)
- customize everything, design various plays of games, contribute new game integrations
- benchmark and eval suite to compare and optimize agent players, share your best
- streaming and webrtc friendly to support a new genre of gaming, do you a-game?
- rich web UI and support for any token vendor, homelab friendly

## Components

See [DESIGN.md](./DESIGN.md) for the authoritative architecture.

- `./packages/botdeck` - browser UI: the single emulator core, dashboard, human controls, and agent loop
- `./packages/vermbot` - Node server: the agent, the HTTP front door, and the repo-rooted file API
- `./games/<game>` - per-ROM data (`game.nes` is gitignored), `guide/`, `prompts/`, and game-specific workspace packages such as `games/ff1/state` for integrations and interactions
- `./plays/<game>/<id>` - per-run `config.json`, `states/`, `steps/`, `memory/`, `journal/`, `goals/`

## Architecture

The system is built around turn-based play (Final Fantasy, Pokemon). The emulator always runs at 60fps; the agent simply provides no input while it "thinks", like a human deliberating over a menu, then issues a high-level command that is translated into a button macro with human-like timing.

Data flow per turn:

1. botdeck reads game state via a `GamePlugin` (browser, from the live emulator).
2. botdeck composes a `TurnRequest` (structured state + optional screenshot + available commands).
3. botdeck POSTs the request to vermbot's `/api/turn`.
4. vermbot assembles the prompt from `games/<game>/prompts/*.md` snippets, with optional per-play overrides in `plays/<game>/<id>/snippets/user/`, then asks the model.
5. The model may call memory/journal/goals tools across `maxToolRounds` before emitting a final command.
6. vermbot returns a `TurnResponse` with the chosen `GameCommand`, reason, rendered prompts, and raw output.
7. botdeck's `GamePlugin` compiles the command into a `ButtonStep[]` macro.
8. The emulator plays the sequence frame-by-frame.
9. botdeck snapshots before/after states and persists the completed `StepRecord` to the play directory via `POST /api/plays/:game/:id/steps`.

Layers:

- botdeck owns the emulator, the render loop, the macro timing, and the game plugin interface (`GamePlugin`: `readState`, `availableCommands`, `compile`).
- vermbot owns the agent, the prompt assembly, the tool-use loop, and the file API over repo `fs`.
- games own the smarts per title: RAM/state readers and command-to-button-sequence mappings (e.g. "travel to destination", "use healing potion").
- `@games/ff1-state` is the first workspace package that reads Final Fantasy I state from live jsNES CPU RAM and save states.

The shared protocol types (`GameCommand`, `ButtonStep`, `CommandSpec`, `TurnRequest`, `TurnResponse`, `StepRecord`) are mirrored in `packages/botdeck/src/types.ts` and `packages/vermbot/src/protocol.ts`: botdeck is a browser app and vermbot stays Node-only.

## Tech Stack

- [.extern/jsnes](https://github.com/bfirsh/jsnes) | https://jsnes.org/ - NES emulator core, consumed as ESM source
- [.extern/opencode](https://github.com/anomalyco/opencode) `packages/llm` (`@opencode-ai/llm`) - OpenAI-compatible LLM client
- [Effect](https://effect.website/) - agent request pipeline (4.0.0-beta)
- pnpm workspaces, Node 24, TypeScript 5.9
- React 19 / Tailwind 4, only in-house components
- Vitest + Playwright - unit, benchmark, and e2e tests

## Local dependencies

jsnes and the opencode LLM client are vendored under `.extern/` and consumed via pnpm `link:` workspace deps:

- botdeck links `.extern/jsnes` (consumed as ESM source; no separate build step).
- vermbot links `.extern/opencode/packages/llm` as `@opencode-ai/llm`; install its deps once inside the vendored tree:
  - `cd .extern/opencode && bun install --filter @opencode-ai/llm...`
- `@games/ff1-state` is declared in `pnpm-workspace.yaml` and linked into both `botdeck` and `vermbot`.

## Install and run

Requires Node 24 and pnpm.

```bash
# 1. Install workspace deps
pnpm install

# 2. Install the vendored LLM client deps once
cd .extern/opencode && bun install --filter @opencode-ai/llm...
cd ../..

# 3. Start the agent + file API on :8787
pnpm dev:vermbot

# 4. In another shell, start the dashboard on :5173
pnpm dev:botdeck
```

Open `http://localhost:5173/?play=ff1/0000_dev` (the default play if no `?play=` is given). The emulator auto-loads the ROM derived from the play's game via the file API.

To clean up dev servers left dangling by agent sessions, run `scripts/kill-dangling-servers.sh` (add `--dry-run` to preview). It targets only processes owned by this repo on ports :8787/:5173 and is safe to re-run.

The agent talks to a homelab vLLM endpoint. The base URL is project-level in `packages/vermbot/config.json`; the model comes from the `model` field in the play's `config.json`. No hosted/proprietary provider keys are used.

## Build, typecheck, test, and benchmark

```bash
pnpm build          # build all packages
pnpm typecheck      # typecheck all packages
pnpm test           # run unit tests across all packages
pnpm test:coverage  # run unit tests with coverage
pnpm test:e2e       # run Playwright e2e tests in botdeck
pnpm test:e2e:perf  # run botdeck performance e2e tests
pnpm bench          # run Vitest benchmarks across all packages
pnpm lint           # lint all packages
pnpm lint:fix       # lint and fix all packages
```
