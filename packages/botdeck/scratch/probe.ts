import { readFileSync } from "node:fs";
import { NES } from "jsnes";

const ROOT = "/Users/tony/verdverm/botdeck";
const ROM_PATH = `${ROOT}/games/ff1/game.nes`;
const STATES = `${ROOT}/plays/ff1/0000_dev/states`;

export const A = 0, B = 1, SELECT = 2, START = 3, UP = 4, DOWN = 5, LEFT = 6, RIGHT = 7;

function nes() {
  return new NES({ emulateSound: false } as never);
}

export function boot(stateFile: string, em = nes()) {
  const rom = readFileSync(ROM_PATH).toString("binary");
  em.loadROM(rom);
  const st = JSON.parse(readFileSync(`${STATES}/${stateFile}.state.json`, "utf8"));
  em.fromJSON(st);
  return em;
}

export function step(em: NES, frames: number) {
  for (let i = 0; i < frames; i++) em.frame();
}

export async function tap(em: NES, button: number, hold = 4, gap = 4) {
  em.buttonDown(1, button as never);
  step(em, hold);
  em.buttonUp(1, button as never);
  step(em, gap);
}

export function mem(em: NES): Uint8Array {
  const m = (em as unknown as { mmap?: { mem?: Uint8Array }; cpu?: { mem?: Uint8Array } });
  return (m.mmap?.mem ?? m.cpu?.mem)!;
}

export function dump(em: NES, label: string, addrs: number[]) {
  const m = mem(em);
  const parts = addrs.map((a) => `$${a.toString(16).padStart(2, "0")}:${m[a]}`);
  console.log(`  ${label.padEnd(24)} ${parts.join(" ")}`);
}

export function dumpRange(em: NES, label: string, start: number, len: number) {
  const m = mem(em);
  console.log(`  ${label} [${start.toString(16)}+${len}]: ${Array.from(m.slice(start, start + len)).join(",")}`);
}
