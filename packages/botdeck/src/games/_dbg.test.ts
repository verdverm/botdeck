/**
 * Debug assertions for the extracted standard-map locations. Kept as a
 * permanent diagnostic surface for the extractor/nav pair: when the extractor
 * output shape changes, these pin what the nav module must adapt to.
 */
import { expect, it } from "vitest";
import { planSmRoute, standardMap } from "./ff1-nav";

it("dbg: dumped and asserted SM location shape", () => {
  const m = standardMap(0)!;
  const dump0 = m.locations
    .map((l) => `${l.type} ${l.name} @${l.x},${l.y} tiles:${l.warpTiles.length}`)
    .join("\n");
  // Coneria town carries no doorway clusters: the only leave-route is the
  // out-of-map warp void (now in voidTiles, not locations).
  expect(dump0).toBe("");
  expect(standardMap(8)!.locations.some((l) => l.type === "exit")).toBe(true);

  // Named normal teleports inside a standard map always target unnamed
  // dungeon floors, so Coneria has no named normal door; 'exit' resolves via
  // the nearest-door rule (or the warp void for doorway-less maps).
  const voidPlanned = planSmRoute(0, "exit", { x: 10, y: 10 });
  if ("error" in voidPlanned) throw new Error(voidPlanned.error);
  expect(voidPlanned.location.type).not.toBe("normal");
  expect(voidPlanned.location.void).toBe(true);
});
