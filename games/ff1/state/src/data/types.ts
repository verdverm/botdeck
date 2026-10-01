/**
 * Final Fantasy 1 (NES) TypeScript type definitions.
 *
 * These types describe raw records as they appear in RAM. They are
 * platform-agnostic and do not depend on any emulator access layer.
 */

import type { ItemInfo } from './items.js';
import type { SpellInfo } from './spells.js';
import type { ClassInfo } from './classes.js';

/** A raw 8-bit memory byte. */
export type Byte = number;

/** A raw 16-bit memory word. */
export type Word = number;

/** Raw party name buffer: 4 names, 4 bytes each. */
export type RawPartyNames = [Byte, Byte, Byte, Byte][];

/** Raw class ids for the 4 party members. */
export type RawPartyClasses = [Byte, Byte, Byte, Byte];

/**
 * Raw 64-byte character stat block.
 */
export type RawCharacterStats = Byte[];

/** Raw stat blocks for all 4 party members. */
export type RawPartyStats = [
  RawCharacterStats,
  RawCharacterStats,
  RawCharacterStats,
  RawCharacterStats,
];

/**
 * Raw spells-learned buffer for one character.
 * 32 bytes = 8 levels x 4 bytes; first 3 bytes of each level are spell slots.
 */
export type RawSpellsLearned = Byte[];

/**
 * Raw spell-charge buffer for one character.
 * 64 bytes; current MP at +$20 and max MP at +$28.
 */
export type RawSpellCharges = Byte[];

/**
 * Raw equipment buffer for one character.
 * 4 weapon bytes + 4 armor bytes.
 */
export type RawEquipment = Byte[];

/**
 * One inventory slot as a decoded (id, quantity) pair.
 */
export interface InventorySlot {
  /** Raw item id. */
  itemId: Byte;

  /** Stack quantity. */
  quantity: Byte;
}

/** Decoded inventory. */
export type Inventory = InventorySlot[];

/** Decoded character record. */
export interface CharacterRecord {
  /** 0-based party index. */
  index: number;

  /** Character name (already decoded). */
  name: string;

  /** Class info, if the raw class id is known. */
  classInfo?: ClassInfo;

  /** Raw class id. */
  classId: Byte;

  /** Raw 64-byte stat block. */
  rawStats: RawCharacterStats;

  /** Raw spells learned buffer. */
  rawSpellsLearned: RawSpellsLearned;

  /** Raw spell charges. */
  rawSpellCharges: RawSpellCharges;

  /** Raw equipment bytes. */
  rawEquipment: RawEquipment;

  /** Decoded known spells. */
  spells?: SpellInfo[];

  /** Decoded equipped items. */
  equipment?: (ItemInfo | undefined)[];
}

/** Decoded party snapshot. */
export interface PartySnapshot {
  /** Party members in order. */
  characters: CharacterRecord[];

  /** Decoded gold amount. */
  gold: number;
}

/** Decoded world/vehicle snapshot. */
export interface WorldSnapshot {
  /** Current map id. */
  mapId: Byte;

  /** Party world-map X coordinate. */
  worldX: Byte;

  /** Party world-map Y coordinate. */
  worldY: Byte;

  /** Ship X coordinate, if applicable. */
  shipX?: Byte;

  /** Ship Y coordinate, if applicable. */
  shipY?: Byte;

  /** Airship X coordinate, if applicable. */
  airshipX?: Byte;

  /** Airship Y coordinate, if applicable. */
  airshipY?: Byte;

  /** Raw vehicle ownership byte. */
  vehiclesRaw: Byte;
}
