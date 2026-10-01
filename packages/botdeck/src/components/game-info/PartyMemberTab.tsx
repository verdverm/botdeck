import type { PartyCharacter } from "@games/ff1-state";
import { SectionTitle } from "./shared";

export function CharacterDetail({ character }: { character: PartyCharacter }) {
  const stats = character.stats;
  const equipment = character.equipment;
  const spells = character.spellCharges?.levels ?? [];

  return (
    <div className="space-y-4 text-sm">
      <section className="grid grid-cols-2 gap-3">
        <div>
          <SectionTitle>Name / Class</SectionTitle>
          <p className="text-neutral-200">
            {character.name} — {character.classInfo?.name ?? `Class ${character.classId}`}
          </p>
        </div>
        <div>
          <SectionTitle>Level / HP</SectionTitle>
          <p className="text-neutral-200">
            Lv {character.level ?? "-"} — {character.hp ?? "-"} / {character.maxHp ?? "-"} HP
          </p>
        </div>
      </section>

      <section>
        <SectionTitle>Stats</SectionTitle>
        {stats ? (
          <div className="grid grid-cols-3 gap-2 text-neutral-200">
            <div>STR {stats.strength ?? "-"}</div>
            <div>AGI {stats.agility ?? "-"}</div>
            <div>INT {stats.intelligence ?? "-"}</div>
            <div>VIT {stats.vitality ?? "-"}</div>
            <div>LUCK {stats.luck ?? "-"}</div>
            <div>EXP {stats.experience ?? "-"}</div>
            <div>DMG {stats.damage ?? "-"}</div>
            <div>HIT {stats.hitRate ?? "-"}</div>
            <div>ABS {stats.absorb ?? "-"}</div>
            <div>EVD {stats.evade ?? "-"}</div>
            <div>MDF {stats.magicDefense ?? "-"}</div>
          </div>
        ) : (
          <p className="text-neutral-500">No stats available.</p>
        )}
      </section>

      <section>
        <SectionTitle>Status</SectionTitle>
        <p className="text-neutral-200">
          {character.status?.ailments.length
            ? character.status.ailments.map((a) => a.name).join(", ")
            : "OK"}
        </p>
      </section>

      <section>
        <SectionTitle>Equipment</SectionTitle>
        <div className="grid grid-cols-2 gap-2 text-neutral-200">
          <div>Weapon: {equipment.weapon?.name ?? "-"}</div>
          <div>Armor: {equipment.armor?.name ?? "-"}</div>
          <div>Shield: {equipment.shield?.name ?? "-"}</div>
          <div>Helmet: {equipment.helmet?.name ?? "-"}</div>
          <div>Gauntlet: {equipment.gauntlet?.name ?? "-"}</div>
        </div>
      </section>

      <section>
        <SectionTitle>Spell Charges</SectionTitle>
        {spells.length > 0 ? (
          <div className="grid grid-cols-4 gap-2 text-neutral-200">
            {spells.map((level) => (
              <div key={level.level}>
                L{level.level}: {level.current ?? "-"} / {level.max ?? "-"}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-neutral-500">No spell charges available.</p>
        )}
      </section>

      <section>
        <SectionTitle>Spells Known</SectionTitle>
        <p className="text-neutral-200">
          {character.spellsKnown.length > 0
            ? character.spellsKnown.map((s) => s.name).join(", ")
            : "None"}
        </p>
      </section>
    </div>
  );
}
