// Dump the raw lut_SMPtrTbl entries to understand why some map ids decompress
// cleanly and others do not. lut_SMPtrTbl lives in bank $04 at $8000
// (Constants.inc:450, verified by LoadStandardMap bank_0F.asm:4124).
import { loadRom, smTilesetForMap } from "./ff1-lib.mjs";

const rom = loadRom();
console.log("id | ptr | bank | addr  | tileset");
for (let id = 0; id < 64; id++) {
  const o = 0x04 * 0x4000 + id * 2;
  const lo = rom[16 + o];
  const hi = rom[16 + o + 1];
  const hiBank = (hi & 0xc0) >> 6;
  const addrHigh = (hi & 0x3f) | 0x80;
  const ts = smTilesetForMap(rom, id);
  console.log(
    `${id.toString(16).padStart(2, "0")} $${(hi * 0x100 + lo).toString(16).padStart(4, "0")} ` +
      `banksel ${hiBank} addr $${addrHigh.toString(16)}${lo.toString(16).padStart(2, "0")} ` +
      `tileset ${ts}`,
  );
}
