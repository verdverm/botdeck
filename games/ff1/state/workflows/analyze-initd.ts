import {
  createJsNesStateView,
  readFF1State,
  readFF1StateFromSaveState,
  type JsNesState,
} from "@games/ff1-state";
import saveStateFile from "../../../../plays/ff1/0000_dev/ff1.initd.state.json" with { type: "json" };

function hexByte(n: number): string {
  return n.toString(16).padStart(2, "0");
}

function hexRow(view: ReturnType<typeof createJsNesStateView>, addr: number, len: number): string {
  const parts: string[] = [];
  for (let i = 0; i < len; i++) {
    parts.push(hexByte(view.u8(addr + i)));
  }
  return `${addr.toString(16).padStart(4, "0")}: ${parts.join(" ")}`;
}

function dumpRaw(view: ReturnType<typeof createJsNesStateView>) {
  console.log("=== Raw bytes ===\n");

  console.log("Party names ($6102-$6115, 4 bytes per character):");
  for (let i = 0; i < 4; i++) {
    console.log(`  ${hexRow(view, 0x6102 + i * 0x40, 4)}`);
  }

  console.log("\nClasses ($6100/$6140/$6180/$61C0):");
  for (let i = 0; i < 4; i++) {
    console.log(`  char ${i}: $${hexByte(view.u8(0x6100 + i * 0x40))}`);
  }

  console.log("\nGold ($601C-$601E):");
  console.log(`  ${hexRow(view, 0x601c, 3)}`);

  console.log("\nCharacter stat blocks ($6100-$61FF):");
  for (let i = 0; i < 4; i++) {
    const base = 0x6100 + i * 0x40;
    console.log(`  char ${i} (${base.toString(16).padStart(4, "0")}):`);
    for (let r = 0; r < 4; r++) {
      console.log(`    ${hexRow(view, base + r * 16, 16)}`);
    }
  }

  console.log("\nSpells ($6300-$633F, 8 levels x 4 bytes per character):");
  for (let i = 0; i < 4; i++) {
    console.log(`  char ${i}: ${hexRow(view, 0x6300 + i * 0x40, 32)}`);
  }

  console.log("\nMP current+max ($6320-$632F / $6360-$636F etc):");
  for (let i = 0; i < 4; i++) {
    const base = 0x6300 + i * 0x40;
    console.log(`  char ${i} current: ${hexRow(view, base + 0x20, 8)}`);
    console.log(`  char ${i} max:    ${hexRow(view, base + 0x28, 8)}`);
  }

  console.log("\nEquipment ($6118-$611B / $611C-$611F etc):");
  for (let i = 0; i < 4; i++) {
    const base = 0x6100 + i * 0x40;
    console.log(
      `  char ${i} weapons: ${hexRow(view, base + 0x18, 4)}  armor: ${hexRow(
        view,
        base + 0x1c,
        4
      )}`
    );
  }

  console.log("\nInventory/key items ($6020-$603B):");
  console.log(`  ${hexRow(view, 0x6020, 28)}`);

  console.log("\nZero-page world data:");
  console.log(`  OW X/Y ($0027/$0028): ${hexByte(view.u8(0x0027))} ${hexByte(view.u8(0x0028))}`);
  console.log(`  SM scroll ($0029/$002A): ${hexByte(view.u8(0x0029))} ${hexByte(view.u8(0x002a))}`);
  console.log(`  Map flags ($002D): ${hexByte(view.u8(0x002d))}`);
  console.log(`  Map ID ($0048): ${hexByte(view.u8(0x0048))}`);
  console.log(`  Tileset ($0049): ${hexByte(view.u8(0x0049))}`);
  console.log(`  Vehicle ($0042): ${hexByte(view.u8(0x0042))}`);
  console.log(`  SM X/Y ($0068/$0069): ${hexByte(view.u8(0x0068))} ${hexByte(view.u8(0x0069))}`);
  console.log(`  $0060-$0064: ${hexRow(view, 0x0060, 5)}`);
  console.log(`  $0078-$007C: ${hexRow(view, 0x0078, 5)}`);

  console.log("\nNPC / object table ($6F00, 16 bytes per object):");
  for (let i = 0; i < 16; i++) {
    const base = 0x6f00 + i * 16;
    const id = view.u8(base);
    if (id === 0) continue;
    console.log(
      `  obj ${i.toString(16).padStart(2, "0")}: id=$${hexByte(id)} flags=$${hexByte(
        view.u8(base + 1)
      )} phys=(${hexByte(view.u8(base + 2))},${hexByte(
        view.u8(base + 3)
      )}) gfx=(${hexByte(view.u8(base + 4))},${hexByte(view.u8(base + 5))})`
    );
  }
}

function main() {
  const saveState = saveStateFile as unknown as { state: JsNesState };
  const state = saveState.state;

  const view = createJsNesStateView(state);
  dumpRaw(view);

  console.log("\n\n=== Decoded FF1GameState ===\n");
  const game = readFF1StateFromSaveState(state);
  console.log(JSON.stringify(game, null, 2));

  // Also exercise readFF1State(view) to make sure both entry points agree.
  const game2 = readFF1State(view);
  console.log("\nNames via MemoryView:", game2.party.map((c) => c.name).join(", "));
}

main();
