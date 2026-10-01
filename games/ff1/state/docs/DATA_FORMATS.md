# Final Fantasy I (NES) Data Formats

Reference for the encodings used by FF1 RAM values read by `@games/ff1-state`.

## Text encoding

Character names are stored as PPU tile indices, not ASCII. The tables below are the US Final Fantasy font layout used by this package (`src/data/text.ts`).

### Digits

| Tile | Character |
|------|-----------|
| `$80` | `0` |
| `$81` | `1` |
| `$82` | `2` |
| `$83` | `3` |
| `$84` | `4` |
| `$85` | `5` |
| `$86` | `6` |
| `$87` | `7` |
| `$88` | `8` |
| `$89` | `9` |

### Uppercase letters

| Tile | Character |
|------|-----------|
| `$8A`–`$A3` | `A`–`Z` |

### Lowercase letters

| Tile | Character |
|------|-----------|
| `$A4`–`$BD` | `a`–`z` |

### Punctuation

| Tile | Character |
|------|-----------|
| `$BE` | `"` |
| `$BF` | `,` |
| `$C0` | `.` |
| `$C1` | ` ` (space) |
| `$C2` | `-` |
| `$C4` | `!` |
| `$C5` | `?` |
| `$FF` | ` ` (duplicate space, used as padding) |

A byte that is not mapped is rendered as `?`. Name buffers are fixed-length (4 bytes) and terminate at the first `$FF` byte; `$00` is the digit `0`, not a terminator.

## Class IDs

Stored at offset `$00` of each character stat block.

| ID | Name | Promoted | Base class |
|----|------|----------|------------|
| `$00` | Fighter | No | — |
| `$01` | Thief | No | — |
| `$02` | Black Belt | No | — |
| `$03` | Red Mage | No | — |
| `$04` | White Mage | No | — |
| `$05` | Black Mage | No | — |
| `$06` | Knight | Yes | Fighter |
| `$07` | Ninja | Yes | Thief |
| `$08` | Master | Yes | Black Belt |
| `$09` | Red Wizard | Yes | Red Mage |
| `$0A` | White Wizard | Yes | White Mage |
| `$0B` | Black Wizard | Yes | Black Mage |

## Item IDs

FF1 uses **relative** IDs for equipment and **absolute** small IDs for consumables and key items.

### Weapons (relative 1-based IDs)

| ID | Name |
|----|------|
| `$00` | Nothing |
| `$01` | Wooden Nunchuck |
| `$02` | Small Knife |
| `$03` | Wooden Staff |
| `$04` | Rapier |
| `$05` | Iron Hammer |
| `$06` | Short Sword |
| `$07` | Hand Axe |
| `$08` | Scimitar |
| `$09` | Iron Nunchuck |
| `$0A` | Large Knife |
| `$0B` | Iron Staff |
| `$0C` | Sabre |
| `$0D` | Long Sword |
| `$0E` | Great Axe |
| `$0F` | Falchion |
| `$10` | Silver Knife |
| `$11` | Silver Sword |
| `$12` | Silver Hammer |
| `$13` | Silver Axe |
| `$14` | Flame Sword |
| `$15` | Ice Sword |
| `$16` | Dragon Sword |
| `$17` | Giant Sword |
| `$18` | Sun Sword |
| `$19` | Coral Sword |
| `$1A` | Were Sword |
| `$1B` | Rune Sword |
| `$1C` | Power Staff |
| `$1D` | Light Axe |
| `$1E` | Heal Staff |
| `$1F` | Mage Staff |
| `$20` | Wizard Staff |
| `$21` | Vorpal Sword |
| `$22` | CatClaw |
| `$23` | Thor Hammer |
| `$24` | Bane Sword |
| `$25` | Katana |
| `$26` | Xcalber |
| `$27` | Masamune |

### Body armor (relative 1-based IDs)

| ID | Name |
|----|------|
| `$00` | Nothing |
| `$01` | Cloth |
| `$02` | Wooden Armor |
| `$03` | Chain Armor |
| `$04` | Iron Armor |
| `$05` | Steel Armor |
| `$06` | Silver Armor |
| `$07` | Flame Armor |
| `$08` | Ice Armor |
| `$09` | Opal Armor |
| `$0A` | Dragon Armor |
| `$0B` | Copper Bracelet |
| `$0C` | Silver Bracelet |
| `$0D` | Gold Bracelet |
| `$0E` | Opal Bracelet |
| `$0F` | White Shirt |
| `$10` | Black Shirt |

### Shields, helmets, gauntlets (relative 1-based IDs)

These share the same 1-based ID space with body armor. In memory the four armor slots are not typed; the reader resolves each ID against the armor/shield/helmet/gauntlet tables.

| ID | Type | Name |
|----|------|------|
| `$11` | Shield | Wooden Shield |
| `$12` | Shield | Iron Shield |
| `$13` | Shield | Silver Shield |
| `$14` | Shield | Flame Shield |
| `$15` | Shield | Ice Shield |
| `$16` | Shield | Opal Shield |
| `$17` | Shield | Aegis Shield |
| `$18` | Shield | Buckler |
| `$19` | Shield | ProCape |
| `$1A` | Helmet | Cap |
| `$1B` | Helmet | Wooden Helmet |
| `$1C` | Helmet | Iron Helmet |
| `$1D` | Helmet | Silver Helmet |
| `$1E` | Helmet | Opal Helmet |
| `$1F` | Helmet | Heal Helmet |
| `$20` | Helmet | Ribbon |
| `$21` | Gauntlet | Gloves |
| `$22` | Gauntlet | Copper Gauntlet |
| `$23` | Gauntlet | Iron Gauntlet |
| `$24` | Gauntlet | Silver Gauntlet |
| `$25` | Gauntlet | Zeus Gauntlet |
| `$26` | Gauntlet | Power Gauntlet |
| `$27` | Gauntlet | Opal Gauntlet |
| `$28` | Gauntlet | ProRing |

### Consumables (absolute IDs, `$6036`–`$603B`)

| ID | Name |
|----|------|
| `$00` | Tent |
| `$01` | Cabin |
| `$02` | Cottage |
| `$03` | Potion |
| `$04` | Pure |
| `$05` | Soft |

### Key items (absolute IDs, `$6021`–`$6035`)

| ID | Name |
|----|------|
| `$00` | Lute |
| `$01` | Crown |
| `$02` | Crystal |
| `$03` | Herb |
| `$04` | Mystic Key |
| `$05` | Tnt |
| `$06` | Adamant |
| `$07` | Slab |
| `$08` | Ruby |
| `$09` | Rod |
| `$0A` | Floater |
| `$0B` | Chime |
| `$0C` | Tail |
| `$0D` | Cube |
| `$0E` | Bottle |
| `$0F` | Oxyale |
| `$10` | Canoe |
| `$11` | Fire Orb |
| `$12` | Water Orb |
| `$13` | Air Orb |
| `$14` | Earth Orb |

## Spell IDs and RAM slot mapping

The ROM stores 64 spells as 8 levels of 8 spells each. Within a level, the first 4 spells are white magic and the last 4 are black magic.

### Logical spell IDs (`$00`–`$3F`)

| Level | White | Black |
|-------|-------|-------|
| 1 | `$00` CURE, `$01` HARM, `$02` FOG, `$03` RUSE | `$04` FIRE, `$05` SLEP, `$06` LOCK, `$07` LIT |
| 2 | `$08` LAMP, `$09` MUTE, `$0A` ALIT, `$0B` INVS | `$0C` ICE, `$0D` DARK, `$0E` TMPR, `$0F` SLOW |
| 3 | `$10` CUR2, `$11` HRM2, `$12` AFIR, `$13` HEAL | `$14` FIR2, `$15` HOLD, `$16` LIT2, `$17` LOK2 |
| 4 | `$18` PURE, `$19` FEAR, `$1A` AICE, `$1B` AMUT | `$1C` SLP2, `$1D` FAST, `$1E` CONF, `$1F` ICE2 |
| 5 | `$20` CUR3, `$21` LIFE, `$22` HRM3, `$23` HEL2 | `$24` FIR3, `$25` BANE, `$26` WARP, `$27` SLO2 |
| 6 | `$28` SOFT, `$29` EXIT, `$2A` FOG2, `$2B` INV2 | `$2C` LIT3, `$2D` RUB, `$2E` QAKE, `$2F` STUN |
| 7 | `$30` CUR4, `$31` HRM4, `$32` ARUB, `$33` HEL3 | `$34` ICE3, `$35` BRAK, `$36` SABR, `$37` BLND |
| 8 | `$38` LIF2, `$39` FADE, `$3A` WALL, `$3B` XFER | `$3C` NUKE, `$3D` STOP, `$3E` ZAP, `$3F` XXXX |

### RAM slot values

A character's known-spell area stores a **1-based level-relative slot** in the first 3 bytes of each 4-byte level group. Use the formula:

```
logicalId = (level - 1) * 8 + (ramValue - 1)
```

| RAM value | Meaning |
|-----------|---------|
| `$00` | Empty slot |
| `$01`–`$04` | White magic slots 1–4 of the level |
| `$05`–`$08` | Black magic slots 1–4 of the level |
| `$FF` | Empty / padding (treated as empty) |

## Status ailment bit flags

Stored at offset `$01` of each character stat block.

| Bit | Mask | Key | Name | Persistent |
|----:|-----:|-----|------|------------|
| 0 | `$01` | dead | KO | Yes |
| 1 | `$02` | stone | Stone | Yes |
| 2 | `$04` | poison | Poison | Yes |
| 3 | `$08` | dark | Darkness | Yes |
| 4 | `$10` | stun | Stun | No |
| 5 | `$20` | sleep | Sleep | No |
| 6 | `$40` | mute | Mute | Yes |
| 7 | `$80` | confuse | Confusion | No |

## Vehicle byte format

### Current vehicle (`$0042`)

Only one bit is expected to be set at a time.

| Value | Name |
|------:|------|
| `$01` | Foot |
| `$02` | Canoe |
| `$04` | Ship |
| `$08` | Airship |

### Vehicle ownership (`unsram`)

| Address | Vehicle | Meaning |
|--------:|---------|---------|
| `$6000` | Ship | Nonzero = owned |
| `$6004` | Airship | Nonzero = owned |
| `$6012` | Canoe | Nonzero = owned |

## Gold 24-bit little-endian

Gold is stored at `$601C`–`$601E`:

```
gold = mem[$601C] | (mem[$601D] << 8) | (mem[$601E] << 16)
```

The game caps gold at 999,999 (`$000F423F`), so the high byte is effectively never greater than `$0F`.

## Inventory slot format

The reader returns a flat list of `InventoryItem` objects. The list is ordered as:

1. Consumables in ID order (`Tent`, `Cabin`, `Cottage`, `Potion`, `Pure`, `Soft`).
2. Key items in ID order (`Lute` through `Earth Orb`).

Each entry contains:

- `slot` — position in the returned list.
- `itemId` — raw ID stored in RAM.
- `itemInfo` — looked-up display name/category.
- `quantity` — for consumables this is the stack count; for key items any nonzero value means "owned".

Equipment is not stored in the shared inventory; it lives in per-character weapon/armor slots.

## References

- `src/data/text.ts` — text decoder.
- `src/data/classes.ts` — class table.
- `src/data/items.ts` — weapon, armor, consumable, and key-item tables.
- `src/data/spells.ts` — spell table and RAM-slot conversion.
- `src/data/status.ts` — status ailment masks.
- `src/data/vehicles.ts` — vehicle constants.
- `MEMORY_LAYOUT.md` — where each value lives in RAM.
