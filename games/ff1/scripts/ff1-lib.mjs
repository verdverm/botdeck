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

// --- standard maps (towns/castles/dungeons 64x64) ----------------------
// Format VERIFIED against the disassembly:
//   lut_SMPtrTbl[cur_map]  (bank_0F.asm:4124 LoadStandardMap) -> pointer whose
//   high 2 bits pick the bank (BANK_STANDARDMAPS $04 + bank) and whose
//   AND-$3F OR-$80 value is the bank-relative address of the compressed map.
//   DecompressMap (bank_0F.asm:4227) fills 64x64 = 4096 tiles into RAM mapdata;
//   SM coords wrap mod 64 everywhere AND #$3F.
//   Per-tile properties come from lut_SMTilesetProp (bank_0F.asm:2875),
//   2 bytes per tile for the map's tileset (lut_Tilesets[$ACC0], bank $00):
//     byte 1 [TTBs sssm]: TT bits 7-6 = teleport type (TP_TELE_*), bit 5 =
//       battle marker, bits 4-1 = special, bit 0 = no-move (TP_NOMOVE).
//     byte 2 = teleport ID (exit/normal teleport) or chest/door parameter.
// Constants.inc:298-328 for the TP_ bit meanings.

// lut_NormTele_X/Y/Map = $AD00/$AD40/$AD80 in bank $00. TELE_BASE ($AC00, the
// comment below) is declared later in the file, so use the literal offset.
const TELE_NORM_BASE = 0x2c00 + 0x100;

// Per-tile TP constants (Constants.inc:298-328).
export const TP_NOMOVE = 0x01;
export const TP_SPEC_MASK = 0x1e;
export const TP_BATTLEMARKER = 0x20;
export const TP_TELE_NONE = 0;
export const TP_TELE_WARP = 0x40;
export const TP_TELE_NORM = 0x80;
export const TP_TELE_EXIT = 0xc0;
export const TP_TELE_MASK = 0xc0;

// lut_Tilesets[$ACC0] : standard-map id -> tileset (bank_0F.asm:415). File
// offset $ACC0 is a post-header PRG offset, so +16 for the NES header.
// 64 entries cover every standard-map id (cur_map is masked to 0-63).
export function smTilesetForMap(rom, mapId) {
  return readAt(rom, 16 + 0x2cc0, 64)[mapId];
}

// lut_SMPtrTbl entry parser (bank_0F.asm:4127-4141).
// Returns { bank, addr } with the compressed map's CPU address in its bank.
export function smMapEntry(rom, mapId) {
  const o = 0x04 * 0x4000 + mapId * 2;
  const lo = rom[16 + o];
  const hi = rom[16 + o + 1];
  // AND #$3F; ORA #$80 -> address high byte; ORA #BANK_STANDARDMAPS (low 2
  // bits clear, so ORA = ADD here) -> bank.
  const addr = ((hi & 0x3f) | 0x80) * 0x100 + lo;
  const bank = 0x04 + (((hi & 0xc0) >> 6) & 0x03);
  return { mapId, bank, addr };
}

function idToHex(entry) {
  return (entry.mapId ?? 0).toString(16);
}

// DecompressMap port for standard maps. Same RLE as the overworld rows: a run
// byte $80-$FE repeats tile (byte & $7f) for the following count ($00 = 256);
// $FF terminates. Standard maps are exactly 4096 tiles.
//
// A map may CROSS into the next PRG bank (@NextBank, bank_0F.asm:4297): when
// the source pointer passes $C000 the game swaps in (bank + 1) and continues
// reading from $8000. Large maps like 0x18 do exactly that.
export function decompressSmMap(rom, entry, expected = 4096) {
  const prg = rom.subarray(16);
  let bank = entry.bank;
  let addr = entry.addr;
  const read8 = () => {
    if (addr >= 0xc000) {
      bank = bank + 1;
      addr = 0x8000;
    }
    const v = prg[bank * 0x4000 + (addr - 0x8000)];
    addr = (addr + 1) & 0xffff;
    return v;
  };
  const out = [];
  let guard = 0;
  while (guard++ < 65536) {
    const b = read8();
    if (b === 0xff) break;
    if (b < 0x80) {
      out.push(b);
    } else {
      const tile = b & 0x7f;
      const count = read8() || 256;
      for (let i = 0; i < count; i++) out.push(tile);
    }
    if (out.length >= expected) break;
  }
  if (out.length !== expected) throw new Error(`SM 0x${idToHex(entry)} produced ${out.length} tiles (expected ${expected})`);
  return out;
}

// Build the full 64x64 tile grid of a standard map.
export function buildSmGrid(rom, mapId) {
  const tiles = decompressSmMap(rom, smMapEntry(rom, mapId));
  const grid = [];
  for (let y = 0; y < 64; y++) grid.push(tiles.slice(y * 64, y * 64 + 64));
  return grid;
}

// lut_SMTilesetProp in bank $00: 2 bytes per tile id, tileset blocks of 256
// bytes on page boundaries (VERIFIED: LoadSMTilesetData bank_0F.asm:2872-2880
// adds cur_tileset to the HIGH byte of lut_SMTilesetProp's address, so the
// block for tileset t is at $8800 + t*$100 and holds tiles $00-$7F).
//   { prop: byte 1 (TTBs sssm), param: byte 2 }
export function smTilesetProp(rom, tileset) {
  const base = 0x00 * 0x4000 + 0x0800 + tileset * 0x100; // $8800 + tileset*$100 in bank $00
  const out = [];
  for (let t = 0; t < 256; t++) {
    out.push({ prop: rom[16 + base + t * 2], param: rom[16 + base + t * 2 + 1] });
  }
  return out;
}

// lut_NormTele_X/Y/Map ($AD00/$AD40/$AD80 in bank $00): normal teleport
// destinations (standard map -> standard map).
export function normalTeleportTables(rom) {
  const prg = rom.subarray(16);
  const x = [];
  const y = [];
  const map = [];
  for (let i = 0; i < 64; i++) {
    x.push(prg[TELE_NORM_BASE + i]);
    y.push(prg[TELE_NORM_BASE + 0x40 + i]);
    map.push(prg[TELE_NORM_BASE + 0x80 + i]);
  }
  return { x, y, map };
}

// lut_ExitTele_X/Y ($AC60/$AC70 in bank $00): overworld scroll coordinates of
// an exit teleport (standard map -> overworld).
export function exitTeleportTables(rom) {
  const prg = rom.subarray(16);
  const x = [];
  const y = [];
  for (let i = 0; i < 64; i++) {
    x.push(prg[TELE_BASE + 0x60 + i]);
    y.push(prg[TELE_BASE + 0x70 + i]);
  }
  return { x, y };
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
