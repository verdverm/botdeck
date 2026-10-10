# Final Fantasy I (NES) Map / Navigation Design

Research notes and implementation plan for `goto` pathfinding (TODO #4, #6). Source of
truth for every ROM claim: `.extern/FF1Disassembly/Final Fantasy Disassembly` (Entroper),
cross-checked against the live `game.nes` header and the dev save state
(`plays/ff1/0000_dev`). Certainty markers follow the other docs: **VERIFIED / INFERRED / TODO**.

## 1. Requirements (agreed with user)

- One-time **extraction into our own `gamedata`** (a new, self-owned source). Not the guide
  images (PNG/JPG only, no coordinates), not runtime ROM parsing.
- Start with the **overworld only**. Towns and dungeons are N additional maps later.
- `goto(location)` takes a **destination location** and runs **A\* to it, emitting the full
  path regardless of distance**, as one macro. It is *not* the current "press A if already
  adjacent" stub.
- Interrupt model: a random battle aborts the macro; the bot loop re-reads state on the next
  turn and hands control back to the agent, who re-decides (re-`goto` / heal / etc.). Because
  `goto` re-paths from the party's *current* `overworldX/Y` every call, drift and aborts are
  self-correcting on the next `goto`.

## 2. Coordinate system (VERIFIED)

- Overworld player position: `$0027` (X), `$0028` (Y), bytes `0x00-0xFF`
  (`ADDR_OW_X`/`ADDR_OW_Y`; `variables.inc: ow_scroll_x/ow_scroll_y`).
- The world is a **256x256 tile grid**. Dev save reads `overworldX=146, overworldY=158`
  (Corneria area), confirming tile-scale units.
- The visible screen is 16x16 tiles; the player is drawn at `scroll + 7` in each axis
  (see `OWCanMove @Calc`: base offset `#7`, disasm `bank_0F.asm:1086+`).
- Standard maps (towns/dungeons) use a *separate* coordinate space: scroll `$0029/$002A`,
  collision `sm_player_x/y $0068/$0069`, `cur_map $0048`, `mapflags $002D` bit 0. Out of scope
  for the first implementation.

## 3. Where the map data lives in ROM (VERIFIED)

The full 256x256 grid is **not resident in RAM at once**. `mapdata` (`$7000`, `variables.inc:810`)
holds only a rolling **16-row window** (`$7x00-$7xFF`, where `x` = low nibble of the row). As the
player moves vertically, `LoadOWMapRow` (`bank_0F.asm:4171+`) decompresses the next row into the
window.

To extract the complete grid offline we decompress all 256 rows ourselves:

- **Overworld map bank:** `BANK_OWMAP = $01` (`Constants.inc:89`).
- **Row pointer table:** `lut_OWPtrTbl = $8000` in `BANK_OWMAP` (`Constants.inc:449`),
  **256 rows x 2 bytes = 512 bytes** (low byte then high byte, LSB-first), each pointing at that
  row's compressed map data.
- **Decompression:** `DecompressMap` (`bank_0F.asm`); note `bank_01.asm:8016+` has a near-copy
  that reads `lut_OWPtrTbl` directly for the overworld rows. Port `DecompressMap`'s RLE to the
  extractor. Each decompressed row = 256 tile-ID bytes.

- **Overworld tileset (collision) data:** loaded by `LoadOWTilesetData` (`bank_0F.asm:645`) from
  `BANK_OWINFO`, source `lut_OWTileset = $8000` (`Constants.inc:469`), copying `$400` bytes into
  `tileset_data` (`$0400`). Within that buffer, `tileset_prop` (`= tileset_data`,
  `variables.inc:279`) is the **first 256 entries x 2 bytes** = 512 bytes of per-tile properties.
  So tile ID -> `tileset_prop[tileID*2]`, `tileset_prop[tileID*2+1]`.

- **Minimap tile classifier:** `lut_MinimapTileset` (`bank_09.asm:5106`, ROM `$27F90`), one byte
  per overworld tile. Low 2 bits = color; **bit 2 (`$04`) set = this tile is a town/dungeon
  (a marker sprite is drawn).** Useful for auto-detecting entrance tiles for the location table.

## 4. Walkability rule (VERIFIED, `bank_0F.asm:1086` `OWCanMove`)

For a target tile with `byte0 = tileset_prop[tileID*2]`:

```
blocked  = (byte0 & currentVehicleMask) != 0
```

`currentVehicleMask` is the `vehicle` byte `$0042` (`ADDR_VEHICLE`), one-hot
(`DATA_FORMATS.md`): Foot `$01`, Canoe `$02`, Ship `$04`, Airship `$08`.

Extra rules (foot only, `tileprop+1` / special bits):
- `OWTP_SPEC_FLOATER` (`$C0`) / `_CHIME` (`$40`) / `_CARAVAN` (`$80`) gate certain tiles
  (`Constants.inc:332-339`). For a first pass, ignore special tiles beyond the base mask.
- **Airship (`$08`): `OWCanMove` short-circuits and allows movement anywhere** (no collision) —
  confirmed at `bank_0F.asm:551`. Pathfinding for airship can return a straight/diagonal-free path.
- Random-encounter bit (`tileprop+1` bit 6) marks tiles where battles may trigger — informational,
  not a wall.

## 5. Current code to change

- `packages/botdeck/src/games/ff1.ts` `compileGoto()` — stub: `void command; return [pressA()]`.
  Replace with path resolution (see §6).
- `games/ff1/state/src/ff1/reader.ts`:
  - `getAvailableLocations()` and `KNOWN_LOCATIONS` — no `position` filled; the `KnownLocation.position?:
    {x,y}` field already exists in `types.ts` but is never populated. Fill entrance coordinates here.
  - `reachability()` — returns only `same-map/reachable/unknown`; upgrade to real connectivity once
    the grid exists. `TODO_LOCATION_NOTE` explicitly says "not modeled yet".
- `field.md` prompt: remove the "only triggers a transition when already at the destination tile"
  caveat once `goto` is real.

## 6. Implementation plan

**Phase A - Extraction (new, one-time, into `gamedata/`)**
1. Add `games/ff1/state/src/data/` (or a sibling `map/` module) with:
   - a `DecompressMap` port (RLE) matching the disasm,
   - an extractor that reads `lut_OWPtrTbl` (512 bytes) + `lut_OWTileset` tileset block +
     `lut_MinimapTileset` straight from `game.nes`, producing:
     - `overworld-tiles.json` (256x256 tile IDs),
     - `overworld-tileset-prop.json` (256x2 byte properties for the OW tileset),
     - `overworld-entrances.json` (name -> `{x,y}` for town/dungeon marker tiles).
2. **Verify** decompression against the live emulator: boot `game.nes`, read the resident `mapdata`
   window at a known `overworldX/Y`, compare to the extractor output for those rows. This removes
   the RLE-format unknown.

**Phase B - Grid + A\* (in `@games/ff1-state`, platform-agnostic, tested)**
3. `WorldGrid` type: tile IDs + `isWalkable(x,y,vehicleMask)` + entrance lookups.
4. `findPath(grid, from, to, vehicleMask)` -> A* (Manhattan adjacency, 4-dir) returning the tile
   path. Handle "no path with current vehicle" as an explicit result (do not lie).
5. Populate `KnownLocation.position` from `overworld-entrances.json`; make `getAvailableLocations`
   return real coordinates + correct `reachable` via a grid connectivity check.

**Phase C - Execution (in `packages/botdeck/src/games/ff1.ts`)**
6. `compileGoto(command)`: resolve the named location to an entrance tile, read current
   `overworldX/Y` from `readState()`, run `findPath`, and emit directional `ButtonStep`s that walk
   the full path. A* gives a tile-by-tile route; convert each step to a direction press using the
   existing `navigateDirection`/`press` helpers in `ff1-menu.ts`.
7. Movement-timing calibration: a single `press` holds `HOLD_FRAMES=4`; measure how many tiles that
   actually moves (may need multiple holds per tile). Tune `HOLD/GAP_FRAMES` for overworld movement
   so a step reliably advances exactly one tile. (This is the main runtime unknown; needs a live
   probe, tracked as a sub-task.)

**Phase D - Prompt/UI**
8. Update `field.md` (goto = real pathfinding to a named destination).
9. `LocationTab` already renders coordinates/entrances — wire it to the new populated `position`
   data and optionally draw the path.

## 7. Open questions / risks

- **Movement granularity** (Phase C step 7): tiles-per-button-hold is not yet measured. Until known,
  exact one-tile steps are guesswork. Needs a live headless/browser probe. This is the single
  biggest implementation risk.
- **RLE format** of `DecompressMap`: must be ported exactly or the grid is wrong; verify per Phase A
  step 2 before building A* on top.
- **Ship/canoe/airship boarding:** entering a town by land vs. arriving by ship uses different
  entrance tiles. First pass = foot only; document as TODO.
- Towns/dungeons (standard maps) are deferred; `goto` into a building interior is out of scope for
  the overworld-only first pass.
```