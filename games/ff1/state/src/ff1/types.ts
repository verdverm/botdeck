import type { ClassInfo, ItemInfo, SpellInfo, StatusInfo } from "../data/index.js";

export interface CharacterStats {
  strength: number | undefined;
  agility: number | undefined;
  intelligence: number | undefined;
  vitality: number | undefined;
  luck: number | undefined;
  experience: number | undefined;
  damage: number | undefined;
  hitRate: number | undefined;
  absorb: number | undefined;
  evade: number | undefined;
  magicDefense: number | undefined;
  _rawBytes: Uint8Array;
  _note: string;
}

export interface SpellChargeLevel {
  level: number;
  current: number | undefined;
  max: number | undefined;
}

export interface SpellCharges {
  levels: SpellChargeLevel[];
  _rawBytes: Uint8Array;
  _note: string;
}

export interface CharacterStatus {
  ailments: StatusInfo[];
  raw: number;
  _note: string;
}

export interface CharacterEquipment {
  weapon: ItemInfo | undefined;
  armor: ItemInfo | undefined;
  shield: ItemInfo | undefined;
  helmet: ItemInfo | undefined;
  gauntlet: ItemInfo | undefined;
  rawWeapons: Uint8Array;
  rawArmor: Uint8Array;
  _note: string;
}

export interface PartyCharacter {
  index: number;
  name: string;
  classId: number;
  classInfo: ClassInfo | undefined;
  level: number | undefined;
  hp: number | undefined;
  maxHp: number | undefined;
  stats: CharacterStats | undefined;
  status: CharacterStatus | undefined;
  spellCharges: SpellCharges | undefined;
  spellsKnown: SpellInfo[];
  equipment: CharacterEquipment;
  raw: RawCharacterData;
}

export interface RawCharacterData {
  nameBytes: Uint8Array;
  statBytes: Uint8Array;
  spellsLearnedBytes: Uint8Array;
  spellChargeBytes: Uint8Array;
  equipmentWeaponBytes: Uint8Array;
  equipmentArmorBytes: Uint8Array;
}

export interface InventoryItem {
  slot: number;
  itemId: number;
  itemInfo: ItemInfo | undefined;
  quantity: number;
  /** Optional uncertainty note when the inventory layout is not fully verified. */
  _note?: string;
}

export interface MapObject {
  index: number;
  id: number;
  flags: number;
  physicalX: number;
  physicalY: number;
  graphicX: number;
  graphicY: number;
  facing: number;
  pl: number;
  rawBytes: Uint8Array;
}

export interface WorldState {
  mapId: number;
  mapName: string | undefined;
  isOverworld: boolean;
  isStandardMap: boolean;
  mapFlags: number;
  tilesetId: number;
  overworldX: number;
  overworldY: number;
  standardMapX: number;
  standardMapY: number;
  standardMapScrollX: number;
  standardMapScrollY: number;
  shipX: number | undefined;
  shipY: number | undefined;
  airshipX: number | undefined;
  airshipY: number | undefined;
  currentVehicle: string | undefined;
  ownedVehicles: string[];
  vehiclesRaw: number;
  hasCanoe: boolean;
  mapObjects: MapObject[];
  _note: string;
}

export interface GameFlags {
  raw: Uint8Array;
  hasLute: boolean | undefined;
  hasCrown: boolean | undefined;
  hasCrystal: boolean | undefined;
  hasHerb: boolean | undefined;
  hasMysticKey: boolean | undefined;
  hasTnt: boolean | undefined;
  hasAdamant: boolean | undefined;
  hasSlab: boolean | undefined;
  hasRuby: boolean | undefined;
  hasRod: boolean | undefined;
  hasFloater: boolean | undefined;
  hasChime: boolean | undefined;
  hasTail: boolean | undefined;
  hasCube: boolean | undefined;
  hasBottle: boolean | undefined;
  hasOxyale: boolean | undefined;
  hasCanoe: boolean | undefined;
  hasEarthOrb: boolean | undefined;
  hasFireOrb: boolean | undefined;
  hasWaterOrb: boolean | undefined;
  hasAirOrb: boolean | undefined;
  _note: string;
}

export interface FF1GameState {
  party: PartyCharacter[];
  gold: number;
  inventory: InventoryItem[];
  world: WorldState;
  flags: GameFlags;
}
