import { NES } from "jsnes";
import type { NESOptions } from "jsnes";
import type { ButtonStep } from "@/types";

export const SCREEN_WIDTH = 256;
export const SCREEN_HEIGHT = 240;
const NES_FPS = 60;
const DEFAULT_HOLD_FRAMES = 6; // ~100ms press, feels like a human tap
const DEFAULT_GAP_FRAMES = 6; // ~100ms between presses

// iNES battery save RAM is mapped into cpu.mem at $6000-$7FFF.
export const SRAM_START = 0x6000;
export const SRAM_SIZE = 0x2000;

export type FrameListener = (buffer: Uint32Array) => void;
export type BatteryWriteListener = (address: number, value: number) => void;

/** Parsed iNES header fields surfaced for state collection (§ collectState). */
export interface RomInfo {
  name: string | null;
  valid?: boolean;
  isNES2?: boolean;
  mapperType?: number;
  mirroring?: number;
  batteryRam?: boolean;
  romCount?: number;
  vromCount?: number;
  [key: string]: unknown;
}

// jsnes keeps the ROM header + memory on internal fields not in its .d.ts.
// Access them through a narrow cast rather than widening public types.
interface NesInternals {
  rom?: Record<string, unknown>;
  cpu?: { mem?: Uint8Array | number[] };
  mmap?: { mem?: Uint8Array | number[] };
}

/**
 * The single NES core (DESIGN.md §2): a frame-synced RAF loop plus frame-counted
 * button-macro playback. It is the merged successor to humdeck's `jsnes.Browser`
 * and botdeck's prior core, because the agent's command -> button timing must
 * stay locked to emulated frames.
 *
 * Turn-based model: the core ALWAYS runs at 60fps (never frozen). While the
 * agent deliberates there is simply no input, exactly like a human watching a
 * turn-based game think. When a decision comes back, `playSequence` drives a
 * macro of button presses with human-like hold/gap timings off the frame
 * counter, so command -> button mappings stay synced to emulation speed.
 *
 * Rendering (canvas/screenshot) and audio are left to the caller/hooks so the
 * core stays UI-agnostic.
 */
export class Emulator {
  private nes: InstanceType<typeof NES>;
  private raf = 0;
  private running = false;
  private accumulator = 0;
  private lastTime = 0;
  private listeners = new Set<FrameListener>();
  private batteryListeners = new Set<BatteryWriteListener>();
  private romName: string | null = null;
  private hasRom = false;

  private sequence: ButtonStep[] | null = null;
  private seqIndex = 0;
  private seqCountdown = 0;
  private seqHeld: number | null = null;
  private onSequenceDone: (() => void) | null = null;

  constructor() {
    const opts: NESOptions = {
      emulateSound: false,
      onFrame: (buffer) => {
        for (const listener of this.listeners) listener(buffer);
      },
      onBatteryRamWrite: (address, value) => {
        for (const listener of this.batteryListeners) listener(address, value);
      },
    };
    this.nes = new NES(opts);
  }

  /** Load bytes under an optional display name; marks power-on state. */
  loadROM(data: string | Uint8Array | ArrayBuffer, name?: string): void {
    this.nes.loadROM(data);
    this.romName = name ?? "loaded.nes";
    this.hasRom = true;
  }

  reset(): void {
    if (this.hasRom) this.nes.reset();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    const loop = (now: number) => {
      if (!this.running) return;
      this.accumulator += now - this.lastTime;
      this.lastTime = now;
      const frameMs = 1000 / NES_FPS;
      // Run up to 3 catch-up frames per tick, then drop backlog.
      let frames = 0;
      while (this.accumulator >= frameMs && frames < 3) {
        this.stepFrame();
        this.accumulator -= frameMs;
        frames += 1;
      }
      if (this.accumulator > frameMs * 3) this.accumulator = 0;
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  isRunning(): boolean {
    return this.running;
  }

  get romInfo(): RomInfo | null {
    if (!this.hasRom) return null;
    const rom = (this.nes as unknown as NesInternals).rom;
    const info: Record<string, unknown> = { name: this.romName };
    if (rom) {
      for (const key of ROM_HEADER_FIELDS) {
        if (key in rom) info[key] = rom[key];
      }
    }
    return info as RomInfo;
  }

  getRomName(): string | null {
    return this.hasRom ? this.romName : null;
  }

  hasRomLoaded(): boolean {
    return this.hasRom;
  }

  /** The live memory view jsnes uses (mmap first, then cpu), for RAM reads. */
  getMemory(): Uint8Array | number[] | undefined {
    const internals = this.nes as unknown as NesInternals;
    return internals.mmap?.mem ?? internals.cpu?.mem;
  }

  buttonDown(button: number): void {
    this.nes.buttonDown(1, button as never);
  }

  buttonUp(button: number): void {
    this.nes.buttonUp(1, button as never);
  }

  /** Queues a button macro and plays it out frame-by-frame. */
  playSequence(steps: ButtonStep[], onDone?: () => void): void {
    if (steps.length === 0) {
      onDone?.();
      return;
    }
    this.sequence = steps;
    this.seqIndex = 0;
    this.seqCountdown = 0;
    this.onSequenceDone = onDone ?? null;
  }

  isPlayingSequence(): boolean {
    return this.sequence !== null;
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onBatteryRamWrite(listener: BatteryWriteListener): () => void {
    this.batteryListeners.add(listener);
    return () => this.batteryListeners.delete(listener);
  }

  getFps(): number {
    return this.nes.getFPS();
  }

  toJSON() {
    return this.nes.toJSON();
  }

  fromJSON(data: object) {
    this.nes.fromJSON(data as never);
  }

  // ---------------------------------------------------------------------------

  /** One emulated frame + one macro step. */
  private stepFrame(): void {
    this.advanceSequence();
    this.nes.frame();
  }

  private releaseHeld(): void {
    if (this.seqHeld !== null) {
      this.nes.buttonUp(1, this.seqHeld as never);
      this.seqHeld = null;
    }
  }

  private advanceSequence(): void {
    if (!this.sequence) return;

    if (this.seqHeld === null) {
      // Gap between presses: count down before pressing.
      if (this.seqCountdown > 0) {
        this.seqCountdown -= 1;
        return;
      }
      const step = this.sequence[this.seqIndex];
      if (!step) {
        this.finishSequence();
        return;
      }
      this.nes.buttonDown(1, step.button as never);
      this.seqHeld = step.button;
      this.seqCountdown = step.holdFrames ?? DEFAULT_HOLD_FRAMES;
      return;
    }

    // Holding a button: count down the hold, then release.
    this.seqCountdown -= 1;
    if (this.seqCountdown > 0) return;

    this.releaseHeld();
    this.seqIndex += 1;
    if (this.seqIndex >= this.sequence.length) {
      this.finishSequence();
      return;
    }
    const nextGap = this.sequence[this.seqIndex]?.gapFrames ?? DEFAULT_GAP_FRAMES;
    this.seqCountdown = nextGap;
  }

  private finishSequence(): void {
    this.releaseHeld();
    const done = this.onSequenceDone;
    this.sequence = null;
    this.seqIndex = 0;
    this.seqCountdown = 0;
    this.onSequenceDone = null;
    done?.();
  }
}

// Header getters on jsnes' ROM are plain properties; surface the useful subset.
const ROM_HEADER_FIELDS = [
  "valid",
  "isNES2",
  "mapperType",
  "subMapper",
  "mirroring",
  "fourScreen",
  "batteryRam",
  "trainer",
  "romCount",
  "vromCount",
  "prgRamSize",
  "prgNvRamSize",
  "chrRamSize",
  "chrNvRamSize",
  "timingMode",
  "consoleType",
] as const;
