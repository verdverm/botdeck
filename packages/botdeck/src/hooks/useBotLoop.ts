import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectedState } from "@/emulator/collectState";
import type { Emulator } from "@/emulator/emulator";
import { fetchDiff, postState, stepsUrl } from "@/play";
import type {
  ButtonStep,
  GameCommand,
  GamePlugin,
  StepRecord,
  TurnRequest,
  TurnResponse,
} from "@/types";

const DEFAULT_SETTLE_MS = 250;
const DEFAULT_TURN_TIMEOUT_MS = 120_000;

export interface TurnLogEntry {
  seq: number;
  ts: number;
  request: TurnRequest;
  response: TurnResponse;
  command: GameCommand;
  macro?: ButtonStep[];
  stateBefore?: string;
  stateAfter?: string;
  diff?: Record<string, unknown>;
  error?: string;
}

export interface UseBotLoopOptions {
  playId: string;
  game: string;
  emulator: Emulator;
  plugin: GamePlugin;
  getScreenshot?: () => string | undefined;
  /** Snapshot the emulator for before/after state capture. */
  collect?: () => CollectedState | null;
  /** Persist before/after states for each agent step (default true). */
  collectStates?: boolean;
  settleDelayMs?: number;
  /** Timeout for the POST /api/turn fetch, in milliseconds. */
  turnTimeoutMs?: number;
}

export interface UseBotLoopResult {
  isThinking: boolean;
  isPlayingMacro: boolean;
  error: string | undefined;
  lastRequest: TurnRequest | undefined;
  lastResponse: TurnResponse | undefined;
  messages: TurnLogEntry[];
  step: () => Promise<void>;
  autoRun: boolean;
  setAutoRun: (value: boolean) => void;
  pendingMessage: string;
  setPendingMessage: (value: string) => void;
}

export function useBotLoop(options: UseBotLoopOptions): UseBotLoopResult {
  const { playId, game, emulator, plugin, getScreenshot, collect } = options;
  const settleDelayMs = options.settleDelayMs ?? DEFAULT_SETTLE_MS;
  const turnTimeoutMs = options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
  const collectStates = options.collectStates ?? true;

  const [isThinking, setIsThinking] = useState(false);
  const [isPlayingMacro, setIsPlayingMacro] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [lastRequest, setLastRequest] = useState<TurnRequest | undefined>();
  const [lastResponse, setLastResponse] = useState<TurnResponse | undefined>();
  const [messages, setMessages] = useState<TurnLogEntry[]>([]);
  const [autoRun, setAutoRunState] = useState(false);
  const [pendingMessage, setPendingMessage] = useState("");

  const seqRef = useRef(0);
  const runningRef = useRef(false);
  const autoRunRef = useRef(autoRun);
  const pendingMessageRef = useRef(pendingMessage);

  useEffect(() => {
    autoRunRef.current = autoRun;
  }, [autoRun]);

  useEffect(() => {
    pendingMessageRef.current = pendingMessage;
  }, [pendingMessage]);

  // Keep macro status in sync with the emulator without polling every frame.
  useEffect(() => {
    const id = window.setInterval(() => setIsPlayingMacro(emulator.isPlayingMacro()), 50);
    return () => window.clearInterval(id);
  }, [emulator]);

  const persistStep = useCallback(
    async (record: StepRecord) => {
      const res = await fetch(stepsUrl(playId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`step persist failed (${res.status}): ${body}`);
      }
      return (await res.json()) as StepRecord;
    },
    [playId],
  );

  const saveStepState: (
    seq: number,
    when: "before" | "after",
  ) => Promise<string | undefined> = useCallback(
    async (seq, when) => {
      if (!collect) return undefined;
      const snapshot = collect();
      if (!snapshot) return undefined;
      const result = await postState(
        playId,
        snapshot,
        `step_${String(seq).padStart(6, "0")}_${when}`,
      );
      return result.statePath;
    },
    [collect, playId],
  );

  const runOneTurn = useCallback(async (): Promise<void> => {
    if (runningRef.current) return;
    if (!emulator.hasRomLoaded() || !emulator.isRunning()) {
      setError("emulator is not running");
      setAutoRunState(false);
      return;
    }

    runningRef.current = true;
    setIsThinking(true);
    setError(undefined);

    const seq = (seqRef.current += 1);
    const ts = Date.now();
    let stateBefore: string | undefined;
    let stateAfter: string | undefined;
    let request: TurnRequest | undefined;
    let response: TurnResponse | undefined;
    let macro: ButtonStep[] | undefined;

    try {
      if (collectStates) {
        stateBefore = await saveStepState(seq, "before");
      }

      const pluginState = plugin.readState();
      const userMessage = pendingMessageRef.current.trim();
      if (userMessage) {
        pluginState.userMessage = userMessage;
      }

      request = {
        gameId: game,
        playId,
        state: pluginState,
        screenshot: getScreenshot?.(),
        options: plugin.availableCommands(pluginState),
      };
      setLastRequest(request);

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), turnTimeoutMs);
      let res: Response;
      try {
        res = await fetch("/api/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`turn failed (${res.status}): ${body}`);
      }
      response = (await res.json()) as TurnResponse;
      setLastResponse(response);

      macro = plugin.compile(response.command);
      setIsThinking(false);
      setIsPlayingMacro(true);
      await emulator.runMacro(macro);
      setIsPlayingMacro(false);

      if (collectStates) {
        stateAfter = await saveStepState(seq, "after");
      }

      const record: StepRecord = {
        stepId: "",
        ts,
        request,
        response,
        command: response.command,
        macro,
        stateBefore,
        stateAfter,
      };
      await persistStep(record);

      let diff: Record<string, unknown> | undefined;
      if (collectStates && stateBefore && stateAfter) {
        try {
          diff = await fetchDiff(playId, stateBefore, stateAfter);
          console.log(`step ${seq} diff:`, diff);
        } catch (diffErr) {
          console.warn(`step ${seq} diff failed:`, diffErr);
        }
      }

      const entry: TurnLogEntry = {
        seq,
        ts,
        request: request!,
        response: response!,
        command: response!.command,
        macro,
        stateBefore,
        stateAfter,
        diff,
      };
      setMessages((prev) => [...prev, entry]);

      // Clear the injected user message once consumed.
      if (pendingMessageRef.current) {
        setPendingMessage("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setAutoRunState(false);
      if (request && response) {
        const errorEntry: TurnLogEntry = {
          seq,
          ts,
          request: request!,
          response: response!,
          command: response!.command,
          macro,
          stateBefore,
          stateAfter,
          error: msg,
        };
        setMessages((prev) => [...prev, errorEntry]);
      }
    } finally {
      setIsThinking(false);
      setIsPlayingMacro(false);
      runningRef.current = false;
    }
  }, [emulator, game, playId, plugin, getScreenshot, persistStep, turnTimeoutMs, collectStates, saveStepState]);

  const step = useCallback(async () => {
    setAutoRunState(false);
    await runOneTurn();
  }, [runOneTurn]);

  const setAutoRun = useCallback((value: boolean) => {
    setAutoRunState(value);
  }, []);

  // Auto-run scheduler: after a turn finishes, wait for the screen to settle
  // then start the next one while autoRun is still enabled.
  useEffect(() => {
    if (!autoRun) return;
    let timeout = 0;
    const schedule = () => {
      timeout = window.setTimeout(async () => {
        if (!autoRunRef.current) return;
        if (runningRef.current) {
          schedule();
          return;
        }
        await runOneTurn();
        if (autoRunRef.current) schedule();
      }, settleDelayMs);
    };
    schedule();
    return () => window.clearTimeout(timeout);
  }, [autoRun, settleDelayMs, runOneTurn]);

  return {
    isThinking,
    isPlayingMacro,
    error,
    lastRequest,
    lastResponse,
    messages,
    step,
    autoRun,
    setAutoRun,
    pendingMessage,
    setPendingMessage,
  };
}
