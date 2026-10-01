import type { FF1GameState } from "@games/ff1-state";
import { formatPosition } from "./helpers";
import { SectionTitle } from "./shared";

export function LocationTab({ ff1 }: { ff1: FF1GameState | undefined }) {
  const world = ff1?.world;

  const places = [
    { name: "Cornelia", x: 0, y: 0, kind: "town", reachable: true },
    { name: "Temple of Fiends", x: 0, y: 0, kind: "dungeon", reachable: true },
    { name: "Matoya's Cave", x: 0, y: 0, kind: "cave", reachable: false },
    { name: "Marsh Cave", x: 0, y: 0, kind: "cave", reachable: false },
  ];

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

      <section>
        <SectionTitle>Vehicles</SectionTitle>
        <p className="text-neutral-200">
          {world && world.ownedVehicles.length > 0
            ? world.ownedVehicles.join(", ")
            : "None"}
          {world?.currentVehicle && (
            <span className="text-neutral-500"> (riding {world.currentVehicle})</span>
          )}
        </p>
      </section>

      <section>
        <SectionTitle>Navigable Places</SectionTitle>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-neutral-700 text-neutral-500">
              <th className="py-1 pr-2">Name</th>
              <th className="py-1 pr-2">Kind</th>
              <th className="py-1 pr-2">Position</th>
              <th className="py-1 pr-2">Reachable</th>
            </tr>
          </thead>
          <tbody>
            {places.map((place) => (
              <tr key={place.name} className="border-b border-neutral-800">
                <td className="py-1 pr-2">{place.name}</td>
                <td className="py-1 pr-2 capitalize">{place.kind}</td>
                <td className="py-1 pr-2">({place.x}, {place.y})</td>
                <td className="py-1 pr-2">
                  {place.reachable ? (
                    <span className="text-emerald-400">Yes</span>
                  ) : (
                    <span className="text-neutral-500">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
