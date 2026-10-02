import type { FF1GameState, KnownLocation, MapObject, MenuContext } from "@games/ff1-state";
import { formatPosition } from "./helpers";
import { SectionTitle } from "./shared";

function describeObject(obj: MapObject): string {
  // Object IDs are global NPC indexes from the ROM object table; their role
  // (shopkeeper, quest giver, etc.) cannot be determined from RAM alone.
  return `Object ${obj.id}`;
}

function describeLocation(loc: KnownLocation): string {
  return `${loc.name} (${loc.id})`;
}

function menuActions(menu: MenuContext): string[] {
  switch (menu) {
    case "shop":
      return ["buy", "sell"];
    case "inn":
      return ["stay"];
    case "clinic":
      return ["heal"];
    case "main_menu":
      return ["use_item"];
    case "battle":
      return ["fight", "magic", "use_item", "run"];
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
          <SectionTitle>Context Mode</SectionTitle>
          <p className="text-neutral-200">
            {context ? `${context.mode} / ${context.menu}` : "Unknown"}
          </p>
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
        <SectionTitle>Available Locations</SectionTitle>
        {locations.length === 0 ? (
          <p className="text-neutral-500">No known locations for this map.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {locations.map((loc) => (
              <li key={loc.id} className="text-neutral-300">
                <span className="text-xs text-neutral-500">[{loc.type}]</span>{" "}
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
            {menuActions(context.menu).length > 0 && (
              <> - available: {menuActions(context.menu).join(", ")}</>
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
