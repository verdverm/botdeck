import type { DialogState, FF1GameState, GameContext, KnownLocation, MenuState, PartyCharacter, SpellChargeLevel, WorldState } from "./types.js";

export function mpSummary(charges: SpellChargeLevel[] | undefined): string {
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

function formatInventory(state: FF1GameState): string {
  if (!Array.isArray(state.inventory)) return "None";
  const items = state.inventory
    .filter((item) => item.quantity > 0 && item.itemInfo)
    .slice(0, 20)
    .map((item) => `${item.itemInfo?.name ?? `Item ${item.itemId}`} x${item.quantity}`);
  if (items.length === 0) return "None";
  return items.join(", ");
}

function formatKeyItems(state: FF1GameState): string {
  const flags = state.flags;
  if (!flags) return "Unknown";
  const items: string[] = [];
  if (flags.hasLute) items.push("Lute");
  if (flags.hasCrown) items.push("Crown");
  if (flags.hasCrystal) items.push("Crystal");
  if (flags.hasHerb) items.push("Herb");
  if (flags.hasMysticKey) items.push("Mystic Key");
  if (flags.hasTnt) items.push("TNT");
  if (flags.hasAdamant) items.push("Adamant");
  if (flags.hasSlab) items.push("Slab");
  if (flags.hasRuby) items.push("Ruby");
  if (flags.hasRod) items.push("Rod");
  if (flags.hasFloater) items.push("Floater");
  if (flags.hasChime) items.push("Chime");
  if (flags.hasTail) items.push("Tail");
  if (flags.hasCube) items.push("Cube");
  if (flags.hasBottle) items.push("Bottle");
  if (flags.hasOxyale) items.push("Oxyale");
  if (flags.hasCanoe) items.push("Canoe");
  return items.length > 0 ? items.join(", ") : "None";
}

function formatOrbs(state: FF1GameState): string {
  const flags = state.flags;
  if (!flags) return "Unknown";
  const orbs: string[] = [];
  if (flags.hasEarthOrb) orbs.push("Earth");
  if (flags.hasFireOrb) orbs.push("Fire");
  if (flags.hasWaterOrb) orbs.push("Water");
  if (flags.hasAirOrb) orbs.push("Air");
  return orbs.length > 0 ? `${orbs.length}/4 (${orbs.join(", ")})` : "0/4";
}

function formatDialog(dialog: DialogState | undefined): string {
  if (!dialog) return "No on-screen text.";
  const lines: string[] = [];
  if (dialog.open) {
    lines.push("Dialog box is open.");
  } else if (!dialog.pages || dialog.pages.length === 0) {
    return "No on-screen text.";
  }
  if (dialog.current) {
    lines.push(`Current text: ${dialog.current.replace(/\n/g, " ")}`);
  }
  if (dialog.pages && dialog.pages.length > 0) {
    lines.push("Dialog pages seen this turn:");
    for (let i = 0; i < dialog.pages.length; i++) {
      lines.push(`  ${i + 1}. ${dialog.pages[i]!.replace(/\n/g, " ")}`);
    }
  }
  return lines.join("\n");
}

function formatLocations(locations: KnownLocation[] | undefined): string {
  if (!locations || locations.length === 0) return "None";
  return locations
    .map((loc) => {
      const badge = loc.reachable ? `[${loc.reachable}] ` : "";
      return `- ${badge}${loc.name} (${loc.id})`;
    })
    .join("\n");
}

function formatBattle(state: FF1GameState): string {
  const battle = state.battle;
  if (!battle?.inBattle) return "Not in battle.";
  const enemies = battle.enemies.length > 0
    ? battle.enemies
        .map((e) => `- ${e.name ?? `Enemy ${e.slot + 1}`} (slot ${e.slot}, HP ${e.hp ?? "?"})`)
        .join("\n")
    : "- Enemy roster unread (offsets TODO)";
  const party = battle.party
    .map((m) => `- ${m.name}: ${m.canAct ? "can act" : "cannot act"} (row ${m.position.row})`)
    .join("\n");
  return [
    `Active actor: ${battle.activePartyIndex !== undefined ? state.party[battle.activePartyIndex]?.name ?? "?" : "unknown"}`,
    "Enemies:",
    enemies,
    "Party:",
    party,
  ].join("\n");
}

export function formatContext(context: GameContext | undefined): string {
  const ctx = context ?? { mode: "unknown", menu: "unknown" };
  if (ctx.mode === "battle" && ctx.menu !== "battle") {
    return `battle / ${ctx.menu}`;
  }
  if (ctx.mode === "menu") {
    const extra = ctx.shopType ? ` (${ctx.shopType}${ctx.shopId !== undefined ? ` #${ctx.shopId}` : ""})` : "";
    return `${ctx.menu}${extra}`;
  }
  if (ctx.mode === "field" && ctx.menu !== "field" && ctx.menu !== "unknown") {
    return ctx.menu;
  }
  return ctx.mode;
}

export function formatMenu(menu: MenuState | undefined): string {
  if (!menu) return "unknown";
  const bits: string[] = [
    `cursor ${menu.cursor ?? "-"}/${menu.cursorMax}`,
    `window $1f=${menu.windowId}`,
    menu.menuOverlay ? "overlay-bit-set" : "overlay-bit-clear",
  ];
  if (menu.enteringShop) bits.push(`shop ${menu.shopType ?? "?"} #${menu.shopId ?? "?"}`);
  if (menu.dialogOpen) bits.push("dialog");
  return bits.join(" | ");
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
  return [
    "## Party",
    party,
    "",
    "## Resources",
    `- Gold: ${gold}`,
    `- Position: ${formatPosition(world)}`,
    `- Vehicles: ${vehicles}${currentVehicle}`,
    `- Context: ${formatContext(state.context)}`,
    `- Menu: ${formatMenu(state.menu)}`,
    "",
    "## Battle",
    formatBattle(state),
    "",
    "## Key Items",
    formatKeyItems(state),
    "",
    "## Orbs",
    formatOrbs(state),
    "",
    "## Available Locations",
    formatLocations(state.availableLocations),
    "",
    "## Inventory",
    formatInventory(state),
    "",
    "## On-screen text",
    formatDialog(state.dialog),
  ].join("\n");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function formatFF1StateFromUnknown(value: unknown): string {
  if (!isPlainObject(value)) return "No state available.";
  const candidate = value.ff1 ?? value;
  if (!isPlainObject(candidate)) return "No state available.";
  try {
    return formatFF1GameInfo(candidate as unknown as FF1GameState);
  } catch {
    return "No FF1 state available.";
  }
}
