import { describe, expect, it, vi } from "vitest";
import { Emulator } from "./emulator";

type StubNes = {
  loadROM: ReturnType<typeof vi.fn>;
  frame: ReturnType<typeof vi.fn>;
  buttonDown: ReturnType<typeof vi.fn>;
  buttonUp: ReturnType<typeof vi.fn>;
  getFPS: ReturnType<typeof vi.fn>;
  ppu: {
    nameTable: { tile: Uint8Array }[];
    vramMem: Uint8Array;
    vramMirrorTable: Uint16Array;
  };
};

function makeNameTable(): { tile: Uint8Array } {
  return { tile: new Uint8Array(32 * 32) };
}

function makeMirrorTable(): Uint16Array {
  const table = new Uint16Array(0x8000);
  for (let i = 0; i < table.length; i++) table[i] = i;
  return table;
}

function makeEmulator(): { emulator: Emulator; nes: StubNes } {
  const emulator = new Emulator();
  const nes = {
    loadROM: vi.fn(),
    frame: vi.fn(),
    buttonDown: vi.fn(),
    buttonUp: vi.fn(),
    getFPS: vi.fn(() => 60),
    ppu: {
      nameTable: [makeNameTable(), makeNameTable(), makeNameTable(), makeNameTable()],
      vramMem: new Uint8Array(0x4000),
      vramMirrorTable: makeMirrorTable(),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (emulator as any).nes = nes;
  return { emulator, nes };
}

describe("Emulator frame probes", () => {
  it("calls registered probes once per stepFrame", () => {
    const { emulator } = makeEmulator();
    const probe = vi.fn();
    const remove = emulator.onFrameProbe(probe);

    emulator.stepFrame();
    expect(probe).toHaveBeenCalledTimes(1);

    emulator.stepFrame();
    expect(probe).toHaveBeenCalledTimes(2);

    remove();
    emulator.stepFrame();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("does not let a throwing probe stop the emulator loop", () => {
    const { emulator } = makeEmulator();
    const goodProbe = vi.fn();
    const badProbe = vi.fn(() => {
      throw new Error("probe failure");
    });
    emulator.onFrameProbe(badProbe);
    emulator.onFrameProbe(goodProbe);

    emulator.stepFrame();
    expect(badProbe).toHaveBeenCalledTimes(1);
    expect(goodProbe).toHaveBeenCalledTimes(1);
    expect(emulator.isRunning()).toBe(false); // stubbed frame() does not set running
  });
});

describe("Emulator nametable access", () => {
  it("returns a 32x128 effective nametable buffer from PPU VRAM", () => {
    const { emulator, nes } = makeEmulator();
    nes.ppu.vramMem[0x2000] = 0x11;
    nes.ppu.vramMem[0x2400] = 0x22;
    nes.ppu.vramMem[0x2800] = 0x33;
    nes.ppu.vramMem[0x2c00] = 0x44;

    const nt = emulator.getNametable();
    expect(nt).toBeDefined();
    expect(nt!.width).toBe(32);
    expect(nt!.height).toBe(128);
    expect(nt!.data[0]).toBe(0x11);
    expect(nt!.data[32 * 32]).toBe(0x22);
    expect(nt!.data[32 * 32 * 2]).toBe(0x33);
    expect(nt!.data[32 * 32 * 3]).toBe(0x44);
  });

  it("resolves vertical mirroring through vramMirrorTable", () => {
    const { emulator, nes } = makeEmulator();
    // Vertical mirroring: NT0 ($2000) == NT2 ($2800), NT1 ($2400) == NT3 ($2C00).
    for (let i = 0; i < 0x400; i++) {
      nes.ppu.vramMirrorTable[0x2800 + i] = 0x2000 + i;
      nes.ppu.vramMirrorTable[0x2c00 + i] = 0x2400 + i;
    }
    nes.ppu.vramMem[0x2000] = 0xaa;
    nes.ppu.vramMem[0x2400] = 0xbb;

    const nt = emulator.getNametable();
    expect(nt!.data[0]).toBe(0xaa);
    expect(nt!.data[32 * 32 * 2]).toBe(0xaa);
    expect(nt!.data[32 * 32 * 1]).toBe(0xbb);
    expect(nt!.data[32 * 32 * 3]).toBe(0xbb);
  });

  it("resolves horizontal mirroring through vramMirrorTable", () => {
    const { emulator, nes } = makeEmulator();
    // Horizontal mirroring: NT0 ($2000) == NT1 ($2400), NT2 ($2800) == NT3 ($2C00).
    for (let i = 0; i < 0x400; i++) {
      nes.ppu.vramMirrorTable[0x2400 + i] = 0x2000 + i;
      nes.ppu.vramMirrorTable[0x2c00 + i] = 0x2800 + i;
    }
    nes.ppu.vramMem[0x2000] = 0xcc;
    nes.ppu.vramMem[0x2800] = 0xdd;

    const nt = emulator.getNametable();
    expect(nt!.data[0]).toBe(0xcc);
    expect(nt!.data[32 * 32]).toBe(0xcc);
    expect(nt!.data[32 * 32 * 2]).toBe(0xdd);
    expect(nt!.data[32 * 32 * 3]).toBe(0xdd);
  });
});
