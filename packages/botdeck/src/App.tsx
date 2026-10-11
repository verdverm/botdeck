import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameScreen } from "@/components/GameScreen";
import { Gamepad } from "@/components/Gamepad";
import { PlayPicker } from "@/components/PlayPicker";
import { SaveControls } from "@/components/SaveControls";
import { GameInfoPanel } from "@/components/game-info";
import { useEmulator } from "@/hooks/useEmulator";
import { useBotLoop } from "@/hooks/useBotLoop";
import { GenericGamePlugin } from "@/games/generic";
import { FF1GamePlugin } from "@/games/ff1";
import {
  DEFAULT_PLAY_ID,
  fetchDiff,
  loadPlayConfig,
  postState,
  readGameId,
  readPlayId,
  resolveDefaultPlayId,
  stateUrl,
} from "@/play";
import type { CollectedState } from "@/emulator/collectState";
import type {
  ButtonStep,
  GameCommand,
  PlaySnippet,
  SnippetRunResult,
  SnippetStep,
} from "@/types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function App() {
  const game = readGameId();
  const [playId, setPlayId] = useState(() => readPlayId(game));

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
    gameFocused,
    onCanvasFocus,
    onCanvasBlur,
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
    // If there is no ?play= query param we are waiting for resolveDefaultPlayId
    // to pick the first real play; skip loading the static default config.
    if (
      typeof window !== "undefined" &&
      !new URLSearchParams(window.location.search).get("play") &&
      playId === `${game}/${DEFAULT_PLAY_ID}`
    ) {
      return;
    }
    loadPlayConfig(playId)
      .then(setPlayConfig)
      .catch((e) => console.error("failed to load play config", e));
  }, [playId, game]);

  const { turnTimeoutMs, settleDelayMs, collectStates } = useMemo(() => {
    const agent = isPlainObject(playConfig?.agent) ? playConfig.agent : {};
    const maxToolRounds = typeof agent.maxToolRounds === "number" ? agent.maxToolRounds : 25;
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

  const [snippetRunning, setSnippetRunning] = useState(false);
  const snippetAbortRef = useRef<(() => void) | null>(null);

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

  // Switch the active play: update state + URL only. The user chooses whether
  // to load a snapshot via the Load menu.
  const switchPlay = useCallback((nextPlayId: string) => {
    setPlayId(nextPlayId);
    const url = new URL(window.location.href);
    url.searchParams.set("play", nextPlayId);
    window.history.replaceState({}, "", url);
  }, []);

  // When the page is opened without a ?play= param, pick the first play for
  // the game so the Load menu shows the right snapshots.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("play")) return;
    void resolveDefaultPlayId(game).then((id) => {
      if (id !== playId) switchPlay(id);
    });
  }, [game, playId, switchPlay]);

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

  const runSnippetStep = useCallback(
    async (step: SnippetStep, signal: AbortSignal) => {
      if (signal.aborted) return;
      const runSteps = async (steps: ButtonStep[]) => {
        if (steps.length === 0) return;
        const onAbort = () => emulator.cancelMacro();
        signal.addEventListener("abort", onAbort);
        try {
          await emulator.runMacro(steps);
        } finally {
          signal.removeEventListener("abort", onAbort);
        }
      };
      switch (step.kind) {
        case "command": {
          const macro = plugin.compile(step.command);
          if (macro.length === 0 && step.command.name !== "wait") {
            throw new Error(`unknown or unsupported snippet command: ${step.command.name}`);
          }
          await runSteps(macro);
          break;
        }
        case "macro": {
          await runSteps(step.buttonSteps);
          break;
        }
        case "wait": {
          await new Promise((resolve) => {
            const id = window.setTimeout(resolve, (step.frames / 60) * 1000);
            const onAbort = () => {
              signal.removeEventListener("abort", onAbort);
              window.clearTimeout(id);
              resolve(undefined);
            };
            signal.addEventListener("abort", onAbort);
          });
          break;
        }
      }
    },
    [emulator, plugin],
  );

  const onRunSnippet = useCallback(
    async (snippet: PlaySnippet): Promise<SnippetRunResult> => {
      const controller = new AbortController();
      snippetAbortRef.current = () => controller.abort();
      setSnippetRunning(true);

      const settle = (ms: number) =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, ms);
        });

      const snapshot = (when: "before" | "after") => {
        const collected = collect();
        if (!collected) return Promise.resolve(undefined);
        return postState(
          playId,
          collected,
          `snippet_${snippet.id}_${when}`,
        ).then((r) => r.statePath);
      };

      try {
        const filename = `${snippet.startState}.state.json`;
        const res = await fetch(stateUrl(playId, filename));
        if (!res.ok) {
          throw new Error(`failed to load start state ${filename}: ${res.status}`);
        }
        const state = (await res.json()) as object;
        const collected = await loadState(state);
        setSnapshot(collected);
        setLastSaved(null);

        await settle(200);
        const beforePath = await snapshot("before");

        for (const step of snippet.steps) {
          if (controller.signal.aborted) break;
          await runSnippetStep(step, controller.signal);
        }

        await settle(200);
        const afterPath = await snapshot("after");

        let diff: Record<string, unknown> | undefined;
        if (beforePath && afterPath) {
          try {
            diff = await fetchDiff(playId, beforePath, afterPath);
          } catch (diffErr) {
            console.warn(`snippet ${snippet.id} diff failed:`, diffErr);
          }
        }

        const final = collect();
        if (final) setSnapshot(final);
        return { beforePath, afterPath, diff };
      } finally {
        snippetAbortRef.current = null;
        setSnippetRunning(false);
      }
    },
    [playId, loadState, collect, runSnippetStep],
  );

  const onStopSnippet = useCallback(() => {
    snippetAbortRef.current?.();
  }, []);

  const onManualCommand = useCallback(
    async (command: GameCommand) => {
      await agent.runManualCommand(command);
      const final = collect();
      if (final) setSnapshot(final);
    },
    [agent, collect],
  );

  const handleButtonDown = useCallback(
    (button: number) => {
      // In step mode or with a pending decision, route manual input through the macro runner.
      if (agent.runMode === "step" || agent.pendingDecision) {
        void agent.runManualMacro([{ button, holdFrames: 4, gapFrames: 4 }]);
        return;
      }
      buttonDown(button);
    },
    [agent, buttonDown],
  );

  const handleButtonUp = useCallback(
    (button: number) => {
      if (agent.runMode === "step" || agent.pendingDecision) {
        return;
      }
      buttonUp(button);
    },
    [agent, buttonUp],
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
            <PlayPicker game={game} playId={playId} onSelect={(id) => void switchPlay(id)} />
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
            focused={gameFocused}
            onFocus={onCanvasFocus}
            onBlur={onCanvasBlur}
          />

          <div className="flex justify-center">
            <Gamepad onDown={handleButtonDown} onUp={handleButtonUp} />
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
            playId={playId}
            game={game}
            plugin={plugin}
            onRunSnippet={onRunSnippet}
            onManualCommand={onManualCommand}
            snippetRunning={snippetRunning}
            onStopSnippet={onStopSnippet}
          />
        </div>
      </main>
    </div>
  );
}
