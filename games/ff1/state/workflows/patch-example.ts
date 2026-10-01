import {
  createJsNesStateView,
  decodeGameGenie,
  applyGameGeniePatches,
  readGold,
  type JsNesState,
} from "@games/ff1-state";

function makeEmptyState(): JsNesState {
  return {
    cpu: { mem: new Uint8Array(0x10000) as Uint8Array },
  };
}

function getMem(state: JsNesState): Uint8Array {
  return state.cpu.mem as Uint8Array;
}

function main() {
  const state = makeEmptyState();
  const mem = getMem(state);

  mem[0x601c] = 0x10;
  mem[0x601d] = 0x27;
  mem[0x601e] = 0x00;

  console.log("Gold before patch:", readGold(createJsNesStateView(state)));

  const code = "XYZZYO"; // 6-letter placeholder code; replace with a real FF1 code
  const patch = decodeGameGenie(code);
  if (!patch) {
    console.error("Failed to decode GameGenie code:", code);
    return;
  }

  console.log("Decoded patch:", {
    addr: patch.addr.toString(16).padStart(4, "0"),
    value: patch.value.toString(16).padStart(2, "0"),
    wantsKey: patch.wantskey,
    key: patch.key?.toString(16).padStart(2, "0"),
  });

  for (let addr = 0; addr < mem.length; addr++) {
    mem[addr] = applyGameGeniePatches(addr, mem[addr]!, [patch]);
  }

  console.log("Gold after patch:", readGold(createJsNesStateView(state)));

  // Direct RAM write to the gold low byte at $601C. This is not a real
  // Game Genie ROM patch; it uses the same patch helper to demonstrate
  // hooking emulator reads. A real Game Genie code would target a ROM
  // address masked with 0x7FFF (e.g. a code that alters the gold routine).
  const hexPatch = decodeGameGenie("601c:99");
  if (hexPatch) {
    for (let addr = 0; addr < mem.length; addr++) {
      mem[addr] = applyGameGeniePatches(addr, mem[addr]!, [hexPatch]);
    }
    console.log("Gold after direct RAM write 601c:99:", readGold(createJsNesStateView(state)));
  }
}

main();
