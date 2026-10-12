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
/**
 * Overworld camera scroll X in tiles ($0027, `ow_scroll_x`). This is the
 * top-left tile of the screen, NOT the party's position: the party is always
 * drawn 7 tiles in from each edge (`OWCanMove @Calc`, bank_0F.asm:1086), so
 * `player = scroll + OW_PLAYER_OFFSET`.
 */
export const ADDR_OW_X = 0x0027;
/** Overworld camera scroll Y in tiles ($0028, `ow_scroll_y`). See ADDR_OW_X. */
export const ADDR_OW_Y = 0x0028;
/**
 * Offset from the overworld scroll to the party's own tile, on both axes.
 * VERIFIED: `OWCanMove @Calc` adds `#7` to `ow_scroll_x/y` to locate the tile
 * the party stands on, and every teleport table stores player coords that are
 * `scroll + 7` (the code subtracts 7 to recover the scroll).
 */
export const OW_PLAYER_OFFSET = 7;
/** The overworld is a 256x256 tile grid that wraps on both axes. */
export const OW_MAP_SIZE = 256;
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
/**
 * mapflags ($2D) bit 1. In the disassembly this is the "draw column" map mode,
 * but it is empirically set for the whole battle screen and clear once the
 * party is back on the field (VERIFIED against the recorded battle
 * save-states: battle frames always read $02/$03, post-battle field reads
 * $00/$01). Use it to tell "the battle screen is drawn" apart from "the game
 * is in battle" - btl_result and enemy HP go stale for many frames after the
 * battle ends.
 */
export const MAPFLAG_BATTLE_SCREEN = 0x02;

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
/** Offset of raw object ID (from ROM object table) within a map object record. */
export const MAPOBJ_RAWID_OFFSET = 0x0a;

// Progression / event flags (VERIFIED location, INFERRED bit meanings)
export const ADDR_WORLD_FLAGS = 0x6200;
export const WORLD_FLAGS_SIZE = 0x100;

// ===========================================================================
// Battle state (VERIFIED against FF1Disassembly variables.inc)
// btl_enemystats starts at $6BD3 and has 9 records of $14 bytes each.
// btl_result ($6B86) is 0 while battle is active, nonzero when ending.
// ===========================================================================

/** Battle result / in-battle indicator. 0 = active, nonzero = ending. */
export const ADDR_BATTLE_RESULT = 0x6b86;
/** Number of enemies generated for the current battle. */
export const ADDR_BATTLE_ENEMY_COUNT = 0x6c93;
/** Start of live enemy stat records ($6BD3). */
export const ADDR_BATTLE_ENEMIES = 0x6bd3;
/** Stride of one live enemy record. */
export const BATTLE_ENEMY_STRIDE = 0x14;
/** Offset of the enemy ID within a live enemy record. */
export const BATTLE_ENEMY_ID_OFFSET = 0x11;
/** Offset of current HP within a live enemy record. */
export const BATTLE_ENEMY_HP_OFFSET = 0x02;
/** Index of the party member currently selecting a battle command. */
export const ADDR_BATTLE_ACTIVE_INDEX = 0x6b7a;
/**
 * btl_curturn ($688E): the turn-order cursor for the current round. It is 0 at
 * the start of a round and advances through the btl_turnorder list as the game
 * resolves queued actions. Once the round is exhausted the game leaves this
 * value at (or past) the turn-order length, so a value >= 13 means "no action
 * is currently resolving" - the reliable round-executing vs command-window
 * discriminator. VERIFIED against FF1Disassembly variables.inc and the
 * recorded battle save-states (btl_turnorder has $D = 13 entries).
 */
export const ADDR_BATTLE_TURNORDER_INDEX = 0x688e;
/** Number of btl_turnorder entries (9 enemies + 4 characters). */
export const BATTLE_TURNORDER_LEN = 0x0d;
/** Battle menu cursor X (menu position). */
export const ADDR_BATTLE_CURSOR_X = 0x6aaa;
/** Battle menu cursor Y (menu position). */
export const ADDR_BATTLE_CURSOR_Y = 0x6aab;
/**
 * btl_battletype ($6C92): formation layout, 0=9-small, 1=4-large, 2=mix,
 * 3=fiend, 4=chaos. VERIFIED against FF1Disassembly variables.inc.
 */
export const ADDR_BATTLE_TYPE = 0x6c92;

/**
 * Cursor-order-to-enemy-slot tables for each multi-target formation, taken
 * verbatim from the ROM's `lut_EnemyIndex9Small` / `lut_EnemyIndex4Large` /
 * `lut_EnemyIndexMix` (FF1Disassembly bank_0C.asm $9FF7). Enemy-target
 * selection (`SelectEnemyTarget`) runs a single linear cursor (`btlcurs`,
 * $6AAA) through this order, skipping empty/dead slots, UP/DOWN only, with
 * wraparound at `btlcurs_max`. The order is NOT row-major: in the 9-small
 * layout enemy slot 0 is drawn center-row but the first cursor stop is slot 1.
 * Fiend/Chaos formations have a single auto-target (no menu), so they map to
 * the trivial `[0]` order.
 */
export const BATTLE_ENEMY_CURSOR_ORDER: Readonly<Record<number, readonly number[]>> = {
  0: [1, 0, 2, 4, 3, 5, 7, 6, 8],
  1: [0, 1, 2, 3],
  2: [0, 1, 3, 2, 4, 6, 5, 7],
  3: [0],
  4: [0],
};

/**
 * Ally target order. `SelectPlayerTarget` mirrors a 2x4 command menu down one
 * column (lut_PlayerTargetCursorPos), so the cursor advances strictly through
 * party index 0..3 with DOWN (row index & 3 wraps).
 */
export const BATTLE_ALLY_CURSOR_ORDER: readonly number[] = [0, 1, 2, 3];

/**
 * Per-character battle command buffer.
 *
 * Each character has 4 bytes (3 used, 1 padding) starting at $688F:
 *   +$00 command code: 00/01/02 = none (asleep/stunned/dead/stone),
 *                       04 = attack, 08 = drink, 10 = use item, 20 = run, 40 = magic
 *   +$01 effect/spell ID (FF if unused)
 *   +$02 target: 0x00-0x08 = enemy slot, 0x80-0x83 = player slot,
 *               0xFF = all enemies, 0xFE = all players
 *
 * Derived buffers (contiguous in RAM due to clear loops):
 *   $689F = item ID for command 0x10 (1 byte per character)
 *   $68A3 = consume type: 01 magic, 02 drink (1 byte per character)
 *   $68A7 = consume ID: spell level for magic, potion index for drink (1 byte per character)
 *
 * Documented in FF1Disassembly variables.inc.
 */
export const ADDR_BATTLE_CHAR_CMDBUF = 0x688f;
export const BATTLE_CHAR_CMD_STRIDE = 4;
export const BATTLE_CHAR_CMD_COMMAND_OFFSET = 0;
export const BATTLE_CHAR_CMD_EFFECT_OFFSET = 1;
export const BATTLE_CHAR_CMD_TARGET_OFFSET = 2;
export const ADDR_BATTLE_CHAR_CMD_ITEM = 0x689f;
export const ADDR_BATTLE_CHAR_CMD_CONSUME_TYPE = 0x68a3;
export const ADDR_BATTLE_CHAR_CMD_CONSUME_ID = 0x68a7;

// ===========================================================================
// Menu / shop state (VERIFIED against FF1Disassembly variables.inc)
// entering_shop ($50), shop_id ($51), and shop_type ($66) are set when the
// party is in a shop/inn/clinic/caravan.  The generic menu cursor lives at $62.
// ===========================================================================

/** Nonzero when the party is about to enter / is inside a shop menu. */
export const ADDR_ENTERING_SHOP = 0x50;
/** Shop ID being entered. */
export const ADDR_SHOP_ID = 0x51;
/** Shop type: 0=weapon,1=armor,2=white magic,3=black magic,4=clinic,5=inn,6=item,7=caravan. */
export const ADDR_SHOP_TYPE = 0x66;
/** Generic menu cursor position ($62, shared by main/item/equip menus). */
export const ADDR_MENU_CURSOR = 0x62;
/**
 * Menu row count / cursor maximum ($63). Zero on the open field, nonzero when
 * a list window (main menu, shop buy list, etc.) is drawn. OBSERVED against a
 * controlled field->START-open transition in the emulator; not yet confirmed in
 * the disassembly.
 */
export const ADDR_MENU_CURSOR_MAX = 0x63;
/**
 * Window/overlay id ($1f). 64 (0x40) on a plain field; 1 while a menu window is
 * drawn. OBSERVED against a controlled field->START-open transition; the field
 * value is not perfectly stable across all overworld tiles, so treat nonzero
 * here as a weak signal to combine with the cursor bytes.
 */
export const ADDR_WINDOW_ID = 0x1f;
/**
 * Menu overlay state byte ($67). Bit 7 (0x80) is set while the main menu or an
 * in-map window is open. OBSERVED: 0 on the plain field, 0xC0 when the START
 * menu is open; also set for inn/clinic windows (which are caught earlier by
 * entering_shop).
 */
export const ADDR_MENU_OVERLAY = 0x67;
/** Bit within $67 that marks an open window/menu overlay. */
export const MENU_OVERLAY_WINDOW_BIT = 0x80;
/** Shop cursor X ($64). */
export const ADDR_SHOP_CURSOR_X = 0x64;
/** Shop cursor Y ($65). */
export const ADDR_SHOP_CURSOR_Y = 0x65;
/** Object index currently being talked to on a standard map ($67). */
export const ADDR_TALK_OBJECT = 0x67;
/**
 * Menu item/magic DESCRIPTION box counter ($7F, `descboxopen` in
 * variables.inc). INCed by DrawItemDescBox (bank_0E:8480), cleared by
 * EnterItemMenu / EnterMagicMenu / CloseDescBox. VERIFIED: this flags the
 * in-menu description box only. It is NOT set for NPC dialogue boxes
 * (ShowDialogueBox sets no persistent flag), so it must not be used as a
 * "dialog open" signal.
 */
export const ADDR_DESC_BOX_OPEN = 0x7f;
/**
 * Current music track ($4B, `music_track`). EnterMainMenu sets it to $51
 * (bank_0E:6158) and it runs through all field submenus. VERIFIED as set;
 * its persistence across every submenu is INFERRED. Used as the field-menu
 * open proxy: music_track == $51 && !inBattle && !entering_shop.
 */
export const ADDR_MUSIC_TRACK = 0x4b;
export const MUSIC_TRACK_FIELD_MENU = 0x51;

/**
 * Battle command-buffer target ($6B7B, `btlcmd_target`). During
 * SelectEnemyTarget this holds the enemy slot the target cursor is currently
 * on (bank_0C SelectEnemyTarget stores it at :1960/:1986). Lifetime outside
 * target selection is INFERRED/stale; only trust it while a target cursor is
 * on screen.
 */
export const ADDR_BATTLE_TARGET = 0x6b7b;
/**
 * Battle cursor sprite pixel position ($6AE3/$6AE4, `btlcursspr_x/y`).
 * Updated every frame by the active battle menu routine from btlcurs_x/y,
 * so it tracks whichever menu is currently polling input. VERIFIED in
 * MenuSelection_2x4 / MenuSelection_Magic (bank_0C).
 */
export const ADDR_BATTLE_CURSOR_SPR_X = 0x6ae3;
export const ADDR_BATTLE_CURSOR_SPR_Y = 0x6ae4;
/**
 * Magic menu page ($6AF8). MenuSelection_Magic sets it to 0/1 on entry and
 * on page flip (bank_0C:2032+). SHARED with `btl_combatboxcount`
 * (variables.inc:670): only meaningful while the magic menu is open.
 */
export const ADDR_BATTLE_MAGIC_PAGE = 0x6af8;

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
