import { readFileSync } from "node:fs";
import { NES } from "jsnes";

const ROOT = "/Users/tony/verdverm/botdeck";
const rom = readFileSync(`${ROOT}/games/ff1/game.nes`).toString("binary");
const st = JSON.parse(readFileSync(`${ROOT}/plays/ff1/0001_dev/states/000037-step-000019-before.state.json`, "utf8"));

const nes = new NES({ emulateSound: false } as never);
nes.loadROM(rom);
nes.fromJSON(st);

const internals = nes as unknown as { cpu?: { mem?: unknown }; mmap?: { mem?: unknown } };
const cpuMem = internals.cpu?.mem as ArrayLike<number>;
const mmapMem = internals.mmap?.mem as ArrayLike<number> | undefined;
console.log("saved cpu.mem[0x2d]:", st.cpu.mem[0x2d]);
console.log("live  cpu.mem[0x2d]:", cpuMem?.[0x2d]);
console.log("mmap.mem exists:", mmapMem !== undefined);
if (mmapMem) console.log("live mmap.mem[0x2d]:", mmapMem[0x2d]);
console.log("cpu.mem is Uint8Array:", cpuMem instanceof Uint8Array, "constructor:", (cpuMem as object)?.constructor?.name);
console.log("same object as saved?", cpuMem === st.cpu.mem);

// What does jsnes actually read via the mapper (the real game path)?
const mmap = (nes as unknown as { mmap: { read: (a: number) => number } }).mmap;
console.log("mmap.read(0x002d):", mmap.read(0x002d));
