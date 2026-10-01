/**
 * Final Fantasy 1 (NES) memory map constants.
 *
 * Address certainty:
 * - VERIFIED: offsets confirmed by active inspection of the provided jsNES save
 *             state and cross-checked against the Entroper/FF1Disassembly source.
 * - INFERRED: offsets taken from community documentation; should be double-checked.
 * - TODO: placeholder / uncertain; needs verification.
 *
 * All addresses are CPU RAM offsets. Character/magic data lives in the
 * battery-backed "unsram" region starting at $6000.
 *
 * Authoritative disassembly references:
 *   unsram          = $6000
 *   ch_stats        = unsram + $0100
 *   ch_magicdata    = unsram + $0300
 *   game_flags      = unsram + $0200
 */

/** Base of the battery-backed save/work RAM. (VERIFIED) */
export const SAVE_SLOT_BASE = 0x6000;

/** Size of the unsram region in bytes. (VERIFIED) */
export const SAVE_SLOT_SIZE = 0x400;

/** Number of playable characters in the party. */
export const PARTY_SIZE = 4;

/** Length of a character name in bytes. (VERIFIED) */
export const NAME_LENGTH = 4;

/** Stride between character stat blocks. (VERIFIED) */
export const CHAR_STATS_STRIDE = 0x40;

/** Stride between character magic blocks. (VERIFIED) */
export const CHAR_MAGIC_STRIDE = 0x40;

// ===========================================================================
// VERIFIED addresses
// ===========================================================================

/**
 * Character stat blocks start at $6100 and repeat every $40 bytes.
 *
 * Layout (per character):
 *   +$00 class
 *   +$01 ailments
 *   +$02 - +$05 name (4 bytes, PPU tile indices)
 *   +$06 unused?
 *   +$07 - +$09 experience (24-bit little-endian)
 *   +$0A - +$0B current HP (16-bit little-endian)
 *   +$0C - +$0D max HP (16-bit little-endian)
 *   +$0E - +$0F unused?
 *   +$10 strength
 *   +$11 agility
 *   +$12 intelligence
 *   +$13 vitality
 *   +$14 luck
 *   +$15 unused?
 *   +$16 - +$17 exp to next level (16-bit little-endian, display only)
 *   +$18 - +$1B equipped weapons (4 bytes, 1-based relative weapon IDs)
 *   +$1C - +$1F equipped armor (4 bytes, 1-based relative armor IDs)
 *   +$20 - +$21 damage
 *   +$22 hit rate
 *   +$23 absorb
 *   +$24 evade
 *   +$25 magic defense
 *   +$26 level (0-based out of battle)
 */
export const ADDR_CHAR_STATS = 0x6100;

/** Offset of class id within a character stat block. */
export const CHAR_CLASS_OFFSET = 0x00;
/** Offset of status ailments byte within a character stat block. */
export const CHAR_AILMENTS_OFFSET = 0x01;
/** Offset of name bytes within a character stat block. */
export const CHAR_NAME_OFFSET = 0x02;
/** Offset of total experience within a character stat block. */
export const CHAR_EXP_OFFSET = 0x07;
/** Size of total experience in bytes. */
export const CHAR_EXP_SIZE = 3;
/** Offset of current HP within a character stat block. */
export const CHAR_CURHP_OFFSET = 0x0a;
/** Offset of max HP within a character stat block. */
export const CHAR_MAXHP_OFFSET = 0x0c;
/** Size of HP values in bytes. */
export const CHAR_HP_SIZE = 2;
/** Offset of strength within a character stat block. */
export const CHAR_STR_OFFSET = 0x10;
/** Offset of agility within a character stat block. */
export const CHAR_AGI_OFFSET = 0x11;
/** Offset of intelligence within a character stat block. */
export const CHAR_INT_OFFSET = 0x12;
/** Offset of vitality within a character stat block. */
export const CHAR_VIT_OFFSET = 0x13;
/** Offset of luck within a character stat block. */
export const CHAR_LUCK_OFFSET = 0x14;
/** Offset of "EXP to next level" within a character stat block. */
export const CHAR_EXPTONEXT_OFFSET = 0x16;
/** Size of "EXP to next level" in bytes. */
export const CHAR_EXPTONEXT_SIZE = 2;
/** Offset of equipped weapon slots within a character stat block. */
export const CHAR_WEAPONS_OFFSET = 0x18;
/** Offset of equipped armor slots within a character stat block. */
export const CHAR_ARMOR_OFFSET = 0x1c;
/** Number of weapon and armor slots each character has. */
export const CHAR_EQUIPMENT_SLOTS = 4;
/** Offset of damage within a character stat block. */
export const CHAR_DMG_OFFSET = 0x20;
/** Offset of hit rate within a character stat block. */
export const CHAR_HITRATE_OFFSET = 0x21;
/** Offset of absorb within a character stat block. */
export const CHAR_ABSORB_OFFSET = 0x22;
/** Offset of evade within a character stat block. */
export const CHAR_EVADE_OFFSET = 0x23;
/** Offset of magic defense within a character stat block. */
export const CHAR_MAGDEF_OFFSET = 0x25;
/** Offset of level within a character stat block. */
export const CHAR_LEVEL_OFFSET = 0x26;

/**
 * Gold: $601C-$601E (24-bit little-endian). (VERIFIED)
 *
 * Confirmed against both the disassembly (gold = unsram + $1C) and the
 * observed save-state value.
 */
export const ADDR_GOLD = 0x601c;
export const GOLD_SIZE = 3;

/**
 * Magic data starts at $6300 and repeats every $40 bytes per character.
 *
 * Layout (per character):
 *   +$00 - +$1F spells known (32 bytes = 8 levels x 4 bytes; first 3 bytes of
 *          each level are known spell slots, the 4th byte is padding)
 *   +$20 - +$27 current MP per level (8 bytes)
 *   +$28 - +$2F max MP per level (8 bytes)
 */
export const ADDR_CHAR_MAGIC = 0x6300;

export const SPELL_DATA_SIZE = 0x20;
export const SPELL_LEVEL_COUNT = 8;
export const SPELL_LEVEL_SIZE = 4;
export const SPELL_SLOTS_PER_LEVEL = 3;
export const SPELL_MP_CURRENT_OFFSET = 0x20;
export const SPELL_MP_MAX_OFFSET = 0x28;
export const SPELL_MP_SIZE = 8;

/**
 * Key-item flags and consumable quantities live in the first $40 bytes of
 * unsram.
 *
 *   $6021-$6035 : key item flags (one byte each, nonzero = owned)
 *   $6036-$603B : consumable quantities
 */
export const ADDR_ITEMS = 0x6020;

export const KEY_ITEM_COUNT = 21;
export const ADDR_KEY_ITEM_START = 0x6021;
export const CONSUMABLE_COUNT = 6;
export const ADDR_CONSUMABLE_START = 0x6036;

// Ship/airship/bridge/canal visibility and coordinates (VERIFIED)
/** Ship ownership/visibility byte. Nonzero = owned. */
export const ADDR_SHIP_VIS = 0x6000;
/** Ship overworld X coordinate. */
export const ADDR_SHIP_X = 0x6001;
/** Ship overworld Y coordinate. */
export const ADDR_SHIP_Y = 0x6002;
/** Airship ownership/visibility byte. Nonzero = owned. */
export const ADDR_AIRSHIP_VIS = 0x6004;
/** Airship overworld X coordinate. */
export const ADDR_AIRSHIP_X = 0x6005;
/** Airship overworld Y coordinate. */
export const ADDR_AIRSHIP_Y = 0x6006;
/** Canoe ownership byte. Nonzero = owned. */
export const ADDR_HAS_CANOE = 0x6012;

// Vehicle state (VERIFIED from variables.inc)
/** Current vehicle byte. */
export const ADDR_VEHICLE = 0x0042;

// Map / position state (VERIFIED)
/** Player X coordinate on the overworld. */
export const ADDR_OW_X = 0x0027;
/** Player Y coordinate on the overworld. */
export const ADDR_OW_Y = 0x0028;
/** Standard-map camera scroll X in tiles; player sprite is at scroll + 7. */
export const ADDR_SM_SCROLL_X = 0x0029;
/** Standard-map camera scroll Y in tiles. */
export const ADDR_SM_SCROLL_Y = 0x002a;
/** Player collision X on standard maps. */
export const ADDR_SM_X = 0x0068;
/** Player collision Y on standard maps. */
export const ADDR_SM_Y = 0x0069;
/** Current standard-map ID; only meaningful when mapflags bit 0 is set. */
export const ADDR_MAP_ID = 0x0048;
/** Current tileset ID. */
export const ADDR_CUR_TILESET = 0x0049;

// Map context flags (VERIFIED).  Bit 0 = standard map (town/dungeon); clear = overworld.
/** Map context flags byte. */
export const ADDR_MAPFLAGS = 0x002d;
/** Bit 0 set = standard map (town/dungeon); clear = overworld. */
export const MAPFLAG_STANDARD = 0x01;

// Standard-map objects / NPCs live at $6F00.  16 objects, 16 bytes each. (VERIFIED)
/** Base address of the standard-map object/NPC table. */
export const ADDR_MAP_OBJECTS = 0x6f00;
/** Number of object slots in the standard-map object table. */
export const MAP_OBJECT_COUNT = 16;
/** Size of each standard-map object record in bytes. */
export const MAP_OBJECT_STRIDE = 16;
/** Offset of object id within a map object record. */
export const MAPOBJ_ID_OFFSET = 0x00;
/** Offset of object flags within a map object record. */
export const MAPOBJ_FLAGS_OFFSET = 0x01;
/** Offset of physical X coordinate within a map object record. */
export const MAPOBJ_PHYS_X_OFFSET = 0x02;
/** Offset of physical Y coordinate within a map object record. */
export const MAPOBJ_PHYS_Y_OFFSET = 0x03;
/** Offset of graphic X coordinate within a map object record. */
export const MAPOBJ_GFX_X_OFFSET = 0x04;
/** Offset of graphic Y coordinate within a map object record. */
export const MAPOBJ_GFX_Y_OFFSET = 0x05;
/** Offset of facing direction within a map object record. */
export const MAPOBJ_FACE_OFFSET = 0x0c;
/** Offset of palette/property byte within a map object record. */
export const MAPOBJ_PL_OFFSET = 0x0d;

// Progression / event flags (VERIFIED location, INFERRED bit meanings)
export const ADDR_WORLD_FLAGS = 0x6200;
export const WORLD_FLAGS_SIZE = 0x100;

// ===========================================================================
// DEPRECATED / INCORRECT offsets kept out of the active reader.
// These were the original assumptions from community docs and are left here
// only so callers looking at older commits can see what changed.
// ===========================================================================

export const ADDR_PARTY_NAMES = ADDR_CHAR_STATS + CHAR_NAME_OFFSET;
export const ADDR_PARTY_CLASSES = ADDR_CHAR_STATS + CHAR_CLASS_OFFSET;
export const ADDR_SPELLS_LEARNED = ADDR_CHAR_MAGIC;
export const ADDR_SPELL_CHARGES = ADDR_CHAR_MAGIC + SPELL_MP_CURRENT_OFFSET;
export const ADDR_EQUIPMENT = ADDR_CHAR_STATS + CHAR_WEAPONS_OFFSET;
export const ADDR_INVENTORY = ADDR_ITEMS;
