import { describe, expect, it } from "vitest";
import {
  MAP_WIDTH,
  allLocations,
  entranceFor,
  findPath,
  grindMacro,
  mulberry32,
  namedLocations,
  planRoute,
  randomWalkSteps,
  resolveLocation,
  resolveSmLocation,
  findSmPath,
  planSmRoute,
  playerTile,
  smIsWalkable,
  standardMap,
  tileKey,
  toMoveRuns,
} from "./ff1-nav";
import { NES_BUTTONS } from "@/types";
import { OW_STEP_GAP_FRAMES, OW_STEP_HOLD_FRAMES } from "./ff1-nav";

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

describe("ff1 standard-map nav", () => {
  it("loads extracted standard maps", () => {
    expect(standardMap(0)?.name).toBe("Coneria");
    expect(standardMap(0)?.tiles.length).toBe(64);
    expect(standardMap(0)?.locations.length).toBe(0);
    expect((standardMap(0)?.voidTiles?.length ?? 0)).toBeGreaterThan(0);
  });

  it("coneria town has no doorway clusters, only the warp void", () => {
    // Coneria Castle itself is entered from the overworld; inside Coneria town
    // the only leave-route is the out-of-map warp void.
    expect(standardMap(0)!.locations).toEqual([]);
    expect(resolveSmLocation(0, "exit")).toEqual([]);
  });

  it("resolves 'exit' doorways and picks the nearest tile", () => {
    const list = resolveSmLocation(8, "exit");
    expect(list.length).toBe(2);
    expect(list.every((l) => l.type === "exit")).toBe(true);

    // From (4,22) the nearer of the two exit doors is the southern one.
    const planned = planSmRoute(8, "exit", { x: 4, y: 22 });
    if ("error" in planned) throw new Error(planned.error);
    expect(planned.goal).toEqual({ x: 10, y: 36 });
  });

  it("paths inside Coneria town", () => {
    // Walk between plain town tiles (fountain/promenade area).
    const result = findSmPath(0, { x: 12, y: 6 }, { x: 12, y: 7 });
    expect(result.found).toBe(true);
    expect(smIsWalkable(standardMap(0)!, 12, 6)).toBe(true);
    // Void tiles are NOT navigable through, only terminable goals.
    expect(smIsWalkable(standardMap(0)!, 32, 0)).toBe(false);
  });

  it("routes via the warp void and errors for unknown doorways", () => {
    const planned = planSmRoute(0, "exit", { x: 12, y: 14 });
    if ("error" in planned) throw new Error(planned.error);
    expect(planned.result.found).toBe(true);
    expect(planned.location.type).toBe("warp");
    expect(planned.location.void).toBe(true);
    // The void goal tile itself is a terminal-only step.
    expect(smIsWalkable(standardMap(0)!, planned.goal.x, planned.goal.y)).toBe(false);

    expect(planSmRoute(0, "coneria_castle", { x: 12, y: 14 })).toHaveProperty("error");
  });

  it("paths through a locked door only when the Mystic Key is set", () => {
    // Coneria Castle (mapId 8): locked doors at (12,14)/(17,14) are the only
    // opening between the lower hall (y>=15) and the treasure rooms above
    // (y<=13); every other tile in row 14 is a wall. So a south->north route
    // must step onto a locked-door tile to be found.
    const map = standardMap(8)!;
    const from = { x: 12, y: 16 };
    const to = { x: 12, y: 12 };

    // Door tile is a wall without the key, walkable with it (the game's
    // SMMove_Door rule). smIsWalkable is the primitive both routes use.
    expect(smIsWalkable(map, 12, 14, false)).toBe(false);
    expect(smIsWalkable(map, 12, 14, true)).toBe(true);

    // Without the key the route does not exist.
    expect(findSmPath(8, from, to, { openLockedDoors: false }).found).toBe(false);
    // With the key it is found and the path actually crosses a door tile.
    const withKey = findSmPath(8, from, to, { openLockedDoors: true });
    expect(withKey.found).toBe(true);
    expect(withKey.path.some((t) => smIsWalkable(map, t.x, t.y, false) === false)).toBe(true);
  });

  it("paths through an open room door on Coneria Castle 2F", () => {
    // Coneria Castle 2F (mapId 24): the only way from the entrance at (12,18)
    // to the north room is through the doorway tile at (12,8). It is flagged
    // no-move in the extracted grid but the party walks through it normally.
    const map = standardMap(24)!;
    const from = { x: 12, y: 18 };
    const to = { x: 12, y: 6 };

    expect(smIsWalkable(map, 12, 8)).toBe(true);

    const result = findSmPath(24, from, to);
    expect(result.found).toBe(true);
    expect(result.path.some((t) => t.x === 12 && t.y === 8)).toBe(true);
  });

  it("routes from Coneria entrance to weapon shop", () => {
    // Entrance from dev save: scroll (9,16) -> player tile (16,23).
    const planned = planSmRoute(0, "weapon shop", { x: 16, y: 23 });
    if ("error" in planned) throw new Error(planned.error);
    expect(planned.result.found).toBe(true);
    expect(planned.location.name).toBe("weapon shop");
    // Goal is the door tile itself; the final step walks onto it and triggers
    // the interior transition.
    expect(planned.goal).toEqual({ x: 11, y: 10 });
    expect(planned.result.path.length).toBeGreaterThan(3);
  });
});

describe("ff1 grind (random walk)", () => {
  it("compiles only d-pad steps with the standard step timing", () => {
    const steps = randomWalkSteps({
      center: { x: 20, y: 20 },
      distance: 3,
      grid: { width: 64, height: 64, wrapX: true, wrapY: true, passable: () => true },
      maxSteps: 40,
      rng: mulberry32(1234),
    });
    expect(steps.length).toBe(40);
    for (const step of steps) {
      expect([NES_BUTTONS.UP, NES_BUTTONS.DOWN, NES_BUTTONS.LEFT, NES_BUTTONS.RIGHT]).toContain(step.button);
      expect(step.holdFrames).toBe(OW_STEP_HOLD_FRAMES);
      expect(step.gapFrames).toBe(OW_STEP_GAP_FRAMES);
    }
  });

  it("random walk from the center never leaves the radius", () => {
    const center = { x: 32, y: 32 };
    const distance = 3;
    let cursor = center;
    const hold = { [NES_BUTTONS.UP]: [0, -1], [NES_BUTTONS.DOWN]: [0, 1], [NES_BUTTONS.LEFT]: [-1, 0], [NES_BUTTONS.RIGHT]: [1, 0] } as Record<number, [number, number]>;
    const steps = randomWalkSteps({
      center,
      distance,
      grid: { width: 64, height: 64, wrapX: true, wrapY: true, passable: () => true },
      maxSteps: 50,
      rng: mulberry32(99),
    });
    for (const step of steps) {
      const [dx, dy] = hold[step.button]!;
      cursor = { x: (cursor.x + dx + 64) % 64, y: (cursor.y + dy + 64) % 64 };
      const d = Math.abs(cursor.x - center.x) + Math.abs(cursor.y - center.y);
      expect(d).toBeLessThanOrEqual(distance);
    }
  });

  it("respects walkability from a spec'd grid", () => {
    // Coneria town: walk from a solid area to a walkable one only where possible.
    const map = standardMap(0)!;
    const blocked = { width: 64, height: 64, wrapX: true, wrapY: true, passable: (x: number, y: number) => smIsWalkable(map, x, y) };
    const steps = randomWalkSteps({ center: { x: 8, y: 8 }, distance: 2, grid: blocked, maxSteps: 10, rng: mulberry32(7) });
    expect(steps.length).toBeGreaterThan(0);
  });

  it("grindMacro walks to the center then random walks", () => {
    const from = playerTile(146, 158); // dev start tile (153,165)
    // Center a few tiles away on Coneria's south door tile (154,162), known
    // walkable from the dev save 000015 assertion in the overworld tests.
    const res = grindMacro({ x: 154, y: 162 }, 3, from, { kind: "overworld", vehicle: "foot" });
    expect(res.plan.approach.length).toBeGreaterThan(0);
    expect(res.plan.walkSteps).toBeGreaterThan(0);
    expect(res.steps.length).toBe(res.plan.approach.length + res.plan.walkSteps);
  });

  it("avoids tiles occupied by objects when a blocked set is supplied", () => {
    // Block the direct north/south corridor near the dev start and force a
    // detour east/west.
    const from = playerTile(146, 158);
    const to = { x: from.x, y: from.y + 2 };
    const blocked = new Set([tileKey(from.x, from.y + 1)]);
    const result = findPath(from, to, "foot", blocked);
    expect(result.found).toBe(true);
    expect(result.path.some((t) => t.x === from.x && t.y === from.y + 1)).toBe(false);
  });

  it("lets the goal tile remain reachable even if it is in the blocked set", () => {
    // The blocked set stops intermediate steps, not a deliberate terminal
    // tile. The caller excludes a target NPC from blocked when needed.
    const from = playerTile(146, 158);
    const to = { x: from.x, y: from.y + 1 };
    const blocked = new Set([tileKey(to.x, to.y)]);
    const result = findPath(from, to, "foot", blocked);
    expect(result.found).toBe(true);
    expect(result.path.at(-1)).toEqual(to);
  });

  it("avoids object tiles in standard-map pathfinding", () => {
    // In Coneria town, block the tile between two known walkable plaza tiles.
    const from = { x: 12, y: 6 };
    const to = { x: 14, y: 6 };
    const blocked = new Set([tileKey(13, 6)]);
    const result = findSmPath(0, from, to, { blocked });
    expect(result.found).toBe(true);
    expect(result.path.some((t) => t.x === 13 && t.y === 6)).toBe(false);
  });
});
