// Decode FF1 font-encoded text runs across the ROM PRG and report runs that
// match known location-name words, to locate the in-ROM source of map names.
// Run: node find-names.mjs   (from games/ff1/scripts/)
import fs from "node:fs";
import { loadRom, decodeTextTile } from "./ff1-lib.mjs";

const rom = loadRom();
const prg = rom.subarray(16);

const WORDS = [
  "CORN", "MELMOND", "ELFLAND", "PRAVO", "CRESCENT", "GAIA", "ONRAC",
  "CARAVAN", "CAVE", "SHRINE", "CASTLE", "TOWN", "MOUNT", "DUERGAR",
  "MARSH", "EARTH", "GULG", "SUNKEN", "WATERFALL", "MIRAGE", "FORTRESS",
  "CITADEL", "ORDEAL", "MATOYA", "CHAOS", "FIEND", "BAHAMUT", "CARDIA",
  "DWARF", "LUFENIA", "FALGARD", "MERCHANT", "CAMP",
];

// Decode a maximal run of printable font tiles starting at i.
function decodeRun(i) {
  let s = "";
  let j = i;
  while (j < prg.length) {
    const c = decodeTextTile(prg[j]);
    if (c === null) break;
    s += c;
    j++;
  }
  return { s, len: j - i };
}

const out = [];
let i = 0;
while (i < prg.length) {
  const { s, len } = decodeRun(i);
  if (len >= 4) {
    const up = s.toUpperCase();
    for (const w of WORDS) {
      if (up.includes(w)) {
        out.push({ off: i + 16, s });
        break;
      }
    }
    i += len;
  } else {
    i += 1;
  }
}

// de-duplicate by offset, sort
const seen = new Set();
const rows = [];
const wordCount = new Map();
for (const o of out) {
  if (seen.has(o.off)) continue;
  seen.add(o.off);
  rows.push(`$${o.off.toString(16).padStart(5, "0")}  ${o.s.slice(0, 40)}`);
  const up = o.s.toUpperCase();
  for (const w of WORDS) if (up.includes(w)) wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
}
for (const r of rows) console.log(r);
console.log(`\n${rows.length} matching runs`);
console.log("\nper-word occurrence counts:");
for (const [w, c] of [...wordCount.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${w}: ${c}`);
}
