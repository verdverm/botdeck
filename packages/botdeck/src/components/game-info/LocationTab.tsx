import type { FF1GameState, KnownLocation, MapObject, MenuContext } from "@games/ff1-state";
import { getNpcNameById } from "@games/ff1-state";
import { formatContext, formatPosition } from "./helpers";
import { SectionTitle } from "./shared";

function describeObject(obj: MapObject): string {
  const name = getNpcNameById(obj.id);
  if (name) return `${name} (id 0x${obj.id.toString(16).padStart(2, "0")})`;
  return `Object ${obj.id} (raw 0x${obj.rawId.toString(16).padStart(2, "0")})`;
}

function describeLocation(loc: KnownLocation): string {
  return `${loc.name} (${loc.id})`;
}

function isExit(loc: KnownLocation): boolean {
  return loc.type === "point" && loc.name.toLowerCase().includes("exit");
}

function reachabilityColor(reachable: KnownLocation["reachable"]): string {
  switch (reachable) {
    case "same-map":
      return "text-emerald-400";
    case "reachable":
      return "text-blue-400";
    default:
      return "text-neutral-500";
  }
}

function menuActionLabels(menu: MenuContext): string[] {
  switch (menu) {
    case "shop":
      return ["Buy", "Sell"];
    case "inn":
      return ["Stay"];
    case "clinic":
      return ["Heal"];
    case "battle":
      // The FF1 battle menu has five entries per actor: FIGHT, MAGIC, DRINK,
      // EQUIP, RUN. The agent command for "drink" is currently `use_item`.
      return ["Fight", "Magic", "Drink (use_item)", "Equip", "Run"];
    case "field":
    case "town":
    case "castle":
    case "dungeon":
      return ["Travel (goto)", "Talk", "Interact", "Cancel", "Menu", "Use item (if consumable)"];
    default:
      return [];
  }
}

export function LocationTab({ ff1 }: { ff1: FF1GameState | undefined }) {
  const world = ff1?.world;
  const objects = world?.mapObjects ?? [];
  const context = ff1?.context;
  const locations = ff1?.availableLocations ?? [];

  return (
    <div className="space-y-4 text-sm">
      <section className="grid grid-cols-2 gap-3">
        <div>
          <SectionTitle>Current Location</SectionTitle>
          <p className="text-neutral-200">{formatPosition(world)}</p>
        </div>
        <div>
          <SectionTitle>Map</SectionTitle>
          <p className="text-neutral-200">
            {world ? world.mapName ?? `Map ${world.mapId}` : "Unknown"}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <SectionTitle>Context</SectionTitle>
          <p className="text-neutral-200">{formatContext(context)}</p>
        </div>
        <div>
          <SectionTitle>Vehicles</SectionTitle>
          <p className="text-neutral-200">
            {world && world.ownedVehicles.length > 0
              ? world.ownedVehicles.join(", ")
              : "None"}
            {world?.currentVehicle && (
              <span className="text-neutral-500"> (riding {world.currentVehicle})</span>
            )}
          </p>
        </div>
      </section>

      <section>
        <SectionTitle>
          {world?.isOverworld ? "Travel Destinations" : "Places on This Map"}
        </SectionTitle>
        {locations.length === 0 ? (
          <p className="text-neutral-500">No known locations for this map.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {locations.map((loc) => (
              <li key={loc.id} className="text-neutral-300">
                <span className="text-xs text-neutral-500">[{loc.type}]</span>{" "}
                {loc.reachable && (
                  <span className={`mr-1 text-xs ${reachabilityColor(loc.reachable)}`}>
                    [{loc.reachable}]
                  </span>
                )}
                {isExit(loc) && (
                  <span className="mr-1 text-xs text-emerald-400">[exit]</span>
                )}
                {describeLocation(loc)}
              </li>
            ))}
          </ul>
        )}
        {context?.note && <p className="mt-1 text-xs text-neutral-500">{context.note}</p>}
      </section>

      <section>
        <SectionTitle>Menu Actions</SectionTitle>
        {context ? (
          <p className="text-neutral-200">
            Context <span className="text-neutral-500">{context.menu}</span>
            {menuActionLabels(context.menu).length > 0 && (
              <> - available: {menuActionLabels(context.menu).join(", ")}</>
            )}
          </p>
        ) : (
          <p className="text-neutral-500">Unknown menu context.</p>
        )}
      </section>

      <section>
        <SectionTitle>Nearby Interactables</SectionTitle>
        {objects.length === 0 ? (
          <p className="text-neutral-500">No NPCs or objects visible on this map.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-700 text-neutral-500">
                <th className="py-1 pr-2">Role</th>
                <th className="py-1 pr-2">Physical</th>
                <th className="py-1 pr-2">Graphic</th>
                <th className="py-1 pr-2">Facing</th>
              </tr>
            </thead>
            <tbody>
              {objects.map((obj) => (
                <tr key={obj.index} className="border-b border-neutral-800">
                  <td className="py-1 pr-2">{describeObject(obj)}</td>
                  <td className="py-1 pr-2">({obj.physicalX}, {obj.physicalY})</td>
                  <td className="py-1 pr-2">({obj.graphicX}, {obj.graphicY})</td>
                  <td className="py-1 pr-2">{obj.facing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
