// Inspect the special (quest-gated) bits on overworld tiles.
//
// OWCanMove adds a foot-only rule on top of the vehicle mask: when the target
// tile's *first* property byte (`blockMask`) has bits 6-7 set, the tile is gated
// by a key item - $40 needs the Chime, $80 is the Caravan door. The walkability
// masks in overworld.json ignore those, so a route can plan through a tile the
// game will refuse. This script finds which tiles are gated.
//
// Run: node check-special-tiles.mjs [x y ...]   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import { MAPS_DIR } from "./ff1-lib.mjs";

const map = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, "overworld.json"), "utf8"));
const { tiles, tileProps, width, height } = map;

const LABELS = {
  0x00: "none",
  0x40: "CHIME (blocked on foot without the Chime)",
  0x80: "CARAVAN (fairy-gated door)",
  0xc0: "FLOATER-coded tile",
};

// Specific tiles to report, if given.
for (let i = 2; i < process.argv.length; i += 2) {
  const x = Number(process.argv[i]);
  const y = Number(process.argv[i + 1]);
  const id = tiles[y]?.[x];
  const props = tileProps[String(id)];
  const gate = props.blockMask & 0xc0;
  console.log(
    `(${x},${y}) tile ${id} blockMask $${props.blockMask.toString(16).padStart(2, "0")} ` +
      `byte1 $${props.special.toString(16).padStart(2, "0")} ` +
      `foot=${props.pass.foot} gate=${LABELS[gate] ?? `other $${gate.toString(16)}`} ` +
      `teleport=${(props.special & 0x80) !== 0} encounter=${(props.special & 0x80) === 0 && (props.special & 0x40) !== 0}`,
  );
}

// Census of special-bit values over the tiles actually used by the map.
const used = new Set();
for (const row of tiles) for (const t of row) used.add(t);
const bySpecial = new Map();
for (const t of used) {
  const gate = tileProps[String(t)].blockMask & 0xc0;
  if (gate === 0) continue;
  if (!bySpecial.has(gate)) bySpecial.set(gate, { count: 0, tiles: new Set() });
  const e = bySpecial.get(gate);
  e.count += 1;
  e.tiles.add(t);
}

console.log(`\nused tile ids: ${used.size}  tiles with special bits set:`);
for (const [gate, e] of [...bySpecial.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  $${gate.toString(16).padStart(2, "0")}: ${e.count} tiles  ids [${[...e.tiles].sort((a, b) => a - b).join(",")}]`);
}

// Where do the gated tiles sit? Print their bounding boxes so we can see whether
// they block a chokepoint or just decorate an unreachable mountain.
for (const [gate, e] of [...bySpecial.entries()].sort((a, b) => a[0] - b[0])) {
  const spots = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const id = tiles[y][x];
      if ((tileProps[String(id)].blockMask & 0xc0) === gate) spots.push({ x, y, id });
    }
  }
  const xs = spots.map((s) => s.x);
  const ys = spots.map((s) => s.y);
  console.log(
    `  gate $${gate.toString(16).padStart(2, "0")} bounds x ${Math.min(...xs)}..${Math.max(...xs)} y ${Math.min(...ys)}..${Math.max(...ys)} (${spots.length} tiles)`,
  );
  if (spots.length <= 24) console.log(`    ${spots.map((s) => `(${s.x},${s.y})t${s.id}`).join(" ")}`);
}
