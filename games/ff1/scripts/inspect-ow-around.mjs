// Render the overworld neighborhood (13x17) around given coordinates using
// the extracted overworld grid, to identify dungeon entrance sites by terrain.
// Run: node inspect-ow-around.mjs x y [x y ...]
import fs from "node:fs";
import path from "node:path";

const ow = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../maps/overworld.json")));
const props = ow.tileProps;
const at = (x, y) => {
  const t = ow.tiles[((y % 256) + 256) % 256][((x % 256) + 256) % 256];
  const p = props[String(t)];
  if (!p) return " ";
  if (p.pass.foot) return ".";
  if (p.pass.canoe) return "=";
  if (p.pass.ship) return "~";
  return "#";
};
const wrap = (x, y) => { x = ((x % 256) + 256) % 256; y = 0 ? 0 : y; return [x, ((y % 256) + 256) % 256]; };

for (let i = 2; i < process.argv.length; i += 2) {
  const [cx, cy] = wrap(Number(process.argv[i]), Number(process.argv[i + 1]));
  console.log(`--- (${cx},${cy}) ---`);
  for (let y = cy - 6; y <= cy + 6; y++) {
    let row = "";
    for (let x = cx - 8; x <= cx + 8; x++) {
      const [ax, ay] = wrap(x, y);
      row += at(ax, ay);
    }
    console.log("  " + row);
  }
}
