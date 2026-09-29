import { useCallback, useState } from "react";
import { GameScreen } from "@/components/GameScreen";
import { Gamepad } from "@/components/Gamepad";
import { RomPicker } from "@/components/RomPicker";
import { SaveControls } from "@/components/SaveControls";
import { StateViewer } from "@/components/StateViewer";
import { useEmulator } from "@/hooks/useEmulator";
import { readGameId } from "@/play";
import type { CollectedState } from "@/emulator/collectState";

export function App() {
  const {
    canvasRef,
    fps,
    power,
    romName,
    hasRom,
    error,
    buttonDown,
    buttonUp,
    reset,
    powerOn,
    powerOff,
    collect,
    saveStateToFile,
    loadStateFromFile,
  } = useEmulator(readGameId());

  const [snapshot, setSnapshot] = useState<CollectedState | null>(null);

  const onCollect = useCallback(() => {
    const s = collect();
    if (s) setSnapshot(s);
  }, [collect]);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between px-4 py-2">
        <h1 className="text-lg font-semibold text-neutral-100">botdeck</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            {romName ?? "no ROM"} · {fps} fps
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
        {/* Left: emulator + manual play controls */}
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <RomPicker />
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
            <p className="text-xs text-neutral-500">
              arrows = d-pad, Z = B, X = A, Enter = Start, \ = Select
            </p>
          </div>

          <GameScreen canvasRef={canvasRef} />

          <div className="flex justify-center">
            <Gamepad onDown={buttonDown} onUp={buttonUp} />
            {error && <p className="text-sm text-rose-400">{error}</p>}
          </div>
        </div>

        {/* Right: JSON view of the collected game state */}
        <div className="flex min-h-0 flex-col">
          <StateViewer data={snapshot} />
        </div>
      </main>
    </div>
  );
}
