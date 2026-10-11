# AGENTS

botdeck is the browser half of the harness: the jsnes-based NES emulator, the
human controls, the game plugins that read live emulator state and compile
high-level GameCommands into button macros, and the React glue that runs the
agent turn loop against vermbot's /api. Packages/vermbot owns the model call,
prompts, tool loop, and the repo file API; this package owns the emulator and
everything the user sees and touches. See packages/vermbot/AGENTS.md for that
side, the root DESIGN.md for architecture (sections 1-5, 9-10), and
games/ff1/AGENTS.md for the ff1 game integration.

Runtime contract: botdeck never touches the repo filesystem. All durable
reads and writes go over the /api proxy of the Vite dev server
(vite.config.ts proxies /api to http://localhost:8787, vermbot's default
VERMBOT_PORT). No node:* imports in client code, no /@fs URLs, no Vite
aliases used for serving repo data - the file API is the only door, and
src/play.ts is the only place that knows the URLs.

## Module map

- src/emulator/emulator.ts - the Emulator class wrapping jsnes: a
  requestAnimationFrame loop locked to the NES frame rate (calc from
  NES_FPS 60.0988, screen 256x240), frame/battery/error listeners, NesAudio
  output (audio.ts), and the macro runner. runMacro plays a ButtonStep[]
  frame by frame (holdFrames/gapFrames default 2 each) at the frame-locked
  boundary, with an optional per-frame interrupt predicate; cancelMacro
  stops it, wasMacroInterrupted reports whether the predicate fired, and
  the emulator records that state for vermbot diffs. The class also exposes
  internal PPU internals (narrow-cast) used by the nametable tests, the
  SRAM window (0x6000-0x7FFF), setLastRoute for showing compiled travel
  routes in the UI, and hasRomLoaded/isRunning.
- src/emulator/collectState.ts - collectState snapshots the live jsNES
  machine into the CollectedState JSON payload (capturedAt, rom metadata,
  saveRam bytes, full saveState object) that POST
  /api/plays/:game/:id/states accepts on vermbot's side. The save-state
  serialization benchmarks live in stateSerialization.bench.ts.
- src/emulator/audio.ts - the NesAudio shim over WebAudio; null-safe when
  audio is muted, unavailable, or headless (its own audio.bench.ts).
- src/types.ts - the browser-side mirror of packages/vermbot/src/protocol.ts
  (NES_BUTTONS, NesButtonName, ButtonStep, GameCommand, CommandSpec,
  TurnRequest with mode/actor/userMessage, TurnTranscript + rounds,
  TurnResponse, StepRecord, ToolCall, ToolResult, PlayStateMetadata,
  PlayStateEntry, PlayStateSort, PlaySnippet, SnippetStep, SnippetRunResult,
  MemoryEntry, JournalEntry, the prompt-bundle types PromptTemplateEntry,
  TemplateSource, PromptConfig, PromptTemplateBundle) plus the browser
  contracts the protocol does not have: AgentMode, GamePlugin, and
  ToolSpec. Keep in lockstep with protocol.ts when either side changes.
- src/play.ts - the one file that knows the file-API URLs, plus a typed
  wrapper for each: ids from the query string (?game= and ?play=,
  defaulting to ff1/0000_dev via readGameId/readPlayId),
  resolveDefaultPlayId falls back to the first play of a game and rewrites
  the URL, loadRomBytes fetches the ROM binary through
  /api/games/:game/rom, and the request helpers cover play config CRUD
  (loadPlayConfig, listPlays, renamePlay, deletePlay), states
  (postState, updateStateMetadata, deleteState, statesUrl/stateUrl,
  fetchDiff), snippets (saveSnippet/deleteSnippet for the user store,
  saveAgentSnippet/deleteAgentSnippet for the agent store), steps
  (stepsUrl), goals (loadGoals/saveGoals and the goals URL), memory
  (listMemory/readMemory/writeMemory/deleteMemory), journal
  (listJournal/readJournal/writeJournal/deleteJournal), and the prompt
  surfaces (loadPromptContext via /prompt-context, game and play prompt
  template CRUD). Also exports the PlaySummary and PlayConfig types.
- src/games/generic.ts - GenericGamePlugin, the fallback whose commands are
  exactly the eight single button presses compiled to short macros.
- src/games/ff1.ts - FF1GamePlugin: readState pulls the ff1 structure from
  @games/ff1-state over live CPU RAM and PPU, adds dialog capture
  (resetDialogCapture/captureDialogFrame, accumulated during macro
  playback), availableCommands returns battle or field commands based on
  getMode (battle, or one of shop/inn/clinic collapsed to shop,
  town/castle/dungeon collapsed to interior, otherwise overworld), compile
  dispatches each command name to its own builder (goto, grind, talk_to,
  interact, menu/dialog, battle, press_button) and macroAbort returns a
  per-frame predicate that cancels long travel macros the moment the game
  leaves the field (random battle, town entrance).
- src/games/ff1-menu.ts - low-level menu machinery shared by all compiles:
  press and navigate helpers (press, pressA/B/Start/Select,
  navigateDirection/navigateVertical), targetCursorDownPresses, menu label
  resolution (resolveMenuIndex, indexFromLabel), enemy/ally slot resolution,
  and the frame timing constants HOLD_FRAMES/GAP_FRAMES.
- src/games/ff1-nav.ts - navigation: A* over the overworld and small maps
  (findSmPath, gotoSmMacro), town and dungeon pathing (walkPathToSteps),
  grind macros with random-walk loops, vehicle handling (ship/canoe
  sub-plans), blocked-tile logic (objectBlockedTiles, tileKey),
  reachableNamedLocations, and the RoutePlan/Vehicle types that
  setLastRoute publishes to the UI.
- src/games/_dbg*.test.ts - hardware-facing scratch tests hit real save
  fixtures and derived RAM layouts to chase specific ff1 bugs (boot
  sequencing, town walks, macro abort, dialog classification). They are
  dev scratch: expectations are re-checked as game RAM layouts are
  re-verified, and they are not the durable regression net - keep
  ff1.test.ts, ff1-menu.test.ts, and ff1-nav.test.ts clean instead.
- src/hooks/useEmulator.ts - boot and shell: loads the ROM via
  loadRomBytes, power on/off/reset, canvas rendering loop, keyboard input
  (arrows, Z on B, X on A, Enter on Start, backslash on Select, mapped by
  KeyboardEvent.code with debounce and typing-element guards), mute
  control, and state persistence (collect, saveStateToPlay via postState
  with optional name, loadStateFromFile and loadState (from a fetched or
  in-memory state object)). Here too
  lives the FPS meter, focus gating for keyboard input (game canvas
  focused), and the per-frame screenshot callback used by
  decideAndMaybeExecute below.
- src/hooks/useBotLoop.ts - the agent loop hook. Owns the full turn
  lifecycle (see "Agent turn lifecycle" below), including battle-phase
  waiting helpers and stall guards keyed on real state signatures rather
  than timers. Accepts a settleDelayMs (default 250ms) and
  turnTimeoutMs (default 120000ms), and persists a StepRecord via /steps
  per turn.
- src/hooks/battle-helpers.ts - pure battle predicates
  (isInBattle, isRoundExecuting, isCommandEntryReady, isBattleOver,
  nextCommandableMember) used by useBotLoop (and covered in its own test
  file) so the sequencing logic can be asserted independent of React.
- src/App.tsx - the top of the tree: wires useEmulator and useBotLoop,
  builds the plugin (FF1GamePlugin when game === ff1, otherwise
  GenericGamePlugin), loads play config + ROM on boot, and runs the
  snippet runner. runSnippetStep executes each SnippetStep kind (command
  via plugin.compile, macro directly, wait for frames/60 seconds) with an
  abort signal; onRunSnippet optionally loads a startState (either a
  .state.json sidecar from the play's states endpoint or the currently
  loaded machine state) and snapshots before and after states, plus a
  diff, as snippet_run before/after artifacts in the play's states dir.
- src/components/GameScreen.tsx - the canvas container and its focus
  plumbing for keyboard input.
- src/components/Gamepad.tsx - on-screen NES controls wired to
  buttonDown/buttonUp.
- src/components/PlayPicker.tsx - play list/create/rename/delete UI over
  /api/plays.
- src/components/LoadMenu.tsx - saved state browser: load, bookmark,
  rename, delete, and diff of the play's states.
- src/components/SaveControls.tsx - save the current state into the play
  (with optional name), collect a state, power/reset, mute.
- src/components/RomPicker.tsx - dev-time game/ROM chooser (?game=).
- src/components/game-info/ - the right-hand GameInfoPanel with eight tabs
  per the Tab union in game-info/types.ts: overview, party (PartyTab with
  PartyMain and PartyMemberTab subgroup tabs), location, battle, menu,
  snippets (AgentSnippetsTab and UserSnippetsTab, each with a JSON editor
  and a runner), agent (AgentTab: turn log, auto/step run-mode controls,
  the pending-decision card, manual command and macro input, and snippet
  run status), and markdown (MarkdownTab on the vermbot prompt-context
  bundle, rendering the resolved templates via promptRender.ts, which
  mirrors how prompts.ts interpolates {{key}} values server-side).
  helpers.ts, shared.tsx, PlaceholderPanel (no-play fallback), and
  index.tsx (the default export) sit alongside.
- bench/index.html and bench/main.tsx - the in-browser benchmark page
  (pnpm bench:browser) for the canvas render path; BENCH.md documents this
  page and the Vitest unit benches together.
- e2e/ - Playwright specs against the dev server (smoke, watch-mode
  manual input, selfplay, snippet capture, macro after-battle, macro
  interrupt, performance). playwright.config.ts starts the Vite dev
  server itself on :5173 and seeds test plays via test-play.ts.
- scratch/ - throwaway probe scripts for emulator/state behavior; keep
  this out of review scope.

## Agent turn lifecycle

runOneTurn inside useBotLoop is the sequence. The auto-run scheduler effect
just schedules it again after settleDelayMs while autoRun stays on.

1. Snapshot the pre-turn emulator state (saveStepState: collectState plus
   POST /api/plays/:game/:id/states with a
   step_<seq>_before filename) so vermbot has the before half of the
   state diff; skipped when collectStates is disabled.
2. buildRequest assembles the TurnRequest from the live plugin state:
   gameId, playId, the plugin's getMode, the structured state object, a
   base64 data-URL screenshot from the current frame, the plugin's
   availableCommands for the current mode and battle actor, and an
   optional one-shot userMessage (pendingMessage).
3. callAgent POSTs /api/turn with an AbortController wired to the turn
   timeout and agent abort. User cancellation is not persisted; failures
   are, through persistFailedStep (a StepRecord whose command name is ""
   and error is set) so the play history and the vermbot recent-actions
   prompt section stay truthful.
4. A TurnResponse error (no valid command from the model) also lands in
   persistFailedStep and throws.
5. In step run mode the turn stops here and surfaces a PendingDecision for
   user approval via executePending; auto-run mode continues directly into
   executeCommand.
6. executeCommand calls plugin.compile(response.command); a compile error
   becomes the step's error field with an empty macro. plugin.macroAbort is
   computed before registration so a throwing plugin cannot leak probes.
7. The macro plays through emulator.runMacro with the abort predicate; a
   dialog-open per-frame capture probe runs during playback (dialog pages
   are sampled into the request state so the next turn sees them).
8. Post-macro: battle turns wait on real conditions
   (waitForCommandLatch that checks the actor's command buffer slot, the
   round executing, command entry advancing, or battle end; a short safety
   bound keeps the loop from hanging on a stub macro), field turns with an
   open dialog wait through the settle delay. The post-state is then
   re-read and captured.
9. State after is persisted the same way as state before
   (saveStepState(seq, "after")), a StepRecord is POSTed to .../steps with
   request, response, command, macro, stateBefore, stateAfter, and the
   optional error field; a failed persist surfaces as an error rather
   than being retried.
10. fetchDiff runs between the before/after state files (verbatim paths
    vermbot uses), and the TurnLogEntry (request, response, command,
    macro, diff) is pushed into the messages log powering AgentTab.

The loop never rests on wall-clock timers inside the turn itself:
waitForBattlePhase samples plugin.readState at the emulated frame boundary
via the emulator's onFrameProbe, requires confirmFrames consecutive frames
(default 2), and falls back to 200ms polling only when the frame probe is
stalled (no probe event for 150ms). The specialty helpers on top:
waitForBattleRound covers round processing, dismissBattleEnd pages forward
through the victory/defeat sequence with the game as the arbiter of each
press, and the runBattleRound state machine asks the agent exactly once per
commandable member between corroborated command-entry windows, guarded by
the battleSignature change-detection to prevent repeated no-op turns.

Manual input never races the agent: runManualCommand and runManualMacro
refuse to run while an agent turn is live (runningRef guard), and manual
commands flow through the same compile, macro, and StepRecord path but
with a response of reason "manual injection" instead of an API round trip.

## Data layout and the browser side of it

- The ROM is per-game; the play id is game/id. Both come from the query
  string (?game=, ?play=), defaulting to ff1/0000_dev.
- The states endpoint uses six-digit zero-padded file ids; save and step
  state files share the same sidecar triple
  (.state.json / .ff1.json / .metadata.json) on vermbot's disk, and
  botdeck only ever speaks the filename through the API.
- Steps POST a StepRecord identical to what vermbot's assertStepRecord
  validates; the claimed turn is recorded with stepId blank and assigned
  server-side.
- Collect state writes a CollectedState through postState; snippets POST a
  PlaySnippet with its startState as a state filename, and the
  prompt-context endpoint returns the PromptTemplateBundle this UI's
  markdown tab renders.

## Tests, benchmarks, and e2e

- Unit tests (vitest, jsdom via src/test/setup.ts): useBotLoop.test.ts
  covers the full turn lifecycle with a fake fetch, battle helpers,
  dialog capture, and snippet flow; ff1/ff1-menu/ff1-nav tests are the
  durable ff1 regressions, and emulator.macro.test.ts,
  emulator.nametable.test.ts, and collectState.test.ts cover the
  emulator substrate. The _dbg* scratch tests exist but are not the
  regression contract.
- Benchmarks: pnpm --filter botdeck bench (Vitest benches:
  emulator.bench.ts, collectState.bench.ts,
  stateSerialization.bench.ts, audio.bench.ts) and
  pnpm --filter botdeck bench:browser for the real canvas path.
- E2e: pnpm --filter botdeck test:e2e (test:e2e:watch, :perf, :ui
  variants); the webServer boots pnpm dev itself, and PW_HEADLESS=false
  shows the browser.
- Other scripts: dev (root alias dev:botdeck), build (tsc --noEmit then
  vite build), preview, typecheck, lint, lint:fix.

## Environment and runtime surface

- The dev server on :5173 is what Playwright targets; everything behind
  /api is proxied to vermbot on :8787, so both packages must be running
  (pnpm dev at the root starts both in parallel).
- Query params: ?game= (ROM/game choice) and ?play= (play id).
- No API keys or env vars of its own; only vermbot's config.json matters
  to the backend.

## Rules

- Keep every import inside the package on the @/ alias (vite +
  tsconfig paths); no ../../../ chains, no deep relative imports.
- Keep src/play.ts the only place with file-API URL strings; new endpoints
  get a builder and a typed helper there before any component uses them.
- Keep src/types.ts in lockstep with packages/vermbot/src/protocol.ts;
  when a shared payload field changes, both sides move in the same
  commit, since the wire JSON is the contract.
- Game-specific code only inside src/games/<game>.ts (and its tests);
  loop code in hooks/ reads nothing game-shaped through GamePlugin
  (readState, availableCommands, getMode, compile, macroAbort). Game
  RAM layout changes happen in @games/ff1-state first, then ripple into
  ff1.ts.
- Macro playback stays frame-locked; never add wall-clock waits inside
  emulator.ts. Progress waits belong in useBotLoop against state
  predicates sampled via onFrameProbe.
- Failed turns are persisted, not dropped: a step with an empty command
  and a populated error field keeps the agent's recent-actions prompt
  honest on the vermbot side.
