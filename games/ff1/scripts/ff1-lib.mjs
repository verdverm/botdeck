// Reusable FF1 ROM helpers for the extraction scripts in this directory.
// All functions take a loaded ROM Buffer and return decoded data. Nothing here
// writes files; scripts compose these into named artifacts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Path constants resolved relative to this lib (games/ff1/scripts/ff1-lib.mjs).
const GAME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ROM_PATH = path.join(GAME_DIR, "game.nes");
export const MAPS_DIR = path.join(GAME_DIR, "maps");

// MMC1: SwapPRG maps a 16KB bank into $8000-$BFFF; $C000-$FFFF fixed to last bank.
export const BANK_OWMAP = 0x01; // lut_OWPtrTbl (256 overworld row pointers)
export const BANK_OWINFO = 0x00; // lut_OWTileset -> tileset_prop
export const LAST_BANK = 0x0f;

// File offsets of tables the disassembly annotates as [$addr :: 0xoffset].
export const OFF_LUT_MINIMAPTILESET = 0x27f90; // bank_09.asm:5106, 1 byte/tile-id
export const OFF_LUT_MINIMAPNT = 0x27010; // bank_09.asm:4120, 30x32 minimap nametable

export const VEHICLES = { foot: 0x01, canoe: 0x02, ship: 0x04, airship: 0x08 };

export function loadRom(p = ROM_PATH) {
  return fs.readFileSync(p);
}

// CPU address -> PRG (post-header) offset, given the swappable bank at $8000.
export function prgOffset(rom, addr, bank) {
  const prg = rom.subarray(16);
  if (addr >= 0x8000 && addr <= 0xbfff) return bank * 0x4000 + (addr - 0x8000);
  if (addr >= 0xc000) return LAST_BANK * 0x4000 + (addr - 0xc000);
  throw new Error(`bad CPU address 0x${addr.toString(16)}`);
}

// Read a run of PRG bytes at a raw file offset (header included).
export function readAt(rom, fileOffset, len) {
  return rom.subarray(fileOffset, fileOffset + len);
}

// FF1 font tile -> character. Verified against the Entroper disassembly font.
export function decodeTextTile(byte) {
  if (byte >= 0x80 && byte <= 0x89) return String.fromCharCode(0x30 + (byte - 0x80));
  if (byte >= 0x8a && byte <= 0xa3) return String.fromCharCode(0x41 + (byte - 0x8a));
  if (byte >= 0xa4 && byte <= 0xbd) return String.fromCharCode(0x61 + (byte - 0xa4));
  if (byte === 0xbe || byte === 0xff) return " ";
  return null;
}

// --- lut_OWPtrTbl: 256 LSB-first row pointers ---
export function owRowPointer(rom, row) {
  const prg = rom.subarray(16);
  const o = BANK_OWMAP * 0x4000 + row * 2;
  return prg[o] | (prg[o + 1] << 8);
}

// DecompressMap port (bank_0F.asm:4227). $00 run-length == 256 tiles (DEX/BNE).
// Terminates on $FF. Returns exactly 256 tile ids.
export function decompressOwRow(rom, row) {
  const prg = rom.subarray(16);
  const out = [];
  let addr = owRowPointer(rom, row);
  const off = (a) =>
    a >= 0x8000 && a <= 0xbfff ? BANK_OWMAP * 0x4000 + (a - 0x8000) : LAST_BANK * 0x4000 + (a - 0xc000);
  let guard = 0;
  while (guard++ < 8192) {
    const b = prg[off(addr)];
    addr = (addr + 1) & 0xffff;
    if (b === 0xff) break;
    if (b < 0x80) {
      out.push(b);
    } else {
      const tile = b & 0x7f;
      const cb = prg[off(addr)];
      addr = (addr + 1) & 0xffff;
      const count = cb === 0 ? 256 : cb;
      for (let i = 0; i < count; i++) out.push(tile);
    }
    if (out.length >= 256) break;
  }
  if (out.length !== 256) throw new Error(`row ${row} produced ${out.length} tiles`);
  return out;
}

// Build the full 256x256 overworld tile grid.
export function buildOwGrid(rom) {
  const grid = [];
  for (let y = 0; y < 256; y++) grid.push(decompressOwRow(rom, y));
  return grid;
}

// tileset_prop: first 512 bytes ($2 x 256) of the OW tileset block at
// lut_OWTileset (BANK_OWINFO $8000).
export function owTilesetProp(rom) {
  const prg = rom.subarray(16);
  const base = BANK_OWINFO * 0x4000;
  const prop = [];
  for (let t = 0; t < 256; t++) {
    prop.push({ blockMask: prg[base + t * 2], special: prg[base + t * 2 + 1] });
  }
  return prop;
}

// lut_MinimapTileset: 1 byte per tile id. bit $04 set = town/dungeon marker.
export function minimapTileset(rom) {
  return Array.from(readAt(rom, OFF_LUT_MINIMAPTILESET, 256));
}

export function isTownDungeonTile(tileId, minimap) {
  return (minimap[tileId] & 0x04) !== 0;
}

// Terrain glyph for a tile id from its tileset_prop entry.
// Terrain uses only non-letter symbols so letters stay free for entrance glyphs.
// '.' land, '=' river (canoe), '~' ocean (ship), '#' blocked (airship only).
export function terrainChar(tilePropEntry) {
  const p = passability(tilePropEntry.blockMask);
  if (p.foot) return ".";
  if (p.canoe) return "=";
  if (p.ship) return "~";
  return "#";
}

// --- entrance teleport tables (BANK_TELEPORTINFO = $00) -----------------
// Overworld tiles whose special byte (tileset_prop[t].special) has bit 7 set
// are teleport tiles; the low 6 bits are the teleport ID. Stepping on one
// warps to (lut_EntrTele_X/Y[id]) in map lut_EntrTele_Map[id] (bank_0F.asm:388).
// CPU addrs in bank $00: X=$AC00, Y=$AC20, Map=$AC40 (32 entries each).
const TELE_BASE = 0x2c00; // $AC00 in bank $00 -> PRG offset (file offset +16)
export function entranceTeleportTables(rom) {
  const prg = rom.subarray(16);
  const x = [];
  const y = [];
  const map = [];
  for (let i = 0; i < 32; i++) {
    x.push(prg[TELE_BASE + i]);
    y.push(prg[TELE_BASE + 0x20 + i]);
    map.push(prg[TELE_BASE + 0x40 + i]);
  }
  return { x, y, map };
}

// Teleport ID if the tile's special byte marks it a teleport tile, else null.
export function tileTeleport(special) {
  if ((special & 0x80) === 0) return null;
  return special & 0x3f;
}

// Standard-map names for IDs 0x00-0x0C (mirror of STANDARD_MAP_NAMES in
// games/ff1/state/src/ff1/reader.ts, VERIFIED against the ROM teleport tables).
export const STANDARD_MAP_NAMES = {
  0x00: "Coneria",
  0x01: "Provoka",
  0x02: "Elfland",
  0x03: "Melmond",
  0x04: "Crescent Lake",
  0x05: "Gaia",
  0x06: "Onrac",
  0x07: "Caravan",
  0x08: "Coneria Castle",
  0x09: "Elfland Castle",
  0x0a: "Northwest Castle",
  0x0b: "Castle of Ordeals",
  0x0c: "Temple of Fiends",
};

// Resolve per-vehicle passability for a tile from its blockMask.
// Airship always passes (OWCanMove short-circuits on airship).
export function passability(blockMask) {
  return {
    foot: (blockMask & VEHICLES.foot) === 0,
    canoe: (blockMask & VEHICLES.canoe) === 0,
    ship: (blockMask & VEHICLES.ship) === 0,
    airship: true,
  };
}

// Flood-fill 4-connected clusters over a boolean predicate on the grid.
export function findClusters(grid, pred) {
  const H = grid.length;
  const W = grid[0].length;
  const key = (x, y) => y * W + x;
  const visited = new Set();
  const clusters = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (visited.has(key(x, y)) || !pred(x, y)) continue;
      const stack = [[x, y]];
      const comp = [];
      visited.add(key(x, y));
      while (stack.length) {
        const [cx, cy] = stack.pop();
        comp.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (visited.has(key(nx, ny)) || !pred(nx, ny)) continue;
          visited.add(key(nx, ny));
          stack.push([nx, ny]);
        }
      }
      clusters.push(comp);
    }
  }
  return clusters;
}
