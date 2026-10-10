// Overworld extractor for FF1 (NES). Single source of truth for the map data.
// Uses ff1-lib.mjs. Writes exactly two artifacts to games/ff1/maps/:
//   overworld.json  - game-ready: tile grid, per-tile walkability, locations
//   overworld.txt   - ASCII render: terrain + entrance glyphs + legend
//
// Naming/entrance mechanism (VERIFIED vs disassembly):
//   - A tile whose tileset_prop special byte has bit 7 set is a teleport tile;
//     low 6 bits = teleport ID (bank_0F.asm:388 @Teleport).
//   - Teleport ID indexes lut_EntrTele_Map -> destination standard-map ID.
//   - Map IDs 0x00-0x0C have names via STANDARD_MAP_NAMES (reader.ts mirror).
//   - Walkability: blocked = (blockMask & vehicleMask) != 0 (OWCanMove, bank_0F.asm:1086).
// Run: node extract-ow-map.mjs   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import {
  loadRom,
  MAPS_DIR,
  ROM_PATH,
  VEHICLES,
  buildOwGrid,
  owTilesetProp,
  minimapTileset,
  passability,
  terrainChar,
  entranceTeleportTables,
  tileTeleport,
  STANDARD_MAP_NAMES,
} from "./ff1-lib.mjs";

const rom = loadRom();
const grid = buildOwGrid(rom);
const prop = owTilesetProp(rom);
const mini = minimapTileset(rom);
const tele = entranceTeleportTables(rom);

// --- per-tile walkability ----------------------------------------------
const tileIds = new Set();
for (const row of grid) for (const t of row) tileIds.add(t);
const maxTile = Math.max(...tileIds);

const tileProps = {};
for (let t = 0; t <= maxTile; t++) {
  tileProps[t] = {
    blockMask: prop[t].blockMask,
    special: prop[t].special,
    minimap: mini[t],
    pass: passability(prop[t].blockMask),
  };
}

// --- locations from overworld teleport (warp) tiles --------------------
const warps = [];
for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 256; x++) {
    const t = grid[y][x];
    const tpId = tileTeleport(prop[t].special);
    if (tpId === null || tpId >= tele.map.length) continue;
    warps.push({ x, y, tile: t, tpId, mapId: tele.map[tpId] });
  }
}

// Group by destination standard-map id. A location == its destination map, so
// all warp tiles (across any teleport IDs) that lead to the same map are one
// location, even when the entrances are physically separate on the overworld.
const byMap = new Map();
for (const w of warps) {
  if (!byMap.has(w.mapId)) byMap.set(w.mapId, []);
  byMap.get(w.mapId).push(w);
}

const locations = [];
for (const [mapId, list] of [...byMap.entries()].sort((a, b) => a[0] - b[0])) {
  const xs = list.map((w) => w.x);
  const ys = list.map((w) => w.y);
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  // Representative center = the actual warp tile nearest the centroid, so the
  // center is a real walk-onto-me entrance tile.
  let best = list[0];
  let bestD = Infinity;
  for (const w of list) {
    const d = (w.x - cx) ** 2 + (w.y - cy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  locations.push({
    destMapId: mapId,
    teleportIds: [...new Set(list.map((w) => w.tpId))].sort((a, b) => a - b),
    x: best.x,
    y: best.y,
    warpTiles: list.map((w) => [w.x, w.y]),
    name: STANDARD_MAP_NAMES[mapId] ?? null,
  });
}
locations.sort((a, b) => a.y - b.y || a.x - b.x);

// --- write game-ready JSON ---------------------------------------------
fs.mkdirSync(MAPS_DIR, { recursive: true });

// Serialize the game object readably: pretty top-level, but each 256-tile row
// stays on its own compact line (a full JSON.stringify(_,null,2) would put
// every tile id on its own line = 65k+ lines).
function serializeGame(g) {
  const rows = g.tiles.map((r) => "    [" + r.join(",") + "]").join(",\n");
  const tileProps = Object.entries(g.tileProps)
    .map(([t, p]) => `    ${JSON.stringify(t)}: ${JSON.stringify(p)}`)
    .join(",\n");
  const locations = g.locations.map((l) => "    " + JSON.stringify(l)).join(",\n");
  const head = {
    source: g.source,
    map: g.map,
    width: g.width,
    height: g.height,
    vehicleMasks: g.vehicleMasks,
    walkRule: g.walkRule,
  };
  const headStr = Object.entries(head)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(",\n");
  return (
    "{\n" +
    headStr +
    ",\n  \"tiles\": [\n" +
    rows +
    "\n  ],\n  \"tileProps\": {\n" +
    tileProps +
    "\n  },\n  \"locations\": [\n" +
    locations +
    "\n  ]\n}\n"
  );
}

const game = {
  source: path.relative(path.resolve("."), ROM_PATH),
  map: "overworld",
  width: 256,
  height: 256,
  vehicleMasks: VEHICLES,
  walkRule: "blocked = (blockMask & vehicleMask) != 0  (OWCanMove, bank_0F.asm:1086)",
  // tiles[y][x] = tile id; tileProps[id].pass[vehicle] = walkable boolean.
  tiles: grid,
  tileProps,
  // locations: entrance sites. name null => standard map beyond 0x0C (dungeon).
  locations,
};

// --- ASCII render: terrain + entrance glyphs + legend ------------------
// Glyph pool must be disjoint from the terrain chars used by terrainChar()
// ('.', 'r', '~', '#'), so use uppercase + digits only (36 >= location count).
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const glyphFor = new Map();
const legend = [];
locations.forEach((loc, i) => {
  const g = GLYPHS[i % GLYPHS.length];
  loc.glyph = g;
  for (const [wx, wy] of loc.warpTiles) glyphFor.set(`${wx},${wy}`, g);
  legend.push(
    `${g} = ${loc.name ?? `Map 0x${loc.destMapId.toString(16).padStart(2, "0")} (tp ${loc.teleportIds.join("/")})`} @ (${loc.x},${loc.y})`
  );
});

const lines = [];
lines.push("FF1 overworld - '.' land  '=' river(canoe)  '~' ocean(ship)  '#' blocked(airship only)");
lines.push("Entrance glyphs (A-Z/0-9, see LEGEND) mark overworld warp tiles.");
for (let y = 0; y < 256; y++) {
  let row = "";
  for (let x = 0; x < 256; x++) row += glyphFor.get(`${x},${y}`) ?? terrainChar(prop[grid[y][x]]);
  lines.push(row);
}
lines.push("");
lines.push("LEGEND");
lines.push(...legend);
fs.writeFileSync(path.join(MAPS_DIR, "overworld.txt"), lines.join("\n") + "\n");

// write json once, after glyphs are assigned
fs.writeFileSync(path.join(MAPS_DIR, "overworld.json"), serializeGame(game));

const named = locations.filter((l) => l.name).length;
console.log(`Wrote ${MAPS_DIR}/overworld.json  (${tileIds.size} tiles, ${locations.length} locations, ${named} named)`);
console.log(`Wrote ${MAPS_DIR}/overworld.txt   (terrain render + entrance legend)`);
