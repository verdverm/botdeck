import { MemoryView, createJsNesStateView } from "../nes/memory.js";
import type { JsNesState } from "../nes/types.js";
import {
  PARTY_SIZE,
  NAME_LENGTH,
  ADDR_CHAR_STATS,
  CHAR_STATS_STRIDE,
  CHAR_CLASS_OFFSET,
  CHAR_AILMENTS_OFFSET,
  CHAR_NAME_OFFSET,
  CHAR_EXP_OFFSET,
  CHAR_EXP_SIZE,
  CHAR_CURHP_OFFSET,
  CHAR_MAXHP_OFFSET,
  CHAR_HP_SIZE,
  CHAR_STR_OFFSET,
  CHAR_AGI_OFFSET,
  CHAR_INT_OFFSET,
  CHAR_VIT_OFFSET,
  CHAR_LUCK_OFFSET,
  CHAR_EXPTONEXT_OFFSET,
  CHAR_EXPTONEXT_SIZE,
  CHAR_WEAPONS_OFFSET,
  CHAR_ARMOR_OFFSET,
  CHAR_EQUIPMENT_SLOTS,
  CHAR_DMG_OFFSET,
  CHAR_HITRATE_OFFSET,
  CHAR_ABSORB_OFFSET,
  CHAR_EVADE_OFFSET,
  CHAR_MAGDEF_OFFSET,
  CHAR_LEVEL_OFFSET,
  ADDR_GOLD,
  GOLD_SIZE,
  ADDR_CHAR_MAGIC,
  CHAR_MAGIC_STRIDE,
  SPELL_DATA_SIZE,
  SPELL_LEVEL_COUNT,
  SPELL_LEVEL_SIZE,
  SPELL_SLOTS_PER_LEVEL,
  SPELL_MP_CURRENT_OFFSET,
  SPELL_MP_MAX_OFFSET,
  SPELL_MP_SIZE,
  ADDR_KEY_ITEM_START,
  KEY_ITEM_COUNT,
  ADDR_CONSUMABLE_START,
  CONSUMABLE_COUNT,
  ADDR_MAP_ID,
  ADDR_CUR_TILESET,
  ADDR_OW_X,
  ADDR_OW_Y,
  ADDR_SM_SCROLL_X,
  ADDR_SM_SCROLL_Y,
  ADDR_SM_X,
  ADDR_SM_Y,
  ADDR_MAPFLAGS,
  MAPFLAG_STANDARD,
  ADDR_VEHICLE,
  ADDR_SHIP_VIS,
  ADDR_SHIP_X,
  ADDR_SHIP_Y,
  ADDR_AIRSHIP_VIS,
  ADDR_AIRSHIP_X,
  ADDR_AIRSHIP_Y,
  ADDR_HAS_CANOE,
  ADDR_WORLD_FLAGS,
  WORLD_FLAGS_SIZE,
  ADDR_MAP_OBJECTS,
  MAP_OBJECT_COUNT,
  MAP_OBJECT_STRIDE,
  MAPOBJ_ID_OFFSET,
  MAPOBJ_FLAGS_OFFSET,
  MAPOBJ_PHYS_X_OFFSET,
  MAPOBJ_PHYS_Y_OFFSET,
  MAPOBJ_GFX_X_OFFSET,
  MAPOBJ_GFX_Y_OFFSET,
  MAPOBJ_FACE_OFFSET,
  MAPOBJ_PL_OFFSET,
} from "../data/constants.js";
import { getClassById } from "../data/classes.js";
import {
  getWeaponById,
  getArmorById,
  getShieldById,
  getHelmetById,
  getGauntletById,
  getConsumableById,
  getKeyItemById,
} from "../data/items.js";
import { getSpellById, getSpellIdFromRamSlot } from "../data/spells.js";
import { STATUSES } from "../data/status.js";
import {
  getCurrentVehicleName,
  ownedVehicles,
  hasVehicleOwnership,
} from "../data/vehicles.js";
import { decodeName } from "../data/text.js";
import type {
  PartyCharacter,
  InventoryItem,
  WorldState,
  GameFlags,
  FF1GameState,
  CharacterStats,
  SpellCharges,
  CharacterStatus,
  CharacterEquipment,
  SpellChargeLevel,
  MapObject,
} from "./types.js";
import type { SpellInfo, StatusInfo, ItemInfo } from "../data/index.js";

const INFERRED_EQUIPMENT_NOTE =
  "Equipment slot meanings are VERIFIED (4 weapon slots + 4 armor slots). The mapping from equipped armor ID to body/shield/helmet/gauntlet uses the armor-type table.";

const INFERRED_WORLD_NOTE =
  "Overworld position is at $27/$28; standard-map position is scroll $29/$2A plus collision coords $68/$69. Map context is controlled by mapflags ($2D) bit 0; cur_map ($48) is only meaningful inside standard maps. NPC/object RAM is at $6F00 (16 objects x 16 bytes).";

const TODO_FLAGS_NOTE =
  "Progression-flag offsets are TODO/INFERRED. Decoded booleans are left undefined until bit positions are verified; the raw $6200 flag page is returned.";

function readUint24LE(view: MemoryView, addr: number): number {
  const b0 = view.u8(addr);
  const b1 = view.u8(addr + 1);
  const b2 = view.u8(addr + 2);
  return b0 | (b1 << 8) | (b2 << 16);
}

function readUint16LEFromBytes(bytes: Uint8Array, offset: number): number {
  const lo = bytes[offset] ?? 0;
  const hi = bytes[offset + 1] ?? 0;
  return lo | (hi << 8);
}

function readUint24LEFromBytes(bytes: Uint8Array, offset: number): number {
  const b0 = bytes[offset] ?? 0;
  const b1 = bytes[offset + 1] ?? 0;
  const b2 = bytes[offset + 2] ?? 0;
  return b0 | (b1 << 8) | (b2 << 16);
}

function readCharacterStats(bytes: Uint8Array): CharacterStats {
  return {
    strength: bytes[CHAR_STR_OFFSET],
    agility: bytes[CHAR_AGI_OFFSET],
    intelligence: bytes[CHAR_INT_OFFSET],
    vitality: bytes[CHAR_VIT_OFFSET],
    luck: bytes[CHAR_LUCK_OFFSET],
    experience: readUint24LEFromBytes(bytes, CHAR_EXP_OFFSET),
    damage: bytes[CHAR_DMG_OFFSET],
    hitRate: bytes[CHAR_HITRATE_OFFSET],
    absorb: bytes[CHAR_ABSORB_OFFSET],
    evade: bytes[CHAR_EVADE_OFFSET],
    magicDefense: bytes[CHAR_MAGDEF_OFFSET],
    _rawBytes: new Uint8Array(bytes),
    _note:
      "Character stat layout verified against FF1Disassembly variables.inc and the provided save state.",
  };
}

function readCharacterStatus(raw: number): CharacterStatus {
  const ailments: StatusInfo[] = [];
  for (const status of Object.values(STATUSES)) {
    if ((raw & status.mask) !== 0) {
      ailments.push(status);
    }
  }
  return {
    ailments,
    raw,
    _note:
      "Status bit positions verified against FF1Disassembly Constants.inc.",
  };
}

function readSpellCharges(bytes: Uint8Array): SpellCharges {
  const levels: SpellChargeLevel[] = [];
  for (let i = 0; i < SPELL_MP_SIZE; i++) {
    levels.push({
      level: i + 1,
      current: bytes[SPELL_MP_CURRENT_OFFSET + i],
      max: bytes[SPELL_MP_MAX_OFFSET + i],
    });
  }
  return {
    levels,
    _rawBytes: new Uint8Array(bytes),
    _note:
      "Spell charge layout verified: current MP at +$20, max MP at +$28, one byte per spell level.",
  };
}

function readSpellsLearned(bytes: Uint8Array): SpellInfo[] {
  const spells: SpellInfo[] = [];
  for (let level = 1; level <= SPELL_LEVEL_COUNT; level++) {
    const base = (level - 1) * SPELL_LEVEL_SIZE;
    for (let slot = 0; slot < SPELL_SLOTS_PER_LEVEL; slot++) {
      const raw = bytes[base + slot] ?? 0;
      if (raw === 0 || raw === 0xff) {
        continue;
      }
      const spellId = getSpellIdFromRamSlot(level, raw);
      const spell = spellId === undefined ? undefined : getSpellById(spellId);
      if (spell) {
        spells.push(spell);
      }
    }
  }
  return spells;
}

function readCharacterEquipment(
  weaponBytes: Uint8Array,
  armorBytes: Uint8Array
): CharacterEquipment {
  const weapon = weaponBytes.find((id) => id !== 0);
  const weapons: ItemInfo[] = [];
  for (const id of weaponBytes) {
    const item = id === 0 ? undefined : getWeaponById(id);
    if (item) weapons.push(item);
  }

  let armor: ItemInfo | undefined;
  let shield: ItemInfo | undefined;
  let helmet: ItemInfo | undefined;
  let gauntlet: ItemInfo | undefined;

  for (const id of armorBytes) {
    if (id === 0) continue;
    const item =
      getArmorById(id) ??
      getShieldById(id) ??
      getHelmetById(id) ??
      getGauntletById(id);
    if (!item) continue;
    switch (item.type) {
      case "armor":
        if (!armor) armor = item;
        break;
      case "shield":
        if (!shield) shield = item;
        break;
      case "helmet":
        if (!helmet) helmet = item;
        break;
      case "gauntlet":
        if (!gauntlet) gauntlet = item;
        break;
    }
  }

  return {
    weapon: weapons[0],
    armor,
    shield,
    helmet,
    gauntlet,
    rawWeapons: new Uint8Array(weaponBytes),
    rawArmor: new Uint8Array(armorBytes),
    _note: INFERRED_EQUIPMENT_NOTE,
  };
}

/**
 * Read the four party characters from CPU RAM.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @returns The four party members, including stats, equipment, spells, and status.
 */
export function readParty(view: MemoryView): PartyCharacter[] {
  const party: PartyCharacter[] = [];
  for (let i = 0; i < PARTY_SIZE; i++) {
    const statBase = ADDR_CHAR_STATS + i * CHAR_STATS_STRIDE;
    const magicBase = ADDR_CHAR_MAGIC + i * CHAR_MAGIC_STRIDE;

    const nameAddr = statBase + CHAR_NAME_OFFSET;
    const nameBytes = view.bytes(nameAddr, NAME_LENGTH);
    const name = decodeName(nameBytes);

    const classId = view.u8(statBase + CHAR_CLASS_OFFSET);
    const classInfo = getClassById(classId);

    const statBytes = view.bytes(statBase, CHAR_STATS_STRIDE);
    const level = (statBytes[CHAR_LEVEL_OFFSET] ?? 0) + 1;
    const hp = readUint16LEFromBytes(statBytes, CHAR_CURHP_OFFSET);
    const maxHp = readUint16LEFromBytes(statBytes, CHAR_MAXHP_OFFSET);

    const spellsLearnedBytes = view.bytes(magicBase, SPELL_DATA_SIZE);
    const spellChargeBytes = view.bytes(magicBase, CHAR_MAGIC_STRIDE);

    const equipmentWeaponBytes = view.bytes(
      statBase + CHAR_WEAPONS_OFFSET,
      CHAR_EQUIPMENT_SLOTS
    );
    const equipmentArmorBytes = view.bytes(
      statBase + CHAR_ARMOR_OFFSET,
      CHAR_EQUIPMENT_SLOTS
    );

    party.push({
      index: i,
      name,
      classId,
      classInfo,
      level,
      hp,
      maxHp,
      stats: readCharacterStats(statBytes),
      status: readCharacterStatus(statBytes[CHAR_AILMENTS_OFFSET] ?? 0),
      spellCharges: readSpellCharges(spellChargeBytes),
      spellsKnown: readSpellsLearned(spellsLearnedBytes),
      equipment: readCharacterEquipment(
        equipmentWeaponBytes,
        equipmentArmorBytes
      ),
      raw: {
        nameBytes: new Uint8Array(nameBytes),
        statBytes: new Uint8Array(statBytes),
        spellsLearnedBytes: new Uint8Array(spellsLearnedBytes),
        spellChargeBytes: new Uint8Array(spellChargeBytes),
        equipmentWeaponBytes: new Uint8Array(equipmentWeaponBytes),
        equipmentArmorBytes: new Uint8Array(equipmentArmorBytes),
      },
    });
  }
  return party;
}

/**
 * Read the party's gold.
 *
 * Gold is stored as a 24-bit little-endian value at `$601C`.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @returns Gold amount, capped by the game at 999,999.
 */
export function readGold(view: MemoryView): number {
  return readUint24LE(view, ADDR_GOLD);
}

function pushInventoryItem(
  list: InventoryItem[],
  itemId: number,
  quantity: number,
  lookup: (id: number) => ItemInfo | undefined,
  note?: string
) {
  if (quantity === 0) return;
  list.push({
    slot: list.length,
    itemId,
    itemInfo: lookup(itemId),
    quantity,
    _note: note,
  });
}

/**
 * Read inventory from CPU RAM.
 *
 * FF1 stores consumable quantities as single bytes (`$6036`–`$603B`) and key
 * items as single-byte flags (`$6021`–`$6035`). Equipment is held in per-character
 * slots and is not returned here; use `readParty()` for equipped items.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @returns Flat list of consumable and key-item inventory entries.
 */
export function readInventory(view: MemoryView): InventoryItem[] {
  const inventory: InventoryItem[] = [];

  for (let i = 0; i < CONSUMABLE_COUNT; i++) {
    const qty = view.u8(ADDR_CONSUMABLE_START + i);
    pushInventoryItem(
      inventory,
      i,
      qty,
      getConsumableById,
      "Consumable quantity layout verified against unsram item area."
    );
  }

  for (let i = 0; i < KEY_ITEM_COUNT; i++) {
    const flag = view.u8(ADDR_KEY_ITEM_START + i);
    pushInventoryItem(
      inventory,
      i,
      flag,
      getKeyItemById,
      "Key item flag layout verified against unsram item area."
    );
  }

  return inventory;
}

// Standard-map IDs are 0-based; $0048 == 0 is Coneria.  Names for the
// entrance-teleport maps (0x00-0x0C) are VERIFIED against the ROM teleport
// tables and object lists; IDs above 0x0C are TODO / INFERRED.
const STANDARD_MAP_NAMES: Readonly<Record<number, string>> = {
  0x00: "Coneria",
  0x01: "Provoka",
  0x02: "Elfland",
  0x03: "Melmond",
  0x04: "Crescent Lake",
  0x05: "Gaia",
  0x06: "Onrac",
  0x07: "Caravan",
  0x08: "Coneria Castle",
  0x09: "Elfland Castle",
  0x0a: "Northwest Castle",
  0x0b: "Castle of Ordeals",
  0x0c: "Temple of Fiends",
};

function standardMapName(id: number): string {
  return STANDARD_MAP_NAMES[id] ?? `Standard Map 0x${id.toString(16).padStart(2, "0")}`;
}

/**
 * Read the live NPC/object table from CPU RAM.
 *
 * Objects are 16 bytes each at `$6F00`. Empty slots have `id == 0` and are
 * omitted from the returned list.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @returns List of active standard-map objects/NPCs.
 */
export function readMapObjects(view: MemoryView): MapObject[] {
  const objects: MapObject[] = [];
  for (let i = 0; i < MAP_OBJECT_COUNT; i++) {
    const base = ADDR_MAP_OBJECTS + i * MAP_OBJECT_STRIDE;
    const id = view.u8(base + MAPOBJ_ID_OFFSET);
    if (id === 0) {
      continue;
    }
    objects.push({
      index: i,
      id,
      flags: view.u8(base + MAPOBJ_FLAGS_OFFSET),
      physicalX: view.u8(base + MAPOBJ_PHYS_X_OFFSET),
      physicalY: view.u8(base + MAPOBJ_PHYS_Y_OFFSET),
      graphicX: view.u8(base + MAPOBJ_GFX_X_OFFSET),
      graphicY: view.u8(base + MAPOBJ_GFX_Y_OFFSET),
      facing: view.u8(base + MAPOBJ_FACE_OFFSET),
      pl: view.u8(base + MAPOBJ_PL_OFFSET),
      rawBytes: new Uint8Array(view.bytes(base, MAP_OBJECT_STRIDE)),
    });
  }
  return objects;
}

/**
 * Read world-map / town / dungeon state from CPU RAM.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @returns Current map, position, vehicles, and standard-map objects.
 */
export function readWorldState(view: MemoryView): WorldState {
  const shipVisible = hasVehicleOwnership(view.u8(ADDR_SHIP_VIS));
  const airshipVisible = hasVehicleOwnership(view.u8(ADDR_AIRSHIP_VIS));
  const canoeByte = view.u8(ADDR_HAS_CANOE);
  const mapFlags = view.u8(ADDR_MAPFLAGS);
  const isStandardMap = (mapFlags & MAPFLAG_STANDARD) !== 0;

  return {
    mapId: isStandardMap ? view.u8(ADDR_MAP_ID) : 0,
    mapName: isStandardMap ? standardMapName(view.u8(ADDR_MAP_ID)) : "World Map",
    isOverworld: !isStandardMap,
    isStandardMap,
    mapFlags,
    tilesetId: view.u8(ADDR_CUR_TILESET),
    overworldX: view.u8(ADDR_OW_X),
    overworldY: view.u8(ADDR_OW_Y),
    standardMapX: view.u8(ADDR_SM_X),
    standardMapY: view.u8(ADDR_SM_Y),
    standardMapScrollX: view.u8(ADDR_SM_SCROLL_X),
    standardMapScrollY: view.u8(ADDR_SM_SCROLL_Y),
    shipX: shipVisible ? view.u8(ADDR_SHIP_X) : undefined,
    shipY: shipVisible ? view.u8(ADDR_SHIP_Y) : undefined,
    airshipX: airshipVisible ? view.u8(ADDR_AIRSHIP_X) : undefined,
    airshipY: airshipVisible ? view.u8(ADDR_AIRSHIP_Y) : undefined,
    currentVehicle: getCurrentVehicleName(view.u8(ADDR_VEHICLE)),
    ownedVehicles: ownedVehicles(
      view.u8(ADDR_SHIP_VIS),
      view.u8(ADDR_AIRSHIP_VIS),
      canoeByte
    ),
    vehiclesRaw: view.u8(ADDR_VEHICLE),
    hasCanoe: hasVehicleOwnership(canoeByte),
    mapObjects: isStandardMap ? readMapObjects(view) : [],
    _note: INFERRED_WORLD_NOTE,
  };
}

/**
 * Read progression / key-item flags from CPU RAM.
 *
 * Individual decoded booleans are left undefined until their bit positions are
 * verified; the raw `$6200` flag page is always returned.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @returns Raw flag bytes plus named progression placeholders.
 */
export function readGameFlags(view: MemoryView): GameFlags {
  const raw = view.bytes(ADDR_WORLD_FLAGS, WORLD_FLAGS_SIZE);
  return {
    raw: new Uint8Array(raw),
    hasLute: undefined,
    hasCrown: undefined,
    hasCrystal: undefined,
    hasHerb: undefined,
    hasMysticKey: undefined,
    hasTnt: undefined,
    hasAdamant: undefined,
    hasSlab: undefined,
    hasRuby: undefined,
    hasRod: undefined,
    hasFloater: undefined,
    hasChime: undefined,
    hasTail: undefined,
    hasCube: undefined,
    hasBottle: undefined,
    hasOxyale: undefined,
    hasCanoe: undefined,
    hasEarthOrb: undefined,
    hasFireOrb: undefined,
    hasWaterOrb: undefined,
    hasAirOrb: undefined,
    _note: TODO_FLAGS_NOTE,
  };
}

/**
 * Read the full FF1 game state from CPU RAM.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @returns Complete game snapshot including party, gold, inventory, world, and flags.
 */
export function readFF1State(view: MemoryView): FF1GameState {
  return {
    party: readParty(view),
    gold: readGold(view),
    inventory: readInventory(view),
    world: readWorldState(view),
    flags: readGameFlags(view),
  };
}

/**
 * Read the full FF1 game state from a jsNES save-state object.
 *
 * @param saveState - jsNES state object containing `cpu.mem`.
 * @returns Complete game snapshot.
 */
export function readFF1StateFromSaveState(saveState: JsNesState): FF1GameState {
  return readFF1State(createJsNesStateView(saveState));
}
