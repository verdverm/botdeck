// Navigation sanity check for the extracted overworld grid.
//
// Answers the two questions the goto compiler depends on:
//   1. Which named locations are reachable on foot from a given position?
//   2. How long is each route, in tiles and in held-button frames?
//
// Run: node check-nav.mjs [scrollX scrollY]   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import { MAPS_DIR, VEHICLES, findClusters } from "./ff1-lib.mjs";

const map = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, "overworld.json"), "utf8"));
const { tiles, tileProps, locations, width, height } = map;

// The party tile is the screen scroll plus the fixed centre offset.
// VERIFIED: OWCanMove @Calc, bank_0F.asm:1086+.
const PLAYER_OFFSET = 7;
const scroll = {
  x: Number(process.argv[2] ?? 146),
  y: Number(process.argv[3] ?? 158),
};
const start = {
  x: (scroll.x + PLAYER_OFFSET) % width,
  y: (scroll.y + PLAYER_OFFSET) % height,
};

// Frames the party spends crossing one tile, per vehicle.
// VERIFIED: StartMapMove sets move_speed (px/frame) and a tile is 16 px.
const FRAMES_PER_TILE = { foot: 16, canoe: 16, ship: 8, airship: 4 };

const vehicles = Object.keys(VEHICLES);

function walkable(x, y, vehicle) {
  const props = tileProps[String(tiles[y][x])];
  return props.pass[vehicle];
}

// Connected component of the start tile for one vehicle.
function reachableSet(vehicle) {
  const clusters = findClusters(tiles, (x, y) => walkable(x, y, vehicle));
  const key = (x, y) => y * width + x;
  for (const comp of clusters) {
    if (comp.some(([x, y]) => x === start.x && y === start.y)) {
      return new Set(comp.map(([x, y]) => key(x, y)));
    }
  }
  return new Set();
}

// BFS distance to the goal, so route length matches what A* reports.
function bfsDistance(vehicle, goal) {
  const key = (x, y) => y * width + x;
  const seen = new Set([key(start.x, start.y)]);
  const queue = [[start.x, start.y, 0]];
  let head = 0;
  while (head < queue.length) {
    const [cx, cy, d] = queue[head++];
    if (cx === goal.x && cy === goal.y) return d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = (cx + dx + width) % width;
      const ny = (cy + dy + height) % height;
      if (seen.has(key(nx, ny)) || !walkable(nx, ny, vehicle)) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny, d + 1]);
    }
  }
  return null;
}

console.log(`scroll (${scroll.x},${scroll.y}) -> party tile (${start.x},${start.y})`);
console.log(`standing tile: ${tiles[start.y][start.x]}, walkable on foot: ${walkable(start.x, start.y, "foot")}\n`);

for (const vehicle of vehicles) {
  const set = reachableSet(vehicle);
  const named = locations.filter((l) => l.name);
  const reached = named.filter((l) =>
    l.warpTiles.some(([wx, wy]) => set.has(wy * width + wx)),
  );
  console.log(
    `${vehicle.padEnd(8)} reachable tiles ${String(set.size).padStart(5)}  named locations ${reached.length}/${named.length}`,
  );
  for (const loc of reached) {
    const goal = loc.warpTiles
      .map(([x, y]) => ({ x, y }))
      .sort(
        (a, b) =>
          Math.abs(a.x - start.x) + Math.abs(a.y - start.y) - (Math.abs(b.x - start.x) + Math.abs(b.y - start.y)),
      )[0];
    const tiles_ = bfsDistance(vehicle, goal);
    const frames = tiles_ === null ? "?" : tiles_ * FRAMES_PER_TILE[vehicle];
    console.log(
      `  ${(loc.name ?? "").padEnd(20)} entrance (${goal.x},${goal.y})  ${String(tiles_).padStart(4)} tiles  ${String(frames).padStart(5)} frames  ${(Number(frames) / 60).toFixed(1)}s`,
    );
  }
  const missed = named.filter((l) => !reached.includes(l)).map((l) => l.name);
  if (missed.length) console.log(`  no ${vehicle} route: ${missed.join(", ")}`);
  console.log("");
}
