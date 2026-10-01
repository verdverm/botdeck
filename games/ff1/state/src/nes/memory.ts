import { readUint8, readUint16LE, readBytes, decodeAsciiText } from "./helpers.js";
import type { TextTable } from "./helpers.js";
import type { ByteArray, JsNesState } from "./types.js";

export const CPU_MEMORY_SIZE = 0x10000;
export const SAVE_RAM_SIZE = 0x2000;
export const SAVE_RAM_START = 0x6000;

export class MemoryView {
  constructor(private readonly mem: ByteArray, private readonly base = 0) {}

  u8(addr: number): number {
    return this.mem[addr - this.base] ?? 0;
  }

  u16(addr: number): number {
    return readUint16LE(this.mem, addr - this.base);
  }

  bytes(addr: number, length: number): Uint8Array {
    return readBytes(this.mem, addr - this.base, length);
  }

  string(addr: number, length: number, textTable?: TextTable): string {
    return decodeAsciiText(this.bytes(addr, length), textTable);
  }
}

export function createCpuMemoryView(mem: ByteArray): MemoryView {
  if (mem.length < CPU_MEMORY_SIZE) {
    throw new Error(`CPU memory must be at least ${CPU_MEMORY_SIZE} bytes`);
  }
  return new MemoryView(mem, 0);
}

export function createSaveRamView(ram: ByteArray): MemoryView {
  if (ram.length < SAVE_RAM_SIZE) {
    throw new Error(`Save RAM must be at least ${SAVE_RAM_SIZE} bytes`);
  }
  return new MemoryView(ram, SAVE_RAM_START);
}

export function createJsNesStateView(state: JsNesState): MemoryView {
  return createCpuMemoryView(state.cpu.mem);
}
