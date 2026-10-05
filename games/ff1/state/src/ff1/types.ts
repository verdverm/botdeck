import type { ClassInfo, ItemInfo, SpellInfo, StatusInfo } from "../data/index.js";

export interface CharacterStats {
  strength: number | undefined;
  agility: number | undefined;
  intelligence: number | undefined;
  vitality: number | undefined;
  luck: number | undefined;
  experience: number | undefined;
  expToNext: number | undefined;
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

export interface BattleEnemy {
  slot: number;
  id: number | undefined;
  name: string | undefined;
  hp: number | undefined;
  /** Max HP is not yet read from a verified offset; undefined until verified. */
  maxHp: number | undefined;
  /** True when the enemy is still alive (HP > 0). Dead enemies remain in the list so slot identity is preserved. */
  alive: boolean;
  position: { row: number; col: number };
}

export interface BattlePartyMember {
  index: number;
  name: string;
  /**
   * Corroborated liveness: current HP > 0 and neither KO nor Stone in the
   * ailment byte (multiple signals; never trusts one field).
   */
  alive: boolean;
  /** The battle command queued in btl_charcmdbuf, if any. */
  pendingAction: Record<string, unknown> | undefined;
  /** True when the member is alive and no command is queued yet. */
  canAct: boolean;
  position: { row: number; col: number };
}

export type BattlePhase =
  /** Not on the battle screen. */
  | "outOfBattle"
  /** Command entry window: a living member can be given a command. */
  | "commandEntry"
  /** The round is executing (animations / enemy turns). */
  | "roundExecuting"
  /** The battle has been decided but the battle screen is still drawn. */
  | "battleEnding";

export interface BattleState {
  /**
   * Battle screen drawn (mapflags bit 1) with btl_result == 0 and enemies or
   * party still present. Multi-signal; see reader.ts.
   */
  inBattle: boolean;
  /** Derived from corroborating btl_result, enemy HP, and battle-screen flags. */
  phase: BattlePhase;
  /**
   * The three flags below are a pure projection of `phase` (see reader.ts
   * readBattleState) kept for consumers that read them directly; always derive
   * from `phase` when possible to avoid drift with an older snapshot.
   */
  /** True while the round's queued actions are still resolving (phase === "roundExecuting"). */
  roundExecuting: boolean;
  /** True when command entry is available for a living member (phase === "commandEntry" and a member can act). */
  commandEntryAvailable: boolean;
  /** True when the battle outcome is decided (phase === "battleEnding" or "outOfBattle"). */
  battleOver: boolean;
  /** First alive member without a queued command, when in commandEntry. */
  nextCommandableIndex: number | undefined;
  enemyCount: number | undefined;
  enemies: BattleEnemy[];
  party: BattlePartyMember[];
  activePartyIndex: number | undefined;
  cursorX: number | undefined;
  cursorY: number | undefined;
  note: string;
}

export type MenuContext =
  | "field"
  | "main_menu" // reserved for future main-menu-open detection; currently not produced by the reader
  | "shop"
  | "inn"
  | "clinic"
  | "dialog"
  | "battle"
  | "town"
  | "castle"
  | "dungeon"
  | "unknown";

export interface MenuState {
  inMenu: boolean;
  cursor: number | undefined;
  /** $63 row count / cursor max; nonzero when a list window is drawn (observed). */
  cursorMax: number;
  /** $1f window/overlay id; 64 (0x40) on a plain field, 1 under a menu (observed). */
  windowId: number;
  /** $67 bit 7: set while the main menu or an in-map window is open (observed). */
  menuOverlay: boolean;
  enteringShop: boolean;
  shopId: number | undefined;
  shopType: string | undefined;
  shopCursorX: number | undefined;
  shopCursorY: number | undefined;
  talkObject: number | undefined;
  dialogOpen: boolean;
  note: string;
}

export interface GameContext {
  mode: "field" | "battle" | "menu";
  menu: MenuContext;
  shopType?: string;
  shopId?: number;
  note: string;
}

export type Reachability = "same-map" | "reachable" | "unknown";

export interface KnownLocation {
  id: string;
  name: string;
  mapId?: number;
  mapName?: string;
  position?: { x: number; y: number };
  type: "town" | "shop" | "inn" | "clinic" | "npc" | "dungeon" | "castle" | "point";
  reachable?: Reachability;
  note?: string;
}

export interface MapObject {
  index: number;
  id: number;
  rawId: number;
  flags: number;
  physicalX: number;
  physicalY: number;
  graphicX: number;
  graphicY: number;
  facing: number;
  pl: number;
  rawBytes: Uint8Array;
}

export interface DialogState {
  open: boolean;
  current: string;
  pages: string[];
  note?: string;
}

export interface FF1GameState {
  party: PartyCharacter[];
  gold: number;
  inventory: InventoryItem[];
  world: WorldState;
  flags: GameFlags;
  battle: BattleState;
  context: GameContext;
  menu: MenuState;
  availableLocations: KnownLocation[];
  dialog?: DialogState;
}
