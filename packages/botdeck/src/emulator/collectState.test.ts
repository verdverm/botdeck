import { describe, expect, it, vi } from "vitest";
import { collectState } from "./collectState";
import type { Emulator } from "./emulator";

vi.mock("@games/ff1-state", () => ({
  readFF1StateFromSaveState: vi.fn(() => ({ party: [] })),
}));

function makeEmulator(overrides: Partial<Emulator> = {}): Emulator {
  const mem = new Uint8Array(0x10000).fill(0);
  mem[0x6000] = 0xab;
  mem[0x7fff] = 0xcd;

  return {
    hasRomLoaded: () => true,
    getMemory: () => mem,
    romInfo: { name: "test.nes" },
    toJSON: () => ({ cpu: { mem } }),
    ...overrides,
  } as unknown as Emulator;
}

describe("collectState", () => {
  it("returns null when no emulator is provided", () => {
    expect(collectState(null)).toBeNull();
  });

  it("returns null when no ROM is loaded", () => {
    const em = makeEmulator({ hasRomLoaded: () => false });
    expect(collectState(em)).toBeNull();
  });

  it("collects the save RAM window and ROM info", () => {
    const em = makeEmulator();
    const result = collectState(em);
    expect(result).not.toBeNull();
    expect(result!.capturedAt).toMatch(/^\d{4}-/);
    expect(result!.rom).toEqual({ name: "test.nes" });
    expect(result!.saveRam).toHaveLength(0x2000);
    expect(result!.saveRam[0]).toBe(0xab);
    expect(result!.saveRam[0x1fff]).toBe(0xcd);
  });

  it("returns zeros when memory is unavailable", () => {
    const em = makeEmulator({ getMemory: () => undefined });
    const result = collectState(em);
    expect(result).not.toBeNull();
    expect(result!.saveRam.every((v) => v === 0)).toBe(true);
  });
});
