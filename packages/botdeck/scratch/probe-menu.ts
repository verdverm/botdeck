import { boot, mem, START, DOWN, UP, A, B, LEFT, RIGHT } from "./probe.js";

const STATE = process.argv[2] ?? "000002-start-02-town-entrence";

const em = boot(STATE);
const F = (n: number) => { for (let i = 0; i < n; i++) em.frame(); };
const tap = (btn: number, hold = 6, gap = 12) => { em.buttonDown(1, btn); F(hold); em.buttonUp(1, btn); F(gap); };
const zp = () => Array.from(mem(em).slice(0x00, 0x100));

function show(label: string, prev: number[]) {
  const cur = zp();
  const ch = cur
    .map((v, i) => [i, prev[i], v] as const)
    .filter(([, b, a]) => b !== a)
    .map(([i, b, a]) => `$${i.toString(16).padStart(2, "0")}:${b}->${a}`);
  console.log(`${label.padEnd(16)} changed: ${ch.join(" ") || "(none)"}`);
  console.log(`  focus $60-$6B: ${cur.slice(0x60, 0x6c).join(",")}   $50/51: ${cur[0x50]},${cur[0x51]}   $7C-$7F: ${cur.slice(0x7c, 0x80).join(",")}`);
  return cur;
}

F(60);
let p = zp();
console.log("menu $60-$6B baseline:", p.slice(0x60, 0x6c).join(","));

tap(START);
F(120);
p = show("START", p);

tap(DOWN);
F(60);
p = show("DOWN", p);

tap(DOWN);
F(60);
p = show("DOWN", p);

tap(UP);
F(60);
p = show("UP", p);

tap(A);
F(120);
p = show("A (row0?)", p);

tap(DOWN);
F(60);
p = show("sub DOWN", p);

tap(B);
F(60);
p = show("B", p);

tap(B);
F(120);
p = show("B (close?)", p);
