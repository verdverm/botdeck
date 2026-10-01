import type { FF1GameState, PartyCharacter, SpellChargeLevel, WorldState } from "./types.js";

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
  const items = state.inventory
    .filter((item) => item.quantity > 0 && item.itemInfo)
    .slice(0, 20)
    .map((item) => `${item.itemInfo?.name ?? `Item ${item.itemId}`} x${item.quantity}`);
  if (items.length === 0) return "None";
  return items.join(", ");
}

function formatCharacter(c: PartyCharacter): string {
  const lines: string[] = [
    `- ${c.name} (${c.classInfo?.name ?? `Class ${c.classId}`}) Lv ${c.level ?? "-"}`,
    `  HP: ${c.hp ?? "-"} / ${c.maxHp ?? "-"} | MP: ${mpSummary(c.spellCharges?.levels)}`,
  ];
  const ailments = c.status?.ailments.map((s) => s.name).join(", ");
  if (ailments) lines.push(`  Status: ${ailments}`);
  const eq = c.equipment;
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

  const party = state.party.map(formatCharacter).join("\n") || "No party data.";
  const vehicles = state.world.ownedVehicles.length > 0
    ? state.world.ownedVehicles.join(", ")
    : "None";
  const currentVehicle = state.world.currentVehicle
    ? ` (riding ${state.world.currentVehicle})`
    : "";

  return [
    "## Party",
    party,
    "",
    "## Resources",
    `- Gold: ${state.gold.toLocaleString()}`,
    `- Position: ${formatPosition(state.world)}`,
    `- Vehicles: ${vehicles}${currentVehicle}`,
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
