interface GameStatePanelProps {
  state: Record<string, unknown>;
}

function format(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function GameStatePanel({ state }: GameStatePanelProps) {
  const entries = Object.entries(state);
  return (
    <section className="flex min-h-0 flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Game State
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-500">No state yet.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 overflow-auto text-sm">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-neutral-400">{key}</dt>
              <dd className="text-neutral-200">{format(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
