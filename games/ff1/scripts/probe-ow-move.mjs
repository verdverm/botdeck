// Measure how many emulated frames one overworld tile step actually costs.
//
// The A* goto compiler assumes `FRAMES_PER_TILE` (foot 16, canoe 16, ship 8,
// airship 4), derived from StartMapMove setting `move_speed` pixels/frame with a
// 16-pixel tile. This script checks that against the real core: boot the ROM,
// restore a recorded overworld save state, hold one direction, and report the
// scroll ($0027/$0028) after every frame.
//
// Run: node probe-ow-move.mjs [direction] [frames]   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
// jsnes is not installed for this script directory; resolve it through the
// botdeck package that depends on it (a link: into .extern/jsnes).
import { NES } from "../../../packages/botdeck/node_modules/jsnes/src/index.js";
import { ROM_PATH, MAPS_DIR } from "./ff1-lib.mjs";

const DIRECTIONS = { up: 4, down: 5, left: 6, right: 7 };
const direction = String(process.argv[2] ?? "up").toLowerCase();
const frames = Number(process.argv[3] ?? 48);
if (!(direction in DIRECTIONS)) {
  console.error(`unknown direction "${direction}" (use up|down|left|right)`);
  process.exit(1);
}

// A recorded overworld state, so the party starts on foot on known land.
const STATE_PATH = path.resolve(
  path.dirname(ROM_PATH),
  "../../plays/ff1/0000_dev/states/000001-start-01.state.json",
);

const noop = () => {};
const nes = new NES({
  onFrame: noop,
  onAudioSample: noop,
  emulateSound: false,
  sampleRate: 44100,
});

nes.loadROM(fs.readFileSync(ROM_PATH));
const saved = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
nes.fromJSON(saved.state ?? saved);

const internals = nes;
const mem = internals.mmap?.mem ?? internals.cpu?.mem;
if (!mem || mem.length < 0x10000) {
  console.error(`no CPU memory available (got ${mem?.length}); cannot read scroll bytes`);
  process.exit(1);
}

const ADDR_SCROLL_X = 0x0027;
const ADDR_SCROLL_Y = 0x0028;
const ADDR_VEHICLE = 0x0042;
const ADDR_MAPFLAGS = 0x002d;
const OFFSET = 7;

const scroll = () => ({ x: mem[ADDR_SCROLL_X], y: mem[ADDR_SCROLL_Y] });
const tile = () => {
  const s = scroll();
  return { x: (s.x + OFFSET) & 0xff, y: (s.y + OFFSET) & 0xff };
};

if (mem[ADDR_MAPFLAGS] & 0x01) {
  console.error("the chosen save state is inside a standard map, not the overworld");
  process.exit(1);
}

console.log(`vehicle byte: $${mem[ADDR_VEHICLE].toString(16).padStart(2, "0")}`);
console.log(`start scroll (${scroll().x},${scroll().y}) -> tile (${tile().x},${tile().y})`);

// Settle a few frames first: the core may be mid-move when restored.
for (let i = 0; i < 4; i++) nes.frame();
const before = tile();

nes.buttonDown(1, DIRECTIONS[direction]);
const moves = [];
let last = before;
for (let i = 1; i <= frames; i++) {
  nes.frame();
  const now = tile();
  if (now.x !== last.x || now.y !== last.y) {
    moves.push({ frame: i, from: `${last.x},${last.y}`, to: `${now.x},${now.y}` });
    last = now;
  }
}
nes.buttonUp(1, DIRECTIONS[direction]);

console.log(`\nheld ${direction.toUpperCase()} for ${frames} frames`);
for (const m of moves) {
  console.log(`  frame ${String(m.frame).padStart(3)}: ${m.from} -> ${m.to}`);
}
if (moves.length > 1) {
  const deltas = moves.slice(1).map((m, i) => m.frame - moves[i].frame);
  console.log(`\ntiles moved: ${moves.length}`);
  console.log(`frames per tile: first=${moves[0].frame}, subsequent=[${deltas.join(", ")}]`);
} else if (moves.length === 1) {
  console.log(`\ntiles moved: 1 (first step at frame ${moves[0].frame})`);
} else {
  console.log("\ntiles moved: 0 - the party did not move; check the direction/terrain");
}

// Walkability cross-check against the extracted grid.
const mapFile = path.join(MAPS_DIR, "overworld.json");
if (fs.existsSync(mapFile)) {
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  let cursor = before;
  let ok = true;
  for (const m of moves) {
    const [x, y] = m.to.split(",").map(Number);
    const props = map.tileProps[String(map.tiles[y][x])];
    if (!props?.pass.foot) {
      console.log(`\ngrid mismatch: tile (${x},${y}) is NOT foot-walkable in overworld.json`);
      ok = false;
    }
    cursor = { x, y };
  }
  if (ok) console.log(`\nall ${moves.length} stepped tiles are foot-walkable in overworld.json (ended at ${cursor.x},${cursor.y})`);
}
