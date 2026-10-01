import {
  createJsNesStateView,
  readFF1State,
  readFF1StateFromSaveState,
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

function encodeChar(ch: string): number {
  if (ch === " ") return 0xff;
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90) return 0x8a + (code - 65);
  if (code >= 97 && code <= 122) return 0xa4 + (code - 97);
  return 0xff;
}

function writeName(mem: Uint8Array, index: number, name: string) {
  const base = 0x6100 + index * 0x40 + 0x02;
  for (let i = 0; i < 4; i++) {
    mem[base + i] = encodeChar(name[i] ?? " ");
  }
}

function writeWeapon(mem: Uint8Array, charIndex: number, weaponId: number) {
  mem[0x6100 + charIndex * 0x40 + 0x18] = weaponId;
}

function writeArmor(mem: Uint8Array, charIndex: number, armorId: number) {
  mem[0x6100 + charIndex * 0x40 + 0x1c] = armorId;
}

function main() {
  const state = makeEmptyState();
  const mem = getMem(state);

  writeName(mem, 0, "Firi");
  mem[0x6100] = 0x00;
  writeWeapon(mem, 0, 0x04); // Rapier
  writeArmor(mem, 0, 0x03); // Chain Armor

  writeName(mem, 1, "Zack");
  mem[0x6140] = 0x04;
  writeWeapon(mem, 1, 0x05); // Iron Hammer
  writeArmor(mem, 1, 0x01); // Cloth

  writeName(mem, 2, "Milo");
  mem[0x6180] = 0x05;
  writeWeapon(mem, 2, 0x03); // Wooden Staff
  writeArmor(mem, 2, 0x01); // Cloth

  writeName(mem, 3, "Jaki");
  mem[0x61c0] = 0x02;
  writeArmor(mem, 3, 0x02); // Wooden Armor

  // Gold
  mem[0x601c] = 0x10;
  mem[0x601d] = 0x27;
  mem[0x601e] = 0x00;

  // Consumables: 5 Potions, 2 Tents
  mem[0x6036] = 2; // Tent
  mem[0x6039] = 5; // Potion

  // World / position
  mem[0x002d] = 0x01; // standard-map flag
  mem[0x0048] = 0x00; // Coneria (standard maps are 0-based)
  mem[0x0049] = 0x00; // town tileset
  mem[0x0068] = 16;
  mem[0x0069] = 13;
  mem[0x0042] = 0x01; // on foot

  const game = readFF1StateFromSaveState(state);

  console.log("Party:");
  for (const c of game.party) {
    console.log(
      `  ${c.index + 1}. ${c.name} (${c.classInfo?.name ?? "Unknown"}) Lv${c.level} HP ${c.hp}/${c.maxHp}`
    );
  }

  console.log(`\nGold: ${game.gold}`);

  console.log("\nInventory:");
  for (const item of game.inventory) {
    console.log(`  ${item.itemInfo?.name ?? `Item#${item.itemId}`} x${item.quantity}`);
  }

  console.log("\nWorld:");
  console.log(`  Map: ${game.world.mapName ?? `#${game.world.mapId}`}`);
  console.log(`  Standard map position: (${game.world.standardMapX}, ${game.world.standardMapY})`);
  console.log(`  Current vehicle: ${game.world.currentVehicle ?? "unknown"}`);
  console.log(`  Owned vehicles: ${game.world.ownedVehicles.join(", ") || "none"}`);

  const view = createJsNesStateView(state);
  const game2 = readFF1State(view);
  console.log("\nRead via MemoryView:", game2.party[0]?.name);
}

main();
