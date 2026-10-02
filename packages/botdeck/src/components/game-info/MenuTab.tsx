import type { FF1GameState, MapObject } from "@games/ff1-state";
import { getNpcNameById } from "@games/ff1-state";
import { SectionTitle } from "./shared";

function describeTalkObject(talkObject: number | undefined, objects: MapObject[] | undefined): string {
  if (talkObject === undefined || talkObject === 0) return "-";
  const obj = objects?.find((o) => o.index === talkObject);
  if (!obj) return `Object index ${talkObject}`;
  const name = getNpcNameById(obj.id);
  if (name) return `${name} (id 0x${obj.id.toString(16).padStart(2, "0")})`;
  return `Object ${obj.id} (raw 0x${obj.rawId.toString(16).padStart(2, "0")})`;
}

export function MenuTab({ ff1 }: { ff1: FF1GameState | undefined }) {
  const menu = ff1?.menu;
  const battle = ff1?.battle;
  const objects = ff1?.world?.mapObjects;

  if (!ff1) {
    return <p className="text-neutral-500">No state collected.</p>;
  }

  return (
    <div className="space-y-4 text-sm">
      <section className="grid grid-cols-2 gap-3">
        <div>
          <SectionTitle>Menu State</SectionTitle>
          <p className="text-neutral-200">{menu?.inMenu ? "Menu / dialog open" : "No menu open"}</p>
        </div>
        <div>
          <SectionTitle>Dialog</SectionTitle>
          <p className="text-neutral-200">{menu?.dialogOpen ? "Open" : "Closed"}</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <SectionTitle>Cursor</SectionTitle>
          <p className="text-neutral-200">{menu?.cursor ?? "-"}</p>
        </div>
        <div>
          <SectionTitle>Window ($1f/$63/$67b7)</SectionTitle>
          <p className="text-neutral-200">
            id {menu?.windowId ?? "-"} · rows {menu?.cursorMax ?? "-"} ·{" "}
            {menu?.menuOverlay ? "overlay" : "none"}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <SectionTitle>Talk Object</SectionTitle>
          <p className="text-neutral-200">{describeTalkObject(menu?.talkObject, objects)}</p>
        </div>
      </section>

      {menu?.enteringShop && (
        <section className="grid grid-cols-2 gap-3">
          <div>
            <SectionTitle>Shop</SectionTitle>
            <p className="text-neutral-200">
              {menu.shopType ?? "unknown"} #{menu.shopId ?? "?"}
            </p>
          </div>
          <div>
            <SectionTitle>Shop Cursor (raw)</SectionTitle>
            <p className="text-neutral-200">
              {menu.shopCursorX ?? "-"}, {menu.shopCursorY ?? "-"}
            </p>
          </div>
        </section>
      )}

      {battle?.inBattle && (
        <section className="grid grid-cols-2 gap-3">
          <div>
            <SectionTitle>Battle Cursor</SectionTitle>
            <p className="text-neutral-200">
              {battle.cursorX ?? "-"}, {battle.cursorY ?? "-"}
            </p>
          </div>
          <div>
            <SectionTitle>Active Party Index</SectionTitle>
            <p className="text-neutral-200">{battle.activePartyIndex ?? "-"}</p>
          </div>
        </section>
      )}

      {menu?.note && <p className="text-xs text-neutral-500">{menu.note}</p>}
    </div>
  );
}
