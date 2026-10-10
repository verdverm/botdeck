/**
 * Debug assertions for SM route planning (nearest-door resolution). Kept as a
 * permanent diagnostic surface for the extractor/nav pair, like _dbg.test.ts.
 */
import { expect, it } from "vitest";
import { planSmRoute, resolveSmLocation, standardMap } from "./ff1-nav";

it("dbg2: SM exit candidates and nearest-door routing", () => {
  // Coneria Castle: exit doors tp4 @ (11,4) and tp5 @ (10,35..36) plus a
  // normal teleport down to the castle's L2 at (12,18). The top-left immense
  // warp block is the out-of-map void, no longer a `locations` doorway.
  const list = resolveSmLocation(8, "exit");
  expect(list.map((l) => `${l.type}@${l.x},${l.y}`)).toEqual(["exit@11,4", "exit@10,36"]);

  // From the west side low area the south exit door tile is the goal.
  const planned = planSmRoute(8, "exit", { x: 4, y: 22 });
  if ("error" in planned) throw new Error(planned.error);
  expect(planned.result.found).toBe(true);
  expect(planned.goal).toEqual({ x: 10, y: 36 });

  // Coneria town has no doorway clusters: it exits through the out-of-map
  // warp void, routed as a goal-only walk onto the nearest void tile.
  const plannedTown = planSmRoute(0, "exit", { x: 12, y: 14 });
  if ("error" in plannedTown) throw new Error(plannedTown.error);
  expect(plannedTown.result.found).toBe(true);
  expect(plannedTown.location.type).toBe("warp");
  expect(plannedTown.location.void).toBe(true);
  expect(standardMap(0)!.locations.length).toBe(0);
  expect(standardMap(0)!.voidTiles?.length).toBeGreaterThan(0);
});
