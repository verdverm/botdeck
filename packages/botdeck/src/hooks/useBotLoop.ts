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

export type AgentRunMode = "auto" | "step";

export interface PendingDecision {
  seq: number;
  ts: number;
  request: TurnRequest;
  response: TurnResponse;
  command: GameCommand;
  actor?: string;
  stateBefore?: string;
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
  /** Continuous auto-run is active. */
  autoRun: boolean;
  setAutoRun: (value: boolean) => void;
  /** Agent run mode: auto advances continuously, step pauses before execution. */
  runMode: AgentRunMode;
  setRunMode: (value: AgentRunMode) => void;
  /** When in step mode, the decision waiting for user approval. */
  pendingDecision: PendingDecision | undefined;
  /** Approve and execute the pending decision (step mode). */
  executePending: () => Promise<void>;
  /** Discard the pending decision without executing. */
  clearPending: () => void;
  /** Run a manual command through the same macro + persist path. */
  runManualCommand: (command: GameCommand) => Promise<void>;
  /** Run raw button steps through the emulator macro runner. */
  runManualMacro: (steps: ButtonStep[]) => Promise<void>;
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
  const [runMode, setRunModeState] = useState<AgentRunMode>("auto");
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | undefined>();
  const [pendingMessage, setPendingMessage] = useState("");

  const seqRef = useRef(0);
  const runningRef = useRef(false);
  const autoRunRef = useRef(autoRun);
  const runModeRef = useRef(runMode);
  const pendingMessageRef = useRef(pendingMessage);

  useEffect(() => {
    autoRunRef.current = autoRun;
  }, [autoRun]);

  useEffect(() => {
    runModeRef.current = runMode;
  }, [runMode]);

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

  const waitSettle = useCallback((): Promise<void> => {
    return new Promise((resolve) => window.setTimeout(resolve, settleDelayMs));
  }, [settleDelayMs]);

  const callAgent = useCallback(
    async (request: TurnRequest): Promise<TurnResponse> => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), turnTimeoutMs);
      try {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`turn failed (${res.status}): ${body}`);
        }
        return (await res.json()) as TurnResponse;
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    [turnTimeoutMs],
  );

  const buildRequest = useCallback(
    (
      pluginState: Record<string, unknown>,
      mode: string,
      actor?: string,
    ): TurnRequest => {
      const userMessage = pendingMessageRef.current.trim();
      if (userMessage) {
        pluginState.userMessage = userMessage;
      }
      return {
        gameId: game,
        playId,
        mode,
        state: pluginState,
        screenshot: getScreenshot?.(),
        options: plugin.availableCommands(pluginState, { actor }),
        actor,
      };
    },
    [game, playId, plugin, getScreenshot],
  );

  const executeCommand = useCallback(
    async (
      seq: number,
      ts: number,
      request: TurnRequest,
      response: TurnResponse,
      stateBefore?: string,
    ): Promise<TurnLogEntry> => {
      const macro = plugin.compile(response.command);
      setIsPlayingMacro(true);
      await emulator.runMacro(macro);
      setIsPlayingMacro(false);

      const stateAfter = collectStates ? await saveStepState(seq, "after") : undefined;

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
        } catch (diffErr) {
          console.warn(`step ${seq} diff failed:`, diffErr);
        }
      }

      const entry: TurnLogEntry = {
        seq,
        ts,
        request,
        response,
        command: response.command,
        macro,
        stateBefore,
        stateAfter,
        diff,
      };
      setMessages((prev) => [...prev, entry]);
      setLastRequest(request);
      setLastResponse(response);
      return entry;
    },
    [emulator, plugin, collectStates, saveStepState, persistStep, playId],
  );

  const decideAndMaybeExecute = useCallback(
    async (
      pluginState: Record<string, unknown>,
      mode: string,
      actor?: string,
    ): Promise<TurnLogEntry | PendingDecision> => {
      const seq = (seqRef.current += 1);
      const ts = Date.now();
      const stateBefore = collectStates ? await saveStepState(seq, "before") : undefined;

      const request = buildRequest(pluginState, mode, actor);
      setLastRequest(request);
      const response = await callAgent(request);
      setLastResponse(response);

      // In step mode, pause before execution and surface the pending decision.
      if (runModeRef.current === "step") {
        const pending: PendingDecision = {
          seq,
          ts,
          request,
          response,
          command: response.command,
          actor,
          stateBefore,
        };
        setPendingDecision(pending);
        return pending;
      }

      return executeCommand(seq, ts, request, response, stateBefore);
    },
    [buildRequest, callAgent, collectStates, executeCommand, saveStepState],
  );

  const runBattleRound = useCallback(async (): Promise<void> => {
    // Battle-state offsets are VERIFIED (see @games/ff1-state reader.ts
    // VERIFIED_BATTLE_NOTE). The remaining limitation is the compile stub for
    // battle actions: they do not yet navigate the actor/target/spell menus.
    // This loop trusts the state reader enough to call the agent once per active
    // party member index reported, and it guards against re-asking for the same
    // actor if the stub macro fails to advance the game's cursor.
    let state = plugin.readState();
    let guard = 0;
    let lastActorIndex: number | undefined;
    while (guard++ < 4) {
      const ff1 = state.ff1 as { battle?: { inBattle?: boolean; activePartyIndex?: number; party?: { name: string; canAct?: boolean }[] } } | undefined;
      if (!ff1?.battle?.inBattle) break;
      const activeIndex = ff1.battle.activePartyIndex;
      if (activeIndex === lastActorIndex) break;
      const actor = activeIndex !== undefined ? ff1.battle.party?.[activeIndex]?.name : undefined;
      if (!actor) break;
      lastActorIndex = activeIndex;

      const result = await decideAndMaybeExecute(state, "battle", actor);
      if ("macro" in result) {
        // executed immediately (TurnLogEntry has macro)
      } else {
        // paused for step mode (PendingDecision has no macro)
        return;
      }
      await waitSettle();
      state = plugin.readState();
    }
  }, [plugin, decideAndMaybeExecute, waitSettle]);

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

    try {
      const state = plugin.readState();
      const mode = plugin.getMode(state);

      if (mode === "battle") {
        await runBattleRound();
      } else {
        await decideAndMaybeExecute(state, mode);
      }

      // Clear the injected user message once consumed.
      if (pendingMessageRef.current) {
        setPendingMessage("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setAutoRunState(false);
    } finally {
      setIsThinking(false);
      setIsPlayingMacro(false);
      runningRef.current = false;
    }
  }, [emulator, plugin, runBattleRound, decideAndMaybeExecute]);

  const executePending = useCallback(async () => {
    const pending = pendingDecision;
    if (!pending) return;
    setPendingDecision(undefined);
    setIsThinking(true);
    try {
      await executeCommand(
        pending.seq,
        pending.ts,
        pending.request,
        pending.response,
        pending.stateBefore,
      );
      // If we were in the middle of a battle round, continue it.
      const state = plugin.readState();
      if (plugin.getMode(state) === "battle") {
        await runBattleRound();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setAutoRunState(false);
    } finally {
      setIsThinking(false);
      setIsPlayingMacro(false);
      runningRef.current = false;
    }
  }, [pendingDecision, executeCommand, plugin, runBattleRound]);

  const clearPending = useCallback(() => {
    setPendingDecision(undefined);
  }, []);

  const step = useCallback(async () => {
    setAutoRunState(false);
    await runOneTurn();
  }, [runOneTurn]);

  const setAutoRun = useCallback((value: boolean) => {
    setAutoRunState(value);
  }, []);

  const setRunMode = useCallback((value: AgentRunMode) => {
    setRunModeState(value);
    if (value === "step") {
      // Step mode disables continuous auto-run.
      setAutoRunState(false);
    }
  }, []);

  const runManualCommand = useCallback(
    async (command: GameCommand) => {
      if (!emulator.hasRomLoaded() || !emulator.isRunning()) {
        setError("emulator is not running");
        return;
      }
      const seq = (seqRef.current += 1);
      const ts = Date.now();
      const stateBefore = collectStates ? await saveStepState(seq, "before") : undefined;
      const snapshot = plugin.readState();
      const request: TurnRequest = {
        gameId: game,
        playId,
        state: snapshot,
        screenshot: getScreenshot?.(),
        options: plugin.availableCommands(snapshot),
      };
      const response: TurnResponse = { command, reason: "manual injection" };
      await executeCommand(seq, ts, request, response, stateBefore);
    },
    [emulator, game, playId, plugin, getScreenshot, collectStates, saveStepState, executeCommand],
  );

  const runManualMacro = useCallback(
    async (steps: ButtonStep[]) => {
      if (!emulator.hasRomLoaded() || !emulator.isRunning()) {
        setError("emulator is not running");
        return;
      }
      setIsPlayingMacro(true);
      await emulator.runMacro(steps);
      setIsPlayingMacro(false);
    },
    [emulator],
  );

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
    runMode,
    setRunMode,
    pendingDecision,
    executePending,
    clearPending,
    runManualCommand,
    runManualMacro,
    pendingMessage,
    setPendingMessage,
  };
}
