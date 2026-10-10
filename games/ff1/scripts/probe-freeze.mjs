// Name the state the game is stuck in after a long synthetic walk.
//
// probe-*.mjs walk the party with a press-per-tile pattern; after a few dozen
// steps the overworld loop stops advancing (the game's own framecounter at $F0
// freezes). This script dumps what the console is actually showing at that
// point: PPU enable/mask, the current MMC1 banks, the map variables, and an
// ASCII dump of the nametable. That distinguishes "battle/transition took over"
// from "the overworld loop died" from "the harness stopped clocking the CPU".
//
// Run: node probe-freeze.mjs [tilesToWalk]   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import { NES } from "../../../packages/botdeck/node_modules/jsnes/src/index.js";
import { ROM_PATH, MAPS_DIR } from "./ff1-lib.mjs";

const HOLD = 2;
const GAP = 20;
const OFFSET = 7;
const tilesToWalk = Number(process.argv[2] ?? 45);

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
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = wrap(cur.x + dx, width);
      const ny = wrap(cur.y + dy, height);
      if (came.has(key(nx, ny)) || !walkable(nx, ny)) continue;
      came.set(key(nx, ny), cur);
      const path = [];
      let node = { x: nx, y: ny };
      while (node && !(node.x === from.x && node.y === from.y)) {
        path.unshift(node);
        node = came.get(key(node.x, node.y));
      }
      queue.push({ x: nx, y: ny });
      if (nx === goal.x && ny === goal.y) return path;
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
const tile = () => ({ x: wrap(mem[0x0027] + OFFSET, width), y: wrap(mem[0x0028] + OFFSET, height) });
const fc = () => mem[0x00f0] | (mem[0x00f1] << 8);

function press(direction) {
  const button = { up: 4, down: 5, left: 6, right: 7 }[direction];
  nes.buttonDown(1, button);
  for (let f = 0; f < HOLD; f++) nes.frame();
  nes.buttonUp(1, button);
  for (let f = 0; f < GAP; f++) nes.frame();
}

function snapshot(label) {
  const ppu = nes.ppu ?? {};
  // The fork renames the $2000/$2001 latches; dump whatever they are called so
  // the NMI/PPU-enable state is readable.
  const ppuKeys = Object.keys(ppu).filter((k) => /ctrl|mask|nmi|enabled|vblank|2000|2001/i.test(k));
  const ppuState = ppuKeys.map((k) => `${k}=${typeof ppu[k] === "number" ? "$" + ppu[k].toString(16) : ppu[k]}`).join(" ");
  console.log(
    `${label}: fc ${fc()} scroll ${mem[0x0027]},${mem[0x0028]} tile ${tile().x},${tile().y} ` +
      `flags $${mem[0x002d].toString(16)} cur_map $${mem[0x0048].toString(16)} tileset $${mem[0x0049].toString(16)} ` +
      `veh $${mem[0x0042].toString(16)} facing $${mem[0x0033].toString(16)} speed $${mem[0x0034].toString(16)}`,
  );
  console.log(`  ppu: ${ppuState}`);
  console.log(
    `  cpu: pc $${(nes.cpu.REG_PC ?? -1).toString(16)} nmiRaised ${nes.cpu.nmiRaised} nmiPending ${nes.cpu.nmiPending} nmiImmediate ${nes.cpu.nmiImmediate} irq ${nes.cpu.irqRequested} halt ${nes.cpu.cyclesToHalt} frame ${nes.fpsFrameCount}`,
  );
}

for (let i = 0; i < 4; i++) nes.frame();
let cursor = tile();
const goal = { x: wrap(cursor.x - 17, width), y: wrap(cursor.y - 20, height) };
let route = bfs(cursor, goal);
if (!route) {
  console.log(`no route to (${goal.x},${goal.y}); walking up instead`);
  route = Array.from({ length: tilesToWalk }, (_, i) => ({ x: cursor.x, y: wrap(cursor.y - 1 - i, height) }));
}

snapshot("start");
let stalledAt = -1;
for (let i = 0; i < route.length; i++) {
  const before = fc();
  const step = route[i];
  let dx = step.x - cursor.x;
  let dy = step.y - cursor.y;
  if (Math.abs(dx) > 1) dx = dx > 0 ? -1 : 1;
  if (Math.abs(dy) > 1) dy = dy > 0 ? -1 : 1;
  press(dy === -1 ? "up" : dy === 1 ? "down" : dx === -1 ? "left" : "right");
  const after = fc();
  if (after === before && stalledAt < 0) stalledAt = i + 1;
  cursor = tile();
  if (stalledAt > 0) break;
}

if (stalledAt < 0) {
  console.log(`\ncompleted ${route.length} steps with no freeze`);
  snapshot("end");
  process.exit(0);
}

console.log(`\nframecounter froze on step ${stalledAt} at tile (${cursor.x},${cursor.y})`);
snapshot("frozen");
console.log(`  tile under party: ${tiles[cursor.y][cursor.x]} ${JSON.stringify(tileProps[String(tiles[cursor.y][cursor.x])])}`);

// What is on screen? The overworld draws its map in the nametables; a battle or
// menu screen looks completely different.
const vram = nes.ppu?.vramMem;
if (vram) {
  const glyphs = " .,:;oO#@";
  for (const base of [0x0000, 0x2000]) {
    let out = `\n  nametable $2${base.toString(16).slice(1)}:\n`;
    for (let row = 0; row < 12; row++) {
      let line = "    ";
      for (let col = 0; col < 32; col++) {
        const t = vram[base + 0x400 * (row >> 3) + col + (row % 8) * 32];
        line += glyphs[Math.min(glyphs.length - 1, (t ?? 0) % glyphs.length)];
      }
      out += line + "\n";
    }
    console.log(out);
  }
}
