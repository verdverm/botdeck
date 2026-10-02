import type { FF1GameState, KnownLocation, PartyCharacter, SpellChargeLevel, WorldState } from "./types.js";

function mpSummary(charges: SpellChargeLevel[] | undefined): string {
  if (!charges || charges.length === 0) return "-";
  return charges.map((l) => `${l.current ?? 0}/${l.max ?? 0}`).join(", ");
}

function formatPosition(world: WorldState | undefined): string {
  if (!world) return "Unknown";
  if (world.isOverworld) {
    return `Overworld (${world.overworldX}, ${world.overworldY})`;
  }
  return `${world.mapName ?? `Map ${world.mapId}`} (${world.standardMapX}, ${world.standardMapY})`;
}

function formatInventory(state: FF1GameState): string {
  if (!Array.isArray(state.inventory)) return "None";
  const items = state.inventory
    .filter((item) => item.quantity > 0 && item.itemInfo)
    .slice(0, 20)
    .map((item) => `${item.itemInfo?.name ?? `Item ${item.itemId}`} x${item.quantity}`);
  if (items.length === 0) return "None";
  return items.join(", ");
}

function formatLocations(locations: KnownLocation[] | undefined): string {
  if (!locations || locations.length === 0) return "None";
  return locations.map((loc) => `- ${loc.name} (${loc.id})`).join("\n");
}

function formatBattle(state: FF1GameState): string {
  const battle = state.battle;
  if (!battle?.inBattle) return "Not in battle.";
  const enemies = battle.enemies.length > 0
    ? battle.enemies.map((e) => `- ${e.name}`).join("\n")
    : "- Enemy roster unread (offsets TODO)";
  const party = battle.party.map((m) => `- ${m.name}: ${m.canAct ? "can act" : "cannot act"}`).join("\n");
  return [
    `Active actor: ${battle.activePartyIndex !== undefined ? state.party[battle.activePartyIndex]?.name ?? "?" : "unknown"}`,
    "Enemies:",
    enemies,
    "Party:",
    party,
  ].join("\n");
}

function formatCharacter(c: PartyCharacter): string {
  const eq = c.equipment ?? {};
  const stats = c.stats;
  const lines: string[] = [
    `- ${c.name ?? "Unknown"} (${c.classInfo?.name ?? `Class ${c.classId ?? "?"}`}) Lv ${c.level ?? "-"}`,
    `  HP: ${c.hp ?? "-"} / ${c.maxHp ?? "-"} | MP: ${mpSummary(c.spellCharges?.levels)} | Next: ${stats?.expToNext ?? "-"} EXP`,
  ];
  const ailments = c.status?.ailments?.map((s) => s.name).join(", ");
  if (ailments) lines.push(`  Status: ${ailments}`);
  const gear = [
    eq.weapon?.name,
    eq.armor?.name,
    eq.shield?.name,
    eq.helmet?.name,
    eq.gauntlet?.name,
  ].filter(Boolean);
  if (gear.length > 0) lines.push(`  Gear: ${gear.join(", ")}`);
  return lines.join("\n");
}

export function formatFF1GameInfo(state: FF1GameState | undefined): string {
  if (!state) return "No FF1 state available.";

  const party = Array.isArray(state.party)
    ? state.party.map(formatCharacter).join("\n") || "No party data."
    : "No party data.";
  const world = state.world;
  const vehicles = world && Array.isArray(world.ownedVehicles) && world.ownedVehicles.length > 0
    ? world.ownedVehicles.join(", ")
    : "None";
  const currentVehicle = world && world.currentVehicle
    ? ` (riding ${world.currentVehicle})`
    : "";
  const gold = typeof state.gold === "number" ? state.gold.toLocaleString() : "?";
  const context = state.context ?? { mode: "unknown", menu: "unknown" };

  return [
    "## Party",
    party,
    "",
    "## Resources",
    `- Gold: ${gold}`,
    `- Position: ${formatPosition(world)}`,
    `- Vehicles: ${vehicles}${currentVehicle}`,
    `- Context: ${context.mode} / menu: ${context.menu}`,
    "",
    "## Battle",
    formatBattle(state),
    "",
    "## Available Locations",
    formatLocations(state.availableLocations),
    "",
    "## Inventory",
    formatInventory(state),
  ].join("\n");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatFF1StateFromUnknown(value: unknown): string {
  if (!isPlainObject(value)) return "No state available.";
  const candidate = value.ff1 ?? value;
  if (!isPlainObject(candidate)) return "No state available.";
  return formatFF1GameInfo(candidate as unknown as FF1GameState);
}
