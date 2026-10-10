import {
  SRAM_START,
  SRAM_SIZE,
  type Emulator,
} from "@/emulator/emulator";
import {
  readFF1StateFromSaveState,
  type FF1GameState,
  type JsNesState,
} from "@games/ff1-state";

/**
 * Snapshot a running NES into a plain, JSON-safe object: the full jsnes save
 * state, the parsed iNES header / ROM info, the battery-backed save RAM
 * window ($6000-$7FFF), and - for FF1 - the extracted game state.
 */
export interface CollectedState {
  capturedAt: string;
  rom: Record<string, unknown>;
  saveRam: number[];
  saveState: unknown;
  ff1?: FF1GameState;
  macroActive?: boolean;
  macroProgress?: { index: number; total: number; phase: "hold" | "gap"; remaining: number };
  macroInterrupted?: boolean;
  lastRoute?: {
    mapId: number | "overworld";
    location?: { name?: string | null } | null;
    from?: { x: number; y: number };
    goal?: { x: number; y: number };
    tiles?: number;
    path?: { x: number; y: number }[];
    runs?: { direction: string; tiles: number }[];
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJSONSafe(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Array.from(value);
  }
  if (Array.isArray(value)) {
    return value.map(toJSONSafe);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = toJSONSafe(v);
    }
    return out;
  }
  return value;
}

function looksLikeFF1(rom: Record<string, unknown>): boolean {
  const name = String(rom.name ?? "").toLowerCase();
  return name.includes("ff1") || name.includes("final fantasy");
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

  const rom = em.romInfo ?? {};
  const saveState = em.toJSON();

  const collected: CollectedState = {
    capturedAt: new Date().toISOString(),
    rom,
    saveRam,
    saveState,
    macroActive: em.isPlayingMacro(),
    macroProgress: em.getMacroProgress(),
    macroInterrupted: em.wasMacroInterrupted(),
    lastRoute: em.getLastRoute() as CollectedState["lastRoute"],
  };

  if (looksLikeFF1(rom)) {
    try {
      const ff1 = readFF1StateFromSaveState(saveState as JsNesState);
      collected.ff1 = toJSONSafe(ff1) as FF1GameState;
    } catch {
      // Leave ff1 undefined if the save state cannot be parsed as FF1.
    }
  }

  return collected;
}
