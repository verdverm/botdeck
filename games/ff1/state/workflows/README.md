# @games/ff1-state workflows

Small examples showing how to use the FF1 state reader and GameGenie patch helpers.

## Reading a jsNES save state

`example.ts` loads a jsNES state object and prints a human-readable summary of the party, inventory, world position, and progression flags.

```bash
pnpm tsx games/ff1/state/workflows/example.ts
```

## Applying a GameGenie patch

`patch-example.ts` decodes a GameGenie code and applies it to every byte in a jsNES CPU memory snapshot. This is the same hook a real emulator would use at read time.

```bash
pnpm tsx games/ff1/state/workflows/patch-example.ts
```

## Package exports

Root exports:

- `MemoryView`, `createJsNesStateView`, `createCpuMemoryView`, `createSaveRamView`
- `readFF1State`, `readFF1StateFromSaveState`, `readParty`, `readGold`, `readInventory`, `readWorldState`, `readGameFlags`
- `decodeGameGenie`, `applyGameGeniePatch`, `applyGameGeniePatches`
- Data tables: `CLASSES`, `ITEMS`, `SPELLS`, `STATUSES`, `CURRENT_VEHICLE`, `OWNED_VEHICLES`, `TEXT_TABLE`, constants, etc.

Subpath exports:

- `@games/ff1-state` - combined NES + FF1 data + reader
- `@games/ff1-state/data` - raw data tables and constants only
- `@games/ff1-state/nes` is not exposed; import the symbols from the root instead
