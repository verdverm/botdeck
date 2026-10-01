# AGENTS

Project root for `botdeck`, an agentic NES gaming harness.

- Start with `README.md` for setup and commands, `DESIGN.md` for architecture, and `TODO.md` for status.
- Top-level commands: `pnpm install`, `pnpm dev:vermbot`, `pnpm dev:botdeck`, `pnpm typecheck`, `pnpm test`, `pnpm bench`.
- Areas: `packages/botdeck` (browser UI/emulator), `packages/vermbot` (Node agent + file API), `games/<game>` (ROM + prompts + state reader), `plays/<game>/<id>` (per-run data).

Rules:
- Always use `@/` module aliases inside packages; no `../../../` chains.
- All runtime repo file access goes through the vermbot `/api` proxy; browser code never uses Node `fs` directly.
- `.nes` ROMs are gitignored; never commit them.
