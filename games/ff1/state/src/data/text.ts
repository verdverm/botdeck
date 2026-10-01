/**
 * Final Fantasy 1 (NES) text decoding.
 *
 * This table maps PPU tile indices to Unicode characters based on the US
 * Final Fantasy font layout (verified against the Entroper/FF1Disassembly
 * source and active save-state inspection).
 *
 * Digits:    $80-$89 -> '0'-'9'
 * Uppercase: $8A-$A3 -> 'A'-'Z'
 * Lowercase: $A4-$BD -> 'a'-'z'
 * Punctuation and space are at $BE-$C2 and $FF.
 */

export const TEXT_TABLE: Readonly<Record<number, string>> = {
  // Digits
  0x80: "0",
  0x81: "1",
  0x82: "2",
  0x83: "3",
  0x84: "4",
  0x85: "5",
  0x86: "6",
  0x87: "7",
  0x88: "8",
  0x89: "9",

  // Uppercase
  0x8a: "A",
  0x8b: "B",
  0x8c: "C",
  0x8d: "D",
  0x8e: "E",
  0x8f: "F",
  0x90: "G",
  0x91: "H",
  0x92: "I",
  0x93: "J",
  0x94: "K",
  0x95: "L",
  0x96: "M",
  0x97: "N",
  0x98: "O",
  0x99: "P",
  0x9a: "Q",
  0x9b: "R",
  0x9c: "S",
  0x9d: "T",
  0x9e: "U",
  0x9f: "V",
  0xa0: "W",
  0xa1: "X",
  0xa2: "Y",
  0xa3: "Z",

  // Lowercase
  0xa4: "a",
  0xa5: "b",
  0xa6: "c",
  0xa7: "d",
  0xa8: "e",
  0xa9: "f",
  0xaa: "g",
  0xab: "h",
  0xac: "i",
  0xad: "j",
  0xae: "k",
  0xaf: "l",
  0xb0: "m",
  0xb1: "n",
  0xb2: "o",
  0xb3: "p",
  0xb4: "q",
  0xb5: "r",
  0xb6: "s",
  0xb7: "t",
  0xb8: "u",
  0xb9: "v",
  0xba: "w",
  0xbb: "x",
  0xbc: "y",
  0xbd: "z",

  // Punctuation / space
  0xbe: '"',
  0xbf: ",",
  0xc0: ".",
  0xc1: " ",
  0xc2: "-",
  0xc4: "!",
  0xc5: "?",

  // Duplicate space entry used by the game
  0xff: " ",
};

/** Default character to use when a byte is not mapped. */
export const TEXT_UNKNOWN = "?";

/** Decode a single byte to a Unicode character. */
export function decodeTextByte(byte: number): string {
  return TEXT_TABLE[byte] ?? TEXT_UNKNOWN;
}

/** Decode a sequence of bytes to a string. */
export function decodeText(bytes: Iterable<number>): string {
  const out: string[] = [];
  for (const b of bytes) {
    out.push(decodeTextByte(b));
  }
  return out.join("");
}

/**
 * Decode a fixed-length name buffer, stopping at padding bytes.
 *
 * Character names are stored in 4-byte fields using the PPU tile encoding.
 * Unused trailing bytes are typically $FF (or occasionally $00 in unused
 * fields). A tile value of $00 is the digit '0' in this encoding, so only
 * $FF is treated as a terminator.
 */
export function decodeName(bytes: Iterable<number>): string {
  let name = "";
  for (const b of bytes) {
    if (b === 0xff) {
      break;
    }
    name += decodeTextByte(b);
  }
  return name;
}
