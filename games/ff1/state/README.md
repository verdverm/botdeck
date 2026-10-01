# @games/ff1-state

Generic NES state access layer for reading jsNES save states, plus a complete Final Fantasy I game-state reader built on top of it.

## Exports

NES / emulator helpers:

- `MemoryView` - read bytes and words from the NES CPU address space
- `createCpuMemoryView`, `createSaveRamView`, `createJsNesStateView` - view factories
- `readUint8`, `readUint16LE`, `readBytes`, `decodeAsciiText` - raw helpers
- `decodeGameGenie`, `encodeGameGenie`, `encodeGameGenieHex`, `applyGameGeniePatch`, `applyGameGeniePatches`

FF1 state reader:

- `readFF1State(view)` / `readFF1StateFromSaveState(saveState)` - full game snapshot
- `readParty(view)`, `readGold(view)`, `readInventory(view)`, `readWorldState(view)`, `readGameFlags(view)` - individual sections
- Human-readable types: `FF1GameState`, `PartyCharacter`, `InventoryItem`, `WorldState`, `GameFlags`

FF1 data tables:

- `CLASSES`, `ITEMS`, `SPELLS`, `STATUSES`, `CURRENT_VEHICLE`, `OWNED_VEHICLES`, `TEXT_TABLE`
- Memory constants from `src/data/constants.ts`

Everything is platform-agnostic TypeScript with no DOM or Node-only APIs.

## Import

```ts
import { MemoryView, createJsNesStateView, readFF1State } from "@games/ff1-state";
```

Subpath exports:

```ts
import { ITEMS, SPELLS } from "@games/ff1-state/data";
```

## Documentation

For the complete memory layout and data-format reference, see:

- [`docs/MEMORY_LAYOUT.md`](./docs/MEMORY_LAYOUT.md) - where every field lives in CPU RAM, with address, size, and certainty markers.
- [`docs/DATA_FORMATS.md`](./docs/DATA_FORMATS.md) - text encoding, class/item/spell/status tables, vehicle bytes, gold format, and inventory layout.

Code certainty markers:

- `VERIFIED` - cross-checked against jsNES save states and the FF1 disassembly.
- `INFERRED` - taken from community documentation; should be double-checked.
- `TODO` - placeholder / uncertain.

## Workflows

See `workflows/` for runnable examples:

- `workflows/example.ts` - read a jsNES state and print the party/world state
- `workflows/patch-example.ts` - apply a GameGenie-style patch to a save state
- `workflows/analyze-initd.ts` - analyze the initial dev save state file
