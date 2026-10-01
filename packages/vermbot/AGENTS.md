# AGENTS

Node agent, HTTP front door, and repo-rooted file API.

Key files:
- `src/server.ts` - HTTP routes and route dispatch.
- `src/agent.ts` - model client, tool-use loop, command parsing.
- `src/prompts.ts` - snippet resolution, template rendering, per-play overrides.
- `src/tools.ts` - memory/journal/goals tool definitions.
- `src/files.ts` - repo-rooted `fs` helpers and path safety.
- `src/protocol.ts` - shared protocol types mirrored in botdeck.
- `config.json` - project-level vLLM base URL.

Commands:
- `pnpm dev:vermbot`
- `pnpm --filter vermbot test`
- `pnpm --filter vermbot bench`

Rules:
- All paths must be built through `repoPath()` / `gameDir()` / `playDir()` in `src/files.ts`; reject any escape from the repo root.
- `/api/turn` is read-only with respect to disk; persistence is always an explicit `POST` to `/api/plays/:game/:id/steps` (or states/memory/journal/goals).
