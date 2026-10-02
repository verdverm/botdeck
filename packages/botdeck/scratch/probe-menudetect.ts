import { boot, mem, START, B } from "./probe.js";

const STATE = process.argv[2] ?? "000002-start-02-town-entrence";
const em = boot(STATE);
const F = (n: number) => { for (let i = 0; i < n; i++) em.frame(); };
const tap = (btn: number, hold = 6, gap = 12) => { em.buttonDown(1, btn); F(hold); em.buttonUp(1, btn); F(gap); };
const grab = (hi = 0x100) => Uint8Array.from(mem(em).slice(0, hi));

F(60);
const field = grab();
tap(START); F(120);
const open = grab();
tap(B); F(120);
const closed = grab();

console.log("Zero-page bytes: field==closed AND open!=field  (clean open-discriminators):");
for (let i = 0; i < 0x100; i++) {
  if (field[i] === closed[i] && open[i] !== field[i]) {
    console.log(`  $${i.toString(16).padStart(2, "0")}: field=${field[i]} open=${open[i]} closed=${closed[i]}`);
  }
}
console.log("\nBytes that DON'T cleanly return on close (residual) but appear on open:");
for (let i = 0; i < 0x100; i++) {
  if (field[i] !== closed[i] && open[i] !== field[i]) {
    console.log(`  $${i.toString(16).padStart(2, "0")}: field=${field[i]} open=${open[i]} closed=${closed[i]}`);
  }
}
