import { useState } from "react";
import { JsonEditor, githubDarkTheme } from "json-edit-react";
import type { CollectedState } from "@/emulator/collectState";

interface StateViewerProps {
  data: CollectedState | null;
  saved?: { statePath?: string; extractedPath?: string } | null;
  disabled?: boolean;
  onRefresh?: () => void;
}

function FF1Summary({ ff1 }: { ff1: NonNullable<CollectedState["ff1"]> }) {
  const mpSummary = (charges: { current?: number; max?: number }[] | undefined) => {
    if (!charges || charges.length === 0) return "-";
    return charges.map((l) => `${l.current ?? 0}/${l.max ?? 0}`).join(", ");
  };

  const inventorySummary = (ff1: NonNullable<CollectedState["ff1"]>) => {
    const items = ff1.inventory
      .filter((item) => item.quantity > 0 && item.itemInfo)
      .slice(0, 20)
      .map((item) => `${item.itemInfo?.name ?? `Item ${item.itemId}`} x${item.quantity}`);
    if (items.length === 0) return "None";
    return items.join(", ");
  };

  const position = (ff1: NonNullable<CollectedState["ff1"]>) => {
    const w = ff1.world;
    if (w.isOverworld) {
      return `Overworld (${w.overworldX}, ${w.overworldY})`;
    }
    return `${w.mapName ?? `Map ${w.mapId}`} (${w.standardMapX}, ${w.standardMapY})`;
  };

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Party
        </h3>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-neutral-700 text-neutral-500">
              <th className="py-1 pr-2">Name</th>
              <th className="py-1 pr-2">Class</th>
              <th className="py-1 pr-2">Lv</th>
              <th className="py-1 pr-2">HP</th>
              <th className="py-1 pr-2">MP</th>
            </tr>
          </thead>
          <tbody>
            {ff1.party.map((c) => (
              <tr key={c.index} className="border-b border-neutral-800">
                <td className="py-1 pr-2">{c.name}</td>
                <td className="py-1 pr-2">
                  {c.classInfo?.name ?? `Class ${c.classId}`}
                </td>
                <td className="py-1 pr-2">{c.level ?? "-"}</td>
                <td className="py-1 pr-2">
                  {c.hp ?? "-"} / {c.maxHp ?? "-"}
                </td>
                <td className="py-1 pr-2">{mpSummary(c.spellCharges?.levels)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Gold
          </h3>
          <p className="font-mono text-neutral-200">{ff1.gold.toLocaleString()}</p>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Position
          </h3>
          <p className="text-neutral-200">{position(ff1)}</p>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Vehicles
        </h3>
        <p className="text-neutral-200">
          {ff1.world.ownedVehicles.length > 0
            ? ff1.world.ownedVehicles.join(", ")
            : "None"}
          {ff1.world.currentVehicle && (
            <span className="text-neutral-500">
              {" "}
              (riding {ff1.world.currentVehicle})
            </span>
          )}
        </p>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Inventory
        </h3>
        <p className="text-neutral-200">{inventorySummary(ff1)}</p>
      </section>
    </div>
  );
}

/**
 * Renders the snapshot produced by the Snapshot flow. When an FF1 extraction
 * is present, a human-readable summary is shown first; the raw JSON view can
 * be toggled below it.
 */
export function StateViewer({ data, saved, disabled, onRefresh }: StateViewerProps) {
  const [showRaw, setShowRaw] = useState(false);

  const basename = (path: string | undefined) => {
    if (!path) return null;
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(i + 1) : path;
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
            Game State
          </h2>
          {savedNames.length > 0 && (
            <span className="text-xs text-neutral-500">
              {savedNames.join(" / ")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={disabled}
              className="rounded bg-neutral-700 px-3 py-1 text-xs font-medium text-neutral-200 hover:bg-neutral-600 disabled:opacity-50"
            >
              Refresh state
            </button>
          )}
          {data && (
            <span className="text-xs text-neutral-500">{data.capturedAt}</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
        {data ? (
          <div className="space-y-4">
            {data.ff1 && <FF1Summary ff1={data.ff1} />}

            {data.ff1 && (
              <button
                onClick={() => setShowRaw((s) => !s)}
                className="rounded bg-neutral-800 px-3 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-700"
              >
                {showRaw ? "Hide raw JSON" : "Show raw JSON"}
              </button>
            )}

            {(showRaw || !data.ff1) && (
              <JsonEditor
                data={(showRaw && data.ff1 ? data.ff1 : data) as unknown as object}
                viewOnly
                collapse={2}
                rootName={data.ff1 && showRaw ? "ff1" : "state"}
                theme={[githubDarkTheme, {}]}
                showCollectionCount="when-closed"
                maxWidth="100%"
              />
            )}
          </div>
        ) : (
          <p className="text-neutral-500">
            No snapshot collected yet. Use Snapshot to sample the emulator.
          </p>
        )}
      </div>
    </div>
  );
}
