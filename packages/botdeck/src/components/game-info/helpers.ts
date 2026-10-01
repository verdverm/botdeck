import type { WorldState } from "@games/ff1-state";

export function mpSummary(charges: { current?: number; max?: number }[] | undefined): string {
  if (!charges || charges.length === 0) return "-";
  return charges.map((l) => `${l.current ?? 0}/${l.max ?? 0}`).join(", ");
}

export function formatPosition(world: WorldState | undefined): string {
  if (!world) return "Unknown";
  if (world.isOverworld) {
    return `Overworld (${world.overworldX}, ${world.overworldY})`;
  }
  return `${world.mapName ?? `Map ${world.mapId}`} (${world.standardMapX}, ${world.standardMapY})`;
}
