import { boot, mem } from "./probe.js";

const FIELDS = [
  "000001-start-01",
  "000002-start-02-town-entrence",
  "000015-state-05-2-town-exit",
  "000035-post-battle-01-1-return-to-town",
  "000041-post-battle-01-7-exit-town",
];
const WINDOWS = ["000003-start-03-1-weapon-shop", "000009-start-03-7-inn", "000008-start-03-6-clinic"];
const BATTLE = ["000016-start-06-1-battle-start", "000017-battle-01-1-menu-open"];

const row = (s: string) => {
  const em = boot(s);
  for (let i = 0; i < 60; i++) em.frame();
  const m = mem(em);
  return { s, f1f: m[0x1f], f26: m[0x26], c62: m[0x62], c63: m[0x63], f50: m[0x50], f7f: m[0x7f], dc: m[0xdc] };
};

const show = (title: string, list: string[]) => {
  console.log(`\n== ${title} ==`);
  for (const s of list) {
    const r = row(s);
    console.log(
      `  $1f=${String(r.f1f).padStart(3)} $26=${String(r.f26).padStart(3)} $62=${r.c62} $63=${r.c63} $50=${r.f50} $7f=${r.f7f} $dc=${r.dc}   ${r.s}`,
    );
  }
};
show("FIELD (expect $1f=64, $63=0)", FIELDS);
show("SHOP/INN/CLINIC", WINDOWS);
show("BATTLE", BATTLE);
