import { describe, expect, it } from "vitest";
import {
  MAP_WIDTH,
  allLocations,
  entranceFor,
  findPath,
  namedLocations,
  planRoute,
  playerTile,
  resolveLocation,
  toMoveRuns,
} from "./ff1-nav";

describe("ff1 overworld grid", () => {
  it("loads the extracted 256x256 grid", () => {
    expect(MAP_WIDTH).toBe(256);
    expect(allLocations().length).toBeGreaterThan(0);
  });

  it("maps the reader's scroll to the party tile at scroll + 7", () => {
    // Dev save 000015 (town exit): scroll 147,155 -> the Coneria door tile.
    expect(playerTile(147, 155)).toEqual({ x: 154, y: 162 });
  });

  it("resolves location names and slugs", () => {
    expect(resolveLocation("coneria")?.name).toBe("Coneria");
    expect(resolveLocation("Coneria")?.name).toBe("Coneria");
    expect(resolveLocation("castle_of_ordeals")?.name).toBe("Castle of Ordeals");
    expect(resolveLocation("nowhere")).toBeUndefined();
  });

  it("exposes only named locations to goto", () => {
    expect(namedLocations().every((loc) => !!loc.name)).toBe(true);
    expect(namedLocations().length).toBeLessThan(allLocations().length);
  });
});

describe("ff1 A* pathfinding", () => {
  it("walks from the Corneria start area to the town entrance", () => {
    const from = playerTile(146, 158); // dev save 000001 start position
    const coneria = resolveLocation("coneria")!;
    const goal = entranceFor(coneria, from);
    const result = findPath(from, goal, "foot");

    expect(result.found).toBe(true);
    expect(result.path.at(-1)).toEqual(goal);
    // Every step lands on a walkable tile and moves exactly one tile.
    let cursor = from;
    for (const step of result.path) {
      const d = Math.abs(step.x - cursor.x) + Math.abs(step.y - cursor.y);
      expect(d === 1 || d === MAP_WIDTH - 1).toBe(true);
      cursor = step;
    }
  });

  it("refuses to path onto an unreachable tile", () => {
    const result = findPath({ x: 1, y: 1 }, { x: 130, y: 130 }, "foot");
    expect(result.found).toBe(false);
    expect(result.path).toEqual([]);
  });

  it("reports no path instead of a partial route", () => {
    const planned = planRoute("Gaia", playerTile(146, 158), "foot");
    expect("error" in planned).toBe(true);
  });

  it("plans a route to a named location from the party tile", () => {
    const planned = planRoute("coneria", playerTile(146, 158), "foot");
    expect("error" in planned).toBe(false);
  });

  it("collapses a path into straight runs", () => {
    const from = playerTile(146, 158);
    const coneria = resolveLocation("coneria")!;
    const goal = entranceFor(coneria, from);
    const result = findPath(from, goal, "foot");
    const runs = toMoveRuns(from, result.path);

    expect(result.found).toBe(true);
    expect(runs.reduce((n, r) => n + r.tiles, 0)).toBe(result.path.length);
    for (const run of runs) expect(run.tiles).toBeGreaterThan(0);
    // Adjacent runs must change direction, otherwise they should have merged.
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]!.direction).not.toBe(runs[i - 1]!.direction);
    }
  });

  it("counts one straight run for a pure-axis route", () => {
    const runs = toMoveRuns({ x: 10, y: 10 }, [{ x: 10, y: 11 }, { x: 10, y: 12 }, { x: 10, y: 13 }]);
    expect(runs).toEqual([{ direction: "down", tiles: 3 }]);
  });

  it("keeps a run going across a world wrap", () => {
    const runs = toMoveRuns({ x: 255, y: 10 }, [{ x: 0, y: 10 }, { x: 1, y: 10 }]);
    expect(runs).toEqual([{ direction: "right", tiles: 2 }]);
  });
});
