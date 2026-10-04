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
  MAPOBJ_RAWID_OFFSET,
  ADDR_BATTLE_RESULT,
  ADDR_BATTLE_ENEMY_COUNT,
  ADDR_BATTLE_ENEMIES,
  BATTLE_ENEMY_STRIDE,
  BATTLE_ENEMY_ID_OFFSET,
  BATTLE_ENEMY_HP_OFFSET,
  ADDR_BATTLE_ACTIVE_INDEX,
  ADDR_BATTLE_CURSOR_X,
  ADDR_BATTLE_CURSOR_Y,
  ADDR_ENTERING_SHOP,
  ADDR_SHOP_ID,
  ADDR_SHOP_TYPE,
  ADDR_MENU_CURSOR,
  ADDR_MENU_CURSOR_MAX,
  ADDR_WINDOW_ID,
  ADDR_MENU_OVERLAY,
  MENU_OVERLAY_WINDOW_BIT,
  ADDR_SHOP_CURSOR_X,
  ADDR_SHOP_CURSOR_Y,
  ADDR_TALK_OBJECT,
  ADDR_DIALOG_OPEN,
} from "../data/constants.js";
import { getClassById } from "../data/classes.js";
import { getEnemyNameById } from "../data/enemies.js";
import { getNpcNameById } from "../data/npcs.js";
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
import { readDialogState } from "./dialog.js";
import type {
  PartyCharacter,
  InventoryItem,
  WorldState,
  GameFlags,
  FF1GameState,
  BattleState,
  BattleEnemy,
  BattlePartyMember,
  GameContext,
  MenuContext,
  MenuState,
  KnownLocation,
  Reachability,
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

const VERIFIED_KEY_ITEMS_NOTE =
  "Key-item and orb offsets are VERIFIED against variables.inc (items at $6021-$6035). The $6200 progression/event flag page is raw and its bit meanings are TODO/INFERRED.";

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
    expToNext: readUint16LEFromBytes(bytes, CHAR_EXPTONEXT_OFFSET),
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
      rawId: view.u8(base + MAPOBJ_RAWID_OFFSET),
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
function hasKeyItem(view: MemoryView, offset: number): boolean {
  return view.u8(ADDR_KEY_ITEM_START + offset) !== 0;
}

export function readGameFlags(view: MemoryView): GameFlags {
  const raw = view.bytes(ADDR_WORLD_FLAGS, WORLD_FLAGS_SIZE);
  return {
    raw: new Uint8Array(raw),
    hasLute: hasKeyItem(view, 0x00),
    hasCrown: hasKeyItem(view, 0x01),
    hasCrystal: hasKeyItem(view, 0x02),
    hasHerb: hasKeyItem(view, 0x03),
    hasMysticKey: hasKeyItem(view, 0x04),
    hasTnt: hasKeyItem(view, 0x05),
    hasAdamant: hasKeyItem(view, 0x06),
    hasSlab: hasKeyItem(view, 0x07),
    hasRuby: hasKeyItem(view, 0x08),
    hasRod: hasKeyItem(view, 0x09),
    hasFloater: hasKeyItem(view, 0x0a),
    hasChime: hasKeyItem(view, 0x0b),
    hasTail: hasKeyItem(view, 0x0c),
    hasCube: hasKeyItem(view, 0x0d),
    hasBottle: hasKeyItem(view, 0x0e),
    hasOxyale: hasKeyItem(view, 0x0f),
    hasCanoe: hasKeyItem(view, 0x10),
    hasEarthOrb: hasKeyItem(view, 0x14),
    hasFireOrb: hasKeyItem(view, 0x11),
    hasWaterOrb: hasKeyItem(view, 0x12),
    hasAirOrb: hasKeyItem(view, 0x13),
    _note: VERIFIED_KEY_ITEMS_NOTE,
  };
}

const VERIFIED_BATTLE_NOTE =
  "Battle-state offsets are VERIFIED against FF1Disassembly variables.inc: btl_result ($6B86), btl_enemycount ($6C93), btl_enemystats ($6BD3 x $14), btlcmd_curchar ($6B7A), btlcurs ($6AAA/$6AAB). Enemy names come from the NES bestiary table.";

const VERIFIED_MENU_NOTE =
  "Menu/shop offsets are VERIFIED against FF1Disassembly variables.inc: entering_shop ($50), shop_id ($51), shop_type ($66), cursor ($62), shopcurs ($64/$65), talkobj ($67), descboxopen ($7F).";

const TODO_LOCATION_NOTE =
  "Available locations are a static lookup keyed by map ID. Reachability indicators are preliminary: same-map/exits are reliable, but overworld barriers (water/mountains/quest state) are not modeled yet.";

function enemySlotPosition(slot: number): { row: number; col: number } {
  // Nine small-enemy slots are arranged in three rows of three.
  return { row: Math.floor(slot / 3), col: slot % 3 };
}

function partySlotPosition(index: number): { row: number; col: number } {
  // Party is shown in two rows of two (front row = 0,1; back row = 2,3).
  return { row: index < 2 ? 0 : 1, col: index % 2 };
}

function readBattleEnemies(view: MemoryView, count: number): BattleEnemy[] {
  const enemies: BattleEnemy[] = [];
  for (let i = 0; i < count; i++) {
    const base = ADDR_BATTLE_ENEMIES + i * BATTLE_ENEMY_STRIDE;
    const id = view.u8(base + BATTLE_ENEMY_ID_OFFSET);
    const hp = view.u16(base + BATTLE_ENEMY_HP_OFFSET);
    enemies.push({
      slot: i,
      id,
      name: getEnemyNameById(id),
      hp,
      maxHp: undefined,
      position: enemySlotPosition(i),
    });
  }
  return enemies;
}

function readBattleParty(party: PartyCharacter[]): BattlePartyMember[] {
  return party.map((c) => ({
    index: c.index,
    name: c.name,
    canAct: c.hp !== undefined && c.hp > 0 && c.status?.ailments.every((s) => s.key !== "dead")
      ? true
      : undefined,
    pendingAction: undefined,
    position: partySlotPosition(c.index),
  }));
}

/**
 * Read battle state from CPU RAM.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @param party - Current party state, used to populate the battle party view.
 * @returns Battle state with live enemy roster and cursor positions.
 */
export function readBattleState(view: MemoryView, party: PartyCharacter[]): BattleState {
  const enemyCount = view.u8(ADDR_BATTLE_ENEMY_COUNT);
  const activeIndex = view.u8(ADDR_BATTLE_ACTIVE_INDEX);
  const inBattle = view.u8(ADDR_BATTLE_RESULT) === 0 && enemyCount > 0;

  return {
    inBattle,
    enemyCount: inBattle ? enemyCount : 0,
    enemies: inBattle ? readBattleEnemies(view, enemyCount) : [],
    party: readBattleParty(party),
    activePartyIndex: inBattle ? (activeIndex < PARTY_SIZE ? activeIndex : undefined) : undefined,
    cursorX: inBattle ? view.u8(ADDR_BATTLE_CURSOR_X) : undefined,
    cursorY: inBattle ? view.u8(ADDR_BATTLE_CURSOR_Y) : undefined,
    note: VERIFIED_BATTLE_NOTE,
  };
}

function classifyStandardMap(mapId: number): "town" | "castle" | "dungeon" | "unknown" {
  // Standard-map IDs 0x00-0x07 are towns, 0x08-0x0A are castles,
  // 0x0B-0x0C are dungeons/temples. Anything else is unclassified.
  if (mapId >= 0x00 && mapId <= 0x07) return "town";
  if (mapId >= 0x08 && mapId <= 0x0a) return "castle";
  if (mapId >= 0x0b && mapId <= 0x0c) return "dungeon";
  return "unknown";
}

const SHOP_TYPE_NAMES: Readonly<Record<number, string>> = {
  0: "weapon",
  1: "armor",
  2: "white magic",
  3: "black magic",
  4: "clinic",
  5: "inn",
  6: "item",
  7: "caravan",
};

function shopTypeName(shopType: number): string | undefined {
  return SHOP_TYPE_NAMES[shopType];
}

function shopMenuContext(shopType: number): MenuContext {
  if (shopType === 5) return "inn";
  if (shopType === 4) return "clinic";
  return "shop";
}

/**
 * Read the current high-level game context.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @param world - Current world state.
 * @param battle - Current battle state.
 * @returns Mode/menu context, including shop/inn/clinic detection.
 */
export function readGameContext(view: MemoryView, world: WorldState, battle: BattleState): GameContext {
  const enteringShop = view.u8(ADDR_ENTERING_SHOP) !== 0;
  const shopTypeRaw = view.u8(ADDR_SHOP_TYPE);
  const shopId = view.u8(ADDR_SHOP_ID);

  if (battle.inBattle) {
    return { mode: "battle", menu: "battle", note: VERIFIED_BATTLE_NOTE };
  }

  // entering_shop ($50) is set while the party is in a shop/inn/clinic/caravan.
  // It should clear on exit, but if it retains a nonzero value on the field we
  // avoid misreporting shop mode by requiring a standard-map context.
  if (enteringShop && world.isStandardMap) {
    const menu = shopMenuContext(shopTypeRaw);
    return {
      mode: "menu",
      menu,
      shopType: shopTypeName(shopTypeRaw),
      shopId,
      note: VERIFIED_MENU_NOTE,
    };
  }

  if (view.u8(ADDR_DIALOG_OPEN) !== 0) {
    return { mode: "field", menu: "dialog", note: VERIFIED_MENU_NOTE };
  }

  if (!world.isStandardMap) {
    return { mode: "field", menu: "field", note: VERIFIED_MENU_NOTE };
  }

  return {
    mode: "field",
    menu: classifyStandardMap(world.mapId),
    note: VERIFIED_MENU_NOTE,
  };
}

/**
 * Read the current menu/shop/dialog state.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @param context - Current game context.
 * @returns Menu cursor, shop state, and dialog state.
 */
export function readMenuState(view: MemoryView, context: GameContext): MenuState {
  const enteringShop = view.u8(ADDR_ENTERING_SHOP) !== 0;
  const shopTypeRaw = view.u8(ADDR_SHOP_TYPE);
  const cursorMax = view.u8(ADDR_MENU_CURSOR_MAX);
  const windowId = view.u8(ADDR_WINDOW_ID);
  const overlay = view.u8(ADDR_MENU_OVERLAY);
  return {
    inMenu: context.mode === "menu" || view.u8(ADDR_DIALOG_OPEN) !== 0,
    cursor: view.u8(ADDR_MENU_CURSOR),
    cursorMax,
    windowId,
    menuOverlay: (overlay & MENU_OVERLAY_WINDOW_BIT) !== 0,
    enteringShop,
    shopId: enteringShop ? view.u8(ADDR_SHOP_ID) : undefined,
    shopType: enteringShop ? shopTypeName(shopTypeRaw) : undefined,
    shopCursorX: enteringShop ? view.u8(ADDR_SHOP_CURSOR_X) : undefined,
    shopCursorY: enteringShop ? view.u8(ADDR_SHOP_CURSOR_Y) : undefined,
    talkObject: view.u8(ADDR_TALK_OBJECT),
    dialogOpen: view.u8(ADDR_DIALOG_OPEN) !== 0,
    note: VERIFIED_MENU_NOTE,
  };
}

const KNOWN_LOCATIONS: Readonly<Record<number, KnownLocation[]>> = {
  0x00: [
    { id: "coneria_weapon_shop", name: "Coneria Weapon Shop", mapId: 0x00, type: "shop" },
    { id: "coneria_armor_shop", name: "Coneria Armor Shop", mapId: 0x00, type: "shop" },
    { id: "coneria_white_magic_shop", name: "Coneria White Magic Shop", mapId: 0x00, type: "shop" },
    { id: "coneria_black_magic_shop", name: "Coneria Black Magic Shop", mapId: 0x00, type: "shop" },
    { id: "coneria_item_shop", name: "Coneria Item Shop", mapId: 0x00, type: "shop" },
    { id: "coneria_clinic", name: "Coneria Clinic", mapId: 0x00, type: "clinic" },
    { id: "coneria_inn", name: "Coneria Inn", mapId: 0x00, type: "inn" },
    { id: "coneria_castle_exit", name: "Coneria Castle Exit", mapId: 0x00, type: "point" },
    { id: "coneria_north_exit", name: "Coneria North Exit", mapId: 0x00, type: "point" },
    { id: "coneria_east_exit", name: "Coneria East Exit", mapId: 0x00, type: "point" },
    { id: "coneria_south_exit", name: "Coneria South Exit", mapId: 0x00, type: "point" },
    { id: "coneria_fountain", name: "Coneria Fountain", mapId: 0x00, type: "npc" },
    { id: "coneria_well", name: "Coneria Well", mapId: 0x00, type: "npc" },
  ],
  0x08: [
    { id: "coneria_castle_throne", name: "Coneria Castle Throne Room", mapId: 0x08, type: "point" },
    { id: "coneria_castle_exit", name: "Coneria Castle Exit", mapId: 0x08, type: "point" },
  ],
};

function reachability(loc: KnownLocation, world: WorldState): Reachability {
  if (world.isStandardMap) {
    if (loc.mapId === world.mapId) return "same-map";
    if (loc.type === "point" && loc.id.toLowerCase().includes("exit")) return "reachable";
    return "unknown";
  }
  // Overworld: without a walkability/collision model we can only make broad
  // statements.  Airship makes everything reachable; otherwise flag unknown so
  // the UI does not lie about water/mountain barriers.
  if (world.currentVehicle === "Airship") return "reachable";
  return "unknown";
}

/**
 * Return the list of locations that can be targeted by `goto` for the current
 * map. This is a static lookup keyed by standard-map ID; the overworld returns
 * the nearest towns/dungeons as travel targets.
 *
 * @param world - Current world state.
 * @returns List of known navigable locations for the current context.
 */
export function getAvailableLocations(world: WorldState): KnownLocation[] {
  const list: KnownLocation[] = [];
  if (world.isStandardMap && world.mapId in KNOWN_LOCATIONS) {
    const mapLocs = KNOWN_LOCATIONS[world.mapId];
    if (mapLocs) list.push(...mapLocs);
  } else if (world.isOverworld) {
    list.push(
      { id: "coneria", name: "Coneria", type: "town" },
      { id: "coneria_castle", name: "Coneria Castle", type: "castle" },
      { id: "temple_of_fiends", name: "Temple of Fiends", type: "dungeon" },
      { id: "matoyas_cave", name: "Matoya's Cave", type: "dungeon" },
      { id: "marsh_cave", name: "Marsh Cave", type: "dungeon" },
      { id: "pravoka", name: "Pravoka", type: "town" },
      { id: "elfheim", name: "Elfheim", type: "town" },
    );
  }
  return list.map((loc) => ({
    ...loc,
    mapName: world.mapName ?? undefined,
    reachable: reachability(loc, world),
    note: TODO_LOCATION_NOTE,
  }));
}

/**
 * Read the full FF1 game state from CPU RAM.
 *
 * @param view - A MemoryView backed by the full NES CPU address space.
 * @returns Complete game snapshot including party, gold, inventory, world, flags, battle, context, menu, and locations.
 */
export function readFF1State(
  view: MemoryView,
  nametable?: { data: Uint8Array; width: number },
): FF1GameState {
  const party = readParty(view);
  const world = readWorldState(view);
  const battle = readBattleState(view, party);
  const context = readGameContext(view, world, battle);
  return {
    party,
    gold: readGold(view),
    inventory: readInventory(view),
    world,
    flags: readGameFlags(view),
    battle,
    context,
    menu: readMenuState(view, context),
    availableLocations: getAvailableLocations(world),
    dialog: readDialogState(view, nametable),
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
