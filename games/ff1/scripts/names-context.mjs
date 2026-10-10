// For each location-name match, dump the full decoded string it sits inside
// plus surrounding context, to determine whether the name is a standalone
// table entry or part of a sentence (dialog).
// Run: node names-context.mjs   (from games/ff1/scripts/)
import { loadRom, decodeTextTile } from "./ff1-lib.mjs";

const rom = loadRom();
const prg = rom.subarray(16);

const NAMES = ["PRAVO", "GAIA", "MELMOND", "ELFLAND", "CRESCENT", "ONRAC",
  "CARAVAN", "CORN", "DUERGAR", "MARSH", "SUNKEN", "MIRAGE", "CITADEL"];

// A font tile is printable if decodeTextTile returns non-null.
const printable = (b) => decodeTextTile(b) !== null;

// Walk backward/forward from an index to the nearest non-printable boundaries,
// giving the full contiguous string the name lives in.
function fullString(idx) {
  let s = idx, e = idx;
  while (s > 0 && printable(prg[s - 1])) s--;
  while (e < prg.length && printable(prg[e])) e++;
  const bytes = prg.slice(s, e);
  const text = [...bytes].map((b) => decodeTextTile(b) ?? "?").join("");
  return { start: s + 16, text, bytes };
}

for (const name of NAMES) {
  let found = false;
  for (let i = 0; i < prg.length - name.length; i++) {
    const { start, text } = fullString(i);
    if (text.toUpperCase().includes(name) && i === start - 16) {
      console.log(`\n[${name}] @ ${"$" + start.toString(16)} full-string-len=${text.length}`);
      console.log(`   "${text}"`);
      console.log(`   raw bytes: ${[...prg.slice(start - 16, start - 16 + Math.min(text.length + 2, 60))].map((b) => b.toString(16).padStart(2, "0")).join(" ")}`);
      found = true;
      break;
    }
  }
  if (!found) console.log(`\n[${name}] no printable-run match`);
}
