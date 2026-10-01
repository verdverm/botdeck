const LETTER_VALUES = "APZLGITYEOXUKSVN";

export interface GameGeniePatch {
  addr: number;
  value: number;
  key?: number;
  wantskey: boolean;
}

function toDigit(letter: string): number {
  return LETTER_VALUES.indexOf(letter);
}

function toLetter(digit: number): string {
  return LETTER_VALUES[digit] ?? "";
}

function toHex(n: number, width: number): string {
  const s = n.toString(16);
  return "0000".substring(0, width - s.length) + s;
}

export function decodeGameGenie(code: string): GameGeniePatch | null {
  if (code.includes(":")) {
    return decodeHex(code);
  }

  const digits = code.toUpperCase().split("").map(toDigit);
  if (digits.length !== 6 && digits.length !== 8) {
    return null;
  }
  if (digits.some((d) => d < 0)) {
    return null;
  }

  const d = (i: number) => digits[i]!;

  let value = ((d(0) & 8) << 4) + ((d(1) & 7) << 4) + (d(0) & 7);
  const addr =
    ((d(3) & 7) << 12) +
    ((d(4) & 8) << 8) +
    ((d(5) & 7) << 8) +
    ((d(1) & 8) << 4) +
    ((d(2) & 7) << 4) +
    (d(3) & 8) +
    (d(4) & 7);
  let key;

  if (digits.length === 8) {
    value += d(7) & 8;
    key =
      ((d(6) & 8) << 4) +
      ((d(7) & 7) << 4) +
      (d(5) & 8) +
      (d(6) & 7);
  } else {
    value += d(5) & 8;
  }

  const wantskey = !!(d(2) >> 3);

  return { value, addr, wantskey, key };
}

export function encodeGameGenie(patch: GameGeniePatch): string {
  const { addr, value, key, wantskey } = patch;

  const digits: number[] = Array(6).fill(0);

  digits[0] = (value & 7) + ((value >> 4) & 8);
  digits[1] = ((value >> 4) & 7) + ((addr >> 4) & 8);
  digits[2] = (addr >> 4) & 7;
  digits[3] = (addr >> 12) + (addr & 8);
  digits[4] = (addr & 7) + ((addr >> 8) & 8);
  digits[5] = (addr >> 8) & 7;

  if (key === undefined) {
    digits[5] += value & 8;
    if (wantskey) {
      digits[2] += 8;
    }
  } else {
    digits[2] += 8;
    digits[5] += key & 8;
    digits[6] = (key & 7) + ((key >> 4) & 8);
    digits[7] = ((key >> 4) & 7) + (value & 8);
  }

  return digits.map(toLetter).join("");
}

export function encodeGameGenieHex(patch: GameGeniePatch): string {
  const { addr, value, key, wantskey } = patch;

  let s = toHex(addr, 4) + ":" + toHex(value, 2);

  if (key !== undefined || wantskey) {
    s += "?";
  }

  if (key !== undefined) {
    s += toHex(key, 2);
  }

  return s;
}

function decodeHex(s: string): GameGeniePatch | null {
  const match = s.match(/([0-9a-fA-F]+):([0-9a-fA-F]+)(\?[0-9a-fA-F]*)?/);
  if (!match) return null;

  const addr = parseInt(match[1]!, 16);
  const value = parseInt(match[2]!, 16);
  const wantskey = match[3] !== undefined;
  const key =
    match[3] !== undefined && match[3].length > 1
      ? parseInt(match[3].substring(1), 16)
      : undefined;

  return { value, addr, wantskey, key };
}

export function applyGameGeniePatch(
  addr: number,
  value: number,
  patch: GameGeniePatch
): number {
  if (patch.addr === (addr & 0x7fff)) {
    if (patch.key === undefined || patch.key === value) {
      return patch.value;
    }
  }
  return value;
}

export function applyGameGeniePatches(
  addr: number,
  value: number,
  patches: readonly GameGeniePatch[]
): number {
  let result = value;
  for (const patch of patches) {
    result = applyGameGeniePatch(addr, result, patch);
  }
  return result;
}
