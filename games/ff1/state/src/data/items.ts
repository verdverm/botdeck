/**
 * Final Fantasy 1 (NES) item tables.
 *
 * Equipment IDs in save RAM are relative to the weapon/armor tables:
 *   - weapon slots use 1-based weapon IDs (0 = nothing)
 *   - armor slots use 1-based armor IDs (0 = nothing)
 *
 * Consumables and key items use the small IDs stored in the unsram item area.
 */

export type ItemType =
  | "weapon"
  | "armor"
  | "shield"
  | "helmet"
  | "gauntlet"
  | "consumable"
  | "key";

export interface ItemInfo {
  /** Item id as stored in the relevant RAM region. */
  id: number;

  /** Display name. */
  name: string;

  /** Broad category. */
  type: ItemType;

  /** True if the item is usable in battle or from the menu. */
  usable?: boolean;
}

export const WEAPONS: readonly ItemInfo[] = [
  { id: 0x00, type: "weapon", name: "Nothing" },
  { id: 0x01, type: "weapon", name: "Wooden Nunchuck" },
  { id: 0x02, type: "weapon", name: "Small Knife" },
  { id: 0x03, type: "weapon", name: "Wooden Staff" },
  { id: 0x04, type: "weapon", name: "Rapier" },
  { id: 0x05, type: "weapon", name: "Iron Hammer" },
  { id: 0x06, type: "weapon", name: "Short Sword" },
  { id: 0x07, type: "weapon", name: "Hand Axe" },
  { id: 0x08, type: "weapon", name: "Scimitar" },
  { id: 0x09, type: "weapon", name: "Iron Nunchuck" },
  { id: 0x0a, type: "weapon", name: "Large Knife" },
  { id: 0x0b, type: "weapon", name: "Iron Staff" },
  { id: 0x0c, type: "weapon", name: "Sabre" },
  { id: 0x0d, type: "weapon", name: "Long Sword" },
  { id: 0x0e, type: "weapon", name: "Great Axe" },
  { id: 0x0f, type: "weapon", name: "Falchion" },
  { id: 0x10, type: "weapon", name: "Silver Knife" },
  { id: 0x11, type: "weapon", name: "Silver Sword" },
  { id: 0x12, type: "weapon", name: "Silver Hammer" },
  { id: 0x13, type: "weapon", name: "Silver Axe" },
  { id: 0x14, type: "weapon", name: "Flame Sword" },
  { id: 0x15, type: "weapon", name: "Ice Sword" },
  { id: 0x16, type: "weapon", name: "Dragon Sword" },
  { id: 0x17, type: "weapon", name: "Giant Sword" },
  { id: 0x18, type: "weapon", name: "Sun Sword" },
  { id: 0x19, type: "weapon", name: "Coral Sword" },
  { id: 0x1a, type: "weapon", name: "Were Sword" },
  { id: 0x1b, type: "weapon", name: "Rune Sword" },
  { id: 0x1c, type: "weapon", name: "Power Staff" },
  { id: 0x1d, type: "weapon", name: "Light Axe" },
  { id: 0x1e, type: "weapon", name: "Heal Staff" },
  { id: 0x1f, type: "weapon", name: "Mage Staff" },
  { id: 0x20, type: "weapon", name: "Wizard Staff" },
  { id: 0x21, type: "weapon", name: "Vorpal Sword" },
  { id: 0x22, type: "weapon", name: "CatClaw" },
  { id: 0x23, type: "weapon", name: "Thor Hammer" },
  { id: 0x24, type: "weapon", name: "Bane Sword" },
  { id: 0x25, type: "weapon", name: "Katana" },
  { id: 0x26, type: "weapon", name: "Xcalber" },
  { id: 0x27, type: "weapon", name: "Masamune" },
];

export const ARMOR: readonly ItemInfo[] = [
  { id: 0x00, type: "armor", name: "Nothing" },
  { id: 0x01, type: "armor", name: "Cloth" },
  { id: 0x02, type: "armor", name: "Wooden Armor" },
  { id: 0x03, type: "armor", name: "Chain Armor" },
  { id: 0x04, type: "armor", name: "Iron Armor" },
  { id: 0x05, type: "armor", name: "Steel Armor" },
  { id: 0x06, type: "armor", name: "Silver Armor" },
  { id: 0x07, type: "armor", name: "Flame Armor" },
  { id: 0x08, type: "armor", name: "Ice Armor" },
  { id: 0x09, type: "armor", name: "Opal Armor" },
  { id: 0x0a, type: "armor", name: "Dragon Armor" },
  { id: 0x0b, type: "armor", name: "Copper Bracelet" },
  { id: 0x0c, type: "armor", name: "Silver Bracelet" },
  { id: 0x0d, type: "armor", name: "Gold Bracelet" },
  { id: 0x0e, type: "armor", name: "Opal Bracelet" },
  { id: 0x0f, type: "armor", name: "White Shirt" },
  { id: 0x10, type: "armor", name: "Black Shirt" },
];

export const SHIELDS: readonly ItemInfo[] = [
  { id: 0x11, type: "shield", name: "Wooden Shield" },
  { id: 0x12, type: "shield", name: "Iron Shield" },
  { id: 0x13, type: "shield", name: "Silver Shield" },
  { id: 0x14, type: "shield", name: "Flame Shield" },
  { id: 0x15, type: "shield", name: "Ice Shield" },
  { id: 0x16, type: "shield", name: "Opal Shield" },
  { id: 0x17, type: "shield", name: "Aegis Shield" },
  { id: 0x18, type: "shield", name: "Buckler" },
  { id: 0x19, type: "shield", name: "ProCape" },
];

export const HELMETS: readonly ItemInfo[] = [
  { id: 0x1a, type: "helmet", name: "Cap" },
  { id: 0x1b, type: "helmet", name: "Wooden Helmet" },
  { id: 0x1c, type: "helmet", name: "Iron Helmet" },
  { id: 0x1d, type: "helmet", name: "Silver Helmet" },
  { id: 0x1e, type: "helmet", name: "Opal Helmet" },
  { id: 0x1f, type: "helmet", name: "Heal Helmet" },
  { id: 0x20, type: "helmet", name: "Ribbon" },
];

export const GAUNTLETS: readonly ItemInfo[] = [
  { id: 0x21, type: "gauntlet", name: "Gloves" },
  { id: 0x22, type: "gauntlet", name: "Copper Gauntlet" },
  { id: 0x23, type: "gauntlet", name: "Iron Gauntlet" },
  { id: 0x24, type: "gauntlet", name: "Silver Gauntlet" },
  { id: 0x25, type: "gauntlet", name: "Zeus Gauntlet" },
  { id: 0x26, type: "gauntlet", name: "Power Gauntlet" },
  { id: 0x27, type: "gauntlet", name: "Opal Gauntlet" },
  { id: 0x28, type: "gauntlet", name: "ProRing" },
];

export const CONSUMABLES: readonly ItemInfo[] = [
  { id: 0x00, type: "consumable", name: "Tent", usable: true },
  { id: 0x01, type: "consumable", name: "Cabin", usable: true },
  { id: 0x02, type: "consumable", name: "Cottage", usable: true },
  { id: 0x03, type: "consumable", name: "Potion", usable: true },
  { id: 0x04, type: "consumable", name: "Pure", usable: true },
  { id: 0x05, type: "consumable", name: "Soft", usable: true },
];

export const KEY_ITEMS: readonly ItemInfo[] = [
  { id: 0x00, type: "key", name: "Lute" },
  { id: 0x01, type: "key", name: "Crown" },
  { id: 0x02, type: "key", name: "Crystal" },
  { id: 0x03, type: "key", name: "Herb" },
  { id: 0x04, type: "key", name: "Mystic Key" },
  { id: 0x05, type: "key", name: "Tnt" },
  { id: 0x06, type: "key", name: "Adamant" },
  { id: 0x07, type: "key", name: "Slab" },
  { id: 0x08, type: "key", name: "Ruby" },
  { id: 0x09, type: "key", name: "Rod" },
  { id: 0x0a, type: "key", name: "Floater" },
  { id: 0x0b, type: "key", name: "Chime" },
  { id: 0x0c, type: "key", name: "Tail" },
  { id: 0x0d, type: "key", name: "Cube" },
  { id: 0x0e, type: "key", name: "Bottle" },
  { id: 0x0f, type: "key", name: "Oxyale" },
  { id: 0x10, type: "key", name: "Canoe" },
  { id: 0x11, type: "key", name: "Fire Orb" },
  { id: 0x12, type: "key", name: "Water Orb" },
  { id: 0x13, type: "key", name: "Air Orb" },
  { id: 0x14, type: "key", name: "Earth Orb" },
];

export const EQUIPMENT: readonly ItemInfo[] = [
  ...WEAPONS,
  ...ARMOR,
  ...SHIELDS,
  ...HELMETS,
  ...GAUNTLETS,
];

export const ITEMS: readonly ItemInfo[] = [
  ...EQUIPMENT,
  ...CONSUMABLES,
  ...KEY_ITEMS,
];

export const WEAPONS_BY_ID: Readonly<Record<number, ItemInfo>> = Object.fromEntries(
  WEAPONS.map((item) => [item.id, item])
);

export const ARMOR_BY_ID: Readonly<Record<number, ItemInfo>> = Object.fromEntries(
  ARMOR.map((item) => [item.id, item])
);

export const SHIELDS_BY_ID: Readonly<Record<number, ItemInfo>> = Object.fromEntries(
  SHIELDS.map((item) => [item.id, item])
);

export const HELMETS_BY_ID: Readonly<Record<number, ItemInfo>> = Object.fromEntries(
  HELMETS.map((item) => [item.id, item])
);

export const GAUNTLETS_BY_ID: Readonly<Record<number, ItemInfo>> = Object.fromEntries(
  GAUNTLETS.map((item) => [item.id, item])
);

export const CONSUMABLES_BY_ID: Readonly<Record<number, ItemInfo>> = Object.fromEntries(
  CONSUMABLES.map((item) => [item.id, item])
);

export const KEY_ITEMS_BY_ID: Readonly<Record<number, ItemInfo>> = Object.fromEntries(
  KEY_ITEMS.map((item) => [item.id, item])
);

export const ITEMS_BY_ID: Readonly<Record<number, ItemInfo>> = Object.fromEntries(
  ITEMS.map((item) => [item.id, item])
);

/** Lookup a weapon by relative equipment id. */
export function getWeaponById(id: number): ItemInfo | undefined {
  return WEAPONS_BY_ID[id];
}

/** Lookup an armor piece by relative equipment id. */
export function getArmorById(id: number): ItemInfo | undefined {
  return ARMOR_BY_ID[id];
}

/** Lookup a shield by relative equipment id. */
export function getShieldById(id: number): ItemInfo | undefined {
  return SHIELDS_BY_ID[id];
}

/** Lookup a helmet by relative equipment id. */
export function getHelmetById(id: number): ItemInfo | undefined {
  return HELMETS_BY_ID[id];
}

/** Lookup a gauntlet by relative equipment id. */
export function getGauntletById(id: number): ItemInfo | undefined {
  return GAUNTLETS_BY_ID[id];
}

/** Lookup a consumable by its unsram item id. */
export function getConsumableById(id: number): ItemInfo | undefined {
  return CONSUMABLES_BY_ID[id];
}

/** Lookup a key item by its unsram item offset. */
export function getKeyItemById(id: number): ItemInfo | undefined {
  return KEY_ITEMS_BY_ID[id];
}

/** Legacy lookup by global id. Kept for compatibility. */
export function getItemById(id: number): ItemInfo | undefined {
  return ITEMS_BY_ID[id];
}

/** Return all items of a given type. */
export function getItemsByType(type: ItemType): readonly ItemInfo[] {
  return ITEMS.filter((item) => item.type === type);
}
