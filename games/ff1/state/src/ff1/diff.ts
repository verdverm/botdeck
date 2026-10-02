import type { FF1GameState, InventoryItem, PartyCharacter, WorldState } from "./types.js";

export interface FF1StateDiff {
  changed: boolean;
  party?: {
    index: number;
    name: string;
    hp?: { before: number | undefined; after: number | undefined };
    maxHp?: { before: number | undefined; after: number | undefined };
    level?: { before: number | undefined; after: number | undefined };
    status?: { before: string[]; after: string[] };
  }[];
  gold?: { before: number; after: number; delta: number };
  position?: {
    before: string;
    after: string;
  };
  inventory?: {
    added: InventoryItem[];
    removed: InventoryItem[];
    changed: { item: string; before: number; after: number; delta: number }[];
  };
  summary: string;
}

function formatPosition(world: WorldState | undefined): string {
  if (!world) return "unknown";
  if (world.isOverworld) {
    return `Overworld (${world.overworldX}, ${world.overworldY})`;
  }
  return `${world.mapName ?? `Map ${world.mapId}`} (${world.standardMapX}, ${world.standardMapY})`;
}

function characterName(c: PartyCharacter | undefined): string {
  return c?.name ?? "?";
}

function inventoryKey(item: InventoryItem): string {
  return item.itemInfo?.name ?? `Item ${item.itemId}`;
}

function inventoryMap(items: InventoryItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (item.quantity === 0) continue;
    const key = inventoryKey(item);
    map.set(key, (map.get(key) ?? 0) + item.quantity);
  }
  return map;
}

/**
 * Compare two FF1 state objects and return a concise diff.
 */
export function diffFF1States(before: FF1GameState, after: FF1GameState): FF1StateDiff {
  const partyDiffs: FF1StateDiff["party"] = [];
  const beforeParty = before.party ?? [];
  const afterParty = after.party ?? [];
  const len = Math.max(beforeParty.length, afterParty.length);

  for (let i = 0; i < len; i++) {
    const b = beforeParty[i];
    const a = afterParty[i];
    if (!b && !a) continue;

    const name = characterName(a ?? b);
    const changes: NonNullable<FF1StateDiff["party"]>[number] = { index: i, name };
    let hasChange = false;

    if (b?.hp !== a?.hp) {
      changes.hp = { before: b?.hp, after: a?.hp };
      hasChange = true;
    }
    if (b?.maxHp !== a?.maxHp) {
      changes.maxHp = { before: b?.maxHp, after: a?.maxHp };
      hasChange = true;
    }
    if (b?.level !== a?.level) {
      changes.level = { before: b?.level, after: a?.level };
      hasChange = true;
    }
    const beforeStatus = (b?.status?.ailments ?? []).map((s) => s.name).sort();
    const afterStatus = (a?.status?.ailments ?? []).map((s) => s.name).sort();
    if (beforeStatus.join(",") !== afterStatus.join(",")) {
      changes.status = { before: beforeStatus, after: afterStatus };
      hasChange = true;
    }

    if (hasChange) partyDiffs.push(changes);
  }

  const goldBefore = before.gold ?? 0;
  const goldAfter = after.gold ?? 0;
  const gold = goldBefore !== goldAfter
    ? { before: goldBefore, after: goldAfter, delta: goldAfter - goldBefore }
    : undefined;

  const positionBefore = formatPosition(before.world);
  const positionAfter = formatPosition(after.world);
  const position = positionBefore !== positionAfter
    ? { before: positionBefore, after: positionAfter }
    : undefined;

  const beforeItems = inventoryMap(before.inventory ?? []);
  const afterItems = inventoryMap(after.inventory ?? []);
  const inventory: FF1StateDiff["inventory"] = { added: [], removed: [], changed: [] };

  for (const [key, qty] of afterItems) {
    const prev = beforeItems.get(key) ?? 0;
    if (prev === 0) {
      const item = (after.inventory ?? []).find((i) => inventoryKey(i) === key);
      if (item) inventory.added.push(item);
    } else if (prev !== qty) {
      inventory.changed.push({ item: key, before: prev, after: qty, delta: qty - prev });
    }
  }
  for (const [key, qty] of beforeItems) {
    if (!afterItems.has(key)) {
      const item = (before.inventory ?? []).find((i) => inventoryKey(i) === key);
      if (item) inventory.removed.push(item);
    }
  }

  const changed = partyDiffs.length > 0 || gold !== undefined || position !== undefined ||
    inventory.added.length > 0 || inventory.removed.length > 0 || inventory.changed.length > 0;

  const parts: string[] = [];
  if (gold) parts.push(`Gold: ${gold.before} -> ${gold.after} (${gold.delta >= 0 ? "+" : ""}${gold.delta})`);
  if (position) parts.push(`Position: ${position.before} -> ${position.after}`);
  for (const p of partyDiffs) {
    const details: string[] = [];
    if (p.hp) details.push(`HP ${p.hp.before ?? "?"} -> ${p.hp.after ?? "?"}`);
    if (p.level) details.push(`Lv ${p.level.before ?? "?"} -> ${p.level.after ?? "?"}`);
    if (p.status) details.push(`Status [${p.status.before.join(", ")}] -> [${p.status.after.join(", ")}]`);
    parts.push(`${p.name}: ${details.join(", ")}`);
  }
  for (const item of inventory.added) parts.push(`+${inventoryKey(item)} x${item.quantity}`);
  for (const item of inventory.removed) parts.push(`-${inventoryKey(item)} x${item.quantity}`);
  for (const item of inventory.changed) {
    parts.push(`${item.item}: ${item.before} -> ${item.after} (${item.delta >= 0 ? "+" : ""}${item.delta})`);
  }

  return {
    changed,
    party: partyDiffs.length > 0 ? partyDiffs : undefined,
    gold,
    position,
    inventory,
    summary: parts.length > 0 ? parts.join("; ") : "No changes.",
  };
}
