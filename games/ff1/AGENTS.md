# AGENTS

Final Fantasy I game data, prompts, and state reader.

Key files:
- `config.json` - default agent and prompt snippet list.
- `prompts/*.md` - markdown prompt snippets rendered by vermbot.
- `state/src/` - `@games/ff1-state` workspace package.
- `maps/*.json` - extracted overworld and standard-map tile grids used by A* navigation.
- `maps/*.txt` - human-readable map notes and source-of-truth references.
- `guide/` - walkthrough/reference data.
- `game.nes` - the ROM (gitignored).
- `scripts/` - map extraction and probing utilities.

Commands:
- `pnpm --filter @games/ff1-state typecheck`

Rules:
- Prompt snippets can be overridden per-play by placing files with the same names in `plays/ff1/<id>/prompts/`.
- Do not commit `game.nes`; only configs, guides, prompts, maps, and code are tracked.
- Botdeck consumes the maps and state reader via workspace links (`@games/ff1-map`, `@games/ff1-state`).
