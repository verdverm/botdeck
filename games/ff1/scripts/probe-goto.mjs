// End-to-end check for the goto pipeline: path over the extracted grid, then
// press the compiled d-pad sequence on the real core and confirm the party ends
// on the entrance tile with no drift.
//
// This is the timing model from packages/botdeck/src/games/ff1-nav.ts
// (OW_STEP_HOLD_FRAMES / OW_STEP_GAP_FRAMES, one press per tile) exercised
// against jsnes, so a regression in either the grid or the step timing shows up
// here before it shows up in a live play.
//
// Run: node probe-goto.mjs [location name] [state file]   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import { NES } from "../../../packages/botdeck/node_modules/jsnes/src/index.js";
import { ROM_PATH, MAPS_DIR } from "./ff1-lib.mjs";

// Mirrors ff1-nav.ts. Kept literal so a mismatch is loud rather than implicit.
const OW_STEP_HOLD_FRAMES = 2;
const OW_STEP_GAP_FRAMES = 20;
const PLAYER_OFFSET = 7;
const BUTTONS = { up: 4, down: 5, left: 6, right: 7 };
const BUTTON_NAMES = Object.fromEntries(Object.entries(BUTTONS).map(([k, v]) => [v, k]));

const wanted = String(process.argv[2] ?? "Coneria");
const stateArg = process.argv[3];
const STATE_PATH = stateArg
  ? path.resolve(stateArg)
  : path.resolve(path.dirname(ROM_PATH), "../../plays/ff1/0000_dev/states/000001-start-01.state.json");

const map = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, "overworld.json"), "utf8"));
const { tiles, tileProps, locations, width, height } = map;

const key = (x, y) => y * width + x;
const wrap = (v, max) => ((v % max) + max) % max;
const walkable = (x, y) => tileProps[String(tiles[wrap(y, height)][wrap(x, width)])]?.pass.foot === true;

function bfs(from, goal) {
  if (from.x === goal.x && from.y === goal.y) return [];
  const came = new Map([[key(from.x, from.y), null]]);
  const queue = [from];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = wrap(cur.x + dx, width);
      const ny = wrap(cur.y + dy, height);
      if (came.has(key(nx, ny)) || !walkable(nx, ny)) continue;
      came.set(key(nx, ny), cur);
      if (nx === goal.x && ny === goal.y) {
        const path = [];
        let node = { x: nx, y: ny };
        while (node && !(node.x === from.x && node.y === from.y)) {
          path.unshift(node);
          node = came.get(key(node.x, node.y));
        }
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

const named = locations.filter((l) => l.name);
const loc = named.find((l) => l.name.toLowerCase() === wanted.toLowerCase());
if (!loc) {
  console.error(`no named location matching "${wanted}". Known: ${named.map((l) => l.name).join(", ")}`);
  process.exit(1);
}

const noop = () => {};
const nes = new NES({ onFrame: noop, onAudioSample: noop, emulateSound: false, sampleRate: 44100 });
nes.loadROM(fs.readFileSync(ROM_PATH));
const saved = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
nes.fromJSON(saved.state ?? saved);

const mem = nes.mmap?.mem ?? nes.cpu?.mem;
if (!mem || mem.length < 0x10000) {
  console.error(`no CPU memory available (got ${mem?.length})`);
  process.exit(1);
}

const readTile = () => ({
  x: wrap(mem[0x0027] + PLAYER_OFFSET, width),
  y: wrap(mem[0x0028] + PLAYER_OFFSET, height),
});

for (let i = 0; i < 4; i++) nes.frame(); // let any pending move settle
const start = readTile();
const goal = loc.warpTiles
  .map(([x, y]) => ({ x, y }))
  .sort((a, b) => Math.abs(a.x - start.x) + Math.abs(a.y - start.y) - (Math.abs(b.x - start.x) + Math.abs(b.y - start.y)))[0];
const route = bfs(start, goal);

console.log(`state:   ${path.basename(STATE_PATH)}`);
console.log(`vehicle: $${mem[0x0042].toString(16).padStart(2, "0")}  mapflags: $${mem[0x002d].toString(16).padStart(2, "0")}`);
console.log(`start tile (${start.x},${start.y}) -> ${loc.name} entrance (${goal.x},${goal.y})`);

if (route === null) {
  console.log("no foot route on the extracted grid; nothing to walk");
  process.exit(1);
}
console.log(`route:   ${route.length} tiles  (hold ${OW_STEP_HOLD_FRAMES} / gap ${OW_STEP_GAP_FRAMES} per tile)`);

let drift = 0;
let cursor = start;
let battles = 0;
for (let i = 0; i < route.length; i++) {
  const expect = route[i];
  let dx = expect.x - cursor.x;
  let dy = expect.y - cursor.y;
  if (Math.abs(dx) > 1) dx = dx > 0 ? -1 : 1;
  if (Math.abs(dy) > 1) dy = dy > 0 ? -1 : 1;
  const direction = dy === -1 ? "up" : dy === 1 ? "down" : dx === -1 ? "left" : "right";
  const button = BUTTONS[direction];

  nes.buttonDown(1, button);
  for (let f = 0; f < OW_STEP_HOLD_FRAMES; f++) nes.frame();
  nes.buttonUp(1, button);
  for (let f = 0; f < OW_STEP_GAP_FRAMES; f++) nes.frame();

  const now = readTile();
  // mapflags bit 1 also rises during a town transition, so a real encounter
  // needs enemies on screen too (btl_num $6C93).
  if (mem[0x002d] & 0x02 && mem[0x6c93] > 0) {
    battles += 1;
    console.log(`  step ${i + 1}: random encounter on tile (${now.x},${now.y}) - the macro would abort here`);
    break;
  }
  if (now.x !== expect.x || now.y !== expect.y) {
    drift += 1;
    // Dump the console's own view of the move so the cause is named rather than
    // guessed: tileprop ($44/$45) is what OWCanMove evaluated for the target
    // tile, and the RAM tile id from the resident window says whether our
    // extracted grid agrees with the game.
    const ramTile = mem[0x7000 + (expect.y % 16) * 0x100 + expect.x];
    console.log(
      `  step ${i + 1} ${direction.padEnd(5)} -> expected (${expect.x},${expect.y}), got (${now.x},${now.y})  ` +
        `jsonTile ${tiles[expect.y][expect.x]} ramTile ${ramTile}  ` +
        `tileprop $${mem[0x0044].toString(16).padStart(2, "0")}/$${mem[0x0045].toString(16).padStart(2, "0")}  ` +
        `veh $${mem[0x0042].toString(16).padStart(2, "0")} facing $${mem[0x0033].toString(16).padStart(2, "0")} ` +
        `speed $${mem[0x0034].toString(16).padStart(2, "0")} ctr ${mem[0x0035]},${mem[0x0036]} ` +
        `flags $${mem[0x002d].toString(16).padStart(2, "0")} enemies $${mem[0x6c93]}`,
    );
    if (drift > 2) break;
    // A missed step desynchronises this probe's own direction math, so recentre
    // on where the party actually is and retry the same target tile.
    route.splice(i, 1, cursor, expect);
  }
  cursor = now;
}

// After arriving, let the console run without input: stepping onto a warp tile
// is what triggers the teleport, so this proves `goto` delivers the party into
// the destination map rather than just next to its door.
const SETTLE_FRAMES = 240;
for (let f = 0; f < SETTLE_FRAMES; f++) nes.frame();

const flags = mem[0x002d];
const endTile = readTile();
console.log(`\nended at (${endTile.x},${endTile.y}); goal (${goal.x},${goal.y})`);
console.log(
  `after ${SETTLE_FRAMES} settle frames: mapflags $${flags.toString(16).padStart(2, "0")}` +
    ` cur_map $${mem[0x0048].toString(16).padStart(2, "0")}` +
    ` scroll ${mem[0x0027]},${mem[0x0028]}`,
);
const entered = (flags & 0x01) !== 0;
const battled = (flags & 0x02) !== 0;
console.log(
  entered
    ? `OK: arrived and entered destination map 0x${mem[0x0048].toString(16).padStart(2, "0")}`
    : battled
      ? `interrupted by a random encounter (expected sometimes; the macro aborter handles it)`
      : `did not enter a map: still on the overworld at (${endTile.x},${endTile.y})`,
);
process.exit(drift === 0 && entered ? 0 : battled ? 2 : 1);
