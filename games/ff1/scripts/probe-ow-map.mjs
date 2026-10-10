// Probe: validate overworld map row pointer table + RLE decompression against game.nes.
// This is exploratory; not the real extractor. Run: node probe-ow-map.mjs   (from games/ff1/scripts/)
import fs from "node:fs";

const NES = fs.readFileSync("../game.nes");
const PRG = NES.subarray(16); // strip 16-byte iNES header

// MMC1: 16KB banks swapped into $8000; $C000 fixed to last bank.
// Address in [$8000,$BFFF] within bank N -> PRG offset N*0x4000 + (addr-0x8000).
const BANK_OWMAP = 0x01;

// lut_OWPtrTbl = $8000 in BANK_OWMAP, 256 rows x 2 bytes (LSB-first row pointers).
const PTR_BASE = BANK_OWMAP * 0x4000; // offset of $8000 for bank 01
function rowPointer(row) {
  const o = PTR_BASE + row * 2;
  const lo = PRG[o];
  const hi = PRG[o + 1];
  return lo | (hi << 8); // CPU address in $8000-$BFFF (or $C000+ for last bank)
}

// Decompress one row following DecompressMap (bank_0F.asm:4227).
// Source is the row pointer; terminates on $FF. Emits tile-ID bytes.
function decompressRow(row) {
  const out = [];
  const start = rowPointer(row);
  let addr = start;
  // absolute PRG position: for $8000-$BFFF -> bankOwmap*0x4000 + addr-0x8000
  const toOff = (a) => {
    if (a >= 0x8000 && a <= 0xbfff) return PTR_BASE + (a - 0x8000);
    if (a >= 0xc000) return (0x0f * 0x4000) + (a - 0xc000); // last bank fixed
    throw new Error(`unexpected ptr 0x${a.toString(16)} at row ${row}`);
  };
  let guard = 0;
  while (guard++ < 4096) {
    const b = PRG[toOff(addr)];
    addr = (addr + 1) & 0xffff;
    if (b === 0xff) break; // terminator
    if (b < 0x80) {
      out.push(b); // single tile
    } else {
      const tile = b & 0x7f;
      const count = PRG[toOff(addr)];
      addr = (addr + 1) & 0xffff;
      for (let i = 0; i < count; i++) out.push(tile);
    }
    if (out.length >= 256) break;
  }
  return out;
}

console.log("First 8 row pointers (CPU addrs):");
for (let r = 0; r < 8; r++) {
  console.log(`  row ${r}: $${rowPointer(r).toString(16).padStart(4, "0")}`);
}

for (const r of [157, 158, 159]) {
  const d = decompressRow(r);
  console.log(`\nRow ${r}: decompressed ${d.length} tiles (expect 256)`);
  console.log("  first 32:", d.slice(0, 32).join(","));
  const uniq = [...new Set(d)].sort((a, b) => a - b);
  console.log("  distinct tile IDs:", uniq.length, "range", uniq[0], "..", uniq.at(-1));
}
