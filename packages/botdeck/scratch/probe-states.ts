import { boot, mem } from "./probe.js";
import { readFF1State, createJsNesStateView } from "@games/ff1-state";

const STATES = [
  "000002-start-02-town-entrence",
  "000003-start-03-1-weapon-shop",
  "000009-start-03-7-inn",
  "000008-start-03-6-clinic",
  "000016-start-06-1-battle-start",
  "000017-battle-01-1-menu-open",
  "000022-battle-01-7-first-imp-death",
];

for (const s of STATES) {
  const em = boot(s);
  for (let i = 0; i < 60; i++) em.frame();
  const m = mem(em);
  const ff1 = readFF1State(createJsNesStateView(em.toJSON() as never));
  const hex = (a: number) => `$${a.toString(16).padStart(2, "0")}=${m[a]}`;
  console.log(`\n${s}`);
  console.log(`  reader: mode=${ff1.context.mode} menu=${ff1.context.menu} cursor=${ff1.menu.cursor} inMenu=${ff1.menu.inMenu} shop=${ff1.menu.shopType}`);
  console.log(`  bytes:  ${hex(0x1f)} ${hex(0x26)} ${hex(0x62)} ${hex(0x63)} ${hex(0x64)} ${hex(0x65)} ${hex(0x66)} ${hex(0x67)} ${hex(0x7f)} ${hex(0xdc)} ${hex(0x11)} ${hex(0x12)}`);
  console.log(`  battle cursor $6AAA=${m[0x6aaa]} $6AAB=${m[0x6aab]} btlcmd $6B7A=${m[0x6b7a]}`);
}
