# AGENTS

`@games/ff1-state` workspace package: read Final Fantasy I state from live jsNES CPU RAM or save-state objects.

Key files:
- `src/ff1/reader.ts` - RAM readers for party, inventory, gold, world, flags.
- `src/ff1/format.ts` - human-readable summary formatter.
- `src/nes/memory.ts` - MemoryView over jsNES CPU memory and save states.
- `src/data/` - constants, item/spell/class/vehicle/text tables.
- `src/index.ts` - public exports.

Commands:
- `pnpm --filter @games/ff1-state typecheck`
- `pnpm --filter @games/ff1-state build`

Rules:
- Verify new RAM offsets and bit positions against disassembly or known-good save states before removing TODO/INFERRED notes.
- Keep the public API surface in `src/index.ts`; internal helpers stay out of the package export.
