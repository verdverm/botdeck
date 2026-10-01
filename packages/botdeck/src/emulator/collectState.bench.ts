import { describe, test, vi } from "vitest";
import { collectState } from "./collectState";

vi.spyOn(console, "log").mockImplementation(() => {});
import {
  readFF1StateFromSaveState,
  type JsNesState,
} from "@games/ff1-state";
import type { Emulator } from "./emulator";

const SRAM_START = 0x6000;
const SRAM_SIZE = 0x2000;

function buildMemory(): Uint8Array {
  const mem = new Uint8Array(0x10000);
  // Synthetic FF1-style save RAM so readFF1StateFromSaveState has real work.
  for (let i = 0; i < SRAM_SIZE; i++) {
    mem[SRAM_START + i] = (i * 7 + 13) % 256;
  }
  // Party names: "A" repeated.
  for (let i = 0; i < 4; i++) {
    mem[0x6100 + i * 0x40] = 0x0a; // 'A' in FF1 text
  }
  return mem;
}

function buildEmulator(): Emulator {
  const mem = buildMemory();
  return {
    hasRomLoaded: () => true,
    getMemory: () => mem,
    romInfo: { name: "ff1.nes" },
    toJSON: () => ({ cpu: { mem } }),
  } as unknown as Emulator;
}

function buildSaveState(): JsNesState {
  return { cpu: { mem: buildMemory() } };
}

describe("collectState snapshot", () => {
  test("collectState() end-to-end", async ({ bench }) => {
    await bench("collectState()", () => {
      collectState(buildEmulator());
    }).run();
  });

  test("toJSON + saveRAM copy", async ({ bench }) => {
    await bench("toJSON + saveRAM copy", () => {
      const em = buildEmulator();
      const mem = em.getMemory();
      const saveRam: number[] = [];
      if (mem) {
        for (let i = 0; i < SRAM_SIZE; i++) {
          saveRam.push(mem[SRAM_START + i] ?? 0);
        }
      }
      em.toJSON();
      return saveRam;
    }).run();
  });

  test("readFF1StateFromSaveState()", async ({ bench }) => {
    await bench("readFF1StateFromSaveState()", () => {
      readFF1StateFromSaveState(buildSaveState());
    }).run();
  });
});
