import type { Phase } from "@/hooks/useBotLoop";
import type { TurnLogEntry } from "@/hooks/useBotLoop";

interface AgentPanelProps {
  running: boolean;
  turn: number;
  phase: Phase;
  fps: number;
  lastReason?: string;
  log: TurnLogEntry[];
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: "idle",
  reading: "reading state",
  composing: "composing context",
  asking: "asking agent",
  applying: "playing command",
};

export function AgentPanel({
  running,
  turn,
  phase,
  fps,
  lastReason,
  log,
}: AgentPanelProps) {
  return (
    <section className="flex min-h-0 flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Agent
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            running
              ? "bg-emerald-500/20 text-emerald-300"
              : "bg-neutral-700 text-neutral-300"
          }`}
        >
          {running ? PHASE_LABEL[phase] : "idle"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <Stat label="turns" value={turn} />
        <Stat label="fps" value={fps} />
        <Stat label="log" value={log.length} />
      </div>

      {lastReason && (
        <p className="rounded bg-neutral-800 p-2 text-sm text-neutral-300">
          {lastReason}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {log
          .slice()
          .reverse()
          .map((d) => (
            <div
              key={d.turn}
              className="flex items-baseline gap-2 border-b border-neutral-800 py-1 text-sm"
            >
              <span className="tabular-nums text-neutral-500">#{d.turn}</span>
              <span className="font-mono text-sky-300">{d.command.name}</span>
              {d.reason && (
                <span className="truncate text-neutral-400">{d.reason}</span>
              )}
            </div>
          ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-neutral-800 p-2">
      <div className="tabular-nums text-lg font-semibold text-neutral-100">
        {value}
      </div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
    </div>
  );
}
