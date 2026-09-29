import { useCallback, useState } from "react";
import { GameScreen } from "@/components/GameScreen";
import { GameStatePanel } from "@/components/GameStatePanel";
import { AgentPanel } from "@/components/AgentPanel";
import { ControlBar } from "@/components/ControlBar";
import { Gamepad } from "@/components/Gamepad";
import { RomPicker } from "@/components/RomPicker";
import { SaveControls } from "@/components/SaveControls";
import { StateViewer } from "@/components/StateViewer";
import { useEmulator } from "@/hooks/useEmulator";
import { useBotLoop } from "@/hooks/useBotLoop";
import { GenericGamePlugin } from "@/games/generic";
import { readPlayId } from "@/play";
import type { CollectedState } from "@/emulator/collectState";
import type { GameCommand } from "@/types";

// Swap for a real game adapter (packages/games/*) once one is wired up.
// The plugin owns both the state reader and the command->button-sequence map,
// so the loop and emulator stay game-agnostic.
const plugin = new GenericGamePlugin();

export function App() {
  const {
    canvasRef,
    fps,
    power,
    romName,
    hasRom,
    error,
    screenshot,
    tap,
    playSequence,
    buttonDown,
    buttonUp,
    loadRom,
    reset,
    powerOn,
    powerOff,
    collect,
    saveStateToFile,
    loadStateFromFile,
  } = useEmulator(readPlayId());

  const [gameState, setGameState] = useState<Record<string, unknown>>({});
  const [snapshot, setSnapshot] = useState<CollectedState | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  // The loop hands back a chosen command; botdeck compiles it to a macro
  // (via the game plugin) and plays it out at human-like timing.
  const playCommand = useCallback(
    (command: GameCommand, onDone: () => void) => {
      const steps = plugin.compile(command);
      playSequence(steps, onDone);
    },
    [playSequence],
  );

  const bot = useBotLoop({ plugin, getScreenshot: screenshot, playCommand });

  const refreshState = useCallback(() => {
    setGameState({ ...plugin.readState(), _seenAt: Date.now() });
  }, []);

  const onCollect = useCallback(() => {
    const s = collect();
    if (s) {
      setSnapshot(s);
      setViewerOpen(true);
    }
  }, [collect]);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between px-4 py-2">
        <h1 className="text-lg font-semibold text-neutral-100">botdeck</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            {romName ?? "no ROM"} · {plugin.title}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              power && hasRom
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-neutral-700 text-neutral-300"
            }`}
          >
            {power && hasRom ? "power on" : "standby"}
          </span>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-2 gap-3 p-3">
        {/* Left: emulator UI (merged from humdeck) + game state */}
        <div className="grid min-h-0 grid-rows-[auto_1fr_auto_1fr] gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={power ? powerOff : powerOn}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                power
                  ? "bg-rose-600 hover:bg-rose-500"
                  : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              Power {power ? "off" : "on"}
            </button>
            <button
              onClick={reset}
              disabled={!hasRom}
              className="rounded bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600 disabled:opacity-50"
            >
              Reset
            </button>
            <SaveControls
              disabled={!power || !hasRom}
              onSaveFile={saveStateToFile}
              onLoadFile={loadStateFromFile}
            />
            <button
              onClick={onCollect}
              disabled={!hasRom}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
            >
              Collect state
            </button>
          </div>

          <GameScreen canvasRef={canvasRef} />

          <div className="flex flex-col items-center gap-2">
            <Gamepad onDown={buttonDown} onUp={buttonUp} />
            <RomPicker onLoad={loadRom} />
            <p className="text-xs text-neutral-500">
              keyboard: arrows = d-pad, Z = B, X = A, Enter = Start, \ = Select
            </p>
            {error && <p className="text-sm text-rose-400">{error}</p>}
          </div>

          <GameStatePanel state={gameState} />
        </div>

        {/* Right: agent loop + controls */}
        <div className="grid min-h-0 grid-rows-[1fr_auto] gap-3">
          <AgentPanel
            running={bot.running}
            turn={bot.turn}
            phase={bot.phase}
            fps={fps}
            lastReason={bot.lastReason}
            log={bot.log}
          />
          <ControlBar
            running={bot.running}
            onStart={bot.start}
            onStop={bot.stop}
            onReset={bot.reset}
            onManualTap={tap}
            onInspect={refreshState}
          />
        </div>
      </main>

      {viewerOpen && (
        <StateViewer data={snapshot} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
}
