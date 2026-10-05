import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectedState } from "@/emulator/collectState";
import type { Emulator } from "@/emulator/emulator";
import { fetchDiff, postState, stepsUrl } from "@/play";
import {
  isBattleOver,
  isCommandEntryReady,
  isRoundExecuting,
  nextCommandableMember,
  type BattleStateLike,
} from "./battle-helpers";
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
  const battleRoundAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    autoRunRef.current = autoRun;
  }, [autoRun]);

  useEffect(() => {
    runModeRef.current = runMode;
  }, [runMode]);

  useEffect(() => {
    pendingMessageRef.current = pendingMessage;
  }, [pendingMessage]);

  // If the user stops auto-run while we are waiting for a battle round to
  // execute, abort that wait so the current turn ends cleanly.
  useEffect(() => {
    if (!autoRun && battleRoundAbortRef.current) {
      battleRoundAbortRef.current.abort();
    }
  }, [autoRun]);

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

  /** Record a turn that never produced a playable command, so history is complete. */
  const persistFailedStep = useCallback(
    async (
      seq: number,
      ts: number,
      request: TurnRequest,
      message: string,
      stateBefore?: string,
      response?: TurnResponse,
    ): Promise<void> => {
      const record: StepRecord = {
        stepId: "",
        ts,
        request,
        response: response ?? { command: { name: "" }, reason: "" },
        command: { name: "" },
        macro: [],
        stateBefore,
        error: message,
      };
      try {
        await persistStep(record);
      } catch (persistErr) {
        console.warn(`step ${seq} failure persist failed:`, persistErr);
      }
    },
    [persistStep],
  );

  /**
   * Advance the loop on real game conditions, not fixed delays.
   *
   * `waitForBattlePhase` samples the game state at the logically correct point
   * - the emulated frame boundary, via the emulator's per-frame probe - and
   * resolves once the target condition has held for `confirmFrames` consecutive
   * frames. That consecutive-frame requirement is what rejects the transient,
   * mid-animation RAM states (the command buffer briefly reads as a fresh
   * window, or a stale btl_result reads as battle-over) that a setInterval poll
   * would latch onto.
   *
   * The wait resolves when EITHER the condition is confirmed OR the wall-clock
   * safety bound elapses; it does not hang indefinitely on a stalled emulator.
   * It resolves `true` when the condition was satisfied and `false` when it
   * timed out, so callers can tell real progress from "gave up" rather than
   * treating a timeout as success.
   *
   * A slow fallback poll exists purely for robustness when frames are NOT
   * advancing (e.g. the tab is backgrounded and requestAnimationFrame pauses).
   * It is only armed once the frame probe has gone quiet for longer than the
   * stall threshold, so a healthy RAF never races the probe with mid-frame
   * samples that would defeat the consecutive-frame guarantee.
   */
  const waitForBattlePhase = useCallback(
    (
      predicate: (state: Record<string, unknown>) => boolean,
      opts?: { signal?: AbortSignal; confirmFrames?: number; timeoutMs?: number },
    ): Promise<boolean> => {
      const confirmFrames = opts?.confirmFrames ?? 2;
      const signal = opts?.signal;
      const timeout = opts?.timeoutMs ?? 30_000;
      const fallbackInterval = 200;
      // Consider frames stalled if no probe has fired for ~150ms; the fallback
      // poll only runs beyond that. Comfortably above one 60fps frame (~16.7ms).
      const stallThresholdMs = 150;
      const start = Date.now();
      let lastProbeAt = Date.now();
      let confirmed = 0;

      return new Promise<boolean>((resolve, reject) => {
        let fallbackId: number | undefined;
        let safetyId: number | undefined;
        let removeProbe: (() => void) | undefined;
        let settled = false;

        const cleanup = () => {
          settled = true;
          if (fallbackId !== undefined) window.clearInterval(fallbackId);
          if (safetyId !== undefined) window.clearTimeout(safetyId);
          removeProbe?.();
          signal?.removeEventListener("abort", onAbort);
        };

        // `satisfied` distinguishes "condition met" from "safety bound elapsed".
        const finish = (satisfied: boolean) => {
          if (settled) return;
          cleanup();
          resolve(satisfied);
        };

        const onAbort = () => {
          if (settled) return;
          cleanup();
          reject(new Error("battle phase wait cancelled"));
        };

        const evaluate = () => {
          if (settled || signal?.aborted) {
            if (signal?.aborted && !settled) onAbort();
            return;
          }
          const state = plugin.readState();
          if (predicate(state)) {
            confirmed += 1;
            if (confirmed >= confirmFrames) finish(true);
            return;
          }
          confirmed = 0;
          if (Date.now() - start > timeout) finish(false);
        };

        const onProbe = () => {
          lastProbeAt = Date.now();
          evaluate();
        };

        // Fallback: sample only while frames are stalled. When the probe is
        // healthy this is a no-op, keeping the probe the sole sampler.
        const onFallback = () => {
          if (Date.now() - lastProbeAt < stallThresholdMs) return;
          evaluate();
        };

        signal?.addEventListener("abort", onAbort);
        removeProbe = emulator.onFrameProbe(onProbe);
        fallbackId = window.setInterval(onFallback, fallbackInterval);
        safetyId = window.setTimeout(() => finish(false), timeout);
        evaluate();
      });
    },
    [plugin, emulator],
  );

  /**
   * Resolve once the executing battle round finishes (command entry or battle
   * over). Returns `true` if the round resolved to a usable phase, `false` if
   * the wait timed out (a stalled or missequenced battle the loop should report
   * rather than silently proceed on).
   */
  const waitForBattleRound = useCallback(
    (signal?: AbortSignal): Promise<boolean> => {
      return waitForBattlePhase(
        (state) => {
          const s = state as unknown as BattleStateLike;
          return !isRoundExecuting(s) && (isBattleOver(s) || isCommandEntryReady(s));
        },
        { signal },
      );
    },
    [waitForBattlePhase],
  );

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
      const userMessage = pendingMessageRef.current.trim() || undefined;
      return {
        gameId: game,
        playId,
        mode,
        state: pluginState,
        screenshot: getScreenshot?.(),
        options: plugin.availableCommands(pluginState, { actor }),
        actor,
        userMessage,
      };
    },
    [game, playId, plugin, getScreenshot],
  );

  /**
   * After a battle command macro, wait for the game condition that proves the
   * command landed: the actor's slot in the command buffer reads as queued,
   * the round started executing, command entry advanced, or the battle ended.
   * Short safety bound so a stub macro that did nothing cannot hang the loop.
   * Returns whether the command actually latched (vs the safety bound elapsing).
   */
  const waitForCommandLatch = useCallback(
    (actor: string | undefined, before: Record<string, unknown>): Promise<boolean> => {
      const beforeBattle = before as unknown as BattleStateLike;
      const wasExecuting = isRoundExecuting(beforeBattle);
      return waitForBattlePhase(
        (s) => {
          const b = s as unknown as BattleStateLike;
          if (isBattleOver(b)) return true;
          if (isRoundExecuting(b) && !wasExecuting) return true;
          if (!isRoundExecuting(b)) {
            if (wasExecuting) return true;
            if (isCommandEntryReady(b)) {
              const next = nextCommandableMember(b);
              if (!actor || next?.name !== actor) return true;
              const member = (b.ff1?.battle?.party ?? []).find((m) => m.name === actor);
              if (member && member.pendingAction !== undefined) return true;
            }
          }
          return false;
        },
        { confirmFrames: 1, timeoutMs: 2_000 },
      );
    },
    [waitForBattlePhase],
  );

  const executeCommand = useCallback(
    async (
      seq: number,
      ts: number,
      request: TurnRequest,
      response: TurnResponse,
      stateBefore?: string,
    ): Promise<TurnLogEntry> => {
      let macro: ButtonStep[];
      let macroError: string | undefined;
      try {
        macro = plugin.compile(response.command);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        response.error = message;
        macroError = message;
        macro = [];
      }

      // Start per-frame dialog capture before the macro runs.
      const capturePlugin = plugin as unknown as {
        resetDialogCapture?: () => void;
        captureDialogFrame?: () => void;
      };
      capturePlugin.resetDialogCapture?.();
      const probe = () => capturePlugin.captureDialogFrame?.();
      const removeProbe = emulator.onFrameProbe(probe);

      setIsPlayingMacro(true);
      await emulator.runMacro(macro);
      setIsPlayingMacro(false);

      // If a dialog box is open after the macro, keep sampling through the
      // settle delay so post-macro pages (e.g. the next page after
      // dialog_advance) are captured before persisting the step.
      // In battle mode, wait on the game condition - the issued command has
      // latched into the command buffer (or the round has started, or command
      // entry moved on) - instead of a fixed delay, so the after-state
      // snapshot never lands mid-transition. The dialog probe stays attached
      // during the wait so late dialog pages are still captured.
      let postState = plugin.readState();
      const postDialogOpen =
        (postState.ff1 as { dialog?: { open?: boolean } } | undefined)?.dialog?.open ?? false;
      if (request.mode === "battle") {
        await waitForCommandLatch(request.actor, postState);
        postState = plugin.readState();
      } else if (postDialogOpen) {
        await waitSettle();
        postState = plugin.readState();
      }
      removeProbe();

      const stateAfter = collectStates ? await saveStepState(seq, "after") : undefined;

      // Persist the captured dialog text on the step's state so it is saved
      // with the turn and visible to the agent next turn.
      const postDialog = (postState.ff1 as { dialog?: unknown } | undefined)?.dialog;
      if (postDialog) {
        (request.state as Record<string, unknown>).dialog = postDialog;
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
        ...(macroError !== undefined ? { error: macroError } : {}),
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
    [emulator, plugin, collectStates, saveStepState, persistStep, playId, waitSettle, waitForCommandLatch],
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
      let response: TurnResponse;
      try {
        response = await callAgent(request);
      } catch (err) {
        // A failed turn is still a turn: persist the request with the error so
        // the play history and the agent's recent-actions prompt section
        // reflect it. Dropping failures silently is what made the history
        // section never appear while the loop kept erroring.
        const message = err instanceof Error ? err.message : String(err);
        await persistFailedStep(seq, ts, request, message, stateBefore);
        throw err;
      }
      setLastResponse(response);
      if (response.error) {
        await persistFailedStep(seq, ts, request, response.error, stateBefore, response);
        throw new Error(response.error);
      }

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
    [buildRequest, callAgent, collectStates, executeCommand, persistFailedStep, saveStepState],
  );

  const runBattleRound = useCallback(
    async (opts?: { signal?: AbortSignal }): Promise<void> => {
      // Battle-state offsets are VERIFIED (see @games/ff1-state reader.ts
      // VERIFIED_BATTLE_NOTE). The remaining limitation is the compile stub for
      // battle actions: they do not yet navigate the actor/target/spell menus.
      // This loop trusts the state reader enough to call the agent once per active
      // party member index reported, and it guards against re-asking for the same
      // actor if the stub macro fails to advance the game's cursor.
      let state = plugin.readState();
      let guard = 0;

      // Reach a command-entry window (or battle end). Returns the fresh state,
      // or a stall reason string when the game never advanced to a usable phase
      // before a safety bound elapsed (as opposed to an abort/cancel, which
      // throws and is handled below). The distinction matters: a resolved wait
      // is progress, a timed-out wait must be surfaced, not silently ignored.
      type EntryResult =
        | { kind: "ready"; state: Record<string, unknown> }
        | { kind: "stall"; message: string }
        | { kind: "cancelled" };
      const waitForCommandEntry = async (): Promise<EntryResult> => {
        try {
          if (isRoundExecuting(state as unknown as BattleStateLike)) {
            const roundResolved = await waitForBattleRound(opts?.signal);
            state = plugin.readState();
            if (!roundResolved && !isBattleOver(state as unknown as BattleStateLike)) {
              return { kind: "stall", message: "battle round did not resolve before the safety timeout" };
            }
          }
          if (
            !isCommandEntryReady(state as unknown as BattleStateLike) &&
            !isBattleOver(state as unknown as BattleStateLike)
          ) {
            const reached = await waitForBattlePhase(
              (s) => {
                const b = s as unknown as BattleStateLike;
                return isCommandEntryReady(b) || isBattleOver(b);
              },
              { signal: opts?.signal },
            );
            state = plugin.readState();
            if (
              !reached &&
              !isBattleOver(state as unknown as BattleStateLike) &&
              !isCommandEntryReady(state as unknown as BattleStateLike)
            ) {
              return { kind: "stall", message: "battle never reached a command-entry window before the safety timeout" };
            }
          }
        } catch {
          // Aborted/cancelled wait: end the turn cleanly with no stall report.
          return { kind: "cancelled" };
        }
        return { kind: "ready", state };
      };

      // Condition-driven sequencing: ask the agent exactly when the game has
      // entered a corroborated command-entry window, for exactly the member
      // the command buffer says is still waiting. Between decisions the loop
      // waits on game conditions (next command entry / round resolved /
      // battle ended) sampled at frame boundaries, never on elapsed time.
      let lastActor: string | undefined;
      while (guard++ < 4) {
        if (isBattleOver(state as unknown as BattleStateLike)) break;

        const entry = await waitForCommandEntry();
        if (entry.kind === "cancelled") return;
        if (entry.kind === "stall") {
          setError(entry.message);
          return;
        }
        state = entry.state;
        if (isBattleOver(state as unknown as BattleStateLike)) break;
        if (!isCommandEntryReady(state as unknown as BattleStateLike)) continue;

        const member = nextCommandableMember(state as unknown as BattleStateLike);
        const actor = member?.name;
        if (!actor) {
          // Command entry is advertised but no living member is waiting for a
          // command (e.g. every member already queued, or a corroborated wipe
          // that the phase rules did not report as battleEnding). End the round
          // with a specific reason rather than spinning on safety timeouts.
          setError("battle command-entry window has no commandable member and the battle is not over");
          return;
        }
        // Do not re-ask for the same actor if the macro did not advance the
        // game (e.g. a compile stub that failed to latch the command buffer).
        if (actor === lastActor) break;
        lastActor = actor;

        const result = await decideAndMaybeExecute(state, "battle", actor);
        if (!("macro" in result)) {
          // Paused for step mode (PendingDecision has no macro field).
          return;
        }

        // The macro has been played and the after-state captured; re-read and
        // loop. If the queued command completed the round, waitForCommandEntry
        // drives the game-condition wait until the next command window or the
        // battle's end - this is what prevents the agent from being called
        // again while the round is still executing.
        state = plugin.readState();
      }
    },
    [plugin, decideAndMaybeExecute, waitForBattlePhase, waitForBattleRound],
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

    const controller = new AbortController();
    battleRoundAbortRef.current = controller;
    try {
      const state = plugin.readState();
      const mode = plugin.getMode(state);

      if (mode === "battle") {
        await runBattleRound({ signal: controller.signal });
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
      battleRoundAbortRef.current = null;
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
      // In step mode one approval = one executed turn. Do not continue the
      // battle round automatically. If the approved command completed the
      // round's command queue, wait on the game condition (command entry or
      // battle end, frame-sampled) before returning control to the user.
      let state = plugin.readState();
      if (
        plugin.getMode(state) === "battle" &&
        isRoundExecuting(state as unknown as BattleStateLike)
      ) {
        try {
          await waitForBattlePhase(
            (s) => {
              const b = s as unknown as BattleStateLike;
              return isCommandEntryReady(b) || isBattleOver(b);
            },
            { signal: battleRoundAbortRef.current?.signal },
          );
        } catch {
          // Cancelled wait: return control to the user.
        }
        state = plugin.readState();
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
  }, [pendingDecision, executeCommand, plugin, waitForBattlePhase]);

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
      try {
        await executeCommand(seq, ts, request, response, stateBefore);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      }
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
