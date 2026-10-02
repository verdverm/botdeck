export * from "./nes/index.js";

export {
  CLASSES,
  CLASS_IDS,
  BASE_CLASSES,
  PROMOTED_CLASSES,
  getClassById,
} from "./data/classes.js";

export type { ClassInfo } from "./data/classes.js";

export {
  ITEMS,
  ITEMS_BY_ID,
  WEAPONS,
  ARMOR,
  SHIELDS,
  HELMETS,
  GAUNTLETS,
  CONSUMABLES,
  KEY_ITEMS,
  getWeaponById,
  getArmorById,
  getShieldById,
  getHelmetById,
  getGauntletById,
  getConsumableById,
  getKeyItemById,
  getItemById,
  getItemsByType,
} from "./data/items.js";

export type { ItemType, ItemInfo } from "./data/items.js";

export {
  SPELLS,
  SPELLS_BY_ID,
  WHITE_SPELLS,
  BLACK_SPELLS,
  getSpellById,
  getSpellsByLevelAndSchool,
} from "./data/spells.js";

export type { SpellSchool, SpellInfo } from "./data/spells.js";

export {
  STATUSES,
  STATUS_KEYS,
  STATUS_LIST,
  getStatusByKey,
} from "./data/status.js";

export type { StatusInfo } from "./data/status.js";

export {
  CURRENT_VEHICLE,
  OWNED_VEHICLES,
  CURRENT_VEHICLE_NAMES,
  getCurrentVehicleName,
  ownedVehicles,
  hasVehicleOwnership,
} from "./data/vehicles.js";

export type { CurrentVehicle } from "./data/vehicles.js";

export {
  TEXT_TABLE,
  TEXT_UNKNOWN,
  decodeTextByte,
  decodeText as decodeGameText,
  decodeName,
} from "./data/text.js";

export { ENEMIES, ENEMIES_BY_ID, getEnemyById, getEnemyNameById } from "./data/enemies.js";

export type { EnemyInfo } from "./data/enemies.js";

export { NPCS_BY_ID, getNpcById, getNpcNameById } from "./data/npcs.js";

export type { NpcInfo } from "./data/npcs.js";

export * from "./data/constants.js";

export type {
  Byte,
  Word,
  InventorySlot,
  CharacterRecord,
  PartySnapshot,
  WorldSnapshot,
  RawPartyNames,
  RawPartyClasses,
  RawCharacterStats,
  RawPartyStats,
  RawSpellsLearned,
  RawSpellCharges,
  RawEquipment,
} from "./data/types.js";

export * from "./ff1/index.js";
