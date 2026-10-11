# AGENTS

Final Fantasy I (NES, MMC1) game data, prompt snippets, map data, guide, and state
reader. This directory is the per-game half of the botdeck harness: the browser
package (packages/botdeck) consumes the maps and the state reader package, and
vermbot (packages/vermbot) consumes the config and prompt snippets.

## Key files

- `config.json` - game config. `agent` block (model, maxToolRounds, maxTokens,
  timeoutMs, limits, recentHistoryLimit, tools whitelist) and `prompt.modes`
  defining the overworld / interior / shop / battle modes and their ordered
  systemSnippets / userSnippets snippet lists. Merged field-by-field with a
  play's config.json by vermbot's resolveAgentConfig.
- `prompts/*.md` - game-default prompt snippets (system, game-info, commands,
  state, tools, goals, memory, journal, plus the per-mode mode snippets
  overworld / interior / shop / battle). Templates support double-brace
  placeholders; vermbot renders them per turn over the state/context bundle.
- `plays/ff1/<id>/snippets/user/<name>.md` - per-play snippet overrides that
  shadow the game defaults here (same name wins); a missing override falls
  back to `games/ff1/prompts/<name>.md`.
- `state/` - `@games/ff1-state` workspace package (see `state/AGENTS.md` and
  `state/README.md`). Reads FF1 state out of live jsNES CPU RAM or save states;
  consumed by botdeck (workspace dep) and vermbot (link dep).
- `maps/` - extracted tile grids and renders, produced by `scripts/` from
  `game.nes` and verified against the Entroper FF1 disassembly
  (`.extern/FF1Disassembly`).
- `guide/` - RPG Site FF1 walkthrough capture and processed markdown.
- `scripts/` - one-shot ROM extraction, inspection, probe, and verify utilities.
- `game.nes` - the ROM (gitignored; required by every `scripts/*.mjs`).
- `splash.png` - game art served by vermbot's `/api/games/:game/splash`.

## Maps

- `maps/overworld.json` - game-ready 256x256 overworld grid: tiles, per-tile
  properties (blockMask, special, minimap glyph, per-vehicle passability), and
  the location list built from entrance-teleport tables.
- `maps/overworld.raw.json` - the raw extracted grid (tiles + tileProps only,
  no locations) kept alongside the game-ready file.
- `maps/overworld.txt` - ASCII render of overworld.json: terrain glyphs,
  entrance locations, legend.
- `maps/<name>.json` / `<name>.txt` - one pair per standard map (town, castle,
  or dungeon floor): tiles, per-tile tileset properties, teleport locations,
  and POIs; the txt is an ASCII render with legend. Map IDs 0x00-0x0C have
  ROM-verified names; the rest were inferred from the teleport graph and
  walkthrough and are flagged `nameVerified: false`.

Consumption: botdeck's navigation (`packages/botdeck/src/games/ff1-nav.ts`) is
the consumer, and its A* over these grids compiles goto macros. The grids are
imported statically through the tsconfig alias
`@games/ff1-map/* -> games/ff1/maps/*` (an alias, not an npm package) and are
never fetched over the /api file proxy.

## Scripts (Node .mjs, run from `games/ff1/scripts/`)

All read the gitignored `../game.nes` and comment every ROM claim against the
Entroper disassembly (`bank_XX.asm` line references). Categories:

- `extract-*` - producers: `extract-ow-map.mjs` writes overworld.json/.txt,
  `extract-sm-map.mjs` writes the standard-map set, `extract-locations.mjs`
  builds the overworld location tables (now merged into overworld.json's
  `locations`).
- `check-*` - validators on the extracted artifacts (nav sanity, overworld
  integrity, special/quest-gated tiles).
- `inspect-*` - ROM data dumps to plan/debug extraction (ptr tables, minimap
  nametable, standard-map teleport graph, anchors, census).
- `probe-*` - emulator probes: movement timing (frames per tile by vehicle),
  drift, freeze/stuck diagnosis, end-to-end goto macro check. These live-drive
  a jsNES core and recorded save states.
- `verify-*` - cross-checks the extracted grid against the live emulator's
  resident `mapdata` window after walking.
- `find-names.mjs`, `names-context.mjs` - decode FF1 font-encoded text runs in
  PRG to locate the in-ROM source of map names.
- `ff1-lib.mjs` - shared helpers: ROM loading, MMC1 bank/PRG offset math, tile
  tables, teleport tables, text decoding, map-name constants.

Producers are the source of truth for everything in `maps/`; hand-editing a
map json is not allowed. Regenerate with node instead and re-run the check and
verify scripts.

## Guide

- `guide/raw/` - self-contained snapshot: crawled HTML pages and images from
  the RPG Site FF1 guide set (capture via `guide/crawl.py`).
- `guide/process.py` - converts `raw/` into `guide/main/`, numbered markdown
  00-24 with copied images, cross-links resolved to local files.
- `guide/main/README.md` - index; `24-maps.md` is the named-map reference the
  map name inference cross-checks against.

The guide is reference data for agents and humans; it is not parsed at runtime.

## State package

`@games/ff1-state` is the workspace package (see its own `state/AGENTS.md`):
- `src/nes/` - MemoryView over jsNES CPU memory and save states, raw read
  helpers, GameGenie decode/encode/patch.
- `src/data/` - constants and lookup tables (classes, items, spells, statuses,
  vehicles, enemies, NPCS from `npcs.ts`, text encoding) and room-level memory
  constants.
- `src/ff1/` - FF1 reader, human-readable formatter, state differ, dialog
  decoder.
- `src/index.ts` - public API; `@games/ff1-state/data` is a subpath export.
- `docs/MEMORY_LAYOUT.md`, `docs/DATA_FORMATS.md`, `docs/MAP_NAV.md` - memory
  addresses and data formats with VERIFIED / INFERRED / TODO markers; the
  disassembly is the source of truth for ROM claims.
- `workflows/` - runnable examples (read a save state, apply a GameGenie patch,
  analyze an initd state file).
- `src/**/*.test.ts` - vitest suites for reader, diff, dialog, formatting,
  battle phases.

## Commands

- `pnpm --filter @games/ff1-state typecheck` (or `build`, identical
  tsc --noEmit)
- `pnpm --filter @games/ff1-state test` - vitest
- `node <script>.mjs` - scripts, from `games/ff1/scripts/` (require
  `../game.nes`)

## Rules

- `game.nes` is gitignored and must never be committed; only configs, guides,
  prompts, maps, and code are tracked.
- `maps/*.json` are generated artifacts: regenerate them with the extract
  scripts and the verify/probe checks; never hand-edit.
- ROM-derived claims (offsets, bit positions, names) must be annotated with
  their disassembly evidence. Keep VERIFIED / INFERRED / TODO markers honest;
  remove TODO/INFERRED only when cross-checked against the disassembly or
  known-good save states.
- Prompt snippets may be overridden per play only via
  `plays/ff1/<id>/snippets/user/`. There is also a per-play prompt-template
  layer for browser-side templates; game-level templates stay in `prompts/`.
- The browser never touches the ROM or `fs`: everything reaches the agent
  through vermbot's /api proxy (config, prompts, plays, state reader package),
  except the statically imported map grids.
- Public exports of `@games/ff1-state` live in `src/index.ts`; internal helpers
  stay out of the package surface.
