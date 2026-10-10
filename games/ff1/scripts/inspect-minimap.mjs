// Dump the lut_MinimapNT world-map nametable as hex so we can locate the
// drawn location-name strings (the minimap draws location names as tile runs
// of the minimap_title CHR set).
import fs from "node:fs";
import path from "node:path";

const p = "../../../.extern/FF1Disassembly/Final Fantasy Disassembly/bin/minimap_nt.nam";
const nam = fs.readFileSync(path.resolve(import.meta.dirname, p));
// Each nametable entry is 2 bytes wide ( Nam + attribute byte pairs?) based on
// the asm comment: 'full name and attribute table for the minimap'. Hex-dump
// the first 0x400 bytes in 32-byte rows.
for (let y = 0; y < 32; y++) {
  let s = "";
  for (let x = 0; x < 32; x++) {
    const b = nam[y * 32 + x];
    s += b === 0 ? "--" : b.toString(16).padStart(2, "0");
    s += " ";
  }
  console.log(s.trimEnd());
}
console.log("---- attribute-ish tail ----");
for (let y = 0; y < 16; y++) {
  let s = "";
  for (let x = 0; x < 32; x++) {
    const i = 0x400 + y * 32 + x;
    s += (nam[i] ?? 0).toString(16).padStart(2, "0");
    s += " ";
  }
  console.log(s.trimEnd());
}
