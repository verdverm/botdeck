import { boot, mem, RIGHT } from "./probe.js";
import { readFF1State, createCpuMemoryView } from "@games/ff1-state";

const em = boot("000002-start-02-post-town");
const m = mem(em);
const view = createCpuMemoryView(m);

const ADDR_MAPFLAGS = 0x002d;
const ADDR_BATTLE_RESULT = 0x6b86;
const ADDR_BATTLE_ENEMY_COUNT = 0x6c93;
const ADDR_BATTLE_ACTIVE_INDEX = 0x6b7a;
const ADDR_BATTLE_TURNORDER_INDEX = 0x688e;

// The new (broken?) predicate: full state read per frame.
function newPredicate(): { abort: boolean; why: string } {
  try {
    const state = readFF1State(view);
    if (state.battle.inBattle) return { abort: true, why: "inBattle" };
    if (state.world.isStandardMap) return { abort: true, why: "isStandardMap" };
    return { abort: false, why: "" };
  } catch (e) {
    return { abort: true, why: `THROW: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Walk RIGHT in hold(2)/gap(2) cycles like the macro runner, evaluating the
// predicate before each frame exactly as advanceMacro does.
let walking = true;
em.buttonDown(1, RIGHT as never);
let frame = 0;
let phase: "hold" | "gap" = "hold";
let remaining = 2;
let steps = 0;
while (walking && frame < 60 * 30) {
  const { abort, why } = newPredicate();
  if (abort) {
    console.log(
      `INTERRUPT at frame=${frame} steps=${steps} why=${why} ` +
        `mapflags=${m[ADDR_MAPFLAGS]} result=${m[ADDR_BATTLE_RESULT]} ` +
        `enemyCount=${m[ADDR_BATTLE_ENEMY_COUNT]} activeIdx=${m[ADDR_BATTLE_ACTIVE_INDEX]} ` +
        `turnOrderIdx=${m[ADDR_BATTLE_TURNORDER_INDEX]}`,
    );
    walking = false;
    break;
  }
  em.frame();
  frame += 1;
  remaining -= 1;
  if (remaining === 0) {
    if (phase === "hold") {
      em.buttonUp(1, RIGHT as never);
      phase = "gap";
      remaining = 2;
    } else {
      em.buttonDown(1, RIGHT as never);
      phase = "hold";
      remaining = 2;
      steps += 1;
    }
  }
}
if (walking) console.log(`no interrupt after ${frame} frames, ${steps} steps`);
