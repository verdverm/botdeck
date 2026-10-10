// Anchor each standard map id to its overworld entrance: print, for every
// dungeon-chain root map id, the OW warp-tile coordinate(s) of the entrances
// that lead into it, plus the named OW locations nearby (radius 25) so the
// dungeon name can be chosen from canonical geography.
//
// Run: node inspect-sm-anchors.mjs   (from games/ff1/scripts/)
import fs from "node:fs";
import path from "node:path";

const ow = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../maps/overworld.json"), "utf8"));
const ROOTS = [
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c,
  0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
  0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x32, 0x33,
  0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0x3c,
];

const byDest = new Map();
for (const loc of ow.locations) {
  if (!byDest.has(loc.destMapId)) byDest.set(loc.destMapId, []);
  byDest.get(loc.destMapId).push(loc);
}

for (const id of ROOTS) {
  const sites = byDest.get(id) ?? [];
  if (sites.length === 0) {
    console.log(`0x${id.toString(16)}: (no OW entrance)`);
    continue;
  }
  for (const site of sites) {
    const near = ow.locations
      .filter((l) => {
        if (l === site) return false;
        const dx = Math.min(Math.abs(l.x - site.x), 256 - Math.abs(l.x - site.x));
        const dy = Math.min(Math.abs(l.y - site.y), 256 - Math.abs(l.y - site.y));
        return dx + dy <= 25;
      })
      .map((l) => `${l.name ?? "?"}@(${l.x},${l.y})`)
      .slice(0, 6);
    console.log(
      `0x${id.toString(16).padStart(2, "0")}: OW Warwick @(${site.x},${site.y}) tp${site.teleportIds.join("/")} near: ${near.join(" ")}`,
    );
  }
}
