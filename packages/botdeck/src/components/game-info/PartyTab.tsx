import { useState } from "react";
import type { FF1GameState } from "@games/ff1-state";
import { PartyMainTable } from "./PartyMain";
import { CharacterDetail } from "./PartyMemberTab";
import { TabButton } from "./shared";
import type { PartySubTab } from "./types";

export function PartyTab({ ff1 }: { ff1: FF1GameState | undefined }) {
  const [subTab, setSubTab] = useState<PartySubTab>("main");

  if (!ff1 || ff1.party.length === 0) {
    return (
      <div className="space-y-3 text-sm text-neutral-400">
        <p>No party data available.</p>
        <div className="rounded border border-neutral-800 bg-neutral-900/50 p-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-neutral-500">Placeholder</p>
          <div className="space-y-1 text-neutral-300">
            <div className="flex justify-between border-b border-neutral-800 py-1">
              <span>Warrior</span>
              <span>Lv 1 — 35/35 HP</span>
            </div>
            <div className="flex justify-between border-b border-neutral-800 py-1">
              <span>Thief</span>
              <span>Lv 1 — 30/30 HP</span>
            </div>
            <div className="flex justify-between border-b border-neutral-800 py-1">
              <span>White Mage</span>
              <span>Lv 1 — 20/20 HP</span>
            </div>
            <div className="flex justify-between py-1">
              <span>Black Mage</span>
              <span>Lv 1 — 20/20 HP</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const members = ff1.party;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap gap-1 border-b border-neutral-800 pb-2">
        <TabButton active={subTab === "main"} label="main" onClick={() => setSubTab("main")} />
        {members.map((c) => (
          <TabButton
            key={c.index}
            active={subTab === c.index}
            label={c.name || `Member ${c.index + 1}`}
            onClick={() => setSubTab(c.index)}
          />
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto pr-1">
        {subTab === "main" ? (
          <PartyMainTable party={members} />
        ) : members[subTab] ? (
          <CharacterDetail character={members[subTab]} />
        ) : (
          <p className="text-neutral-500">Party member not found.</p>
        )}
      </div>
    </div>
  );
}
