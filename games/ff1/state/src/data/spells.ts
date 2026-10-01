/**
 * Final Fantasy 1 (NES) spells.
 *
 * The game stores 64 spell records (8 per "spell level") in ROM. Each level
 * has 4 white-magic slots followed by 4 black-magic slots. In save RAM a
 * character's known spells are stored as level-relative indices 1-8 in the
 * first 3 bytes of each level's 4-byte slot group.
 *
 * The order below matches the spell constants in Entroper/FF1Disassembly's
 * Constants.inc (verified against the provided save state).
 */

export type SpellSchool = "white" | "black";

export interface SpellInfo {
  /** Logical spell id used by this package (0-63). */
  id: number;

  /** Display name. */
  name: string;

  /** Spell level (1-8). */
  level: number;

  /** Magic school. */
  school: SpellSchool;

  /** 1-based position within the level/school (1-4). */
  slot: number;
}

function levelSlot(id: number): { level: number; slot: number } {
  return {
    level: Math.floor(id / 8) + 1,
    slot: (id % 8) + 1,
  };
}

function makeSpell(id: number, name: string): SpellInfo {
  const { level, slot } = levelSlot(id);
  const school: SpellSchool = slot <= 4 ? "white" : "black";
  return { id, name, level, school, slot: slot <= 4 ? slot : slot - 4 };
}

export const SPELLS: readonly SpellInfo[] = [
  // Level 1
  makeSpell(0x00, "CURE"),
  makeSpell(0x01, "HARM"),
  makeSpell(0x02, "FOG"),
  makeSpell(0x03, "RUSE"),
  makeSpell(0x04, "FIRE"),
  makeSpell(0x05, "SLEP"),
  makeSpell(0x06, "LOCK"),
  makeSpell(0x07, "LIT"),

  // Level 2
  makeSpell(0x08, "LAMP"),
  makeSpell(0x09, "MUTE"),
  makeSpell(0x0a, "ALIT"),
  makeSpell(0x0b, "INVS"),
  makeSpell(0x0c, "ICE"),
  makeSpell(0x0d, "DARK"),
  makeSpell(0x0e, "TMPR"),
  makeSpell(0x0f, "SLOW"),

  // Level 3
  makeSpell(0x10, "CUR2"),
  makeSpell(0x11, "HRM2"),
  makeSpell(0x12, "AFIR"),
  makeSpell(0x13, "HEAL"),
  makeSpell(0x14, "FIR2"),
  makeSpell(0x15, "HOLD"),
  makeSpell(0x16, "LIT2"),
  makeSpell(0x17, "LOK2"),

  // Level 4
  makeSpell(0x18, "PURE"),
  makeSpell(0x19, "FEAR"),
  makeSpell(0x1a, "AICE"),
  makeSpell(0x1b, "AMUT"),
  makeSpell(0x1c, "SLP2"),
  makeSpell(0x1d, "FAST"),
  makeSpell(0x1e, "CONF"),
  makeSpell(0x1f, "ICE2"),

  // Level 5
  makeSpell(0x20, "CUR3"),
  makeSpell(0x21, "LIFE"),
  makeSpell(0x22, "HRM3"),
  makeSpell(0x23, "HEL2"),
  makeSpell(0x24, "FIR3"),
  makeSpell(0x25, "BANE"),
  makeSpell(0x26, "WARP"),
  makeSpell(0x27, "SLO2"),

  // Level 6
  makeSpell(0x28, "SOFT"),
  makeSpell(0x29, "EXIT"),
  makeSpell(0x2a, "FOG2"),
  makeSpell(0x2b, "INV2"),
  makeSpell(0x2c, "LIT3"),
  makeSpell(0x2d, "RUB"),
  makeSpell(0x2e, "QAKE"),
  makeSpell(0x2f, "STUN"),

  // Level 7
  makeSpell(0x30, "CUR4"),
  makeSpell(0x31, "HRM4"),
  makeSpell(0x32, "ARUB"),
  makeSpell(0x33, "HEL3"),
  makeSpell(0x34, "ICE3"),
  makeSpell(0x35, "BRAK"),
  makeSpell(0x36, "SABR"),
  makeSpell(0x37, "BLND"),

  // Level 8
  makeSpell(0x38, "LIF2"),
  makeSpell(0x39, "FADE"),
  makeSpell(0x3a, "WALL"),
  makeSpell(0x3b, "XFER"),
  makeSpell(0x3c, "NUKE"),
  makeSpell(0x3d, "STOP"),
  makeSpell(0x3e, "ZAP"),
  makeSpell(0x3f, "XXXX"),
];

export const WHITE_SPELLS: readonly SpellInfo[] = SPELLS.filter(
  (s) => s.school === "white"
);

export const BLACK_SPELLS: readonly SpellInfo[] = SPELLS.filter(
  (s) => s.school === "black"
);

/** Spells indexed by logical id. */
export const SPELLS_BY_ID: Readonly<Record<number, SpellInfo>> = Object.fromEntries(
  SPELLS.map((s) => [s.id, s])
);

/** Lookup a spell by logical id. */
export function getSpellById(id: number): SpellInfo | undefined {
  return SPELLS_BY_ID[id];
}

/**
 * Convert a RAM spell slot value to a logical spell id.
 *
 * Each level has 8 possible spell positions (4 white, then 4 black).
 * Values 1-3 are the normal white spells, 4 is the 4th white slot,
 * 5-7 are the normal black spells, and 8 is the 4th black slot.
 * A value of 0 means the slot is empty.
 */
export function getSpellIdFromRamSlot(level: number, ramValue: number): number | undefined {
  if (ramValue <= 0 || ramValue > 8) {
    return undefined;
  }
  return (level - 1) * 8 + (ramValue - 1);
}

/** Lookup spells by level and school. */
export function getSpellsByLevelAndSchool(
  level: number,
  school: SpellSchool
): readonly SpellInfo[] {
  return SPELLS.filter((s) => s.level === level && s.school === school);
}
