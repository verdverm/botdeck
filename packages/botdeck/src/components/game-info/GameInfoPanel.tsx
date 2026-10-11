import { useEffect, useRef, useState } from "react";
import { AgentTab } from "./AgentTab";
import { AgentSnippetsTab } from "./AgentSnippetsTab";
import { BattleTab } from "./BattleTab";
import { LocationTab } from "./LocationTab";
import { MarkdownTab } from "./MarkdownTab";
import { MenuTab } from "./MenuTab";
import { OverviewTab } from "./OverviewTab";
import { PartyTab } from "./PartyTab";
import { SnippetsTab } from "./SnippetsTab";
import { TabButton } from "./shared";
import type { GameInfoPanelProps, Tab } from "./types";

interface RefreshRate {
  label: string;
  value: number; // seconds; 0 = off
}

const DEFAULT_REFRESH_RATE: RefreshRate = { label: ".2s", value: 0.2 };

const REFRESH_RATES: RefreshRate[] = [
  { label: "none(0)", value: 0 },
  { label: ".1s", value: 0.1 },
  { label: ".2s", value: 0.2 },
  { label: ".3s", value: 0.3 },
  { label: ".5s", value: 0.5 },
  { label: "1s", value: 1 },
  { label: "2s", value: 2 },
  { label: "3s", value: 3 },
  { label: "6s", value: 6 },
  { label: "10s", value: 10 },
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
];

function RefreshRateDropdown({
  rate,
  disabled,
  onChange,
}: {
  rate: RefreshRate;
  disabled?: boolean;
  onChange: (rate: RefreshRate) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDown);
    return () => document.removeEventListener("mousedown", handleDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="rounded bg-neutral-700 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-600 disabled:opacity-50"
      >
        refresh ({rate.label})
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-20 rounded border border-neutral-700 bg-neutral-800 shadow-lg">
          {REFRESH_RATES.map((r) => (
            <button
              key={r.label}
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
              className={`block w-full px-3 py-1.5 text-left text-xs ${
                r.value === rate.value
                  ? "bg-neutral-700 text-neutral-100"
                  : "text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function GameInfoPanel({
  data,
  saved,
  disabled,
  onRefresh,
  agent,
  playId,
  onRunSnippet,
  onManualCommand,
  snippetRunning,
  onStopSnippet,
}: GameInfoPanelProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [rate, setRate] = useState<RefreshRate>(DEFAULT_REFRESH_RATE);

  useEffect(() => {
    if (disabled || !onRefresh || rate.value <= 0) return;
    const id = window.setInterval(onRefresh, rate.value * 1000);
    return () => window.clearInterval(id);
  }, [disabled, onRefresh, rate]);

  const basename = (path: string | undefined) => {
    if (!path) return null;
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(i + 1) : path;
  };

  const formatTimestamp = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const savedNames = saved
    ? [basename(saved.statePath), basename(saved.extractedPath)].filter(
        (name): name is string => Boolean(name),
      )
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
            Game Info
          </h2>
          {savedNames.length > 0 && (
            <span className="text-xs text-neutral-500">{savedNames.join(" / ")}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <span className="text-xs text-neutral-500">{formatTimestamp(data.capturedAt)}</span>
          )}
          {onRefresh && (
            <RefreshRateDropdown
              rate={rate}
              disabled={disabled}
              onChange={(r) => setRate(r)}
            />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-neutral-800 pb-2">
        {(
          [
            "overview",
            "party",
            "location",
            "battle",
            "menu",
            "agent",
            "snippets",
            "agent-snippets",
            "markdown",
          ] as Tab[]
        ).map((t) => (
          <TabButton key={t} active={tab === t} label={t} onClick={() => setTab(t)} />
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
        {tab === "overview" && <OverviewTab data={data} />}
        {tab === "party" && <PartyTab ff1={data?.ff1} />}
        {tab === "location" && <LocationTab data={data ?? undefined} />}
        {tab === "battle" && <BattleTab ff1={data?.ff1} />}
        {tab === "menu" && <MenuTab ff1={data?.ff1} />}
        {tab === "agent" && (
          <AgentTab
            isThinking={agent?.isThinking}
            isPlayingMacro={agent?.isPlayingMacro}
            error={agent?.error}
            lastRequest={agent?.lastRequest}
            lastResponse={agent?.lastResponse}
            messages={agent?.messages}
            autoRun={agent?.autoRun}
            onAutoRunChange={agent?.setAutoRun}
            runMode={agent?.runMode}
            onRunModeChange={agent?.setRunMode}
            onStep={agent?.step}
            onAbort={agent?.abortAgent}
            pendingDecision={agent?.pendingDecision}
            onExecutePending={agent?.executePending}
            onClearPending={agent?.clearPending}
            playId={playId}
            onRunSnippet={onRunSnippet}
            snippetRunning={snippetRunning}
            onStopSnippet={onStopSnippet}
            onManualCommand={onManualCommand}
            pendingMessage={agent?.pendingMessage}
            onPendingMessageChange={agent?.setPendingMessage}
            macroProgress={data?.macroProgress}
            macroInterrupted={data?.macroInterrupted}
            lastRoute={data?.lastRoute}
          />
        )}
        {tab === "snippets" && playId && onRunSnippet && (
          <SnippetsTab playId={playId} disabled={disabled} onRun={onRunSnippet} />
        )}
        {tab === "agent-snippets" && playId && <AgentSnippetsTab playId={playId} disabled={disabled} />}
        {tab === "markdown" && <MarkdownTab />}
      </div>
    </div>
  );
}
