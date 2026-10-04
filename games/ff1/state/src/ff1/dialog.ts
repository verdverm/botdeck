import { decodeTextByte, TEXT_TABLE } from "../data/text.js";
import { MemoryView } from "../nes/memory.js";
import { ADDR_DIALOG_OPEN } from "../data/constants.js";

/**
 * Geometry of the FF1 dialog text area in PPU 8x8 tiles.
 *
 * The disassembly (bank_0F DrawDialogueBox) draws a box on the offscreen
 * nametable.  The box is 6 rows of 16x16 tiles high (= 12 8x8 rows) and the
 * text is inset 2 tiles from the left edge of the box.  The exact screen
 * position depends on the current scroll, so this is a best-effort fixed
 * window that covers the usual dialog area.
 *
 * IMPORTANT: These numbers are inferred from the disassembly and have not
 * been verified against a live running ROM.  Live verification is needed.
 */
export interface DialogGeometry {
  startRow: number;
  startCol: number;
  width: number;
  height: number;
}

export const FF1_DIALOG_GEOMETRY: DialogGeometry = {
  startRow: 4,
  startCol: 2,
  width: 28,
  height: 12,
};

const FF1_SPACE_TILES = new Set([0xff]);

function isRenderableTextTile(byte: number): boolean {
  return byte in TEXT_TABLE || FF1_SPACE_TILES.has(byte);
}

/**
 * Decode a rectangular window of a nametable into text lines.
 *
 * The nametable is treated as a row-major array of PPU tile indices with the
 * given row width (typically 64 when all four 32x32 nametables are stitched
 * together).  Tiles that are not in the FF1 text table break runs of text.
 */
export function decodeNametableWindow(
  nametable: Uint8Array,
  nametableWidth: number,
  geometry: DialogGeometry = FF1_DIALOG_GEOMETRY,
): string[] {
  const lines: string[] = [];
  for (let y = 0; y < geometry.height; y++) {
    const row = geometry.startRow + y;
    let line = "";
    for (let x = 0; x < geometry.width; x++) {
      const col = geometry.startCol + x;
      const idx = row * nametableWidth + col;
      const byte = nametable[idx] ?? 0;
      if (isRenderableTextTile(byte)) {
        line += decodeTextByte(byte);
      }
    }
    line = line.replace(/\s+$/, "");
    if (line.length > 0) {
      lines.push(line);
    }
  }
  return lines;
}

export interface DialogState {
  open: boolean;
  /** Text currently visible in the dialog window. */
  current: string;
  /** Pages observed while the dialog box has been open. */
  pages: string[];
  note?: string;
}

/**
 * Read the current dialog state from CPU RAM and, if provided, the PPU
 * nametable.
 */
export function readDialogState(
  view: MemoryView,
  nametable?: { data: Uint8Array; width: number },
): DialogState {
  const open = view.u8(ADDR_DIALOG_OPEN) !== 0;
  let current = "";
  if (open && nametable) {
    const lines = decodeNametableWindow(nametable.data, nametable.width);
    current = lines.join("\n");
  }
  return {
    open,
    current,
    pages: [],
    note:
      "Dialog text is decoded from PPU nametable tiles using the verified FF1 TEXT_TABLE. " +
      "Window geometry is inferred from the disassembly and needs live ROM verification.",
  };
}
