// Validate the game-ready overworld.json produced by extract-ow-map.mjs.
// Run: node check-ow-map.mjs   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import { MAPS_DIR, STANDARD_MAP_NAMES } from "./ff1-lib.mjs";

const game = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, "overworld.json"), "utf8"));

const problems = [];
function assert(cond, msg) {
  if (!cond) problems.push(msg);
}

assert(game.width === 256 && game.height === 256, "grid not 256x256");
assert(game.tiles.length === 256 && game.tiles[0].length === 256, "tiles shape wrong");
assert(Array.isArray(game.locations) && game.locations.length > 0, "no locations");

// every location's center tile is a teleport (warp) tile
for (const loc of game.locations) {
  const t = game.tiles[loc.y][loc.x];
  const tp = game.tileProps[t];
  assert((tp.special & 0x80) !== 0, `loc ${loc.name ?? loc.destMapId} center is not a teleport tile`);
  // dest map name matches when named
  if (loc.name) {
    assert(STANDARD_MAP_NAMES[loc.destMapId] === loc.name, `loc name mismatch at (${loc.x},${loc.y})`);
  }
  assert(loc.glyph && typeof loc.glyph === "string", `loc ${loc.x},${loc.y} missing glyph`);
}

// unique glyphs
const glyphs = game.locations.map((l) => l.glyph);
assert(new Set(glyphs).size === glyphs.length, "duplicate location glyph");

const named = game.locations.filter((l) => l.name).length;
console.log(`overworld.json OK: ${game.locations.length} locations, ${named} named, ${glyphs.length} glyphs`);
if (problems.length) {
  console.log("PROBLEMS:");
  for (const p of problems) console.log("  - " + p);
  process.exit(1);
} else {
  console.log("all checks passed");
}
