/**
 * Final Fantasy 1 (NES) object/NPC labels for the special object IDs used by
 * the talk-to-object jump table.
 *
 * Object IDs index the ROM object table and are stored in the live map object
 * list at $6F00.  Only a small set of IDs are unique named NPCs; most generic
 * townspeople share the Talk_norm handler and have no unique identity in RAM.
 *
 * Source: FF1Disassembly Constants.inc and bank_0E.asm TalkRoutines.
 */

export interface NpcInfo {
  id: number;
  name: string;
}

const KNOWN_NPCS: readonly NpcInfo[] = [
  { id: 0x01, name: "King of Coneria" },
  { id: 0x02, name: "Garland" },
  { id: 0x03, name: "Kidnapped Princess" },
  { id: 0x04, name: "Bikke the Pirate" },
  { id: 0x05, name: "Elf Doctor" },
  { id: 0x06, name: "Elf Prince" },
  { id: 0x07, name: "Astos" },
  { id: 0x08, name: "Nerrick" },
  { id: 0x09, name: "Smith" },
  { id: 0x0a, name: "Matoya" },
  { id: 0x0b, name: "Dr. Unne" },
  { id: 0x0c, name: "Vampire" },
  { id: 0x0d, name: "Sarda" },
  { id: 0x0e, name: "Bahamut" },
  { id: 0x10, name: "Submarine Engineer" },
  { id: 0x12, name: "Rescued Princess" },
  { id: 0x13, name: "Fairy" },
  { id: 0x14, name: "Titan" },
  { id: 0x16, name: "Rod Plate" },
  { id: 0x17, name: "Lute Plate" },
  { id: 0x3a, name: "Sky Warrior" },
  { id: 0x3b, name: "Sky Warrior" },
  { id: 0x3c, name: "Sky Warrior" },
  { id: 0x3d, name: "Sky Warrior" },
  { id: 0x3e, name: "Sky Warrior" },
  { id: 0x3f, name: "Townsperson" },
  { id: 0x40, name: "Townsperson" },
  { id: 0x41, name: "Townsperson" },
  { id: 0x57, name: "Bat" },
  { id: 0xca, name: "Black Orb" },
];

export const NPCS_BY_ID: Readonly<Record<number, NpcInfo>> = Object.fromEntries(
  KNOWN_NPCS.map((n) => [n.id, n]),
);

/** Look up a display label for a map object ID. Returns undefined for generic objects. */
export function getNpcById(id: number): NpcInfo | undefined {
  return NPCS_BY_ID[id];
}

export function getNpcNameById(id: number): string | undefined {
  return getNpcById(id)?.name;
}
