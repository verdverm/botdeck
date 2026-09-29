import { SRAM_START, SRAM_SIZE, type Emulator } from "@/emulator/emulator";

/**
 * Snapshot a running NES into a plain, JSON-safe object: the full jsnes save
 * state (cpu/ppu/papu/controllers), the parsed iNES header / ROM info, and the
 * battery-backed save RAM window ($6000-$7FFF). This is the "collect game
 * state/info" process (folded in from humdeck) that botdeck's game plugins will
 * eventually build structured state on top of.
 */
export interface CollectedState {
  capturedAt: string;
  rom: Record<string, unknown>;
  saveRam: number[];
  saveState: unknown;
}

export function collectState(emulator: Emulator): CollectedState | null {
  const rom = emulator.romInfo;
  if (!rom) return null;

  const mem = emulator.getMemory();
  const saveRam: number[] = [];
  if (mem) {
    for (let i = 0; i < SRAM_SIZE; i++) {
      saveRam.push(mem[SRAM_START + i] ?? 0);
    }
  }

  return {
    capturedAt: new Date().toISOString(),
    rom: { ...rom },
    saveRam,
    saveState: emulator.toJSON(),
  };
}
