import { useCallback, useEffect, useMemo, useState } from "react";
import { GameScreen } from "@/components/GameScreen";
import { Gamepad } from "@/components/Gamepad";
import { RomPicker } from "@/components/RomPicker";
import { SaveControls } from "@/components/SaveControls";
import { GameInfoPanel } from "@/components/game-info";
import { useEmulator } from "@/hooks/useEmulator";
import { useBotLoop } from "@/hooks/useBotLoop";
import { GenericGamePlugin } from "@/games/generic";
import { FF1GamePlugin } from "@/games/ff1";
import { loadPlayConfig, readGameId, readPlayId } from "@/play";
import type { CollectedState } from "@/emulator/collectState";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function App() {
  const game = readGameId();
  const playId = readPlayId(game);

  const {
    canvasRef,
    emulator,
    fps,
    power,
    romName,
    hasRom,
    splashUrl,
    error,
    muted,
    buttonDown,
    buttonUp,
    reset,
    powerOn,
    powerOff,
    collect,
    refreshState,
    saveStateToPlay,
    loadStateFromFile,
    loadState,
    setMuted,
  } = useEmulator(game);

  const plugin = useMemo(() => {
    if (game === "ff1") return new FF1GamePlugin(emulator);
    return new GenericGamePlugin(emulator);
  }, [emulator, game]);

  const getScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    return canvas ? canvas.toDataURL("image/png") : undefined;
  }, [canvasRef]);

  const [playConfig, setPlayConfig] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    loadPlayConfig(playId)
      .then(setPlayConfig)
      .catch((e) => console.error("failed to load play config", e));
  }, [playId]);

  const { turnTimeoutMs, settleDelayMs, collectStates } = useMemo(() => {
    const agent = isPlainObject(playConfig?.agent) ? playConfig.agent : {};
    const maxToolRounds = typeof agent.maxToolRounds === "number" ? agent.maxToolRounds : 5;
    const timeoutMs = typeof agent.timeoutMs === "number" ? agent.timeoutMs : 120_000;
    const collectStates =
      agent.collectStates === false ? false : true;
    return {
      turnTimeoutMs: maxToolRounds * timeoutMs + 10_000,
      settleDelayMs: 250,
      collectStates,
    };
  }, [playConfig]);

  const agent = useBotLoop({
    playId,
    game,
    emulator,
    plugin,
    getScreenshot,
    collect,
    collectStates,
    turnTimeoutMs,
    settleDelayMs,
  });

  const [snapshot, setSnapshot] = useState<CollectedState | null>(null);
  const [lastSaved, setLastSaved] = useState<{
    statePath?: string;
    extractedPath?: string;
    metadataPath?: string;
  } | null>(null);

  const onSnapshot = useCallback(
    async (name?: string) => {
      const collected = collect();
      if (!collected) throw new Error("no ROM loaded");
      setSnapshot(collected);
      const result = await saveStateToPlay(playId, name);
      if (result.ff1) {
        setSnapshot({ ...collected, ff1: result.ff1 as CollectedState["ff1"] });
      }
      setLastSaved({
        statePath: result.statePath,
        extractedPath: result.extractedPath,
        metadataPath: result.metadataPath,
      });
    },
    [collect, saveStateToPlay, playId],
  );

  const onLoadSaved = useCallback(
    async (stateUrl: string) => {
      const res = await fetch(stateUrl);
      if (!res.ok) {
        throw new Error(`state download failed (${res.status})`);
      }
      const json = (await res.json()) as object;
      const collected = await loadState(json);
      setSnapshot(collected);
      setLastSaved(null);
    },
    [loadState],
  );

  const onRefreshState = useCallback(() => {
    const collected = refreshState();
    if (collected) setSnapshot(collected);
  }, [refreshState]);

  const onLoadFile = useCallback(
    async (file: File) => {
      const collected = await loadStateFromFile(file);
      setSnapshot(collected);
      setLastSaved(null);
    },
    [loadStateFromFile],
  );

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center justify-between px-4 py-2">
        <h1 className="text-lg font-semibold text-neutral-100">botdeck</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">
            {romName ?? "no ROM"} · {Math.round(fps)} fps
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
            <button
              onClick={() => setMuted(!muted)}
              disabled={!power}
              className="rounded bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600 disabled:opacity-50"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <SaveControls
              disabled={!power || !hasRom}
              playId={playId}
              onSnapshot={onSnapshot}
              onLoadFile={onLoadFile}
              onLoadSaved={onLoadSaved}
            />
            {error ? (
              <p className="text-xs text-rose-400">{error}</p>
            ) : (
              <p className="text-xs text-neutral-500">
                arrows = d-pad, Z = B, X = A, Enter = Start, \ = Select
              </p>
            )}
          </div>

          <GameScreen
            canvasRef={canvasRef}
            canPlay={hasRom && !power}
            splashUrl={splashUrl}
            onPlay={powerOn}
          />

          <div className="flex justify-center">
            <Gamepad onDown={buttonDown} onUp={buttonUp} />
          </div>
        </div>

        {/* Right: JSON view of the collected game state */}
        <div className="flex min-h-0 flex-col">
          <GameInfoPanel
            data={snapshot}
            saved={lastSaved}
            disabled={!power || !hasRom}
            onRefresh={onRefreshState}
            agent={agent}
          />
        </div>
      </main>
    </div>
  );
}
