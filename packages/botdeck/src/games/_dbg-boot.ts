/** Shared boot helper for temporary debug tests. */
import { readFileSync } from "node:fs";
import { NES } from "jsnes";
import { Emulator } from "../emulator/emulator";

const ROOT = `${process.cwd()}/../..`;

export function bootEmulator(stateFile: string, play = "0001_dev"): Emulator {
  const emulator = new Emulator();
  const nes = new NES({
    emulateSound: true,
    sampleRate: 48000,
    onFrame: () => {},
    onAudioSample: () => {},
    onBatteryRamWrite: () => {},
  } as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (emulator as any).nes = nes;
  const rom = readFileSync(`${ROOT}/games/ff1/game.nes`).toString("binary");
  emulator.loadROM(rom, "game.nes");
  const st = JSON.parse(
    readFileSync(`${ROOT}/plays/ff1/${play}/states/${stateFile}.state.json`, "utf8"),
  );
  emulator.fromJSON(st);
  return emulator;
}
