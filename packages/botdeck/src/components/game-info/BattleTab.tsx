import type { FF1GameState } from "@games/ff1-state";
import { SectionTitle } from "./shared";

export function BattleTab({ ff1 }: { ff1: FF1GameState | undefined }) {
  const battle = ff1 && "battle" in ff1 ? (ff1.battle as { inBattle?: boolean; note?: string; enemies?: { slot: number; name?: string }[]; party?: { name: string; canAct?: boolean }[]; activePartyIndex?: number }) : undefined;
  const inBattle = battle?.inBattle ?? false;
  const activeName = inBattle && battle?.activePartyIndex !== undefined
    ? ff1?.party[battle.activePartyIndex]?.name
    : undefined;

  return (
    <div className="space-y-4 text-sm">
      <section className="grid grid-cols-2 gap-3">
        <div>
          <SectionTitle>Battle Status</SectionTitle>
          <p className="text-neutral-200">{inBattle ? "In battle" : "Not in battle"}</p>
        </div>
        <div>
          <SectionTitle>Active Actor</SectionTitle>
          <p className="text-neutral-200">{activeName ?? "N/A"}</p>
        </div>
      </section>

      {inBattle && (
        <section>
          <SectionTitle>Enemy Roster</SectionTitle>
          {battle?.enemies && battle.enemies.length > 0 ? (
            <ul className="space-y-1">
              {battle.enemies.map((e) => (
                <li key={e.slot} className="text-xs text-neutral-300">
                  {e.name ?? `Enemy ${e.slot + 1}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-neutral-500">Enemy roster unread (offsets TODO).</p>
          )}
        </section>
      )}

      {ff1 && (
        <section>
          <SectionTitle>Party HP</SectionTitle>
          <ul className="space-y-1">
            {ff1.party.map((c) => (
              <li key={c.index} className="text-xs text-neutral-300">
                {c.name}: {c.hp ?? "?"} / {c.maxHp ?? "?"} HP
              </li>
            ))}
          </ul>
        </section>
      )}

      {inBattle && battle?.party && (
        <section>
          <SectionTitle>Party Action State</SectionTitle>
          <ul className="space-y-1">
            {battle.party.map((m, i) => (
              <li key={i} className="text-xs text-neutral-300">
                {m.name}: {m.canAct ? "can act" : "cannot act"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {battle?.note && (
        <p className="text-xs text-neutral-500">{battle.note}</p>
      )}
    </div>
  );
}
