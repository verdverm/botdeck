import { readFileSync } from "node:fs";
import { NES } from "jsnes";
import { Emulator } from "../src/emulator/emulator.js";
import { FF1GamePlugin } from "../src/games/ff1.js";

const ROOT = "/Users/tony/verdverm/botdeck";
const ROM_PATH = `${ROOT}/games/ff1/game.nes`;
const STATES = `${ROOT}/plays/ff1/0001_dev/states`;

function bootEmulator(stateFile: string): Emulator {
  const emulator = new Emulator();
  const nes = new NES({
    emulateSound: false,
    onFrame: () => {},
    onAudioSample: () => {},
    onBatteryRamWrite: () => {},
  } as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (emulator as any).nes = nes;
  const rom = readFileSync(ROM_PATH).toString("binary");
  emulator.loadROM(rom, "game.nes");
  const st = JSON.parse(readFileSync(`${STATES}/${stateFile}.state.json`, "utf8"));
  emulator.fromJSON(st);
  return emulator;
}

async function run(stateFile: string, location: string, settleFrames = 0) {
  const emulator = bootEmulator(stateFile);
  const plugin = new FF1GamePlugin(emulator);
  for (let i = 0; i < settleFrames; i++) emulator.stepFrame();

  const state = plugin.readState();
  const mode = plugin.getMode(state);
  const ff1 = state.ff1 as { world?: { mapName?: string }; battle?: { inBattle?: boolean } };
  console.log(`\n== ${stateFile} settle=${settleFrames} mode=${mode} map=${ff1.world?.mapName} inBattle=${ff1.battle?.inBattle}`);

  const cmd = { name: "goto", args: { location } };
  let macro;
  try {
    macro = plugin.compile(cmd);
  } catch (e) {
    console.log(`compile failed: ${e instanceof Error ? e.message : e}`);
    return;
  }
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
  const aff1 = after.ff1 as { world?: { mapName?: string; isStandardMap?: boolean }; battle?: { inBattle?: boolean; phase?: string } };
  console.log(
    `END frames=${frames} interrupted=${emulator.wasMacroInterrupted()} ` +
      `map=${aff1.world?.mapName} std=${aff1.world?.isStandardMap} battle=${aff1.battle?.inBattle} phase=${aff1.battle?.phase}`,
  );
}

const [, , stateFile = "000002-start-02-post-town", location = "Temple of Fiends", settle = "0"] = process.argv;
await run(stateFile, location, Number(settle));
