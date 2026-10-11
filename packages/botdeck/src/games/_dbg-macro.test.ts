/**
 * TEMPORARY reproduction for the overworld macro interrupt regression.
 * Boots the real ROM from saved play states, compiles a real `goto`, and runs
 * it through the real Emulator macro runner with the plugin's macroAbort
 * predicate, logging where and why playback stops.
 */
import { readFileSync } from "node:fs";
import { it } from "vitest";
import { NES } from "jsnes";
import { Emulator } from "../emulator/emulator";
import { FF1GamePlugin } from "./ff1";

const ROM_PATH = "games/ff1/game.nes";
const STATES = "plays/ff1/0001_dev/states";

function bootEmulator(stateFile: string): Emulator {
  const emulator = new Emulator();
  const nes = new NES({
    emulateSound: true,
    sampleRate: 48000,
    onFrame: () => {},
    onAudioSample: () => {},
    onBatteryRamWrite: () => {},
  } as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (emulator as any).nes = nes;
  const rom = readFileSync(`${process.cwd()}/../../${ROM_PATH}`).toString("binary");
  emulator.loadROM(rom, "game.nes");
  const st = JSON.parse(
    readFileSync(`${process.cwd()}/../../${STATES}/${stateFile}.state.json`, "utf8"),
  );
  emulator.fromJSON(st);
  return emulator;
}

async function runGoto(stateFile: string, location: string, settleFrames: number) {
  const emulator = bootEmulator(stateFile);
  const plugin = new FF1GamePlugin(emulator);
  for (let i = 0; i < settleFrames; i++) emulator.stepFrame();

  const state = plugin.readState();
  const mode = plugin.getMode(state);
  const ff1 = state.ff1 as {
    world?: { mapName?: string; isStandardMap?: boolean };
    battle?: { inBattle?: boolean; phase?: string };
  };
  console.log(
    `\n== ${stateFile} settle=${settleFrames} mode=${mode} map=${ff1.world?.mapName} std=${ff1.world?.isStandardMap} inBattle=${ff1.battle?.inBattle}`,
  );

  const cmd = { name: "goto", args: { location } };
  const macro = plugin.compile(cmd);
  console.log(`macro steps=${macro.length}`);

  const abort = plugin.macroAbort(cmd);
  const done = emulator.runMacro(macro, abort);
  let frames = 0;
  const maxFrames = 60 * 120;
  let lastReport = -1;
  while (emulator.isPlayingMacro() && frames < maxFrames) {
    emulator.stepFrame();
    frames += 1;
    const p = emulator.getMacroProgress();
    if (p && p.index !== lastReport && p.index % 25 === 0) {
      lastReport = p.index;
      console.log(`  progress step ${p.index}/${p.total} (${p.phase}) frame=${frames}`);
    }
  }
  await done;
  const after = plugin.readState();
  const aff1 = after.ff1 as {
    world?: { mapName?: string; isStandardMap?: boolean };
    battle?: { inBattle?: boolean; phase?: string };
  };
  console.log(
    `END frames=${frames} interrupted=${emulator.wasMacroInterrupted()} ` +
      `map=${aff1.world?.mapName} std=${aff1.world?.isStandardMap} battle=${aff1.battle?.inBattle} phase=${aff1.battle?.phase}`,
  );
}

it(
  "dbg: overworld goto with macroAbort",
  async () => {
    await runGoto("000002-start-02-post-town", "Temple of Fiends", 0);
  },
  300_000,
);

it(
  "dbg: live goto into random battle, watch interrupt",
  async () => {
    const emulator = bootEmulator("000037-step-000019-before");
    const plugin = new FF1GamePlugin(emulator);
    const { createCpuMemoryView, readFF1State } = await import("@games/ff1-state");
    const view = createCpuMemoryView(emulator.getMemory()!);

    const cmd = { name: "goto", args: { location: "temple_of_fiends" } };
    const macro = plugin.compile(cmd);
    console.log(`macro steps=${macro.length}`);
    const abort = plugin.macroAbort(cmd);
    const done = emulator.runMacro(macro, abort);
    let frames = 0;
    let lastProg = -1;
    while (emulator.isPlayingMacro() && frames < 60 * 60) {
      emulator.stepFrame();
      frames += 1;
      const p = emulator.getMacroProgress();
      if (p && p.index !== lastProg) {
        lastProg = p.index;
        const s = readFF1State(view);
        console.log(`  step ${p.index}/${p.total} f=${frames} px=${s.world.overworldPlayerX} py=${s.world.overworldPlayerY} mapflags=${s.world.mapFlags} inBattle=${s.battle.inBattle}`);
      }
    }
    await done;
    const s = readFF1State(view);
    console.log(`END f=${frames} interrupted=${emulator.wasMacroInterrupted()} px=${s.world.overworldPlayerX} py=${s.world.overworldPlayerY} inBattle=${s.battle.inBattle} phase=${s.battle.phase} std=${s.world.isStandardMap}`);

    // Now simulate the next agent turn: what does the loop see?
    const st = plugin.readState();
    console.log(`next turn mode=${plugin.getMode(st)}`);
  },
  300_000,
);

it(
  "dbg: clean live walk -> battle -> victory flow",
  async () => {
    const emulator = bootEmulator("000002-start-02-post-town");
    const plugin = new FF1GamePlugin(emulator);
    const { createCpuMemoryView, readFF1State } = await import("@games/ff1-state");
    const view = createCpuMemoryView(emulator.getMemory()!);
    const A = 0;

    // Walk around (alternating) until a battle triggers.
    let s = readFF1State(view);
    let f = 0;
    const dirs = [6, 7, 4, 5]; // LEFT RIGHT UP DOWN
    let d = 0;
    while (!s.battle.inBattle && f < 60 * 120) {
      if (f % 20 === 0) emulator.buttonDown(dirs[d % 4]!);
      if (f % 20 === 10) {
        emulator.buttonUp(dirs[d % 4]!);
        d += 1;
      }
      emulator.stepFrame();
      f += 1;
      s = readFF1State(view);
    }
    console.log(`battle after ${(f / 60).toFixed(1)}s walking: inBattle=${s.battle.inBattle} phase=${s.battle.phase} enemies=${s.battle.enemyCount}`);
    if (!s.battle.inBattle) return;

    // Fight: whenever a command entry opens for a member, queue FIGHT.
    let guard = 0;
    while (guard++ < 40 && s.battle.phase !== "battleEnding" && s.battle.phase !== "outOfBattle") {
      // wait for command entry window
      let wf = 0;
      while (wf < 60 * 60) {
        emulator.stepFrame();
        wf += 1;
        s = readFF1State(view);
        if ((s.battle.phase === "commandEntry" && s.battle.commandEntryAvailable) || s.battle.phase === "battleEnding" || s.battle.phase === "outOfBattle") break;
      }
      if (s.battle.phase !== "commandEntry") break;
      const idx = s.battle.nextCommandableIndex;
      if (idx === undefined) break;
      const actor = s.battle.party[idx]?.name;
      let macro;
      try {
        macro = plugin.compile({ name: "fight", args: { actor, target: "1" } });
      } catch (e) {
        console.log(`compile failed for ${actor}: ${e instanceof Error ? e.message : e}`);
        break;
      }
      const done = emulator.runMacro(macro, undefined);
      while (emulator.isPlayingMacro()) emulator.stepFrame();
      await done;
      s = readFF1State(view);
      console.log(`queued FIGHT ${actor} (idx=${idx}) macroLen=${macro.length} phase=${s.battle.phase} enemiesAlive=${s.battle.enemies.filter((e) => e.alive).length}`);
    }

    // Victory sequence: watch 180s. Press A every second starting at 5s.
    let last = "";
    let dismissed = -1;
    for (let vf = 1; vf <= 60 * 180; vf++) {
      if (vf > 300 && vf % 60 === 1) emulator.buttonDown(A);
      if (vf > 300 && vf % 60 === 8) emulator.buttonUp(A);
      emulator.stepFrame();
      const ns = readFF1State(view);
      const sig = `phase=${ns.battle.phase} inBattle=${ns.battle.inBattle} mapflags=${ns.world.mapFlags} std=${ns.world.isStandardMap} dialog=${ns.menu.dialogOpen} menu=${ns.context.menu} enemies=${ns.battle.enemyCount} alive=${ns.battle.enemies.filter((e) => e.alive).length}`;
      if (sig !== last) {
        console.log(`  vf=${vf} (${(vf / 60).toFixed(1)}s) ${sig}`);
        last = sig;
      }
      if (!ns.battle.inBattle) {
        dismissed = vf;
        break;
      }
    }
    console.log(dismissed > 0 ? `DISMISSED at ${(dismissed / 60).toFixed(1)}s` : "NEVER DISMISSED in 180s");
  },
  400_000,
);

it(
  "dbg: full live battle flow to victory screen",
  async () => {
    const emulator = bootEmulator("000037-step-000019-before");
    const plugin = new FF1GamePlugin(emulator);
    const { createCpuMemoryView, readFF1State } = await import("@games/ff1-state");
    const view = createCpuMemoryView(emulator.getMemory()!);
    const A = 0;

    // Trigger the battle with a single step left.
    emulator.buttonDown(6);
    for (let f = 0; f < 240; f++) emulator.stepFrame();
    emulator.buttonUp(6);
    let s = readFF1State(view);
    console.log(`after walk: inBattle=${s.battle.inBattle} phase=${s.battle.phase} mapflags=${s.world.mapFlags}`);

    // Wait for command entry, then queue FIGHT for each member via the plugin's
    // own battle compiler, waiting for the round to resolve between members.
    for (let round = 0; round < 12; round++) {
      // wait for commandEntry
      let f = 0;
      while (f < 60 * 30) {
        emulator.stepFrame();
        f += 1;
        s = readFF1State(view);
        if (s.battle.phase !== "commandEntry" || s.battle.commandEntryAvailable) break;
      }
      if (s.battle.phase === "battleEnding" || s.battle.phase === "outOfBattle") {
        console.log(`round ${round}: phase=${s.battle.phase} after ${f} frames`);
        break;
      }
      const idx = s.battle.nextCommandableIndex;
      if (idx === undefined) {
        console.log(`round ${round}: no commandable member, phase=${s.battle.phase} f=${f}`);
        break;
      }
      const actor = s.battle.party[idx]?.name;
      const cmd = { name: "fight", args: { actor, target: "1" } };
      let macro;
      try {
        macro = plugin.compile(cmd);
      } catch (e) {
        console.log(`round ${round}: compile failed for ${actor}: ${e instanceof Error ? e.message : e}`);
        break;
      }
      const done = emulator.runMacro(macro, plugin.macroAbort(cmd));
      while (emulator.isPlayingMacro()) emulator.stepFrame();
      await done;
      s = readFF1State(view);
      console.log(`round ${round}: queued FIGHT for ${actor} (idx=${idx}) macroLen=${macro.length} phase=${s.battle.phase}`);
    }

    // Battle should be ending now. Watch the victory sequence for 120s,
    // pressing A periodically from t+10s onward.
    let last = "";
    let dismissed = -1;
    for (let f = 1; f <= 60 * 120; f++) {
      if (f > 600 && f % 60 === 1) emulator.buttonDown(A);
      if (f > 600 && f % 60 === 8) emulator.buttonUp(A);
      emulator.stepFrame();
      const ns = readFF1State(view);
      const sig = `phase=${ns.battle.phase} inBattle=${ns.battle.inBattle} mapflags=${ns.world.mapFlags} std=${ns.world.isStandardMap} dialog=${ns.menu.dialogOpen} menu=${ns.context.menu}`;
      if (sig !== last) {
        console.log(`  f=${f} (${(f / 60).toFixed(1)}s) ${sig}`);
        last = sig;
      }
      if (!ns.battle.inBattle) {
        dismissed = f;
        break;
      }
    }
    console.log(dismissed > 0 ? `DISMISSED at ${(dismissed / 60).toFixed(1)}s` : "NEVER DISMISSED in 120s");
  },
  300_000,
);

it(
  "dbg: victory screen dismissal",
  async () => {
    const emulator = bootEmulator("000038-step-000019-after");
    const { createCpuMemoryView, readFF1State } = await import("@games/ff1-state");
    const view = createCpuMemoryView(emulator.getMemory()!);
    const A = 0;

    let s = readFF1State(view);
    console.log(`boot: inBattle=${s.battle.inBattle} phase=${s.battle.phase} std=${s.world.isStandardMap} mapflags=${s.world.mapFlags} dialog=${s.menu.dialogOpen}`);

    // Press A every 60 frames; log every state flip for 60s.
    let last = "";
    for (let f = 1; f <= 60 * 60; f++) {
      if (f % 60 === 1) emulator.buttonDown(A);
      if (f % 60 === 8) emulator.buttonUp(A);
      emulator.stepFrame();
      const ns = readFF1State(view);
      const sig = `inBattle=${ns.battle.inBattle} phase=${ns.battle.phase} std=${ns.world.isStandardMap} mapflags=${ns.world.mapFlags} dialog=${ns.menu.dialogOpen} enemies=${ns.battle.enemyCount}`;
      if (sig !== last) {
        console.log(`  f=${f} ${sig}`);
        last = sig;
      }
      s = ns;
      if (!s.battle.inBattle && f > 120) {
        console.log(`  DISMISSED at f=${f}`);
        break;
      }
    }
  },
  300_000,
);

it(
  "dbg: goto immediately after battle-end fade",
  async () => {
    // Boot the post-battle state (battleEnding), run frames until the reader
    // says outOfBattle (the moment the agent loop would issue the next goto),
    // then start the goto and log the predicate decision for the first frames.
    const emulator = bootEmulator("000038-step-000019-after");
    const plugin = new FF1GamePlugin(emulator);

    const { createCpuMemoryView, readFF1State } = await import("@games/ff1-state");
    const view = createCpuMemoryView(emulator.getMemory()!);

    let f = 0;
    let s = readFF1State(view);
    console.log(`boot: inBattle=${s.battle.inBattle} phase=${s.battle.phase} std=${s.world.isStandardMap} mapflags=${s.world.mapFlags}`);
    while (s.battle.inBattle && f < 60 * 30) {
      emulator.stepFrame();
      f += 1;
      const ns = readFF1State(view);
      if (ns.battle.inBattle !== s.battle.inBattle || ns.world.isStandardMap !== s.world.isStandardMap) {
        console.log(`  frame=${f} inBattle=${ns.battle.inBattle} phase=${ns.battle.phase} std=${ns.world.isStandardMap} mapflags=${ns.world.mapFlags}`);
      }
      s = ns;
    }
    console.log(`outOfBattle after ${f} frames; starting goto now`);

    const cmd = { name: "goto", args: { location: "temple_of_fiends" } };
    const macro = plugin.compile(cmd);
    const abort = plugin.macroAbort(cmd)!;
    // Instrument the predicate: log its raw decision for the first 300 frames.
    let checks = 0;
    const instrumented = () => {
      const r = abort();
      checks += 1;
      if (checks <= 300 || r) {
        const st = readFF1State(view);
        console.log(`  check=${checks} abort=${r} inBattle=${st.battle.inBattle} phase=${st.battle.phase} std=${st.world.isStandardMap} mapflags=${st.world.mapFlags}`);
      }
      return r;
    };
    const done = emulator.runMacro(macro, instrumented);
    let frames = 0;
    while (emulator.isPlayingMacro() && frames < 60 * 60) {
      emulator.stepFrame();
      frames += 1;
    }
    await done;
    const end = readFF1State(view);
    console.log(`END frames=${frames} interrupted=${emulator.wasMacroInterrupted()} inBattle=${end.battle.inBattle} std=${end.world.isStandardMap}`);
  },
  300_000,
);
