# TODO

Living roadmap and known gaps for `botdeck`.

## Roadmap

These are the next concrete features, in rough priority order.

1. **State-change detection.** Replace the fixed `settleDelayMs` timer in `useBotLoop` with a change signal derived from the frame buffer and `plugin.readState()`. The agent loop, step persistence, and future WebRTC data channel should all react to actual game state settlement, not a timeout.
2. **Real FF1 command compiler.** The `GenericGamePlugin` only emits single-tap placeholders. Build menu navigation, item/equipment/spell selection, shop interaction, and overworld travel macros for Final Fantasy I.
3. **Navigation tooling.** Add map walkability data and an A* pathfinder so the agent can issue high-level "travel to <place>" commands that compile into d-pad macros.
4. **Sub-agents / specialized tools.** Battles, shopping/equipment upgrades, planning/reflection, and summarization helpers that the main agent can invoke.
5. **Hint / question tool.** Let the agent ask the operator for clarification or a hint when stuck.
6. **Evals and benchmarks.** Compare agent configurations, models, and prompt strategies across plays. See `packages/*/bench*` and `pnpm bench` for the harness skeleton.
7. **WebRTC read-only broadcast.** Let an operator stream the botdeck canvas and structured state to a handful of viewers; vermbot acts only as signaling relay. See `DESIGN.md` §11.
8. **Viewer mode.** A read-only botdeck mode (`?play=<id>&view=readonly`) that renders an incoming WebRTC stream and state feed with no emulator or input wiring.
9. **Save manipulation / "game genie"."** Ability to synthesize or patch starting save states (equipment, gold, progression flags) to bootstrap a play past the early game.
10. **Progression flag decoding.** Finish mapping the `$6200` flag page in `@games/ff1-state` so the agent knows which key items and events are complete.
11. **Additional systems / games.** SNES (FF2/FF6), Game Boy (Pokemon), and eventually non-emulator titles such as KSP or 4X games will need different emulator cores or harness shapes.

## Gaps

Honest status of what is not yet done.

- **State-change detection is timer-based.** The loop waits `settleDelayMs` after a macro instead of waiting for the screen/state to actually settle.
- **No real game-specific command compiler.** Only `GenericGamePlugin` exists; FF1 menu navigation, travel, and combat macros are not implemented.
- **No eval suite.** There are Vitest benchmarks but no agent-evaluation harness or scoring yet.
- **WebRTC is unbuilt.** Signaling endpoint, host capture, and viewer mode are all TODO.
- **No automated save-state patching.** Starting conditions must be set by hand or by playing to that point.
- **FF1 progression flags are raw only.** `@games/ff1-state` returns the `$6200` page but decoded booleans are left undefined until bit positions are verified.
- **State reader is FF1-only.** No reader exists for other games.
- **Agent chat UI is minimal.** The user can inject a message before a turn, but there is no persistent conversation thread or streaming display.

## Related / later

Longer-term ideas and non-urgent experiments pulled from `IDEAS.md`.

- UI refactor: landing page, play browser, evals/analysis page, accordion rows for snapshots.
- Make botdeck look more like a physical game pad; smaller game screen, buttons to the sides.
- ROM alchemy: per-play ROM overrides, a dedicated `games/ff1/alchemy` package, and a UI for patching.
- Versus mode: agent vs agent or human vs agent.
- Cloudflare Pages deploy and `gaming.verdverm.ai` site.
- Support local-only play for users with their own API keys or homelab endpoints.
