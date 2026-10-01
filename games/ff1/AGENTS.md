# AGENTS

Final Fantasy I game data, prompts, and state reader.

Key files:
- `config.json` - default agent and prompt snippet list.
- `prompts/*.md` - markdown prompt snippets rendered by vermbot.
- `state/src/` - `@games/ff1-state` workspace package.
- `guide/` - walkthrough/reference data.
- `game.nes` - the ROM (gitignored).

Commands:
- `pnpm --filter @games/ff1-state typecheck`

Rules:
- Prompt snippets can be overridden per-play by placing files with the same names in `plays/ff1/<id>/prompts/`.
- Do not commit `game.nes`; only configs, guides, prompts, and code are tracked.
