/**
 * Debug path output for standard-map navigation. This test prints the route
 * the current algorithm would take from a few realistic Coneria town tiles to
 * the nearest exit, so we can eyeball whether the path is sane.
 */
import { describe, expect, it } from "vitest";
import { findSmPath, planSmRoute, smIsWalkable, standardMap } from "./ff1-nav";

describe.skip("dbg4: Coneria SM path diagnostics", () => {
  it("dump exit paths from realistic tiles", () => {
    const map = standardMap(0)!;
    const starts = [
      { x: 12, y: 6 },
      { x: 12, y: 14 },
      { x: 7, y: 10 },
      { x: 24, y: 5 },
    ];

    for (const from of starts) {
      const walkable = smIsWalkable(map, from.x, from.y);
      const planned = planSmRoute(0, "exit", from);
      if ("error" in planned) {
        console.log(`from (${from.x},${from.y}) walkable=${walkable} ERROR: ${planned.error}`);
        continue;
      }
      console.log(
        `from (${from.x},${from.y}) walkable=${walkable} -> goal (${planned.goal.x},${planned.goal.y}) tiles=${planned.result.path.length}`,
      );
      console.log("  path: " + planned.result.path.map((t) => `(${t.x},${t.y})`).join(" "));
    }
  });

  it("direct A* sanity from town center", () => {
    const from = { x: 12, y: 6 };
    const to = { x: 12, y: 7 };
    const r = findSmPath(0, from, to);
    console.log(`direct (${from.x},${from.y}) -> (${to.x},${to.y}) found=${r.found} len=${r.path.length}`);
    expect(r.found).toBe(true);
  });
});
