import { useState } from "react";
import type { PendingDecision, TurnLogEntry } from "@/hooks/useBotLoop";
import type { GameCommand, PlaySnippet, TurnRequest, TurnResponse, TurnTranscript, TurnTranscriptRound, ToolCall, ToolResult } from "@/types";
import { parsePlayId, snippetUrl, snippetsUrl } from "@/play";
import { SectionTitle } from "./shared";

interface AgentTabProps {
  isThinking?: boolean;
  isPlayingMacro?: boolean;
  error?: string;
  lastRequest?: TurnRequest;
  lastResponse?: TurnResponse;
  messages?: TurnLogEntry[];
  autoRun?: boolean;
  onAutoRunChange?: (value: boolean) => void;
  runMode?: "auto" | "step";
  onRunModeChange?: (value: "auto" | "step") => void;
  onStep?: () => void;
  pendingDecision?: PendingDecision;
  onExecutePending?: () => void;
  onClearPending?: () => void;
  playId?: string;
  onRunSnippet?: (snippet: PlaySnippet) => void;
  snippetPaused?: boolean;
  onPauseSnippet?: () => void;
  onStopSnippet?: () => void;
  onManualCommand?: (command: GameCommand) => void;
  pendingMessage?: string;
  onPendingMessageChange?: (value: string) => void;
}

function StatusBadge({
  isThinking,
  isPlayingMacro,
  error,
}: {
  isThinking?: boolean;
  isPlayingMacro?: boolean;
  error?: string;
}) {
  if (error) {
    return (
      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">
        error
      </span>
    );
  }
  if (isPlayingMacro) {
    return (
      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
        playing macro
      </span>
    );
  }
  if (isThinking) {
    return (
      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">
        thinking
      </span>
    );
  }
  return (
    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
      idle
    </span>
  );
}

function JsonBlock({ value, maxHeight }: { value: unknown; maxHeight?: string }) {
  return (
    <pre
      className="overflow-auto rounded bg-neutral-950 p-2 text-xs text-neutral-300"
      style={{ maxHeight: maxHeight ?? "200px" }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function ToolCallBubble({ call }: { call: ToolCall }) {
  return (
    <div data-testid="tool-call-bubble" className="rounded bg-blue-900/20 p-2">
      <p className="text-xs font-medium text-blue-300">tool call: {call.name}</p>
      {call.input && <JsonBlock value={call.input} maxHeight="120px" />}
    </div>
  );
}

function ToolResultBubble({ result }: { result: ToolResult }) {
  return (
    <div data-testid="tool-result-bubble" className={`rounded p-2 ${result.error ? "bg-rose-900/20" : "bg-emerald-900/20"}`}>
      <p className={`text-xs font-medium ${result.error ? "text-rose-300" : "text-emerald-300"}`}>
        tool result: {result.name} {result.error ? "(error)" : ""}
      </p>
      {result.error ? (
        <p className="text-xs text-rose-300">{result.error}</p>
      ) : (
        <JsonBlock value={result.result} maxHeight="120px" />
      )}
    </div>
  );
}

function TranscriptView({ transcript }: { transcript: TurnTranscript }) {
  return (
    <div className="flex flex-col gap-2">
      {transcript.system && (
        <details className="rounded bg-neutral-900">
          <summary className="cursor-pointer px-2 py-1 text-xs text-neutral-500">system prompt</summary>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap p-2 text-xs text-neutral-400">
            {transcript.system}
          </pre>
        </details>
      )}
      {transcript.user && (
        <details className="rounded bg-neutral-900">
          <summary className="cursor-pointer px-2 py-1 text-xs text-neutral-500">user prompt</summary>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap p-2 text-xs text-neutral-400">
            {transcript.user}
          </pre>
        </details>
      )}
      {transcript.rounds.map((round, idx) => (
        <TranscriptRoundView key={idx} round={round} />
      ))}
    </div>
  );
}

function ToolCallResultPair({ call, result }: { call: ToolCall; result?: ToolResult }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-blue-900/30 bg-blue-950/10 p-2">
      <ToolCallBubble call={call} />
      {result && <ToolResultBubble result={result} />}
    </div>
  );
}

function TranscriptRoundView({ round }: { round: TurnTranscriptRound }) {
  const resultsById = new Map(round.toolResults?.map((r) => [r.id, r]) ?? []);
  const hasToolCalls = round.toolCalls && round.toolCalls.length > 0;
  const hasAssistantText = round.assistantText && round.assistantText.trim().length > 0;

  return (
    <div className="flex flex-col gap-1">
      {(hasAssistantText || hasToolCalls) && (
        <div className="rounded bg-neutral-800 p-2">
          <p className="text-xs font-medium text-neutral-500">assistant</p>
          {hasAssistantText ? (
            <pre className="whitespace-pre-wrap text-xs text-neutral-300">{round.assistantText}</pre>
          ) : (
            <p className="text-xs italic text-neutral-500">(called tools)</p>
          )}
        </div>
      )}
      {hasToolCalls && (
        <div className="flex flex-col gap-1">
          {round.toolCalls!.map((call) => (
            <ToolCallResultPair key={call.id} call={call} result={resultsById.get(call.id)} />
          ))}
        </div>
      )}
      {round.toolResults && round.toolResults.length > 0 && (
        <div className="flex flex-col gap-1">
          {round.toolResults
            .filter((result) => !round.toolCalls?.some((call) => call.id === result.id))
            .map((result) => (
              <ToolResultBubble key={result.id} result={result} />
            ))}
        </div>
      )}
      {round.parseError && (
        <div className="rounded bg-rose-900/20 p-2">
          <p className="text-xs font-medium text-rose-300">parse error</p>
          <p className="text-xs text-rose-300">{round.parseError}</p>
          {round.correction && (
            <div className="mt-1">
              <p className="text-xs font-medium text-amber-300">retry prompt</p>
              <pre className="whitespace-pre-wrap text-xs text-neutral-400">{round.correction}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ManualCommandInput({
  onRun,
  disabled,
}: {
  onRun?: (command: GameCommand) => void;
  disabled?: boolean;
}) {
  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState<string | undefined>();

  const run = () => {
    setParseError(undefined);
    if (!raw.trim()) return;
    try {
      const parsed = JSON.parse(raw) as GameCommand;
      if (typeof parsed.name !== "string") {
        setParseError("command must have a string 'name'");
        return;
      }
      onRun?.(parsed);
      setRaw("");
    } catch {
      setParseError("invalid JSON command object");
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-neutral-500">Manual command (JSON)</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder='{"name":"fight","args":{"actor":"Fighter","target":"enemy_1"}}'
          disabled={disabled}
          className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={run}
          disabled={disabled || !raw.trim()}
          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Run
        </button>
      </div>
      {parseError && <p className="text-xs text-rose-400">{parseError}</p>}
    </div>
  );
}

function SnippetDropdown({
  playId,
  disabled,
  onRun,
}: {
  playId?: string;
  disabled?: boolean;
  onRun?: (snippet: PlaySnippet) => void;
}) {
  const [snippets, setSnippets] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlaySnippet | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadSnippets = () => {
    if (!playId) return;
    if (snippets.length > 0) {
      setOpen((v) => !v);
      return;
    }
    setLoading(true);
    fetch(snippetsUrl(playId))
      .then(async (r) => {
        if (!r.ok) throw new Error(`list snippets failed: ${r.status}`);
        return (await r.json()) as { id: string; name: string }[];
      })
      .then((list) => {
        setSnippets(list);
        setError(undefined);
        setOpen(true);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  const selectSnippet = (id: string) => {
    setSelected(id);
    fetch(snippetUrl(playId!, id))
      .then(async (r) => {
        if (!r.ok) throw new Error(`read snippet failed: ${r.status}`);
        return (await r.json()) as PlaySnippet;
      })
      .then((s) => setDetail(s))
      .catch((e) => setError(String(e)));
  };

  return (
    <div className="relative">
      <button
        onClick={loadSnippets}
        disabled={disabled || !playId || !onRun}
        className="rounded bg-neutral-700 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-600 disabled:opacity-50"
      >
        {loading ? "loading..." : "snippets"}
      </button>
      {error && <p className="mt-1 text-xs text-rose-400">{error}</p>}
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded border border-neutral-700 bg-neutral-800 p-2 shadow-lg">
          {snippets.length === 0 ? (
            <p className="text-xs text-neutral-500">no snippets</p>
          ) : (
            <>
              <select
                value={selected ?? ""}
                onChange={(e) => selectSnippet(e.target.value)}
                className="w-full rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-100 outline-none"
              >
                <option value="">select snippet...</option>
                {snippets.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {detail && (
                <div className="mt-2 text-xs text-neutral-400">
                  <p>{detail.description}</p>
                  <p className="mt-1 text-neutral-500">
                    start: <span className="text-neutral-300">{detail.startState}</span>
                  </p>
                  <button
                    onClick={() => {
                      setOpen(false);
                      onRun?.(detail);
                    }}
                    disabled={disabled}
                    className="mt-2 w-full rounded bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Run
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function AgentTab({
  isThinking,
  isPlayingMacro,
  error,
  lastRequest,
  lastResponse,
  messages = [],
  autoRun,
  onAutoRunChange,
  runMode = "auto",
  onRunModeChange,
  onStep,
  pendingDecision,
  onExecutePending,
  onClearPending,
  playId,
  onRunSnippet,
  snippetPaused,
  onPauseSnippet,
  onStopSnippet,
  onManualCommand,
  pendingMessage = "",
  onPendingMessageChange,
}: AgentTabProps) {
  const [tab, setTab] = useState<"request" | "response" | "log">("response");
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  const toggleTurn = (seq: number) => {
    setExpandedTurns((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  };

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge isThinking={isThinking} isPlayingMacro={isPlayingMacro} error={error} />
        <div className="flex items-center gap-2">
          <SnippetDropdown playId={playId} disabled={isPlayingMacro || isThinking} onRun={onRunSnippet} />
          <button
            onClick={onPauseSnippet}
            disabled={!onPauseSnippet}
            className="rounded bg-neutral-700 px-2 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-600 disabled:opacity-50"
          >
            {snippetPaused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={onStopSnippet}
            disabled={!onStopSnippet}
            className="rounded bg-rose-700 px-2 py-1 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50"
          >
            Stop
          </button>
          <div className="flex rounded border border-neutral-700 bg-neutral-800 p-0.5">
            <button
              onClick={() => onRunModeChange?.("auto")}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                runMode === "auto"
                  ? "bg-emerald-600 text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Auto
            </button>
            <button
              onClick={() => onRunModeChange?.("step")}
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                runMode === "step"
                  ? "bg-emerald-600 text-white"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              Step
            </button>
          </div>
          {runMode === "auto" ? (
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={autoRun}
                onChange={(e) => onAutoRunChange?.(e.target.checked)}
                disabled={!onAutoRunChange}
                className="rounded border-neutral-600 bg-neutral-700 text-emerald-500 focus:ring-0"
              />
              Auto
            </label>
          ) : (
            <button
              data-testid="agent-step-action"
              onClick={onStep}
              disabled={isThinking || isPlayingMacro || !onStep || !!pendingDecision}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Step
            </button>
          )}
        </div>
      </div>

      {pendingDecision && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-amber-200">
              Pending {pendingDecision.actor ? `· ${pendingDecision.actor}` : ""}
            </span>
            <span className="text-xs text-neutral-400">{pendingDecision.command.name}</span>
          </div>
          {pendingDecision.command.args && (
            <JsonBlock value={pendingDecision.command.args} maxHeight="80px" />
          )}
          <div className="mt-2 flex gap-2">
            <button
              data-testid="pending-run"
              onClick={onExecutePending}
              disabled={isPlayingMacro || isThinking}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Run
            </button>
            <button
              onClick={onClearPending}
              className="rounded bg-neutral-700 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs text-neutral-500">
          Message injected into next turn state
        </label>
        <input
          type="text"
          value={pendingMessage}
          onChange={(e) => onPendingMessageChange?.(e.target.value)}
          placeholder="optional note injected into plugin state..."
          className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
      </div>

      <ManualCommandInput onRun={onManualCommand} disabled={isPlayingMacro || isThinking} />

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <div className="flex gap-1 border-b border-neutral-800 pb-1">
        {(["response", "request", "log"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              tab === t
                ? "bg-neutral-700 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "request" && (
          <div className="flex flex-col gap-2">
            <SectionTitle>Turn Request</SectionTitle>
            {lastRequest ? (
              <JsonBlock value={lastRequest} />
            ) : (
              <p className="text-xs text-neutral-500">No request yet.</p>
            )}
          </div>
        )}

        {tab === "response" && (
          <div className="flex flex-col gap-3">
            {lastResponse ? (
              <>
                <div>
                  <SectionTitle>Chosen Command</SectionTitle>
                  <JsonBlock value={lastResponse.command} />
                </div>
                {lastResponse.reason && (
                  <div>
                    <SectionTitle>Reason</SectionTitle>
                    <p className="text-xs text-neutral-300">{lastResponse.reason}</p>
                  </div>
                )}
                {lastResponse.prompt && (
                  <div>
                    <SectionTitle>Prompt</SectionTitle>
                    {lastResponse.prompt.system && (
                      <div className="mb-2">
                        <h4 className="text-xs text-neutral-500">system</h4>
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-xs text-neutral-300">
                          {lastResponse.prompt.system}
                        </pre>
                      </div>
                    )}
                    {lastResponse.prompt.user && (
                      <div>
                        <h4 className="text-xs text-neutral-500">user</h4>
                        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-xs text-neutral-300">
                          {lastResponse.prompt.user}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
                {lastResponse.raw && (
                  <div>
                    <SectionTitle>Raw Model Output</SectionTitle>
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-xs text-neutral-300">
                      {lastResponse.raw}
                    </pre>
                  </div>
                )}
                {lastResponse.transcript && (
                  <div>
                    <SectionTitle>Transcript</SectionTitle>
                    <TranscriptView transcript={lastResponse.transcript} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-neutral-500">No response yet.</p>
            )}
          </div>
        )}

        {tab === "log" && (
          <div className="flex flex-col gap-2">
            <SectionTitle>Turn Log ({messages.length})</SectionTitle>
            {messages.length === 0 ? (
              <p className="text-xs text-neutral-500">No turns yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {messages.map((m) => {
                  const expanded = expandedTurns.has(m.seq);
                  return (
                    <li key={m.seq} className="rounded border border-neutral-800 bg-neutral-950 p-2">
                      <button
                        onClick={() => toggleTurn(m.seq)}
                        className="flex w-full items-center justify-between gap-2 text-left"
                      >
                        <span className="text-xs font-medium text-neutral-300">
                          #{m.seq} · {m.command.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-neutral-500">
                            {new Date(m.ts).toLocaleTimeString()}
                          </span>
                          <span className="text-xs text-neutral-500">{expanded ? "−" : "+"}</span>
                        </div>
                      </button>
                      {!expanded && (
                        <div className="mt-1">
                          {m.response.reason && (
                            <p className="text-xs text-neutral-400">{m.response.reason}</p>
                          )}
                          {m.error && <p className="mt-1 text-xs text-rose-400">{m.error}</p>}
                          {m.macro && (
                            <p className="mt-1 text-xs text-neutral-500">
                              macro: {m.macro.length} step{m.macro.length === 1 ? "" : "s"}
                            </p>
                          )}
                          {m.diff && (
                            <div className="mt-1">
                              <p className="text-xs text-neutral-500">diff summary:</p>
                              <p className="text-xs text-neutral-400">
                                {String(m.diff.summary ?? "")}
                              </p>
                              {m.diff.changed === false && (
                                <p className="text-xs text-neutral-500">no changes</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {expanded && (
                        <div className="mt-2 flex flex-col gap-2">
                          {m.response.transcript ? (
                            <TranscriptView transcript={m.response.transcript} />
                          ) : (
                            <>
                              {m.response.prompt && (
                                <div>
                                  <SectionTitle>Prompt</SectionTitle>
                                  {m.response.prompt.system && (
                                    <details className="rounded bg-neutral-900">
                                      <summary className="cursor-pointer px-2 py-1 text-xs text-neutral-500">
                                        system
                                      </summary>
                                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap p-2 text-xs text-neutral-400">
                                        {m.response.prompt.system}
                                      </pre>
                                    </details>
                                  )}
                                  {m.response.prompt.user && (
                                    <details className="rounded bg-neutral-900">
                                      <summary className="cursor-pointer px-2 py-1 text-xs text-neutral-500">
                                        user
                                      </summary>
                                      <pre className="max-h-60 overflow-auto whitespace-pre-wrap p-2 text-xs text-neutral-400">
                                        {m.response.prompt.user}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                              )}
                              {m.response.raw && (
                                <div>
                                  <SectionTitle>Raw Model Output</SectionTitle>
                                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-xs text-neutral-300">
                                    {m.response.raw}
                                  </pre>
                                </div>
                              )}
                            </>
                          )}
                          <div>
                            <SectionTitle>Final Command</SectionTitle>
                            <JsonBlock value={m.command} maxHeight="120px" />
                          </div>
                          {m.macro && (
                            <p className="text-xs text-neutral-500">
                              macro: {m.macro.length} step{m.macro.length === 1 ? "" : "s"}
                            </p>
                          )}
                          {m.diff && (
                            <div>
                              <SectionTitle>Diff Summary</SectionTitle>
                              <p className="text-xs text-neutral-400">{String(m.diff.summary ?? "")}</p>
                              {m.diff.changed === false && (
                                <p className="text-xs text-neutral-500">no changes</p>
                              )}
                            </div>
                          )}
                          {m.error && <p className="text-xs text-rose-400">{m.error}</p>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
