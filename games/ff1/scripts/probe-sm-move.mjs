// Measure standard-map movement timing and coordinate relationship.
//
// Loads the 0000_test overworld save, walks to Coneria, enters the town,
// then reports scroll ($29/$2A), player collision ($68/$69), and how many
// tiles the party moves when a direction is held for N frames.
//
// Run: node games/ff1/scripts/probe-sm-move.mjs [direction] [holdFrames] [gapFrames]
import fs from "node:fs";
import path from "node:path";
import { NES } from "../../packages/botdeck/node_modules/jsnes/src/index.js";
import { ROM_PATH } from "./ff1-lib.mjs";

const DIRECTIONS = { up: 4, down: 5, left: 6, right: 7 };
const direction = String(process.argv[2] ?? "down").toLowerCase();
const holdFrames = Number(process.argv[3] ?? 16);
const gapFrames = Number(process.argv[4] ?? 20);
if (!(direction in DIRECTIONS)) {
  console.error(`unknown direction "${direction}" (use up|down|left|right)`);
  process.exit(1);
}

const OW_STATE = path.resolve(
  path.dirname(ROM_PATH),
  "../../plays/ff1/0000_test/states/000001-start-01.state.json",
);

const noop = () => {};
const nes = new NES({
  onFrame: noop,
  onAudioSample: noop,
  emulateSound: false,
  sampleRate: 44100,
});

nes.loadROM(fs.readFileSync(ROM_PATH));
const saved = JSON.parse(fs.readFileSync(OW_STATE, "utf8"));
nes.fromJSON(saved.state ?? saved);

const internals = nes;
const mem = internals.mmap?.mem ?? internals.cpu?.mem;
if (!mem || mem.length < 0x10000) {
  console.error("no CPU memory available");
  process.exit(1);
}

const ADDR_OW_X = 0x0027;
const ADDR_OW_Y = 0x0028;
const ADDR_SM_SCROLL_X = 0x0029;
const ADDR_SM_SCROLL_Y = 0x002a;
const ADDR_SM_X = 0x0068;
const ADDR_SM_Y = 0x0069;
const ADDR_MAPFLAGS = 0x002d;
const ADDR_MAP_ID = 0x0048;

const owTile = () => ({
  x: (mem[ADDR_OW_X] + 7) & 0xff,
  y: (mem[ADDR_OW_Y] + 7) & 0xff,
});
const smTile = () => ({
  x: mem[ADDR_SM_X] & 0x3f,
  y: mem[ADDR_SM_Y] & 0x3f,
});
const smScroll = () => ({
  x: mem[ADDR_SM_SCROLL_X] & 0x3f,
  y: mem[ADDR_SM_SCROLL_Y] & 0x3f,
});

// Settle.
for (let i = 0; i < 10; i++) nes.frame();

console.log("start overworld:", owTile(), "mapflags", mem[ADDR_MAPFLAGS].toString(2).padStart(8, "0"));

// Walk south a few tiles to line up with Coneria door (scroll 147,155 -> tile 154,162).
// Current state is scroll (146,158) -> tile (153,165). Door is at (154,162).
function hold(btn, frames) {
  nes.buttonDown(1, btn);
  for (let i = 0; i < frames; i++) nes.frame();
  nes.buttonUp(1, btn);
}

// Simple open-loop walk to the door: right 1, up 3.
hold(DIRECTIONS.right, 16);
hold(DIRECTIONS.up, 16 * 3 + 4);
console.log("after approach:", owTile(), "mapflags", mem[ADDR_MAPFLAGS].toString(2).padStart(8, "0"));

// Step onto the door tile and wait for the standard-map transition.
hold(DIRECTIONS.up, 16);
for (let i = 0; i < 120; i++) nes.frame();

console.log("after enter:", "mapId", mem[ADDR_MAP_ID], "mapflags", mem[ADDR_MAPFLAGS].toString(2).padStart(8, "0"));
console.log("  scroll:", smScroll(), "player:", smTile(), "(scroll+7)", {
  x: (smScroll().x + 7) & 0x3f,
  y: (smScroll().y + 7) & 0x3f,
});

if ((mem[ADDR_MAPFLAGS] & 0x01) === 0) {
  console.error("failed to enter a standard map");
  process.exit(1);
}

// Now measure movement inside the standard map.
const before = smTile();
nes.buttonDown(1, DIRECTIONS[direction]);
const moves = [];
let last = before;
for (let i = 1; i <= holdFrames + gapFrames; i++) {
  nes.frame();
  if (i === holdFrames) nes.buttonUp(1, DIRECTIONS[direction]);
  const now = smTile();
  if (now.x !== last.x || now.y !== last.y) {
    moves.push({ frame: i, from: `${last.x},${last.y}`, to: `${now.x},${now.y}` });
    last = now;
  }
}

console.log(`\nheld ${direction.toUpperCase()} for ${holdFrames} frames, then released for ${gapFrames} frames`);
console.log("moves:", moves);
console.log("start tile:", before, "end tile:", smTile());
