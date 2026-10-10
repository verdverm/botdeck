// Verify the extracted overworld grid against the live emulator's RAM.
//
// The game keeps only a rolling 16-row window of the overworld in `mapdata`
// ($7000-$7FFF, row r stored at $7000 + (r & 0x0F) * 0x100). Every recorded
// save state therefore carries ground truth for up to 16 grid rows. This script
// checks each extracted row against every state whose window covers it, so a
// decompression bug in one row is named instead of silently corrupting routes.
//
// Run: node verify-ow-rows.mjs [stateGlob]   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";
import { MAPS_DIR } from "./ff1-lib.mjs";

const map = JSON.parse(fs.readFileSync(path.join(MAPS_DIR, "overworld.json"), "utf8"));
const { tiles, width } = map;

const STATES_DIR = path.resolve(
  path.dirname(MAPS_DIR),
  "../../plays/ff1/0000_dev/states",
);

const filter = process.argv[2];
const files = fs
  .readdirSync(STATES_DIR)
  .filter((f) => f.endsWith(".state.json") && (!filter || f.includes(filter)))
  .sort();

// Per-row tallies: rows only count when the game had them resident and drawn, so
// `verified` means at least one state's window included the row.
const verdict = new Map(); // row -> { match: number, mismatch: number, examples: [] }
function note(row, matched, file) {
  if (!verdict.has(row)) verdict.set(row, { match: 0, mismatch: 0, examples: [] });
  const v = verdict.get(row);
  if (matched) v.match += 1;
  else {
    v.mismatch += 1;
    if (v.examples.length < 3) v.examples.push(file);
  }
}

let owStates = 0;
for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(STATES_DIR, file), "utf8"));
  const state = raw.state ?? raw;
  const mem = state.cpu?.mem;
  if (!mem) continue;
  // Overworld only: mapflags ($2D) bit 0 clear.
  if (mem[0x002d] & 0x01) continue;
  owStates += 1;
  const scrollY = mem[0x0028];
  // The window covers the scrolled-to rows plus the one being drawn in.
  for (let i = 0; i < 16; i++) {
    const row = (scrollY + i) % 256;
    const base = 0x7000 + (row % 16) * 0x100;
    let mismatches = 0;
    let firstAt = -1;
    for (let x = 0; x < width; x++) {
      if (mem[base + x] !== tiles[row][x]) {
        mismatches += 1;
        if (firstAt < 0) firstAt = x;
      }
    }
    if (mismatches === 0) note(row, true, file);
    else {
      note(row, false, file);
      if (mismatches < 60) {
        const got = [];
        const want = [];
        for (let x = firstAt; x < Math.min(firstAt + 8, width); x++) {
          got.push(mem[base + x]);
          want.push(tiles[row][x]);
        }
        console.log(
          `row ${row} (from ${file}): ${mismatches} differ, first at x=${firstAt} ram=[${got}] json=[${want}]`,
        );
      }
    }
  }
}

const rows = [...verdict.keys()].sort((a, b) => a - b);
const badRows = rows.filter((r) => verdict.get(r).mismatch > 0);
console.log(`\nscanned ${owStates} overworld states, ${rows.length} distinct rows observed`);
console.log(`rows with any mismatch: ${badRows.length}`);
for (const r of badRows.slice(0, 40)) {
  const v = verdict.get(r);
  console.log(`  row ${r}: ${v.mismatch} mismatch / ${v.match + v.mismatch} looks  e.g. ${v.examples[0]}`);
}
