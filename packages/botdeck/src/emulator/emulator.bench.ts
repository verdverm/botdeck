import { describe, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Emulator } from "./emulator";

// The emulator and audio modules log verbosely at debug level; silence that
// noise so benchmark results remain readable.
vi.spyOn(console, "log").mockImplementation(() => {});

// Small, freely-redistributable test ROM fixture already in the repo.
const ROM_PATH = "public/roms/croom.nes";
const romBytes = readFileSync(ROM_PATH);

function createEmulator(): Emulator {
  const em = new Emulator();
  em.loadROM(romBytes, "croom.nes");
  return em;
}

describe("emulator frame loop", () => {
  test("stepFrame() throughput", async ({ bench }) => {
    await bench("stepFrame()", () => {
      const em = createEmulator();
      em.stepFrame();
    }).run();
  });

  test("stepFrame() after 60 frames throughput", async ({ bench }) => {
    await bench("stepFrame() after 60 frames", () => {
      const em = createEmulator();
      for (let i = 0; i < 60; i++) {
        em.stepFrame();
      }
    }).run();
  });
});
