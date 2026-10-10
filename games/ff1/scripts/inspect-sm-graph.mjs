// Inspect the standard-map teleport graph: dump every normal-teleport edge
// found in the decompressed map grids, plus where named maps lead, so the
// floor-naming scheme in the extractor can be planned against real data.
import {
  loadRom,
  buildSmGrid,
  smTilesetForMap,
  smTilesetProp,
  normalTeleportTables,
  TP_TELE_NORM,
  STANDARD_MAP_NAMES,
} from "./ff1-lib.mjs";

const rom = loadRom();
const norm = normalTeleportTables(rom);

// Valid maps: those that decompress to exactly 4096 tiles.
// edges: map id -> Set of destination map ids.
const edges = new Map();
for (let id = 0; id < 64; id++) {
  let grid;
  try {
    grid = buildSmGrid(rom, id);
  } catch {
    continue;
  }
  const prop = smTilesetProp(rom, smTilesetForMap(rom, id));
  for (const row of grid) {
    for (const t of row) {
      const p = prop[t].prop;
      if ((p & 0xc0) !== TP_TELE_NORM) continue;
      const dst = norm.map[prop[t].param];
      if (!edges.has(id)) edges.set(id, new Set());
      edges.get(id).add(dst);
    }
  }
}

console.log("=== root chains ===");
const depth = new Map();
for (const rootNameId of Object.keys(STANDARD_MAP_NAMES)) {
  const rootId = Number(rootNameId);
  const queue = [[rootId, 0]];
  const seen = new Set([rootId]);
  const chain = [];
  while (queue.length) {
    const [cur, d] = queue.shift();
    chain.push(`${cur}(${d})`);
    for (const dst of edges.get(cur) ?? new Set()) {
      if (seen.has(dst)) continue;
      seen.add(dst);
      if (!depth.has(dst)) depth.set(dst, [rootId, d + 1]);
      queue.push([dst, d + 1]);
    }
  }
  console.log(`${STANDARD_MAP_NAMES[rootNameId]}(${rootId}): ${chain.join(" -> ")}`);
}

console.log("\n=== edges not reachable from any named root ===");
const reachable = new Map();
for (const [id, [root, d]] of depth) {
  reachable.set(id); void root, void d;
}
void reachable;
for (const [id, dests] of [...edges].sort((a, b) => a[0] - b[0])) {
  const known = depth.has(id) || id in STANDARD_MAP_NAMES;
  if (known) continue;
  console.log(`map ${id} -> ${[...dests].join(",")}`);
}
