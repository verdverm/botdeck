// Compare the extracted grid against whatever rows the emulator has resident
// after walking, for scroll positions the recorded save states never reached.
//
// verify-ow-rows.mjs only covers rows the recorded dev play actually visited
// (19 of 256). This script boots the ROM, restores a state, steps the party
// along a straight line, and checks each newly resident row against
// overworld.json. It is how a decompression bug in an unvisited row gets named.
//
// Run: node verify-ow-travel.mjs [direction] [tiles]   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import { NES } from "../../../packages/botdeck/node_modules/jsnes/src/index.js";
import { ROM_PATH, MAPS_DIR } from "./ff1-lib.mjs";

const HOLD = 2;
const GAP = 20;
const OFFSET = 7;
const BUTTONS = { up: 4, down: 5, left: 6, right: 7 };

const direction = String(process.argv[2] ?? "up");
const tilesToWalk = Number(process.argv[3] ?? 40);
const STATE_PATH = path.resolve(
  path.dirname(ROM_PATH),
  "../../plays/ff1/0000_dev/states/000001-start-01.state.json",
);

const map = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, "overworld.json"), "utf8"));

const noop = () => {};
const nes = new NES({ onFrame: noop, onAudioSample: noop, emulateSound: false, sampleRate: 44100 });
nes.loadROM(fs.readFileSync(ROM_PATH));
const saved = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
nes.fromJSON(saved.state ?? saved);
const mem = nes.mmap?.mem ?? nes.cpu?.mem;

const scroll = () => ({ x: mem[0x0027], y: mem[0x0028] });
const partyTile = () => ({ x: (scroll().x + OFFSET) & 0xff, y: (scroll().y + OFFSET) & 0xff });

/** Rows the console currently holds in mapdata, and whether they match. */
function checkWindow(label) {
  const sy = scroll().y;
  const results = [];
  for (let i = 0; i < 16; i++) {
    const row = (sy + i) & 0xff;
    const base = 0x7000 + (row % 16) * 0x100;
    let mismatches = 0;
    let firstAt = -1;
    for (let x = 0; x < 256; x++) {
      if (mem[base + x] !== map.tiles[row][x]) {
        mismatches += 1;
        if (firstAt < 0) firstAt = x;
      }
    }
    if (mismatches > 0) {
      const got = [];
      const want = [];
      for (let x = firstAt; x < Math.min(firstAt + 6, 256); x++) {
        got.push(mem[base + x]);
        want.push(map.tiles[row][x]);
      }
      results.push(
        `row ${row}: ${mismatches} differ at x=${firstAt} ram=[${got}] json=[${want}]`,
      );
    }
  }
  const s = scroll();
  console.log(
    `${label.padEnd(18)} scroll ${s.x},${s.y} tile ${partyTile().x},${partyTile().y}` +
      (results.length ? `\n  ${results.join("\n  ")}` : "  window matches"),
  );
  return results.length === 0;
}

for (let i = 0; i < 4; i++) nes.frame();
checkWindow("start");

const button = BUTTONS[direction];
if (button === undefined) {
  console.error(`unknown direction "${direction}"`);
  process.exit(1);
}

for (let step = 1; step <= tilesToWalk; step++) {
  nes.buttonDown(1, button);
  for (let f = 0; f < HOLD; f++) nes.frame();
  nes.buttonUp(1, button);
  for (let f = 0; f < GAP; f++) nes.frame();
  if (step % 5 === 0 || step === tilesToWalk) checkWindow(`after ${step} ${direction}`);
  // A transition (town entrance, battle) ends the experiment.
  if (mem[0x002d] & 0x01) {
    console.log(`entered a map after ${step} steps; stopping`);
    break;
  }
}
