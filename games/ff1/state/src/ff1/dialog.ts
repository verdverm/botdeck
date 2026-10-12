import { decodeTextByte, TEXT_TABLE } from "../data/text.js";
import { MemoryView } from "../nes/memory.js";
import { ADDR_DESC_BOX_OPEN } from "../data/constants.js";

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

/**
 * Geometry of the battle menu boxes, in PPU 8x8 tiles, VERIFIED against the
 * disassembly box luts (bank_0F):
 * - command box: lua_BattleCommandBoxInfo ($3FA2B) X=$0C Y=0 W=$0D H=$0A,
 *   text FIGHT/MAGIC/DRINK/ITEM at col $0E rows 1/3/5/7, RUN at col $14 row 1.
 *   NOTE: FIGHT/MAGIC/DRINK are drawn with battle digraph tiles ($EB-$F6)
 *   that are not in the plain text table; ITEM ($92 $9D $8E $96) and RUN
 *   ($9B $9E $97) are plain letter tiles, so detection keys on ITEM/RUN.
 * - magic/item box: lut_CombatItemMagicBox ($3FA26) X=$02 Y=$01 W=$16 H=$0A.
 * - drink box: lut_CombatDrinkBox ($3FA16) X=$03 Y=$01 W=$0C H=$06.
 */
export const FF1_BATTLE_COMMAND_BOX: DialogGeometry = {
  startRow: 0,
  startCol: 0x0c,
  width: 0x0d,
  height: 0x0a,
};
export const FF1_BATTLE_MAGIC_BOX: DialogGeometry = {
  startRow: 0x01,
  startCol: 0x02,
  width: 0x16,
  height: 0x0a,
};
export const FF1_BATTLE_DRINK_BOX: DialogGeometry = {
  startRow: 0x01,
  startCol: 0x03,
  width: 0x0c,
  height: 0x06,
};

export type BattleMenuKind = "command" | "magic" | "item" | "drink";

export interface BattleMenuWindow {
  kind: BattleMenuKind;
  /** Decoded text lines currently visible inside the menu box. */
  contents: string[];
}

/**
 * Detect which battle menu box is currently on screen by decoding the
 * known box windows of the nametable and matching their text signatures.
 *
 * The game has no RAM variable identifying the open battle submenu (it is
 * call-stack state), so the on-screen text is the ground truth. VERIFIED
 * geometry; signature matching is INFERRED and should be checked against
 * live states.
 *
 * @returns The detected menu window, or undefined when no known menu box
 *   text is visible (e.g. during target selection or round execution).
 */
export function detectBattleMenuWindow(
  nametable: Uint8Array,
  nametableWidth: number,
): BattleMenuWindow | undefined {
  const command = decodeNametableWindow(nametable, nametableWidth, FF1_BATTLE_COMMAND_BOX);
  if (command.some((l) => l.includes("ITEM") || l.includes("RUN"))) {
    return { kind: "command", contents: command };
  }
  const magic = decodeNametableWindow(nametable, nametableWidth, FF1_BATTLE_MAGIC_BOX);
  if (magic.length > 0) {
    // The drink box (X=$03 Y=$01 W=$0C H=$06) sits entirely inside the
    // magic/item window, so its text also decodes there. Distinguish by
    // blanking the drink sub-rectangle: if no text remains, only the small
    // drink box is on screen.
    const masked = nametable.slice();
    for (let y = 0; y < FF1_BATTLE_DRINK_BOX.height; y++) {
      for (let x = 0; x < FF1_BATTLE_DRINK_BOX.width; x++) {
        masked[(FF1_BATTLE_DRINK_BOX.startRow + y) * nametableWidth + FF1_BATTLE_DRINK_BOX.startCol + x] = 0;
      }
    }
    const outside = decodeNametableWindow(masked, nametableWidth, FF1_BATTLE_MAGIC_BOX);
    if (outside.length === 0) {
      return { kind: "drink", contents: magic };
    }
    // The magic box prints "L1".."L4" (page 0) or "L5".."L8" (page 1) row
    // labels; the item box shares the same geometry but lists item names.
    if (outside.some((l) => /L[1-8]/.test(l))) {
      return { kind: "magic", contents: magic };
    }
    return { kind: "item", contents: magic };
  }
  return undefined;
}

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
  options: { inBattle?: boolean } = {},
): DialogState {
  // $7F (descboxopen) flags the in-menu item/magic DESCRIPTION box only; it
  // is never set for NPC dialogue (VERIFIED, bank_0E:8480 vs ShowDialogueBox
  // which sets no flag). The only reliable "dialog open" signal is text
  // visible in the dialog window of the nametable.
  const descBoxOpen = view.u8(ADDR_DESC_BOX_OPEN) !== 0;
  let current = "";
  // In battle the dialog window overlaps the battle menu boxes, so the
  // nametable decode would pick up menu text. Battle text is surfaced via
  // detectBattleMenuWindow instead.
  if (nametable && !options.inBattle) {
    const lines = decodeNametableWindow(nametable.data, nametable.width);
    current = lines.join("\n");
  }
  const open = nametable ? current.length > 0 : descBoxOpen;
  return {
    open,
    current,
    pages: [],
    note:
      "Dialog open is derived from decoded nametable text (NPC dialogue sets no RAM flag; " +
      "VERIFIED against ShowDialogueBox). Window geometry is inferred from the disassembly " +
      "and needs live ROM verification.",
  };
}
