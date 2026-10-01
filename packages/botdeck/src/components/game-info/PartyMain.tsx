import type { PartyCharacter } from "@games/ff1-state";
import { mpSummary } from "./helpers";

export function PartyMainTable({ party }: { party: PartyCharacter[] }) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-neutral-700 text-neutral-500">
          <th className="py-1 pr-2">Name</th>
          <th className="py-1 pr-2">Class</th>
          <th className="py-1 pr-2">Lv</th>
          <th className="py-1 pr-2">HP</th>
          <th className="py-1 pr-2">MP</th>
          <th className="py-1 pr-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {party.map((c) => (
          <tr key={c.index} className="border-b border-neutral-800">
            <td className="py-1 pr-2">{c.name}</td>
            <td className="py-1 pr-2">{c.classInfo?.name ?? `Class ${c.classId}`}</td>
            <td className="py-1 pr-2">{c.level ?? "-"}</td>
            <td className="py-1 pr-2">
              {c.hp ?? "-"} / {c.maxHp ?? "-"}
            </td>
            <td className="py-1 pr-2">{mpSummary(c.spellCharges?.levels)}</td>
            <td className="py-1 pr-2">
              {c.status?.ailments.length
                ? c.status.ailments.map((a) => a.name).join(", ")
                : "OK"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
