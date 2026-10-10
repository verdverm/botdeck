// Overworld location extractor for FF1 (NES).
// Uses ff1-lib.mjs. Produces games/ff1/maps/overworld-locations.json and an
// overlaid ASCII render games/ff1/maps/overworld-locations.txt.
//
// Mechanism (VERIFIED against the disassembly):
//   - An overworld tile whose tileset_prop special byte has bit 7 set is a
//     teleport (warp) tile; low 6 bits = teleport ID (bank_0F.asm:388 @Teleport).
//   - Teleport ID indexes lut_EntrTele_Map -> destination standard-map ID.
//   - Map IDs 0x00-0x0C have names via STANDARD_MAP_NAMES (reader.ts).
//   - The minimap tileset bit $04 marks town/dungeon footprints (decoration),
//     used here only to render a glyph at the footprint, not for naming.
// Run: node extract-locations.mjs   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import {
  loadRom,
  MAPS_DIR,
  buildOwGrid,
  owTilesetProp,
  minimapTileset,
  isTownDungeonTile,
  entranceTeleportTables,
  tileTeleport,
  terrainChar,
  STANDARD_MAP_NAMES,
} from "./ff1-lib.mjs";
import path from "node:path";

const rom = loadRom();
const grid = buildOwGrid(rom);
const prop = owTilesetProp(rom);
const mini = minimapTileset(rom);
const tele = entranceTeleportTables(rom);

// Collect warp tiles: every grid cell whose tile is a teleport tile.
const warps = [];
for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 256; x++) {
    const t = grid[y][x];
    const tpId = tileTeleport(prop[t].special);
    if (tpId === null || tpId >= tele.map.length) continue;
    warps.push({ x, y, tile: t, tpId, mapId: tele.map[tpId] });
  }
}

// Group warp tiles that share a teleport ID AND are near each other on the map.
// Adjacent warp tiles for the same destination are one entrance.
function keyOf(w) {
  return `${w.tpId}`;
}
const byId = new Map();
for (const w of warps) {
  const k = keyOf(w);
  if (!byId.has(k)) byId.set(k, []);
  byId.get(k).push(w);
}

// Merge tiles of the same tpId into entrances by 4-connectivity of their
// footprint, so two distant sites sharing a tpId become two separate entries.
function footprintToEntrances(list) {
  const set = new Set(list.map((w) => `${w.x},${w.y}`));
  const seen = new Set();
  const groups = [];
  for (const w of list) {
    const k = `${w.x},${w.y}`;
    if (seen.has(k)) continue;
    const stack = [w];
    seen.add(k);
    const comp = [];
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nk = `${c.x + dx},${c.y + dy}`;
        if (set.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(list.find((z) => z.x === c.x + dx && z.y === c.y + dy));
        }
      }
    }
    groups.push(comp);
  }
  return groups;
}

const locations = [];
for (const [tpIdStr, list] of [...byId.entries()].sort((a, b) => +a[0] - +b[0])) {
  const groups = footprintToEntrances(list);
  for (const g of groups) {
    const xs = g.map((w) => w.x);
    const ys = g.map((w) => w.y);
    const x = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    const y = Math.round(ys.reduce((a, b) => a + b, 0) / ys.length);
    const mapId = g[0].mapId;
    locations.push({
      teleportId: +tpIdStr,
      x,
      y,
      warpTiles: g.map((w) => [w.x, w.y]),
      destMapId: mapId,
      name: STANDARD_MAP_NAMES[mapId] ?? null,
    });
  }
}

locations.sort((a, b) => a.y - b.y || a.x - b.x);
fs.mkdirSync(MAPS_DIR, { recursive: true });
fs.writeFileSync(path.join(MAPS_DIR, "overworld-locations.json"), JSON.stringify({ locations }, null, 2));

// Merge locations into the game-ready overworld.json (produced by
// extract-ow-map.mjs; run that first).
const gamePath = path.join(MAPS_DIR, "overworld.json");
if (fs.existsSync(gamePath)) {
  const game = JSON.parse(fs.readFileSync(gamePath, "utf8"));
  game.locations = locations;
  fs.writeFileSync(gamePath, JSON.stringify(game));
} else {
  console.log("note: overworld.json not found; run extract-ow-map.mjs first to merge locations");
}

// --- ASCII render with per-location glyph + legend ----------------------
// Terrain base from walkability, warp tiles overwritten with the location glyph.
const GLYPHS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const glyphFor = new Map(); // `${x},${y}` -> glyph
const legend = [];
locations.forEach((loc, i) => {
  const g = GLYPHS[i % GLYPHS.length];
  for (const [wx, wy] of loc.warpTiles) glyphFor.set(`${wx},${wy}`, g);
  legend.push(`${g} = ${loc.name ?? `Map 0x${loc.destMapId.toString(16).padStart(2, "0")} (tp ${loc.teleportId})`} @ (${loc.x},${loc.y})`);
});

function terrainCharFor(t) {
  return terrainChar(prop[t]);
}

const lines = [];
lines.push("FF1 overworld entrances. Terrain: . land  r river  ~ ocean  # blocked.");
lines.push("Lower/upper glyphs = warp (entrance) tiles, see legend.");
for (let y = 0; y < 256; y++) {
  let row = "";
  for (let x = 0; x < 256; x++) {
    const g = glyphFor.get(`${x},${y}`);
    row += g ?? terrainCharFor(grid[y][x]);
  }
  lines.push(row);
}
lines.push("");
lines.push("LEGEND");
lines.push(...legend);
fs.writeFileSync(path.join(MAPS_DIR, "overworld-locations.txt"), lines.join("\n") + "\n");

console.log(`Wrote ${MAPS_DIR}/overworld-locations.json (${locations.length} locations, ${warps.length} warp tiles)`);
console.log(`Wrote ${MAPS_DIR}/overworld-locations.txt`);
const named = locations.filter((l) => l.name).length;
console.log(`  named: ${named}/${locations.length}`);
