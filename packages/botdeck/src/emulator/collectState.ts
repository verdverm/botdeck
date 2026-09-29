import {
  SRAM_START,
  SRAM_SIZE,
  type Emulator,
} from "@/emulator/emulator";

/**
 * Snapshot a running NES into a plain, JSON-safe object: the full jsnes save
 * state, the parsed iNES header / ROM info, and the battery-backed save RAM
 * window ($6000-$7FFF).
 */
export interface CollectedState {
  capturedAt: string;
  rom: Record<string, unknown>;
  saveRam: number[];
  saveState: unknown;
}

export function collectState(em: Emulator | null): CollectedState | null {
  if (!em || !em.hasRomLoaded()) return null;

  const mem = em.getMemory();
  const saveRam: number[] = [];
  if (mem) {
    for (let i = 0; i < SRAM_SIZE; i++) {
      saveRam.push(mem[SRAM_START + i] ?? 0);
    }
  }

  return {
    capturedAt: new Date().toISOString(),
    rom: em.romInfo ?? {},
    saveRam,
    saveState: em.toJSON(),
  };
}
