// Isolate headless-core drift: restore a save state and run frames with NO
// input, reporting whether the game's own frame counter keeps advancing.
//
// If the counter stalls here, the freeze seen in probe-*.mjs is a harness
// problem (jsnes driven by manual frame() calls), not a navigation or map bug.
// If it keeps counting, the stall is caused by the walk sequence instead.
//
// Run: node probe-idle.mjs [frames]   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import { NES } from "../../../packages/botdeck/node_modules/jsnes/src/index.js";
import { ROM_PATH } from "./ff1-lib.mjs";

const total = Number(process.argv[2] ?? 1200);
const STATE_PATH = path.resolve(
  path.dirname(ROM_PATH),
  "../../plays/ff1/0000_dev/states/000001-start-01.state.json",
);

const noop = () => {};
const nes = new NES({ onFrame: noop, onAudioSample: noop, emulateSound: false, sampleRate: 44100 });
nes.loadROM(fs.readFileSync(ROM_PATH));
const saved = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
nes.fromJSON(saved.state ?? saved);

const mem = nes.mmap?.mem ?? nes.cpu?.mem;
const fc = () => mem[0x00f0] | (mem[0x00f1] << 8);
const scroll = () => `${mem[0x0027]},${mem[0x0028]}`;
const ppuCtrl = () => nes.ppu?.ctrl ?? -1;

let last = fc();
let stalledAt = -1;
for (let f = 1; f <= total; f++) {
  nes.frame();
  if (f % 60 === 0 || f === 1) {
    const now = fc();
    console.log(
      `frame ${String(f).padStart(5)}: framecounter ${now} (delta ${now - last}) scroll ${scroll()} ` +
        `pc $${(nes.cpu.REG_PC ?? -1).toString(16).padStart(4, "0")} ppuCtrl $${ppuCtrl().toString(16).padStart(2, "0")} ` +
        `halt ${nes.cpu.cyclesToHalt}`,
    );
    if (now === last && f > 1 && stalledAt < 0) stalledAt = f;
    last = now;
  }
}
console.log(
  stalledAt < 0
    ? `\nno stall in ${total} idle frames: the core runs fine headless`
    : `\nstalled at frame ${stalledAt} with no input: headless harness drift, not navigation`,
);
