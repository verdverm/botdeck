/**
 * TEMPORARY: frame-by-frame mapflags/predicate watch during town entrance,
 * in-town goto, and town exit. The cb14f44 commit message says mapflags
 * flickers during tile transitions; this pins down exactly when.
 */
import { it } from "vitest";
import { Emulator } from "../emulator/emulator";
import { FF1GamePlugin } from "./ff1";
import { bootEmulator } from "./_dbg-boot";

const ADDR_MAPFLAGS = 0x2d;

async function watch(
  label: string,
  emulator: Emulator,
  view: { u8: (a: number) => number },
  readFF1State: (v: never) => {
    battle: { inBattle: boolean; phase: string };
    world: { isStandardMap: boolean; mapFlags: number; mapName: string; standardMapX: number; standardMapY: number; overworldPlayerX: number; overworldPlayerY: number };
  },
  frames: number,
) {
  const { } = { label };
  let last = "";
  for (let f = 1; f <= frames; f++) {
    emulator.stepFrame();
    const s = readFF1State(view as never);
    const sig = `std=${s.world.isStandardMap} battle=${s.battle.inBattle} phase=${s.battle.phase} flags=${s.world.mapFlags}`;
    if (sig !== last) {
      console.log(
        `  [${label}] f=${f} ${sig} map=${s.world.mapName} ow=${s.world.overworldPlayerX},${s.world.overworldPlayerY} sm=${s.world.standardMapX},${s.world.standardMapY}`,
      );
      last = sig;
    }
  }
}

it(
  "dbg: walk into Coneria, in-town goto, watch flags every frame",
  async () => {
    const emulator = bootEmulator("000002-start-02-post-town");
    const plugin = new FF1GamePlugin(emulator);
    const { createCpuMemoryView, readFF1State } = await import("@games/ff1-state");
    const view = createCpuMemoryView(emulator.getMemory()!);

    const s0 = readFF1State(view);
    console.log(
      `boot: map=${s0.world.mapName} std=${s0.world.isStandardMap} ow=${s0.world.overworldPlayerX},${s0.world.overworldPlayerY}`,
    );

    // goto Coneria (overworld macro, interrupt armed) - expect interrupt at entrance.
    const cmd = { name: "goto", args: { location: "coneria" } };
    const macro = plugin.compile(cmd);
    console.log(`goto coneria: ${macro.length} steps`);
    const abort = plugin.macroAbort(cmd);
    const done = emulator.runMacro(macro, abort);
    let frames = 0;
    let lastSig = "";
    while (emulator.isPlayingMacro() && frames < 60 * 60) {
      // predicate decision this frame, before stepping (mirror advanceMacro)
      emulator.stepFrame();
      frames += 1;
      const s = readFF1State(view);
      const sig = `std=${s.world.isStandardMap} battle=${s.battle.inBattle} flags=${s.world.mapFlags}`;
      if (sig !== lastSig) {
        console.log(`  [goto] f=${frames} ${sig} ow=${s.world.overworldPlayerX},${s.world.overworldPlayerY}`);
        lastSig = sig;
      }
    }
    await done;
    console.log(
      `goto END f=${frames} interrupted=${emulator.wasMacroInterrupted()}`,
    );

    // Let the entrance settle, then read where we are.
    for (let i = 0; i < 240; i++) emulator.stepFrame();
    const s1 = readFF1State(view);
    console.log(
      `after entrance settle: map=${s1.world.mapName} std=${s1.world.isStandardMap} sm=${s1.world.standardMapX},${s1.world.standardMapY} flags=${s1.world.mapFlags}`,
    );

    // In-town goto: exit. Watch the per-frame flags during playback.
    if (s1.world.isStandardMap) {
      const cmd2 = { name: "goto", args: { location: "exit" } };
      let macro2;
      try {
        macro2 = plugin.compile(cmd2);
      } catch (e) {
        console.log(`in-town compile failed: ${e instanceof Error ? e.message : e}`);
        return;
      }
      console.log(`in-town goto: ${macro2.length} steps`);
      const abort2 = plugin.macroAbort(cmd2)!;
      let checks = 0;
      const instrumented = () => {
        const r = abort2();
        checks += 1;
        if (r || checks % 20 === 0) {
          const s = readFF1State(view);
          console.log(
            `  [town] check=${checks} abort=${r} std=${s.world.isStandardMap} battle=${s.battle.inBattle} flags=${s.world.mapFlags} sm=${s.world.standardMapX},${s.world.standardMapY}`,
          );
        }
        return r;
      };
      const done2 = emulator.runMacro(macro2, instrumented);
      let f2 = 0;
      while (emulator.isPlayingMacro() && f2 < 60 * 60) {
        emulator.stepFrame();
        f2 += 1;
      }
      await done2;
      const s2 = readFF1State(view);
      console.log(
        `in-town goto END f=${f2} interrupted=${emulator.wasMacroInterrupted()} map=${s2.world.mapName} std=${s2.world.isStandardMap}`,
      );
    }
  },
  300_000,
);
