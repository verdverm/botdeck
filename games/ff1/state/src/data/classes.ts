/**
 * Final Fantasy 1 (NES) player classes.
 *
 * Class IDs are the raw values stored at ADDR_PARTY_CLASSES.
 * Source: standard FF1 class ordering (community docs, INFERRED).
 */

export interface ClassInfo {
  /** Raw class id stored in save RAM. */
  id: number;

  /** Display name of the class. */
  name: string;

  /** True if this is a promoted (prestige) class. */
  promoted: boolean;

  /** For promoted classes, the base class id before promotion. */
  baseClassId?: number;
}

export const CLASSES: Readonly<Record<number, ClassInfo>> = {
  0x00: { id: 0x00, name: 'Fighter', promoted: false },
  0x01: { id: 0x01, name: 'Thief', promoted: false },
  0x02: { id: 0x02, name: 'Black Belt', promoted: false },
  0x03: { id: 0x03, name: 'Red Mage', promoted: false },
  0x04: { id: 0x04, name: 'White Mage', promoted: false },
  0x05: { id: 0x05, name: 'Black Mage', promoted: false },

  0x06: { id: 0x06, name: 'Knight', promoted: true, baseClassId: 0x00 },
  0x07: { id: 0x07, name: 'Ninja', promoted: true, baseClassId: 0x01 },
  0x08: { id: 0x08, name: 'Master', promoted: true, baseClassId: 0x02 },
  0x09: { id: 0x09, name: 'Red Wizard', promoted: true, baseClassId: 0x03 },
  0x0a: { id: 0x0a, name: 'White Wizard', promoted: true, baseClassId: 0x04 },
  0x0b: { id: 0x0b, name: 'Black Wizard', promoted: true, baseClassId: 0x05 },
};

/** Array of all class ids in ascending order. */
export const CLASS_IDS: readonly number[] = Object.keys(CLASSES)
  .map((k) => parseInt(k, 10))
  .sort((a, b) => a - b);

/** Array of base (unpromoted) classes. */
export const BASE_CLASSES: readonly ClassInfo[] = CLASS_IDS
  .map((id) => CLASSES[id])
  .filter((c): c is ClassInfo => c !== undefined && !c.promoted);

/** Array of promoted classes. */
export const PROMOTED_CLASSES: readonly ClassInfo[] = CLASS_IDS
  .map((id) => CLASSES[id])
  .filter((c): c is ClassInfo => c !== undefined && c.promoted);

/** Lookup a class by raw id. Returns undefined if unknown. */
export function getClassById(id: number): ClassInfo | undefined {
  return CLASSES[id];
}
