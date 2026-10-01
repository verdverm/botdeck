import type { ByteArray } from "./types.js";

export type TextTable = Readonly<Record<number, string>>;

const table: Record<number, string> = {};
for (let i = 0; i < 10; i++) {
  table[i] = String(i);
}
for (let i = 0; i < 26; i++) {
  table[i + 10] = String.fromCharCode(65 + i);
}
table[0xff] = " ";

export const FF1_TEXT_TABLE: TextTable = Object.freeze(table);

export function readUint8(mem: ByteArray, addr: number): number {
  return mem[addr] ?? 0;
}

export function readUint16LE(mem: ByteArray, addr: number): number {
  const lo = readUint8(mem, addr);
  const hi = readUint8(mem, addr + 1);
  return lo | (hi << 8);
}

export function readBytes(mem: ByteArray, addr: number, length: number): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = readUint8(mem, addr + i);
  }
  return out;
}

export function decodeAsciiText(bytes: ByteArray, textTable: TextTable = FF1_TEXT_TABLE): string {
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0xff;
    result += textTable[byte] ?? ".";
  }
  return result;
}

export function readString(
  mem: ByteArray,
  addr: number,
  length: number,
  textTable?: TextTable
): string {
  return decodeAsciiText(readBytes(mem, addr, length), textTable);
}
