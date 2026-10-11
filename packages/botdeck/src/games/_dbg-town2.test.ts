/**
 * TEMPORARY: long in-town walk, watching every frame for mapflags flicker
 * that would trip the startedOnStandardMap branch of macroAbort.
 */
import { it } from "vitest";
import { FF1GamePlugin } from "./ff1";
import { bootEmulator } from "./_dbg-boot";

it(
  "dbg: long in-town goto, per-frame flags watch",
  async () => {
    const emulator = bootEmulator("000002-start-02-post-town");
    const plugin = new FF1GamePlugin(emulator);
    const { createCpuMemoryView, readFF1State } = await import("@games/ff1-state");
    const view = createCpuMemoryView(emulator.getMemory()!);

    // Walk into Coneria via the overworld goto.
    const cmd = { name: "goto", args: { location: "coneria" } };
    const done = emulator.runMacro(plugin.compile(cmd), plugin.macroAbort(cmd));
    let frames = 0;
    while (emulator.isPlayingMacro() && frames < 60 * 60) {
      emulator.stepFrame();
      frames += 1;
    }
    await done;
    for (let i = 0; i < 240; i++) emulator.stepFrame();
    let s = readFF1State(view);
    console.log(`in town: map=${s.world.mapName} std=${s.world.isStandardMap} sm=${s.world.standardMapX},${s.world.standardMapY} flags=${s.world.mapFlags}`);

    // Manually walk UP deep into town (16 tiles), watching flags.
    const UP = 4;
    for (let step = 0; step < 16; step++) {
      emulator.buttonDown(UP);
      for (let f = 0; f < 16; f++) emulator.stepFrame();
      emulator.buttonUp(UP);
      for (let f = 0; f < 4; f++) emulator.stepFrame();
      const ns = readFF1State(view);
      if (ns.world.mapFlags !== 1) {
        console.log(`  manual walk step=${step} flags=${ns.world.mapFlags} sm=${ns.world.standardMapX},${ns.world.standardMapY}`);
      }
    }
    s = readFF1State(view);
    console.log(`deep in town: sm=${s.world.standardMapX},${s.world.standardMapY} flags=${s.world.mapFlags}`);

    // Now goto exit (a long route back) with an instrumented predicate.
    const cmd2 = { name: "goto", args: { location: "exit" } };
    let macro2;
    try {
      macro2 = plugin.compile(cmd2);
    } catch (e) {
      console.log(`compile exit failed: ${e instanceof Error ? e.message : e}`);
      return;
    }
    console.log(`goto exit: ${macro2.length} steps`);
    const abort2 = plugin.macroAbort(cmd2)!;
    let checks = 0;
    const instrumented = () => {
      const r = abort2();
      checks += 1;
      const ns = readFF1State(view);
      if (r || ns.world.mapFlags !== 1) {
        console.log(
          `  check=${checks} abort=${r} flags=${ns.world.mapFlags} std=${ns.world.isStandardMap} battle=${ns.battle.inBattle} phase=${ns.battle.phase} sm=${ns.world.standardMapX},${ns.world.standardMapY}`,
        );
      }
      return r;
    };
    const done2 = emulator.runMacro(macro2, instrumented);
    let f2 = 0;
    let lastIdx = -1;
    while (emulator.isPlayingMacro() && f2 < 60 * 120) {
      emulator.stepFrame();
      f2 += 1;
      const p = emulator.getMacroProgress();
      if (p && p.index !== lastIdx) {
        lastIdx = p.index;
        if (p.index % 5 === 0) console.log(`  progress ${p.index}/${p.total} f=${f2}`);
      }
    }
    await done2;
    s = readFF1State(view);
    console.log(
      `exit goto END f=${f2} interrupted=${emulator.wasMacroInterrupted()} map=${s.world.mapName} std=${s.world.isStandardMap} flags=${s.world.mapFlags}`,
    );
  },
  300_000,
);
