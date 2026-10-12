import { describe, expect, it } from "vitest";
import {
  decodeNametableWindow,
  FF1_DIALOG_GEOMETRY,
  readDialogState,
  detectBattleMenuWindow,
  createCpuMemoryView,
  ADDR_DESC_BOX_OPEN,
  type DialogGeometry,
} from "../index.js";

const TEXT_TABLE_INVERSE: Record<string, number> = {
  "0": 0x80,
  "1": 0x81,
  "2": 0x82,
  "3": 0x83,
  "4": 0x84,
  "5": 0x85,
  "6": 0x86,
  "7": 0x87,
  "8": 0x88,
  "9": 0x89,
  A: 0x8a,
  B: 0x8b,
  C: 0x8c,
  D: 0x8d,
  E: 0x8e,
  F: 0x8f,
  G: 0x90,
  H: 0x91,
  I: 0x92,
  J: 0x93,
  K: 0x94,
  L: 0x95,
  M: 0x96,
  N: 0x97,
  O: 0x98,
  P: 0x99,
  Q: 0x9a,
  R: 0x9b,
  S: 0x9c,
  T: 0x9d,
  U: 0x9e,
  V: 0x9f,
  W: 0xa0,
  X: 0xa1,
  Y: 0xa2,
  Z: 0xa3,
  a: 0xa4,
  b: 0xa5,
  c: 0xa6,
  d: 0xa7,
  e: 0xa8,
  f: 0xa9,
  g: 0xaa,
  h: 0xab,
  i: 0xac,
  j: 0xad,
  k: 0xae,
  l: 0xaf,
  m: 0xb0,
  n: 0xb1,
  o: 0xb2,
  p: 0xb3,
  q: 0xb4,
  r: 0xb5,
  s: 0xb6,
  t: 0xb7,
  u: 0xb8,
  v: 0xb9,
  w: 0xba,
  x: 0xbb,
  y: 0xbc,
  z: 0xbd,
  '"': 0xbe,
  ",": 0xbf,
  ".": 0xc0,
  " ": 0xc1,
  "-": 0xc2,
  "!": 0xc4,
  "?": 0xc5,
};

function encodeText(text: string): number[] {
  return text.split("").map((ch) => TEXT_TABLE_INVERSE[ch] ?? 0xff);
}

function writeLine(nametable: Uint8Array, width: number, row: number, col: number, text: string): void {
  const bytes = encodeText(text);
  for (let i = 0; i < bytes.length; i++) {
    nametable[row * width + col + i] = bytes[i]!;
  }
}

function fillBox(nametable: Uint8Array, width: number, geometry: DialogGeometry, byte: number): void {
  for (let y = 0; y < geometry.height; y++) {
    for (let x = 0; x < geometry.width; x++) {
      nametable[(geometry.startRow + y) * width + geometry.startCol + x] = byte;
    }
  }
}

describe("decodeNametableWindow", () => {
  it("extracts a single line of text from the dialog window", () => {
    const width = 64;
    const nametable = new Uint8Array(width * 64);
    fillBox(nametable, width, FF1_DIALOG_GEOMETRY, 0xff);
    writeLine(nametable, width, FF1_DIALOG_GEOMETRY.startRow + 2, FF1_DIALOG_GEOMETRY.startCol, "Hello World");

    const lines = decodeNametableWindow(nametable, width);
    expect(lines).toEqual(["Hello World"]);
  });

  it("extracts multiple non-empty lines and skips blank rows", () => {
    const width = 64;
    const nametable = new Uint8Array(width * 64);
    fillBox(nametable, width, FF1_DIALOG_GEOMETRY, 0xff);
    writeLine(nametable, width, FF1_DIALOG_GEOMETRY.startRow + 1, FF1_DIALOG_GEOMETRY.startCol, "First line");
    writeLine(nametable, width, FF1_DIALOG_GEOMETRY.startRow + 3, FF1_DIALOG_GEOMETRY.startCol, "Second line");

    const lines = decodeNametableWindow(nametable, width);
    expect(lines).toEqual(["First line", "Second line"]);
  });

  it("ignores non-text tiles outside the window", () => {
    const width = 64;
    const nametable = new Uint8Array(width * 64);
    fillBox(nametable, width, FF1_DIALOG_GEOMETRY, 0xff);
    // Write text above the window.
    writeLine(nametable, width, 0, 0, "Outside");
    writeLine(nametable, width, FF1_DIALOG_GEOMETRY.startRow + 1, FF1_DIALOG_GEOMETRY.startCol, "Inside");

    const lines = decodeNametableWindow(nametable, width);
    expect(lines).toEqual(["Inside"]);
  });

  it("trims trailing space and maps unknown tiles to breaks", () => {
    const width = 64;
    const nametable = new Uint8Array(width * 64);
    fillBox(nametable, width, FF1_DIALOG_GEOMETRY, 0xff);
    // "Hi" followed by a border tile ($f7) then more space.
    const row = FF1_DIALOG_GEOMETRY.startRow + 1;
    const col = FF1_DIALOG_GEOMETRY.startCol;
    nametable[row * width + col] = 0x91; // 'H'
    nametable[row * width + col + 1] = 0xac; // 'i'
    nametable[row * width + col + 2] = 0xf7; // border tile
    nametable[row * width + col + 3] = 0xc1; // space

    const lines = decodeNametableWindow(nametable, width);
    expect(lines).toEqual(["Hi"]);
  });
});

describe("readDialogState", () => {
  it("reports dialog closed when no nametable text is visible", () => {
    const mem = new Uint8Array(0x10000);
    mem[ADDR_DESC_BOX_OPEN] = 0;
    const state = readDialogState(createCpuMemoryView(mem));
    expect(state.open).toBe(false);
    expect(state.current).toBe("");
    expect(state.pages).toEqual([]);
  });

  it("decodes current text when dialog text is on the nametable", () => {
    const width = 64;
    const nametable = new Uint8Array(width * 64);
    fillBox(nametable, width, FF1_DIALOG_GEOMETRY, 0xff);
    writeLine(nametable, width, FF1_DIALOG_GEOMETRY.startRow + 1, FF1_DIALOG_GEOMETRY.startCol, "Welcome");

    const mem = new Uint8Array(0x10000);
    const state = readDialogState(createCpuMemoryView(mem), { data: nametable, width });
    expect(state.open).toBe(true);
    expect(state.current).toBe("Welcome");
  });

  it("skips the dialog window decode during battle", () => {
    const width = 64;
    const nametable = new Uint8Array(width * 64);
    fillBox(nametable, width, FF1_DIALOG_GEOMETRY, 0xff);
    writeLine(nametable, width, FF1_DIALOG_GEOMETRY.startRow + 1, FF1_DIALOG_GEOMETRY.startCol, "Welcome");

    const mem = new Uint8Array(0x10000);
    const state = readDialogState(createCpuMemoryView(mem), { data: nametable, width }, { inBattle: true });
    expect(state.open).toBe(false);
    expect(state.current).toBe("");
  });
});

describe("detectBattleMenuWindow", () => {
  const width = 64;

  it("detects the command menu from the plain-letter ITEM/RUN tiles", () => {
    const nametable = new Uint8Array(width * 64);
    // VERIFIED layout from lua_BattleCommandBoxInfo: ITEM at col $0E row 7,
    // RUN at col $14 row 1 (FIGHT/MAGIC/DRINK are digraph tiles, untestable
    // through the plain text table).
    writeLine(nametable, width, 7, 0x0e, "ITEM");
    writeLine(nametable, width, 1, 0x14, "RUN");
    const win = detectBattleMenuWindow(nametable, width);
    expect(win?.kind).toBe("command");
    expect(win?.contents.join(" ")).toContain("ITEM");
    expect(win?.contents.join(" ")).toContain("RUN");
  });

  it("detects the magic menu from its L1-L4 row labels", () => {
    const nametable = new Uint8Array(width * 64);
    // Magic box text starts one tile inside the box (X=$02, Y=$01); the four
    // level rows reach below the drink sub-rectangle (rows 1-6).
    writeLine(nametable, width, 2, 0x03, "L1 FIRE");
    writeLine(nametable, width, 4, 0x03, "L2");
    writeLine(nametable, width, 6, 0x03, "L3");
    writeLine(nametable, width, 8, 0x03, "L4");
    const win = detectBattleMenuWindow(nametable, width);
    expect(win?.kind).toBe("magic");
    expect(win?.contents.join(" ")).toContain("FIRE");
  });

  it("detects the item box when the shared box has no L-labels", () => {
    const nametable = new Uint8Array(width * 64);
    // Item names run long enough to extend past the drink box width.
    writeLine(nametable, width, 2, 0x03, "POTION         X");
    const win = detectBattleMenuWindow(nametable, width);
    expect(win?.kind).toBe("item");
  });

  it("detects the drink box", () => {
    const nametable = new Uint8Array(width * 64);
    writeLine(nametable, width, 2, 0x04, "PURE");
    const win = detectBattleMenuWindow(nametable, width);
    expect(win?.kind).toBe("drink");
  });

  it("returns undefined when no menu box text is visible", () => {
    const nametable = new Uint8Array(width * 64).fill(0x01);
    expect(detectBattleMenuWindow(nametable, width)).toBeUndefined();
  });
});
