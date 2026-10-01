# AGENTS

Browser dashboard: the emulator, human controls, and agent loop.

Key files:
- `src/emulator/emulator.ts` - frame-synced NES core and macro playback.
- `src/emulator/collectState.ts` - snapshot jsNES state for the file API.
- `src/hooks/useEmulator.ts` - boots the emulator, render loop, save/load, collect.
- `src/hooks/useBotLoop.ts` - turn loop: read state, POST `/api/turn`, play macro, persist step.
- `src/games/generic.ts` - fallback single-tap plugin.
- `src/types.ts` - protocol types mirrored from vermbot.

Components:
- `src/components/GameScreen.tsx` - canvas and emulator rendering.
- `src/components/Gamepad.tsx` - on-screen NES controls.
- `src/components/RomPicker.tsx` - ROM selection UI.
- `src/components/SaveControls.tsx` - save/load/collect state controls.
- `src/components/LoadMenu.tsx` - saved-state browser and loader.
- `src/components/game-info/GameInfoPanel.tsx` - tabbed game state panel (`OverviewTab`, `PartyTab`, `LocationTab`, `BattleTab`, `AgentTab`, `MarkdownTab`).

Commands:
- `pnpm dev:botdeck`
- `pnpm --filter botdeck test`
- `pnpm --filter botdeck test:e2e`
- `pnpm --filter botdeck bench`

Rules:
- Use `@/` imports only.
- Browser code never touches `node:fs`; all repo reads/writes go through the `/api` proxy.
