# Final Fantasy I (NES) Memory Layout

This document describes how Final Fantasy I stores its live and saved state in NES CPU RAM, based on the implementation in `@games/ff1-state`.

Address certainty markers:

- **VERIFIED** — confirmed by inspecting jsNES save states and cross-referencing the [Entroper/FF1Disassembly](https://github.com/Entroper/FF1Disassembly) source.
- **INFERRED** — taken from community documentation and disassemblies; believed correct but not fully exercised by this package.
- **TODO** — placeholder or uncertain; needs verification.

All addresses are CPU address-space offsets (`$0000`–`$FFFF`).

## Overview

FF1 keeps three distinct areas of state:

1. **Active save slot** — battery-backed work/save RAM (`unsram`) at `$6000`–`$63FF`. This holds party stats, inventory, gold, learned magic, and vehicle ownership. It is also the region persisted to cartridge battery RAM.
2. **Zero-page runtime state** — `$0000`–`$00FF`. This holds the current map, scroll position, player coordinates, vehicle in use, and other transient data that is *not* part of a save.
3. **Standard-map object/NPC table** — `$6F00`–`$6FFF`. Sixteen 16-byte object records used for NPCs, treasure chests, and other interactable entities on town/dungeon maps.

## Save state vs live RAM

A jsNES save-state object contains a full CPU memory snapshot. `state.cpu.mem` is a 64 KiB (`$10000` byte) array where index `n` corresponds to CPU address `$n`. The battery-backed region `saveRam` (`$6000`–`$7FFF`) is a slice of that same array; writes to `saveRam` are mirrored back into `cpu.mem` at the same offset.

For reading game state it is safest to use `createJsNesStateView(state)` or `createCpuMemoryView(state.cpu.mem)`, because live values such as player position live in zero-page RAM, outside the `$6000` save region.

## Active save slot layout (`unsram`, `$6000`–`$63FF`)

| Address | Size | Field | Description | Certainty |
|--------:|-----:|-------|-------------|-----------|
| `$6000` | 1 | shipVisibility | Nonzero when the party owns the ship. Also see `$6001`/`$6002` for its world coordinates. | VERIFIED |
| `$6001` | 1 | shipX | Ship X coordinate on the overworld. | VERIFIED |
| `$6002` | 1 | shipY | Ship Y coordinate on the overworld. | VERIFIED |
| `$6003` | 1 | — | Unused/unknown. | TODO |
| `$6004` | 1 | airshipVisibility | Nonzero when the party owns the airship. | VERIFIED |
| `$6005` | 1 | airshipX | Airship X coordinate on the overworld. | VERIFIED |
| `$6006` | 1 | airshipY | Airship Y coordinate on the overworld. | VERIFIED |
| `$6007`–`$600B` | 5 | — | Unused/unknown. | TODO |
| `$600C`–`$601B` | 16 | — | Unknown header bytes. | TODO |
| `$6012` | 1 | canoeOwnership | Nonzero when the party owns the canoe. | VERIFIED |
| `$601C` | 3 | gold | Party gold, 24-bit little-endian. | VERIFIED |
| `$601F` | 1 | — | Padding/unknown. | TODO |
| `$6020` | 1 | — | Padding/unknown. | TODO |
| `$6021`–`$6035` | 21 | keyItems | Key item flags, one byte each. Nonzero = owned. See `DATA_FORMATS.md` for the key-item order. | VERIFIED location |
| `$6036`–`$603B` | 6 | consumables | Consumable quantities, one byte each. See `DATA_FORMATS.md` for the consumable order. | VERIFIED location |
| `$603C`–`$60FF` | 196 | — | Unused/unknown padding. | TODO |
| `$6100`–`$613F` | 64 | characterStats[0] | Party member 0 stat block. See character stat block below. | VERIFIED |
| `$6140`–`$617F` | 64 | characterStats[1] | Party member 1 stat block. | VERIFIED |
| `$6180`–`$61BF` | 64 | Party member 2 stat block. | VERIFIED |
| `$61C0`–`$61FF` | 64 | Party member 3 stat block. | VERIFIED |
| `$6200`–`$62FF` | 256 | worldFlags | Progression / event flags. Location verified; individual bit meanings are mostly TODO/INFERRED. | INFERRED |
| `$6300`–`$633F` | 64 | characterMagic[0] | Party member 0 magic block. See character magic block below. | VERIFIED |
| `$6340`–`$637F` | 64 | Party member 1 magic block. | VERIFIED |
| `$6380`–`$63BF` | 64 | Party member 2 magic block. | VERIFIED |
| `$63C0`–`$63FF` | 64 | Party member 3 magic block. | VERIFIED |

The unsram region is `$400` bytes (`$6000`–`$63FF`). The full battery-backed save RAM (`saveRam`) extends to `$7FFF`, but the reader currently focuses on `$6000`–`$63FF`.

## Character stat block (`$40` bytes)

Each character occupies `$40` bytes, starting at `$6100`.

| Offset | Size | Field | Description | Certainty |
|-------:|-----:|-------|-------------|-----------|
| `$00` | 1 | classId | Character class. See `DATA_FORMATS.md`. | VERIFIED |
| `$01` | 1 | ailments | Status ailments bit field. See `DATA_FORMATS.md`. | VERIFIED |
| `$02`–`$05` | 4 | name | Character name, PPU tile indices. See `DATA_FORMATS.md` for text encoding. | VERIFIED |
| `$06` | 1 | — | Unused/unknown. | TODO |
| `$07`–`$09` | 3 | experience | Total experience, 24-bit little-endian. | VERIFIED |
| `$0A`–`$0B` | 2 | currentHp | Current HP, 16-bit little-endian. | VERIFIED |
| `$0C`–`$0D` | 2 | maxHp | Max HP, 16-bit little-endian. | VERIFIED |
| `$0E`–`$0F` | 2 | — | Unused/unknown. | TODO |
| `$10` | 1 | strength | Strength stat. | VERIFIED |
| `$11` | 1 | agility | Agility stat. | VERIFIED |
| `$12` | 1 | intelligence | Intelligence stat. | VERIFIED |
| `$13` | 1 | vitality | Vitality stat. | VERIFIED |
| `$14` | 1 | luck | Luck stat. | VERIFIED |
| `$15` | 1 | — | Unused/unknown. | TODO |
| `$16`–`$17` | 2 | expToNext | Display-only "EXP to next level", 16-bit little-endian. | VERIFIED |
| `$18`–`$1B` | 4 | equippedWeapons | 1-based relative weapon IDs. `0` = empty. Up to four weapons may be stored, but only the first non-empty slot is normally equipped. | VERIFIED |
| `$1C`–`$1F` | 4 | equippedArmor | 1-based relative armor IDs. `0` = empty. The four slots cover body armor, shield, helmet, and gauntlet, but the order is not positional; the reader resolves each ID against the equipment tables. | VERIFIED |
| `$20`–`$21` | 2 | damage | Calculated damage. | VERIFIED |
| `$22` | 1 | hitRate | Hit rate. | VERIFIED |
| `$23` | 1 | absorb | Absorb (defense). | VERIFIED |
| `$24` | 1 | evade | Evade. | VERIFIED |
| `$25` | 1 | magicDefense | Magic defense. | VERIFIED |
| `$26` | 1 | level | Level, 0-based out of battle. Add 1 for the displayed level. | VERIFIED |
| `$27`–`$3F` | 25 | — | Unused/unknown. | TODO |

## Character magic block (`$40` bytes)

Each character's magic data is `$40` bytes, starting at `$6300`.

| Offset | Size | Field | Description | Certainty |
|-------:|-----:|-------|-------------|-----------|
| `$00`–`$1F` | 32 | spellsKnown | Known spells. 8 levels × 4 bytes. The first 3 bytes of each level hold 1-based level-relative spell slot values; the 4th byte is padding. See `DATA_FORMATS.md` for spell-slot to spell-id mapping. | VERIFIED |
| `$20`–`$27` | 8 | currentMp | Current MP per spell level (1 byte per level). | VERIFIED |
| `$28`–`$2F` | 8 | maxMp | Max MP per spell level (1 byte per level). | VERIFIED |
| `$30`–`$3F` | 16 | — | Unused/unknown. | TODO |

## Zero-page runtime state

These addresses live in CPU RAM page 0 (`$0000`–`$00FF`) and are *not* saved to the battery-backed region. They describe the current map, camera scroll, player position, and vehicle.

| Address | Size | Field | Description | Certainty |
|--------:|-----:|-------|-------------|-----------|
| `$0027` | 1 | owX | Player X coordinate on the overworld. | VERIFIED |
| `$0028` | 1 | owY | Player Y coordinate on the overworld. | VERIFIED |
| `$0029` | 1 | smScrollX | Standard-map camera scroll X, in tiles. The visible player sprite is at `scrollX + 7`. | VERIFIED |
| `$002A` | 1 | smScrollY | Standard-map camera scroll Y, in tiles. | VERIFIED |
| `$002D` | 1 | mapFlags | Map context flags. Bit 0 set = standard map (town/dungeon); clear = overworld. | VERIFIED |
| `$0042` | 1 | vehicle | Current vehicle. See `DATA_FORMATS.md` for values. | VERIFIED |
| `$0048` | 1 | curMap | Current standard-map ID. Only meaningful when `mapFlags` bit 0 is set. | VERIFIED |
| `$0049` | 1 | curTileset | Current tileset ID. | VERIFIED |
| `$0068` | 1 | smX | Player collision X on standard maps. | VERIFIED |
| `$0069` | 1 | smY | Player collision Y on standard maps. | VERIFIED |

## Menu / battle-menu runtime state

Menu identity in FF1 is call-stack state: there is no "menu open" or "which menu" byte anywhere (VERIFIED by bank_0E/bank_0F read-through). The reader therefore combines the bytes below with nametable text decoding (see `src/ff1/dialog.ts` `detectBattleMenuWindow`; battle box geometry VERIFIED from bank_0F luts `lua_BattleCommandBoxInfo` $3FA2B, `lut_CombatItemMagicBox` $3FA26, `lut_CombatDrinkBox` $3FA16).

| Address | Size | Field | Description | Certainty |
|--------:|-----:|-------|-------------|-----------|
| `$004B` | 1 | music_track | Set to `$51` by EnterMainMenu (bank_0E:6158); used as the field-menu-open proxy (`== $51 && !battle && !shop`). | VERIFIED (set) / INFERRED (persistence) |
| `$0062` | 1 | cursor | Field menu cursor. SHARED zero page (`lu_cursor2`, `shutter_b`, `theend_src`); only meaningful while its menu is open; packed 4-col grid in the magic menu, paired with `$63` in equip. | VERIFIED (shared) |
| `$0063` | 1 | cursor_max | Item count for main/item/shop menus; REPURPOSED as secondary cursor (`cursor2`/`lu_mode`) by magic/equip - not a range there. | VERIFIED (shared) |
| `$007F` | 1 | descboxopen | In-menu item/magic DESCRIPTION box counter (INC bank_0E:8480, cleared 6812/6348/8071). Never set for NPC dialogue (ShowDialogueBox has no flag) - do not use as a dialog-open signal. | VERIFIED |
| `$6AAA` | 1 | btlcurs_x | Battle cursor X. Command menu: 2 cols (0=FIGHT column, 1=RUN); magic menu: 3 cols. Zeroed on menu entry. | VERIFIED (bank_0C MenuSelection_2x4 / MenuSelection_Magic) |
| `$6AAB` | 1 | btlcurs_y | Battle cursor Y (4 rows per menu, masked at confirm). | VERIFIED |
| `$6AE3`/`$6AE4` | 2 | btlcursspr_x/y | Cursor sprite pixel position, updated by whichever battle menu is polling. | VERIFIED |
| `$6AF8` | 1 | magic page | Magic menu page 0/1. SHARED with `btl_combatboxcount` - only valid while the magic menu is open. | VERIFIED (shared) |
| `$6B7B` | 1 | btlcmd_target | Enemy slot under the target cursor, written by SelectEnemyTarget (bank_0C:1960/1986). Stale outside target selection. | VERIFIED (write) / INFERRED (lifetime) |

## Standard-map object / NPC table (`$6F00`–`$6FFF`)

The game keeps 16 object records at `$6F00`. Each record is 16 bytes. Slots with `id == 0` are empty and are ignored by the reader.

| Offset | Size | Field | Description | Certainty |
|-------:|-----:|-------|-------------|-----------|
| `$00` | 1 | id | Object/NPC ID. `0` = empty slot. | VERIFIED |
| `$01` | 1 | flags | Object flags (movement, visibility, etc.). Bit meanings are INFERRED/TODO. | INFERRED |
| `$02` | 1 | physicalX | Physical/collision X coordinate. | VERIFIED |
| `$03` | 1 | physicalY | Physical/collision Y coordinate. | VERIFIED |
| `$04` | 1 | graphicX | Graphic/sprite X coordinate. | VERIFIED |
| `$05` | 1 | graphicY | Graphic/sprite Y coordinate. | VERIFIED |
| `$06`–`$0B` | 6 | — | Unknown. | TODO |
| `$0C` | 1 | facing | Facing direction. | VERIFIED address |
| `$0D` | 1 | pl | Palette or extra property byte. | VERIFIED address |
| `$0E`–`$0F` | 2 | — | Unknown. | TODO |

## jsNES-specific notes

jsNES serializes emulator state roughly like this:

```ts
interface JsNesState {
  cpu: { mem: Uint8Array };
  ppu?: unknown;
  apu?: unknown;
  mmap?: unknown;
}
```

- `state.cpu.mem` is the full 64 KiB NES CPU address space.
- `state.cpu.mem[0x6000]` is the first byte of the active save slot.
- The `saveRam` field in some jsNES forks is the `$2000`-byte slice `$6000`–`$7FFF`. Because it is a view into the same backing memory, `saveRam[n]` and `cpu.mem[0x6000 + n]` always match.

When reading live game state, always build a `MemoryView` from the full CPU memory snapshot so that zero-page runtime state and the `$6F00` object table are accessible in addition to the `$6000` save region.

## References

- [Entroper/FF1Disassembly](https://github.com/Entroper/FF1Disassembly) — authoritative NES FF1 disassembly.
- `src/data/constants.ts` — constants from this package.
- `DATA_FORMATS.md` — encoding details for text, classes, items, spells, statuses, and vehicles.
