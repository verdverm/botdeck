import { describe, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Emulator } from "./emulator";

vi.spyOn(console, "log").mockImplementation(() => {});

const ROM_PATH = "public/roms/croom.nes";
const romBytes = readFileSync(ROM_PATH);

function buildState(): object {
  const em = new Emulator();
  em.loadROM(romBytes, "croom.nes");
  // Run a few frames so the state has non-trivial PPU/APU/CPU data.
  for (let i = 0; i < 60; i++) {
    em.stepFrame();
  }
  return em.toJSON();
}

describe("state serialization", () => {
  test("JSON.stringify(emulator.toJSON())", async ({ bench }) => {
    const state = buildState();
    await bench("JSON.stringify(state)", () => {
      JSON.stringify(state);
    }).run();
  });

  test("emulator.fromJSON(JSON.parse(...)) round-trip", async ({ bench }) => {
    const serialized = JSON.stringify(buildState());
    await bench("fromJSON(JSON.parse(...))", () => {
      const em = new Emulator();
      em.loadROM(romBytes, "croom.nes");
      em.fromJSON(JSON.parse(serialized) as object);
    }).run();
  });
});
