// Validate the lut_SMPtrTbl entries: which map ids decompress cleanly, and
// what pointer/tileset each carries. This is the ground truth for how many
// standard maps actually exist in the ROM.
import { loadRom, smMapEntry, decompressSmMap, smTilesetForMap } from "./ff1-lib.mjs";

const rom = loadRom();
const valid = [];
const invalid = [];
for (let id = 0; id < 64; id++) {
  const entry = smMapEntry(rom, id);
  try {
    const tiles = decompressSmMap(rom, entry);
    valid.push([id, entry, smTilesetForMap(rom, id), tiles.length]);
  } catch (err) {
    invalid.push([id, entry, String(err.message).slice(0, 0)]);
  }
}
console.log(`valid: ${valid.map(([id, , ts]) => `${id}(ts${ts})`).join(", ")}`);
console.log(`invalid count: ${invalid.length} ids`);
for (const [id, entry] of invalid) {
  console.log(`  id 0x${id.toString(16)} bank ${entry.bank} addr $${entry.addr.toString(16)}`);
}
