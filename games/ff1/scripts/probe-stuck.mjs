// Diagnose a single refused overworld step.
//
// Walks the party to a tile with the measured per-tile press model, then tries
// to leave it in each direction with several hold lengths, printing the per-frame
// scroll so a block, a timing artefact, and a map-window reload are tellable
// apart.
//
// Run: node probe-stuck.mjs [x] [y]      (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import { NES } from "../../../packages/botdeck/node_modules/jsnes/src/index.js";
import { ROM_PATH, MAPS_DIR } from "./ff1-lib.mjs";

const HOLD = 2;
const GAP = 20;
const OFFSET = 7;
const BUTTONS = { up: 4, down: 5, left: 6, right: 7 };

const target = { x: Number(process.argv[2] ?? 136), y: Number(process.argv[3] ?? 145) };
const STATE_PATH = path.resolve(
  path.dirname(ROM_PATH),
  "../../plays/ff1/0000_dev/states/000001-start-01.state.json",
);

const map = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, "overworld.json"), "utf8"));
const { tiles, tileProps, width, height } = map;

const wrap = (v, max) => ((v % max) + max) % max;
const walkable = (x, y) => tileProps[String(tiles[wrap(y, height)][wrap(x, width)])]?.pass.foot === true;
const key = (x, y) => y * width + x;

function bfs(from, goal) {
  const came = new Map([[key(from.x, from.y), null]]);
  const queue = [from];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.x === goal.x && cur.y === goal.y) {
      const out = [];
      let node = cur;
      while (node && !(node.x === from.x && node.y === from.y)) {
        out.unshift(node);
        node = came.get(key(node.x, node.y));
      }
      return out;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = wrap(cur.x + dx, width);
      const ny = wrap(cur.y + dy, height);
      if (came.has(key(nx, ny)) || !walkable(nx, ny)) continue;
      came.set(key(nx, ny), cur);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

const noop = () => {};
const nes = new NES({ onFrame: noop, onAudioSample: noop, emulateSound: false, sampleRate: 44100 });
nes.loadROM(fs.readFileSync(ROM_PATH));
const saved = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
nes.fromJSON(saved.state ?? saved);
const mem = nes.mmap?.mem ?? nes.cpu?.mem;

const scroll = () => ({ x: mem[0x0027], y: mem[0x0028] });
const tile = () => ({ x: wrap(scroll().x + OFFSET, width), y: wrap(scroll().y + OFFSET, height) });

/** Press one direction for `hold` frames, then idle for `gap` frames. */
function press(direction, hold = HOLD, gap = GAP) {
  const button = BUTTONS[direction];
  nes.buttonDown(1, button);
  for (let f = 0; f < hold; f++) nes.frame();
  nes.buttonUp(1, button);
  for (let f = 0; f < gap; f++) nes.frame();
}

/** Report the tile props the console would evaluate for a neighbour. */
function neighbourReport(from, direction) {
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
  const to = { x: wrap(from.x + d[0], width), y: wrap(from.y + d[1], height) };
  const id = tiles[to.y][to.x];
  const p = tileProps[String(id)];
  const ramId = mem[0x7000 + (to.y % 16) * 0x100 + to.x];
  return (
    `${direction.padEnd(5)} (${to.x},${to.y}) jsonTile ${id} ramTile ${ramId} ` +
    `blockMask $${p.blockMask.toString(16).padStart(2, "0")} byte1 $${p.special.toString(16).padStart(2, "0")} ` +
    `foot=${p.pass.foot} maskBlocksFoot=${(p.blockMask & 0x01) !== 0}`
  );
}

for (let i = 0; i < 4; i++) nes.frame();
const start = tile();
// Approach the tile *next to* the target, then try to step into the target.
const stand = bfs(start, { x: target.x, y: target.y + 1 });
if (!stand) {
  console.error(`cannot reach (${target.x},${target.y + 1}) on foot from (${start.x},${start.y})`);
  process.exit(1);
}
let cursor = start;
for (const step of stand) {
  let dx = step.x - cursor.x;
  let dy = step.y - cursor.y;
  if (Math.abs(dx) > 1) dx = dx > 0 ? -1 : 1;
  if (Math.abs(dy) > 1) dy = dy > 0 ? -1 : 1;
  press(dy === -1 ? "up" : dy === 1 ? "down" : dx === -1 ? "left" : "right");
  cursor = tile();
}

console.log(`walked ${stand.length} tiles to (${cursor.x},${cursor.y}); target is (${target.x},${target.y})`);
console.log(`standing tile ${tiles[cursor.y][cursor.x]} props ${JSON.stringify(tileProps[String(tiles[cursor.y][cursor.x])])}`);
console.log(`\nneighbour evaluation from the extracted grid:`);
for (const d of ["up", "down", "left", "right"]) console.log(`  ${neighbourReport(cursor, d)}`);

console.log(`\nattempting steps:`);
const status = () =>
  `veh $${mem[0x0042].toString(16).padStart(2, "0")} next $${mem[0x0046].toString(16).padStart(2, "0")} ` +
  `chgpause $${mem[0x0047].toString(16).padStart(2, "0")} drawjob $${mem[0x0032].toString(16).padStart(2, "0")} ` +
  `facing $${mem[0x0033].toString(16).padStart(2, "0")} speed $${mem[0x0034].toString(16).padStart(2, "0")} ` +
  `ctr ${mem[0x0035]},${mem[0x0036]} tileprop $${mem[0x0044].toString(16).padStart(2, "0")}/$${mem[0x0045].toString(16).padStart(2, "0")} ` +
  `flags $${mem[0x002d].toString(16).padStart(2, "0")} inforest $${mem[0x0043].toString(16).padStart(2, "0")}`;

// Discriminate "this tile is blocked" from "this row is blocked": tile 20 sits
// both above and to the right of the party in the Corneria approach, so a
// horizontal step onto the same tile id isolates the axis.
for (const d of ["right", "left", "down", "up"]) {
  const before = tile();
  press(d, HOLD, GAP);
  const after = tile();
  console.log(
    `  ${d.padEnd(5)} hold=${HOLD}: (${before.x},${before.y}) -> (${after.x},${after.y}) moved=${before.x !== after.x || before.y !== after.y}`,
  );
  // Return to the same spot if the step succeeded, so each test starts alike.
  if (after.x !== before.x || after.y !== before.y) {
    press({ up: "down", down: "up", left: "right", right: "left" }[d], HOLD, GAP);
  }
}

// Long continuous hold with a per-frame scroll trace: tells a genuine block
// apart from a stall caused by a pending draw job or vehicle-change pause.
const traceFrom = tile();
nes.buttonDown(1, BUTTONS.up);
let changedAt = -1;
for (let f = 1; f <= 64; f++) {
  nes.frame();
  if (changedAt < 0 && (mem[0x0027] !== scroll().x || mem[0x0028] !== traceFrom.y - OFFSET)) changedAt = f;
}
nes.buttonUp(1, BUTTONS.up);
for (let f = 0; f < GAP; f++) nes.frame();
console.log(
  `  up hold=64: (${traceFrom.x},${traceFrom.y}) -> (${tile().x},${tile().y}) firstChangeFrame=${changedAt}`,
);
console.log(`      ${status()}`);
console.log(`  final: ${status()}`);

// Where is the 6502? A stuck PC (or a tiny oscillation) means the emulated game
// loop itself halted, which is a harness problem rather than a terrain problem.
const cpu = nes.cpu;
const seen = new Map();
const fcBefore = mem[0x00f0] | (mem[0x00f1] << 8);
for (let f = 0; f < 60; f++) {
  nes.buttonDown(1, BUTTONS.up);
  nes.frame();
  nes.buttonUp(1, BUTTONS.up);
  const pc = cpu?.REG_PC ?? -1;
  seen.set(pc, (seen.get(pc) ?? 0) + 1);
}
const fcAfter = mem[0x00f0] | (mem[0x00f1] << 8);
console.log(
  `  framecounter: ${fcBefore} -> ${fcAfter} (delta ${fcAfter - fcBefore})  ` +
    `joy $${mem[0x0020].toString(16).padStart(2, "0")} facing $${mem[0x0033].toString(16).padStart(2, "0")} ` +
    `speed $${mem[0x0034].toString(16).padStart(2, "0")} cyclesToHalt ${cpu?.cyclesToHalt}`,
);
const pcs = [...seen.keys()].sort((a, b) => b - a);
console.log(
  `  PC after 60 idle frames: ${[...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([pc, n]) => `$${(pc ?? -1).toString(16).padStart(4, "0")}x${n}`)
    .join(" ")}`,
);
console.log(`  distinct PCs visited: ${seen.size}, top: ${pcs.map((p) => `$${p.toString(16)}`).slice(0, 8).join(" ")}`);
console.log(`  A=X=${cpu?.REG_ACC} X=${cpu?.REG_X} Y=${cpu?.REG_Y} SP=${cpu?.REG_SP}`);

for (const hold of [2, 8, 17, 40]) {
  const before = tile();
  press("up", hold, GAP);
  const after = tile();
  console.log(
    `  up hold=${String(hold).padStart(2)} gap=${GAP}: (${before.x},${before.y}) -> (${after.x},${after.y}) moved=${before.x !== after.x || before.y !== after.y}`,
  );
  console.log(`      ${status()}`);
  if (mem[0x002d] & 0x01) {
    console.log("  (entered a standard map; stopping)");
    break;
  }
}

// Discriminate "this tile is blocked" from "this row is blocked": tile 20 sits
// both above and to the right of the party on this route, so a horizontal step
// onto the same tile id isolates the axis.
for (const d of ["right", "left", "down", "up"]) {
  const before = tile();
  press(d, HOLD, GAP);
  const after = tile();
  console.log(
    `  ${d.padEnd(5)} hold=${HOLD}: (${before.x},${before.y}) -> (${after.x},${after.y}) moved=${before.x !== after.x || before.y !== after.y}`,
  );
  console.log(`      ${status()}`);
  if (after.x !== before.x || after.y !== before.y) {
    press({ up: "down", down: "up", left: "right", right: "left" }[d], HOLD, GAP);
  }
}
