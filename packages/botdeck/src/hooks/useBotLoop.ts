import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectedState } from "@/emulator/collectState";
import type { Emulator } from "@/emulator/emulator";
import { fetchDiff, postState, stepsUrl } from "@/play";
import {
  isBattleOver,
  isCommandEntryReady,
  isInBattle,
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

/** What the loop observed during the most recent settling sample. */
export type SettlingInfo =
  | { phase: "floor" }
  | { phase: "stable"; stableFrames: number; confirmFrames: number; signature: string };

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
  /** Minimum wait after every macro before checking game state. Gives the
   *  game time to start a transition before we sample it. */
  settleDelayMs?: number;
  /** Timeout for the POST /api/turn fetch, in milliseconds. */
  turnTimeoutMs?: number;
  /** Consecutive stable frames required to declare a transition settled. */
  transitionConfirmFrames?: number;
  /** Safety bound (ms) for the post-transition condition wait. */
  transitionTimeoutMs?: number;
}

export interface UseBotLoopResult {
  isThinking: boolean;
  isPlayingMacro: boolean;
  /** The loop is waiting for the game to settle (post-macro floor, state-stability
   *  condition wait, or inter-turn scheduler gap). Not calling the LLM. */
  isSettling: boolean;
  /** A battle turn is in flight and the game is animating/waiting, NOT calling the LLM. */
  isBattling: boolean;
  /** What isSettling is currently observing (signature, stable-frame count, etc). */
  settlingInfo: SettlingInfo | null;
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
  /** Stop auto-run and cancel the in-flight agent turn, if any. */
  abortAgent: () => void;
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
  const transitionConfirmFrames = options.transitionConfirmFrames ?? 3;
  const transitionTimeoutMs = options.transitionTimeoutMs ?? 3_000;
  const turnTimeoutMs = options.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
  const collectStates = options.collectStates ?? true;

  const [isThinking, setIsThinking] = useState(false);
  const [isPlayingMacro, setIsPlayingMacro] = useState(false);
  /** True while the loop is waiting for the game to settle (post-macro floor,
   *  state-stability condition wait, or inter-turn scheduler gap). Distinguished
   *  from isThinking so the pill reflects real lifecycle state, not a coarse
   *  "we're busy" flag. */
  const [isSettling, setIsSettling] = useState(false);
  /** What the settling check is currently observing - surfaced in the UI so the
   *  wait is debuggable. Updates only while isSettling is true. */
  const [settlingInfo, setSettlingInfo] = useState<SettlingInfo | null>(null);
  const [isBattling, setIsBattling] = useState(false);
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
  const turnAbortRef = useRef<AbortController | null>(null);
  const battleStallsRef = useRef(0);

  useEffect(() => {
    autoRunRef.current = autoRun;
  }, [autoRun]);

  useEffect(() => {
    runModeRef.current = runMode;
  }, [runMode]);

  useEffect(() => {
    pendingMessageRef.current = pendingMessage;
  }, [pendingMessage]);

  // If the user stops auto-run while a turn is in flight, abort the turn's
  // pending fetch and battle-phase waits. Macro playback is cancelled in
  // executeCommand via the same signal, and redundantly here for immediacy.
  useEffect(() => {
    if (!autoRun && turnAbortRef.current) {
      turnAbortRef.current.abort();
      emulator.cancelMacro();
    }
  }, [autoRun, emulator]);

  // Keep macro status in sync with the emulator without polling every frame.
  useEffect(() => {
    const id = window.setInterval(() => setIsPlayingMacro(emulator.isPlayingMacro()), 50);
    return () => window.clearInterval(id);
  }, [emulator]);

  const persistStep = useCallback(
    async (record: StepRecord, signal?: AbortSignal) => {
      const res = await fetch(stepsUrl(playId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
        signal: signal ?? null,
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
    signal?: AbortSignal,
  ) => Promise<string | undefined> = useCallback(
    async (seq, when, signal) => {
      if (!collect) return undefined;
      const snapshot = collect();
      if (!snapshot) return undefined;
      const result = await postState(
        playId,
        snapshot,
        `step_${String(seq).padStart(6, "0")}_${when}`,
        signal,
      );
      return result.statePath;
    },
    [collect, playId],
  );

  const waitSettle = useCallback((): Promise<void> => {
    setIsSettling(true);
    setSettlingInfo({ phase: "floor" });
    return new Promise((resolve) =>
      window.setTimeout(() => {
        setIsSettling(false);
        setSettlingInfo(null);
        resolve();
      }, settleDelayMs),
    );
  }, [settleDelayMs]);

  /**
   * Condition-based wait for the game state to become stable. Samples readState()
   * at every emulated frame boundary via onFrameProbe. Computes a signature
   * (mode + map + location + player position) and resolves once that signature
   * has been unchanged for `transitionConfirmFrames` consecutive frames.
   *
   * This catches transitions that START late (game processing a door/stair
   * animation for many frames after the macro's last button press) as well as
   * transitions already in flight. The `settleDelayMs` floor is still applied
   * before this in the calling code as a minimum before we start sampling.
   */
  const waitForStateStable = useCallback(
    (signal?: AbortSignal): Promise<boolean> => {
      const confirmFrames = transitionConfirmFrames;
      const timeout = transitionTimeoutMs;
      const start = Date.now();
      let prevSig = "";
      let stableCount = 0;
      setIsSettling(true);
      setSettlingInfo({ phase: "stable", stableFrames: 0, confirmFrames, signature: "" });

      const stateSignature = (state: Record<string, unknown>): string => {
        const mode = plugin.getMode(state);
        const ff1 = (state as { ff1?: Record<string, unknown> }).ff1;
        const world = (ff1?.world ?? {}) as Record<string, unknown>;
        const loc = (world.location ?? {}) as Record<string, unknown>;
        return `${mode}|${world.mapId ?? ""}|${loc.currentName ?? ""}|${world.playerTile ?? ""}`;
      };

      return new Promise<boolean>((resolve, reject) => {
        let settled = false;
        let safetyId: number | undefined;
        let removeProbe: (() => void) | undefined;

        const cleanup = () => {
          settled = true;
          if (safetyId !== undefined) window.clearTimeout(safetyId);
          removeProbe?.();
          signal?.removeEventListener("abort", onAbort);
          setIsSettling(false);
          setSettlingInfo(null);
        };

        const finish = (satisfied: boolean) => {
          if (settled) return;
          cleanup();
          resolve(satisfied);
        };

        const onAbort = () => {
          if (settled) return;
          cleanup();
          reject(new Error("state stability wait cancelled"));
        };

        const evaluate = () => {
          if (settled || signal?.aborted) {
            if (signal?.aborted && !settled) onAbort();
            return;
          }
          const sig = stateSignature(plugin.readState());
          if (sig === prevSig) {
            stableCount += 1;
            if (stableCount >= confirmFrames) { finish(true); return; }
          } else {
            stableCount = 0;
            prevSig = sig;
          }
          setSettlingInfo({
            phase: "stable",
            stableFrames: stableCount,
            confirmFrames,
            signature: sig,
          });
          if (Date.now() - start > timeout) finish(false);
        };

        signal?.addEventListener("abort", onAbort);
        // Seed the initial signature so the first probe can detect change.
        prevSig = stateSignature(plugin.readState());
        removeProbe = emulator.onFrameProbe(evaluate);
        safetyId = window.setTimeout(() => finish(false), timeout);
        evaluate();
      });
    },
    [plugin, emulator, transitionConfirmFrames, transitionTimeoutMs],
  );

  /** Record a turn that never produced a playable command, so history is complete. */
  const persistFailedStep = useCallback(
    async (
      seq: number,
      ts: number,
      request: TurnRequest,
      message: string,
      stateBefore?: string,
      response?: TurnResponse,
      signal?: AbortSignal,
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
        await persistStep(record, signal);
      } catch (persistErr) {
        if (signal?.aborted) return;
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
    async (signal?: AbortSignal): Promise<boolean> => {
      // Round processing: every member's queued action is resolving. This is
      // the one battle phase the "battling" pill should cover - not the
      // per-member command-entry windows or the LLM calls in between.
      setIsBattling(true);
      try {
        return await waitForBattlePhase(
          (state) => {
            const s = state as unknown as BattleStateLike;
            return !isRoundExecuting(s) && (isBattleOver(s) || isCommandEntryReady(s));
          },
          { signal },
        );
      } finally {
        setIsBattling(false);
      }
    },
    [waitForBattlePhase],
  );

  /**
   * Drive an open NPC/object dialog to completion: press A page by page
   * (like `dismissBattleEnd` does for the victory sequence) until the dialog
   * text disappears, while the per-frame dialog capture probe accumulates
   * every page. The collected pages land in the post-turn state's `dialog`
   * and are surfaced to the agent on the next turn.
   *
   * Multi-page dialogs blank briefly between pages, so a single empty read
   * is not proof of closure: the box is treated as closed only after two
   * consecutive settles with no text.
   */
  const driveDialogToCompletion = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const maxPresses = 24;
      let blankReads = 0;
      for (let presses = 0; presses < maxPresses; presses++) {
        const state = plugin.readState();
        const dialog = (state.ff1 as { dialog?: { current?: string } } | undefined)?.dialog;
        if ((dialog?.current ?? "").trim() === "") {
          blankReads += 1;
          if (blankReads >= 2) return;
          await waitSettle();
          continue;
        }
        blankReads = 0;
        // A during typewriter completes the page, A on a full page advances,
        // A on the last page closes the box. `interact` is a single A press.
        await emulator.runMacro(plugin.compile({ name: "interact" }));
        if (signal?.aborted) return;
        await waitSettle();
      }
      setError("dialog did not close after 24 A presses; the game appears stuck");
      setAutoRunState(false);
    },
    [plugin, emulator, waitSettle],
  );

  const callAgent = useCallback(
    async (request: TurnRequest, signal?: AbortSignal): Promise<TurnResponse> => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), turnTimeoutMs);

      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort);

      setIsThinking(true);
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
        setIsThinking(false);
        window.clearTimeout(timeoutId);
        signal?.removeEventListener("abort", onAbort);
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
    (
      actor: string | undefined,
      before: Record<string, unknown>,
      signal?: AbortSignal,
    ): Promise<boolean> => {
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
        { confirmFrames: 1, timeoutMs: 2_000, signal },
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
      signal?: AbortSignal,
    ): Promise<TurnLogEntry> => {
      // Clear any previous travel route so the nav display disappears once
      // a non-navigation command is issued. Navigation commands (goto, grind,
      // talk_to) will re-set it during compile below.
      emulator.setLastRoute(undefined);

      let macro: ButtonStep[];
      let macroError: string | undefined;
      try {
        macro = plugin.compile(response.command);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        response.error = message;
        macroError = message;
        macro = [];
        // Feedback loop: the turn still ran, but the macro did nothing. Inject
        // a one-shot user message so the agent's next turn corrects its
        // arguments instead of silently repeating a command that fails to
        // compile with the same invalid arguments.
        setPendingMessage(
          `Your previous command "${response.command.name}" failed at compile time: ${message} ` +
            "Do not repeat it. Choose a command from the available options with valid arguments, using the state's listed options.",
        );
      }

      // Long travel macros assume the game stays on the field. Let the plugin
      // abort them the frame it leaves (random battle, town entrance), so the
      // remaining presses are not spent in the battle menu and control comes
      // back to the agent on the next turn. Compute the predicate before
      // registering probes so a throwing plugin cannot leak them.
      const abort = plugin.macroAbort?.(response.command);

      // Start per-frame dialog capture before the macro runs.
      const capturePlugin = plugin as unknown as {
        resetDialogCapture?: () => void;
        captureDialogFrame?: () => void;
      };
      capturePlugin.resetDialogCapture?.();
      const probe = () => capturePlugin.captureDialogFrame?.();
      const removeProbe = emulator.onFrameProbe(probe);

      const onAbort = () => {
        emulator.cancelMacro();
      };
      signal?.addEventListener("abort", onAbort);

      let postState: Record<string, unknown> | undefined;
      setIsPlayingMacro(true);
      try {
        await emulator.runMacro(macro, abort);
        if (signal?.aborted) {
          throw new Error("turn cancelled");
        }
        if (emulator.wasMacroInterrupted()) {
          console.log(`step ${seq}: macro aborted early by the game (battle or transition)`);
        }
        setIsPlayingMacro(false);

        // Post-macro settling: battle uses its own condition-based latch.
        // Field/interior turns: settle floor first (gives the game time to
        // START a transition), then condition-wait if still transitioning.
        if (request.mode === "battle") {
          postState = plugin.readState();
          await waitForCommandLatch(request.actor, postState, signal);
          postState = plugin.readState();
          setIsBattling(isRoundExecuting(postState as unknown as BattleStateLike));
        } else {
          await waitSettle();
          postState = plugin.readState();
          const postDialogOpen =
            (postState.ff1 as { dialog?: { open?: boolean } } | undefined)?.dialog?.open ?? false;
          // dialog.open is nametable-derived, so menu text (shops, field
          // menus) can also satisfy it. Only commands that actually produce
          // NPC/object dialog are allowed to trigger the paging loop, and
          // never inside a shop/menu context - an A press there is a
          // purchase/selection, not a page advance.
          const dialogCommand = ["talk_to", "interact", "dialog_advance"].includes(
            response.command.name,
          );
          const inShopOrMenu =
            (postState.ff1 as
              | { menu?: { enteringShop?: boolean; open?: boolean } }
              | undefined)?.menu?.enteringShop === true ||
            (postState.ff1 as
              | { menu?: { enteringShop?: boolean; open?: boolean } }
              | undefined)?.menu?.open === true;
          if (postDialogOpen && dialogCommand && !inShopOrMenu) {
            // An NPC/object dialog opened (talk_to, interact, pick-up, ...).
            // Page through it to completion while the capture probe records
            // every page, so the full text reaches the agent next turn.
            await driveDialogToCompletion(signal);
            postState = plugin.readState();

            const dialog = (postState.ff1 as
              | { dialog?: { pages?: string[]; current?: string } }
              | undefined)?.dialog;
            const transcript = [...(dialog?.pages ?? []), dialog?.current ?? ""]
              .map((p) => p.trim())
              .filter((p) => p !== "")
              .join(" / ");
            if (transcript !== "") {
              const args = Object.entries(response.command.args ?? {})
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(", ");
              setPendingMessage(
                `Dialog from your previous command "${response.command.name}"` +
                  (args !== "" ? ` (${args})` : "") +
                  `:\n"${transcript.slice(0, 2000)}"`,
              );
            }
          } else {
            await waitForStateStable(signal);
            postState = plugin.readState();
          }
        }
      } finally {
        signal?.removeEventListener("abort", onAbort);
        removeProbe();
      }

      const stateAfter = collectStates ? await saveStepState(seq, "after", signal) : undefined;

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
      await persistStep(record, signal);

      let diff: Record<string, unknown> | undefined;
      if (collectStates && stateBefore && stateAfter) {
        try {
          diff = await fetchDiff(playId, stateBefore, stateAfter, signal);
        } catch (diffErr) {
          if (!signal?.aborted) console.warn(`step ${seq} diff failed:`, diffErr);
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
    [emulator, plugin, collectStates, saveStepState, persistStep, playId, waitSettle, waitForCommandLatch, waitForStateStable, driveDialogToCompletion, setPendingMessage],
  );

  const decideAndMaybeExecute = useCallback(
    async (
      pluginState: Record<string, unknown>,
      mode: string,
      actor?: string,
      signal?: AbortSignal,
    ): Promise<TurnLogEntry | PendingDecision> => {
      const seq = (seqRef.current += 1);
      const ts = Date.now();
      const stateBefore = collectStates ? await saveStepState(seq, "before", signal) : undefined;

      const request = buildRequest(pluginState, mode, actor);
      setLastRequest(request);
      let response: TurnResponse;
      try {
        response = await callAgent(request, signal);
      } catch (err) {
        // A user-cancelled turn is not a failed turn; do not persist it.
        if (signal?.aborted) {
          throw new Error("turn cancelled");
        }
        // A failed turn is still a turn: persist the request with the error so
        // the play history and the agent's recent-actions prompt section
        // reflect it. Dropping failures silently is what made the history
        // section never appear while the loop kept erroring.
        const message = err instanceof Error ? err.message : String(err);
        await persistFailedStep(seq, ts, request, message, stateBefore, undefined, signal);
        throw err;
      }
      setLastResponse(response);
      if (response.error) {
        await persistFailedStep(seq, ts, request, response.error, stateBefore, response, signal);
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

      return executeCommand(seq, ts, request, response, stateBefore, signal);
    },
    [buildRequest, callAgent, collectStates, executeCommand, persistFailedStep, saveStepState],
  );

  /**
   * A coarse signature of the battle's progress-relevant state. Two turns
   * with the same signature means nothing the loop did changed the game:
   * commands are not latching, waits are not resolving, or the game is
   * frozen. Progress is judged on state change, never on elapsed time.
   */
  const battleSignature = useCallback(
    (state: Record<string, unknown>): string => {
      const b = (state as unknown as BattleStateLike).ff1?.battle;
      if (!b) return "";
      return JSON.stringify({
        phase: b.phase,
        next: b.nextCommandableIndex,
        queued: (b.party ?? []).map((m) => (m.pendingAction !== undefined ? 1 : 0)),
        partyHp: (b.party ?? []).map((m) => m.hp),
        enemyHp: (b.enemies ?? []).map((e) => e.hp),
      });
    },
    [],
  );

  /**
   * The victory/defeat sequence (result message, EXP/GIL, level-up pages) is
   * part of the battle screen and advances on A presses. Nothing else in the
   * loop presses A, so without this the game parks at battleEnding forever
   * and every turn is a no-op. Each press is confirmed by an actual state
   * change; a game that stops changing is reported as a stall, not spun on.
   */
  const dismissBattleEnd = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      const maxPresses = 12;
      for (let presses = 0; presses < maxPresses; presses++) {
        const before = plugin.readState();
        if (!isInBattle(before as unknown as BattleStateLike)) return;
        const beforeSig = battleSignature(before);
        await emulator.runMacro(plugin.compile({ name: "interact" }));
        const changed = await waitForBattlePhase(
          (s) =>
            !isInBattle(s as unknown as BattleStateLike) || battleSignature(s) !== beforeSig,
          { signal, timeoutMs: 10_000 },
        );
        if (!changed) {
          setError("battle-end sequence is not advancing on A presses; the game appears stuck");
          setAutoRunState(false);
          return;
        }
      }
      if (isInBattle(plugin.readState() as unknown as BattleStateLike)) {
        setError("battle-end sequence did not finish after 12 A presses");
        setAutoRunState(false);
      }
    },
    [plugin, emulator, waitForBattlePhase, battleSignature],
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

      // The battle outcome is decided but the game is still on the battle
      // screen: dismiss the victory/defeat pages instead of ending the turn
      // as a no-op.
      if (
        isBattleOver(state as unknown as BattleStateLike) &&
        isInBattle(state as unknown as BattleStateLike)
      ) {
        await dismissBattleEnd(opts?.signal);
        return;
      }

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

        const result = await decideAndMaybeExecute(state, "battle", actor, opts?.signal);
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
    setError(undefined);

    const controller = new AbortController();
    turnAbortRef.current = controller;
    try {
      // Wait for the game to finish any in-progress transition before reading
      // state for the agent prompt. Without this the agent sees stale pre-
      // transition data (old map, old location) when a macro triggered a
      // screen change that hasn't settled yet. The settle floor comes first
      // so the game has time to begin the transition before we sample stability.
      await waitSettle();
      await waitForStateStable(controller.signal);

      const state = plugin.readState();
      const mode = plugin.getMode(state);
      // The battling pill tracks live round processing (waitForBattleRound /
      // executeCommand), not mere battle mode. Reset it at turn start.
      setIsBattling(false);

      if (mode === "battle") {
        // Progress is judged on game state, not wall time: a battle turn that
        // leaves the battle signature byte-identical accomplished nothing
        // (command not latching, wait not resolving, frozen game). Stop after
        // repeated no-op turns instead of burning agent calls forever.
        const beforeSig = battleSignature(state);
        await runBattleRound({ signal: controller.signal });
        const afterSig = battleSignature(plugin.readState());
        if (afterSig === beforeSig && isInBattle(plugin.readState() as unknown as BattleStateLike)) {
          battleStallsRef.current += 1;
          if (battleStallsRef.current >= 3) {
            battleStallsRef.current = 0;
            throw new Error(
              "battle is not progressing: game state unchanged across 3 turns (a command is likely failing to latch)",
            );
          }
        } else {
          battleStallsRef.current = 0;
        }
      } else {
        await decideAndMaybeExecute(state, mode, undefined, controller.signal);
      }

      // Clear the injected user message once consumed.
      if (pendingMessageRef.current) {
        setPendingMessage("");
      }
    } catch (err) {
      // User-initiated stop (the abort signal reached a fetch, a phase wait,
      // or the macro): not an error, leave autoRun off and report nothing.
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "turn cancelled") {
        return;
      }
      setError(msg);
      setAutoRunState(false);
    } finally {
      turnAbortRef.current = null;
      setIsThinking(false);
      setIsPlayingMacro(false);
      setIsBattling(false);
      runningRef.current = false;
    }
  }, [emulator, plugin, runBattleRound, decideAndMaybeExecute, waitSettle, waitForStateStable]);

  const executePending = useCallback(async () => {
    const pending = pendingDecision;
    if (!pending) return;
    // Own the turn guard for the duration of the approval execution so the
    // finally block cannot clear another turn's guard and the auto-run
    // scheduler cannot interleave a second execution.
    if (runningRef.current) return;
    runningRef.current = true;
    setPendingDecision(undefined);

    const controller = new AbortController();
    turnAbortRef.current = controller;
    try {
      await executeCommand(
        pending.seq,
        pending.ts,
        pending.request,
        pending.response,
        pending.stateBefore,
        controller.signal,
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
        setIsBattling(true);
        try {
          await waitForBattlePhase(
            (s) => {
              const b = s as unknown as BattleStateLike;
              return isCommandEntryReady(b) || isBattleOver(b);
            },
            { signal: controller.signal },
          );
        } catch {
          // Cancelled wait: return control to the user.
        }
        state = plugin.readState();
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "turn cancelled") {
        return;
      }
      setError(msg);
      setAutoRunState(false);
    } finally {
      turnAbortRef.current = null;
      setIsThinking(false);
      setIsPlayingMacro(false);
      setIsBattling(false);
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

  const abortAgent = useCallback(() => {
    setAutoRunState(false);
    turnAbortRef.current?.abort();
    emulator.cancelMacro();
  }, [emulator]);

  const runManualCommand = useCallback(
    async (command: GameCommand) => {
      if (!emulator.hasRomLoaded() || !emulator.isRunning()) {
        setError("emulator is not running");
        return;
      }
      // A manual command plays its macro through the same runner as the
      // agent's; starting one while a turn is live would cancel the turn's
      // macro mid-playback and silently corrupt its after-state. Refuse
      // instead of interleaving.
      if (runningRef.current) {
        setError("an agent turn is in progress; stop it before issuing manual commands");
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
      if (runningRef.current) {
        setError("an agent turn is in progress; stop it before issuing manual input");
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
    isSettling,
    settlingInfo,
    isBattling,
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
    abortAgent,
    runManualCommand,
    runManualMacro,
    pendingMessage,
    setPendingMessage,
  };
}
