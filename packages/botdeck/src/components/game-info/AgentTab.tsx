import { useState } from "react";
import type { TurnLogEntry } from "@/hooks/useBotLoop";
import type { TurnRequest, TurnResponse } from "@/types";
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
  onStep?: () => void;
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

export function AgentTab({
  isThinking,
  isPlayingMacro,
  error,
  lastRequest,
  lastResponse,
  messages = [],
  autoRun,
  onAutoRunChange,
  onStep,
  pendingMessage = "",
  onPendingMessageChange,
}: AgentTabProps) {
  const [tab, setTab] = useState<"request" | "response" | "log">("response");

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge isThinking={isThinking} isPlayingMacro={isPlayingMacro} error={error} />
        <div className="flex items-center gap-2">
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
          <button
            onClick={onStep}
            disabled={isThinking || isPlayingMacro || !onStep}
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Step
          </button>
        </div>
      </div>

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
                {messages.map((m) => (
                  <li key={m.seq} className="rounded border border-neutral-800 bg-neutral-950 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-neutral-300">
                        #{m.seq} · {m.command.name}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {new Date(m.ts).toLocaleTimeString()}
                      </span>
                    </div>
                    {m.response.reason && (
                      <p className="mt-1 text-xs text-neutral-400">{m.response.reason}</p>
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
