/**
 * Final Fantasy 1 (NES) status ailments.
 *
 * Bit positions are taken from the Entroper/FF1Disassembly Constants.inc
 * (verified against the character ailment byte at offset $01).
 */

export interface StatusInfo {
  /** Internal key. */
  key: string;

  /** Display name. */
  name: string;

  /** True if the ailment persists outside of battle. */
  persistent: boolean;

  /** True if the ailment can be healed by item/spells. */
  curable: boolean;

  /** Bit mask in the character ailment byte. */
  mask: number;
}

export const STATUSES: Readonly<Record<string, StatusInfo>> = {
  dead: { key: "dead", name: "KO", persistent: true, curable: true, mask: 0x01 },
  stone: { key: "stone", name: "Stone", persistent: true, curable: true, mask: 0x02 },
  poison: { key: "poison", name: "Poison", persistent: true, curable: true, mask: 0x04 },
  dark: { key: "dark", name: "Darkness", persistent: true, curable: true, mask: 0x08 },
  stun: { key: "stun", name: "Stun", persistent: false, curable: true, mask: 0x10 },
  sleep: { key: "sleep", name: "Sleep", persistent: false, curable: true, mask: 0x20 },
  mute: { key: "mute", name: "Mute", persistent: true, curable: true, mask: 0x40 },
  confuse: { key: "confuse", name: "Confusion", persistent: false, curable: true, mask: 0x80 },
};

/** All status keys. */
export const STATUS_KEYS: readonly string[] = Object.keys(STATUSES);

/** All status entries. */
export const STATUS_LIST: readonly StatusInfo[] = Object.values(STATUSES);

/** Lookup a status by key. */
export function getStatusByKey(key: string): StatusInfo | undefined {
  return STATUSES[key];
}
