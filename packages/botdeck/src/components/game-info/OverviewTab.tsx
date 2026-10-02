import { useState } from "react";
import { JsonEditor, githubDarkTheme } from "json-edit-react";
import type { CollectedState } from "@/emulator/collectState";
import { formatPosition, mpSummary } from "./helpers";
import { SectionTitle } from "./shared";

function FF1Summary({ ff1 }: { ff1: NonNullable<CollectedState["ff1"]> }) {
  const inventorySummary = (ff1: NonNullable<CollectedState["ff1"]>) => {
    const items = ff1.inventory
      .filter((item) => item.quantity > 0 && item.itemInfo)
      .slice(0, 20)
      .map((item) => `${item.itemInfo?.name ?? `Item ${item.itemId}`} x${item.quantity}`);
    if (items.length === 0) return "None";
    return items.join(", ");
  };

  return (
    <div className="space-y-4 text-sm">
      <section>
        <SectionTitle>Party</SectionTitle>
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
          <SectionTitle>Gold</SectionTitle>
          <p className="font-mono text-neutral-200">{ff1.gold.toLocaleString()}</p>
        </div>
        <div>
          <SectionTitle>Position</SectionTitle>
          <p className="text-neutral-200">{formatPosition(ff1.world)}</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <SectionTitle>Context</SectionTitle>
          <p className="text-neutral-200">
            {ff1.context ? `${ff1.context.mode} / ${ff1.context.menu}` : "Unknown"}
          </p>
        </div>
        <div>
          <SectionTitle>Battle</SectionTitle>
          <p className="text-neutral-200">{ff1.battle?.inBattle ? "In battle" : "Not in battle"}</p>
        </div>
      </section>

      <section>
        <SectionTitle>Vehicles</SectionTitle>
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
        <SectionTitle>Inventory</SectionTitle>
        <p className="text-neutral-200">{inventorySummary(ff1)}</p>
      </section>
    </div>
  );
}

export function OverviewTab({ data }: { data: CollectedState | null }) {
  const [showRaw, setShowRaw] = useState(false);

  if (!data) {
    return (
      <p className="text-neutral-500">
        No snapshot collected yet. Use Snapshot to sample the emulator.
      </p>
    );
  }

  return (
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
  );
}
