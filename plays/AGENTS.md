# AGENTS

Per-run play directories. Each play belongs to one game and inherits that game's ROM and default config.

Layout for `plays/<game>/<id>/`:
- `config.json` - run label, agent options, prompt snippet overrides.
- `states/` - save states + extracted snapshots + metadata.
- `steps/` - persisted agent turns.
- `memory/`, `journal/`, `goals/` - durable agent notes.
- `prompts/` - optional per-play prompt overrides.

Rules:
- Never add a `rom` field to `config.json`; the play's `<game>` segment determines the ROM via `/api/games/:game/rom`.
- Keep resource names (state labels, journal names, etc.) filesystem-safe; vermbot will reject `/`, `..`, and null bytes.
