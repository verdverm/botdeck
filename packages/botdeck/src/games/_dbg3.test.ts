/**
 * Debug assertions for the standard-map module loading surface (per-map JSON
 * files loaded via import.meta.glob). Kept as a permanent diagnostic surface
 * for the extractor/nav pairing, like _dbg.test.ts and _dbg2.test.ts.
 */
import { expect, it } from "vitest";
import { standardMap } from "./ff1-nav";

it("dbg3: per-map file loading carries the out-of-map void data", () => {
  const m = standardMap(0)!;
  expect(m.name).toBe("Coneria");
  const voids = m.voidTiles ?? [];
  expect(voids.length).toBeGreaterThan(0);
  expect(voids[0]!.type).toBe("warp");
});
