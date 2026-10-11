# AGENTS

FF1 plays. See `plays/AGENTS.md` for the shared layout contract and
`packages/vermbot/AGENTS.md` for the file API that serves these directories.

Layout for `plays/ff1/<id>/`:
- `config.json` - run label; `agent` and `prompt` blocks are merged over
  `games/ff1/config.json` field-by-field.
- `states/` - numbered state records: `<id>-<name>.state.json` (raw save state),
  `.ff1.json` (extracted FF1 state), `.metadata.json` (name, bookmarks).
- `steps/` - numbered `<id>.step.json` agent turn records.
- `memory/`, `journal/` - markdown agent notes (slugged).
- `goals/` - `goals.md`, rewritten by goals_write.
- `snippets/user/`, `snippets/agent/` - per-play prompt snippet overrides
  (user: `<name>.snippet.json` macro records; `<name>.md` files in the same
  directory are per-play prompt overrides that shadow
  `games/ff1/prompts/<name>.md`, served via
  `/api/plays/ff1/<id>/prompts/:name`; `snippets/agent/` is the agent-tool
  markdown store).
- `ff1.initd.state.json` - seeded initial full state snapshot.

Rules:
- Only `0000_dev` may exist without being explicitly created via POST /api/plays
  (it is the default play when a TurnRequest has no playId).
- State/steps memory/journal/goals/snippets write nothing by hand: all CRUD goes
  through vermbot's /api routes so sidecars stay consistent.
- Game-specific play notes belong in memory/journal, not code.
