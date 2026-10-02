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
  context?: {
    battle?: { before: boolean; after: boolean };
    menu?: { before: string | undefined; after: string | undefined };
    dialog?: { before: boolean; after: boolean };
    cursor?: { before: number | undefined; after: number | undefined };
    shop?: { before: string | undefined; after: string | undefined };
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

  const ctxBefore = before.context ?? { mode: "unknown", menu: "unknown" };
  const ctxAfter = after.context ?? { mode: "unknown", menu: "unknown" };
  const menuBefore = ctxBefore.mode === "menu" ? ctxBefore.menu : undefined;
  const menuAfter = ctxAfter.mode === "menu" ? ctxAfter.menu : undefined;
  const context: FF1StateDiff["context"] = {};
  if (before.battle?.inBattle !== after.battle?.inBattle) {
    context.battle = {
      before: before.battle?.inBattle ?? false,
      after: after.battle?.inBattle ?? false,
    };
  }
  if (menuBefore !== menuAfter) {
    context.menu = { before: menuBefore, after: menuAfter };
  }
  if (before.menu?.dialogOpen !== after.menu?.dialogOpen) {
    context.dialog = {
      before: before.menu?.dialogOpen ?? false,
      after: after.menu?.dialogOpen ?? false,
    };
  }
  if (before.menu?.cursor !== after.menu?.cursor) {
    context.cursor = {
      before: before.menu?.cursor,
      after: after.menu?.cursor,
    };
  }
  const shopBefore = before.menu?.enteringShop ? before.menu.shopType : undefined;
  const shopAfter = after.menu?.enteringShop ? after.menu.shopType : undefined;
  if (shopBefore !== shopAfter) {
    context.shop = { before: shopBefore, after: shopAfter };
  }
  const hasContextChange = Object.keys(context).length > 0;

  const changed = partyDiffs.length > 0 || gold !== undefined || position !== undefined ||
    inventory.added.length > 0 || inventory.removed.length > 0 || inventory.changed.length > 0 ||
    hasContextChange;

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
  if (context.battle) parts.push(`Battle: ${context.battle.before} -> ${context.battle.after}`);
  if (context.menu) parts.push(`Menu: ${context.menu.before ?? "none"} -> ${context.menu.after ?? "none"}`);
  if (context.dialog) parts.push(`Dialog: ${context.dialog.before} -> ${context.dialog.after}`);
  if (context.cursor) parts.push(`Cursor: ${context.cursor.before ?? "?"} -> ${context.cursor.after ?? "?"}`);
  if (context.shop) parts.push(`Shop: ${context.shop.before ?? "none"} -> ${context.shop.after ?? "none"}`);

  return {
    changed,
    party: partyDiffs.length > 0 ? partyDiffs : undefined,
    gold,
    position,
    inventory,
    context: hasContextChange ? context : undefined,
    summary: parts.length > 0 ? parts.join("; ") : "No changes.",
  };
}
