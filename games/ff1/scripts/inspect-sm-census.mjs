// Per-map teleport census after the fix: for every valid map id, count tiles
// by teleport kind + param. Use it to confirm the dungeon chains and to
// validate lut_NormTele destinations across all six tilesets.
import {
  loadRom,
  buildSmGrid,
  smTilesetForMap,
  smTilesetProp,
  normalTeleportTables,
  TP_TELE_NORM,
  TP_TELE_EXIT,
  TP_TELE_WARP,
  STANDARD_MAP_NAMES,
} from "./ff1-lib.mjs";

const rom = loadRom();
const norm = normalTeleportTables(rom);

const KIND = { [TP_TELE_NORM]: "norm", [TP_TELE_EXIT]: "exit", [TP_TELE_WARP]: "warp  " };
for (let id = 0; id < 64; id++) {
  let grid;
  try {
    grid = buildSmGrid(rom, id);
  } catch {
    continue;
  }
  const prop = smTilesetProp(rom, smTilesetForMap(rom, id));
  const seen = new Map();
  for (const row of grid) {
    for (const t of row) {
      const type = prop[t].prop & 0xc0;
      if (type === 0) continue;
      const label = `${KIND[type]}${prop[t].param.toString(16).padStart(2, "0")}`;
      seen.set(label, (seen.get(label) ?? 0) + 1);
    }
  }
  if (seen.size === 0) continue;
  const normDests = [...[...seen.keys()].filter((k) => k.startsWith("norm"))].map((k) => {
    const tpId = parseInt(k.slice(4), 16);
    return `${k}->0x${norm.map[tpId].toString(16)}`;
  });
  console.log(
    `map 0x${id.toString(16).padStart(2, "0")}: ${[...seen].map(([k, n]) => `${k}x${n}`).join(" ")}` +
      (normDests.length ? `  | ${normDests.join(" ")}` : ""),
  );
}
