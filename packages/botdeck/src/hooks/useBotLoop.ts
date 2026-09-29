import { useCallback, useRef, useState } from "react";
import type { GamePlugin } from "@/games/plugin";
import type { GameCommand, TurnRequest, TurnResponse } from "@/types";

export interface TurnLogEntry {
  turn: number;
  command: GameCommand;
  reason?: string;
  ts: number;
}

interface UseBotLoopArgs {
  plugin: GamePlugin;
  getScreenshot: () => string;
  playCommand: (command: GameCommand, onDone: () => void) => void;
  /** Delay between turns, in ms (time between one macro finishing and the next read). */
  thinkDelayMs?: number;
}

interface UseBotLoopResult {
  running: boolean;
  turn: number;
  phase: Phase;
  lastReason?: string;
  log: TurnLogEntry[];
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Phases map directly to the agent loop steps (README point 5):
 *   reading   -> get game state
 *   composing -> construct context / message
 *   asking    -> call agent
 *   applying  -> process response -> input game commands
 * The emulator is never paused; the bot simply provides no input while the
 * agent deliberates, then plays the chosen macro at human-like timing.
 */
export type Phase = "idle" | "reading" | "composing" | "asking" | "applying";

export function useBotLoop({
  plugin,
  getScreenshot,
  playCommand,
  thinkDelayMs = 500,
}: UseBotLoopArgs): UseBotLoopResult {
  const [running, setRunning] = useState(false);
  const [turn, setTurn] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [lastReason, setLastReason] = useState<string | undefined>();
  const [log, setLog] = useState<TurnLogEntry[]>([]);

  const runningRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const runTurn = useCallback(async () => {
    if (!runningRef.current) return;

    // 1. get game state (plugin reads emulator RAM/screen)
    setPhase("reading");
    const state = plugin.readState();
    const screenshot = getScreenshot();

    // 2. construct context / message
    setPhase("composing");
    const request: TurnRequest = {
      gameId: plugin.id,
      state,
      screenshot: screenshot || undefined,
      options: plugin.availableCommands(),
    };

    // 3. call agent (vermbot)
    setPhase("asking");
    let decision: TurnResponse;
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error(`vermbot ${res.status}`);
      decision = (await res.json()) as TurnResponse;
    } catch {
      // vermbot offline/failed: idle this turn, retry next cycle.
      if (runningRef.current) {
        timerRef.current = window.setTimeout(runTurn, thinkDelayMs);
      }
      return;
    }

    if (!runningRef.current) return;

    // 4. process response -> 5. input game commands (via plugin macro)
    setPhase("applying");
    setTurn((n) => {
      const next = n + 1;
      setLastReason(decision.reason);
      setLog((prev) => [
        ...prev.slice(-49),
        { turn: next, command: decision.command, reason: decision.reason, ts: Date.now() },
      ]);
      return next;
    });

    playCommand(decision.command, () => {
      if (runningRef.current) {
        timerRef.current = window.setTimeout(runTurn, thinkDelayMs);
      }
    });
  }, [plugin, getScreenshot, playCommand, thinkDelayMs]);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    void runTurn();
  }, [runTurn]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    setPhase("idle");
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setTurn(0);
    setLog([]);
    setLastReason(undefined);
  }, [stop]);

  return { running, turn, phase, lastReason, log, start, stop, reset };
}
