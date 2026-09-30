import { NES } from "jsnes";
import { NesAudio } from "./audio";

export const SCREEN_WIDTH = 256;
export const SCREEN_HEIGHT = 240;
const NES_FPS = 60;

// iNES battery save RAM is mapped into cpu.mem at $6000-$7FFF.
export const SRAM_START = 0x6000;
export const SRAM_SIZE = 0x2000;

export type FrameListener = (buffer: Uint32Array) => void;
export type BatteryWriteListener = (address: number, value: number) => void;
export type ErrorListener = (message: string) => void;

// jsnes keeps the ROM header + memory on internal fields not in its .d.ts.
// Access them through a narrow cast rather than widening public types.
interface NesInternals {
  rom?: Record<string, unknown>;
  cpu?: { mem?: Uint8Array | number[] };
  mmap?: { mem?: Uint8Array | number[] };
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

/** The parsed iNES header fields off a raw NES instance. */
export function romInfo(nes: NES, name: string): Record<string, unknown> {
  const internals = nes as unknown as NesInternals;
  const info: Record<string, unknown> = { name };
  if (internals.rom) {
    for (const key of ROM_HEADER_FIELDS) {
      if (key in internals.rom) info[key] = internals.rom[key];
    }
  }
  return info;
}

/** The live memory view jsnes uses (mmap first, then cpu), for RAM reads. */
export function getMemory(nes: NES): Uint8Array | number[] | undefined {
  const internals = nes as unknown as NesInternals;
  return internals.mmap?.mem ?? internals.cpu?.mem;
}

/**
 * The single NES core: a frame-synced RAF loop. The core always runs at 60fps;
 * no input simply means no one is playing. Rendering and audio are left to
 * the caller/hooks so the core stays UI-agnostic.
 */
export class Emulator {
  private nes: InstanceType<typeof NES>;
  private raf = 0;
  private running = false;
  private accumulator = 0;
  private lastTime = 0;
  private listeners = new Set<FrameListener>();
  private batteryListeners = new Set<BatteryWriteListener>();
  private errorListeners = new Set<ErrorListener>();
  private romBytes: string | Uint8Array | ArrayBuffer | null = null;
  private romName: string | null = null;
  private hasRom = false;
  private audio = new NesAudio();

  constructor() {
    const opts = {
      emulateSound: true,
      sampleRate: this.audio.getSampleRate(),
      onFrame: (buffer: Uint32Array) => {
        for (const listener of this.listeners) listener(buffer);
      },
      onAudioSample: this.audio.writeSample,
      onBatteryRamWrite: (address: number, value: number) => {
        for (const listener of this.batteryListeners) listener(address, value);
      },
    };
    this.nes = new NES(opts as never) as InstanceType<typeof NES>;
  }

  /** Load bytes under an optional display name; marks power-on state. */
  loadROM(data: string | Uint8Array | ArrayBuffer, name?: string): void {
    this.nes.loadROM(data);
    this.romBytes = data;
    this.romName = name ?? "loaded.nes";
    this.hasRom = true;
  }

  /**
   * Power-cycle the cartridge by re-loading the stored ROM bytes. jsnes'
   * own `nes.reset()` is broken here: after any frames have run, the next
   * `frame()` throws an invalid-opcode crash, killing the loop (verified in
   * .extern/jsnes). Re-loading performs the same fresh init and works.
   */
  reset(): void {
    if (this.hasRom && this.romBytes) this.nes.loadROM(this.romBytes);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    try {
      this.audio.start();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      for (const listener of this.errorListeners)
        listener(`audio start failed: ${msg}`);
    }
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
    this.audio.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  getRomName(): string | null {
    return this.hasRom ? this.romName : null;
  }

  hasRomLoaded(): boolean {
    return this.hasRom;
  }

  /** The parsed iNES header fields for the loaded ROM. */
  get romInfo(): Record<string, unknown> | null {
    if (!this.hasRom) return null;
    return romInfo(this.nes, this.romName ?? "loaded.nes");
  }

  /** The live memory view jsnes uses, for RAM reads. */
  getMemory(): Uint8Array | number[] | undefined {
    return getMemory(this.nes);
  }

  buttonDown(button: number): void {
    this.nes.buttonDown(1, button as never);
  }

  buttonUp(button: number): void {
    this.nes.buttonUp(1, button as never);
  }

  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onBatteryRamWrite(listener: BatteryWriteListener): () => void {
    this.batteryListeners.add(listener);
    return () => this.batteryListeners.delete(listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
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

  private stepFrame(): void {
    try {
      this.nes.frame();
      this.audio.flush();
    } catch (e) {
      // A crashed emulation kills the loop silently if uncaught; stop and
      // surface the error to the UI instead.
      this.stop();
      const msg = e instanceof Error ? e.message : String(e);
      for (const listener of this.errorListeners) listener(`crashed: ${msg}`);
    }
  }
}
