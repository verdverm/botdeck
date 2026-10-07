import { describe, expect, it } from "vitest";
import { NES_BUTTONS } from "@/types";
import {
  navigateVertical,
  navigateDirection,
  resolveMenuIndex,
  targetCursorDownPresses,
  resolveEnemySlot,
  resolveAllySlot,
  indexFromLabel,
} from "./ff1-menu";

describe("navigateDirection", () => {
  it("presses the requested button N times", () => {
    expect(navigateDirection("down", 2)).toEqual([
      { button: NES_BUTTONS.DOWN, holdFrames: 4, gapFrames: 12 },
      { button: NES_BUTTONS.DOWN, holdFrames: 4, gapFrames: 12 },
    ]);
  });

  it("returns empty for unknown directions", () => {
    expect(navigateDirection("jump", 2)).toEqual([]);
  });
});

describe("navigateVertical", () => {
  it("moves down from a known cursor", () => {
    const steps = navigateVertical(0, 2);
    expect(steps).toHaveLength(2);
    expect(steps.every((s) => s.button === NES_BUTTONS.DOWN)).toBe(true);
  });

  it("moves up when target is above", () => {
    const steps = navigateVertical(3, 1);
    expect(steps).toHaveLength(2);
    expect(steps.every((s) => s.button === NES_BUTTONS.UP)).toBe(true);
  });

  it("does nothing when already at target", () => {
    expect(navigateVertical(2, 2)).toEqual([]);
  });

  it("falls back to relative down moves when cursor is unknown", () => {
    const steps = navigateVertical(undefined, 2);
    expect(steps).toHaveLength(2);
    expect(steps.every((s) => s.button === NES_BUTTONS.DOWN)).toBe(true);
  });

  it("wraps around when requested", () => {
    // 5 items, current 1, target 4: forward 3 vs back 2 -> choose back 2.
    expect(navigateVertical(1, 4, { max: 5, wrap: true })).toHaveLength(2);
  });
});

describe("targetCursorDownPresses", () => {
  // 9-small formation order verified against the ROM (lut_EnemyIndex9Small):
  // cursor index i lands on enemy slot order [1,0,2,4,3,5,7,6,8].
  const order9 = [1, 0, 2, 4, 3, 5, 7, 6, 8];
  it("first legal stop needs no presses", () => {
    // All 5 enemies alive: cursor enters on stops[0]=slot 1.
    expect(targetCursorDownPresses(1, order9, [0, 1, 2, 3, 4])).toBe(0);
  });

  it("lands on the formation-order position, not row-major", () => {
    // slot 0 is the 2nd stop -> 1 DOWN; slot 2 is 3rd -> 2 DOWN; etc.
    expect(targetCursorDownPresses(0, order9, [0, 1, 2, 3, 4])).toBe(1);
    expect(targetCursorDownPresses(2, order9, [0, 1, 2, 3, 4])).toBe(2);
    expect(targetCursorDownPresses(4, order9, [0, 1, 2, 3, 4])).toBe(3);
    expect(targetCursorDownPresses(3, order9, [0, 1, 2, 3, 4])).toBe(4);
  });

  it("skips dead slots, counting only live stops", () => {
    // slot 1 dead: stops become [0,2,4,3]. slot 0 is now stops[0] -> 0 DOWN.
    expect(targetCursorDownPresses(0, order9, [0, 2, 3, 4])).toBe(0);
    expect(targetCursorDownPresses(4, order9, [0, 2, 3, 4])).toBe(2);
  });

  it("wraps around the alive stop list", () => {
    // The cursor walks the FULL formation order, skipping dead slots, so with
    // only slots {2,3} alive the stops are [2,3] (2 precedes 3 in order9).
    expect(targetCursorDownPresses(2, order9, [2, 3])).toBe(0);
    expect(targetCursorDownPresses(3, order9, [2, 3])).toBe(1);
  });

  it("returns undefined for a dead or out-of-order slot", () => {
    expect(targetCursorDownPresses(3, order9, [0, 1, 2, 4])).toBeUndefined();
    expect(targetCursorDownPresses(99, order9, [0, 1])).toBeUndefined();
    expect(targetCursorDownPresses(0, [], [0])).toBeUndefined();
  });
});

describe("resolveEnemySlot", () => {
  const roster = [
    { slot: 0, name: "Goblin", alive: true },
    { slot: 1, name: "Imp", alive: true },
    { slot: 2, name: "Goblin", alive: false },
  ];
  it("parses the canonical 0-based (slot N) label", () => {
    expect(resolveEnemySlot("Goblin (slot 0)", roster)).toBe(0);
    expect(resolveEnemySlot("Imp (slot 1)", roster)).toBe(1);
  });

  it("parses bare-numeric and 'slot N' references (no off-by-one)", () => {
    expect(resolveEnemySlot("0", roster)).toBe(0);
    expect(resolveEnemySlot("2", roster)).toBe(2);
    expect(resolveEnemySlot("slot 1", roster)).toBe(1);
  });

  it("supports 1-based enemy_N legacy labels", () => {
    expect(resolveEnemySlot("enemy_3", roster)).toBe(2);
  });

  it("matches roster names", () => {
    expect(resolveEnemySlot("Imp", roster)).toBe(1);
  });

  it("returns undefined for empty/unresolvable", () => {
    expect(resolveEnemySlot("", roster)).toBeUndefined();
    expect(resolveEnemySlot("nope", roster)).toBeUndefined();
    expect(resolveEnemySlot(undefined, roster)).toBeUndefined();
  });
});

describe("resolveAllySlot", () => {
  const party = [
    { index: 0, name: "Stu", alive: true },
    { index: 1, name: "Rias", alive: true },
  ];
  it("matches by name", () => {
    expect(resolveAllySlot("Rias", party)).toBe(1);
  });
  it("parses 0-based slot references", () => {
    expect(resolveAllySlot("Jaki (slot 3)", party)).toBe(3);
    expect(resolveAllySlot("0", party)).toBe(0);
  });
});

describe("indexFromLabel", () => {
  it("matches exact labels", () => {
    expect(indexFromLabel("ITEM", ["ITEM", "MAGIC", "WEAPON"])).toBe(0);
  });

  it("matches prefixes case-insensitively", () => {
    expect(indexFromLabel("mag", ["ITEM", "MAGIC", "WEAPON"])).toBe(1);
  });

  it("returns undefined when no match", () => {
    expect(indexFromLabel("nope", ["ITEM", "MAGIC"])).toBeUndefined();
  });
});

describe("resolveMenuIndex", () => {
  it("returns numeric targets", () => {
    expect(resolveMenuIndex(2, ["A", "B", "C"], 0)).toBe(2);
  });

  it("parses numeric strings", () => {
    expect(resolveMenuIndex("2", ["A", "B", "C"], 0)).toBe(2);
  });

  it("matches labels", () => {
    expect(resolveMenuIndex("B", ["A", "B", "C"], 0)).toBe(1);
  });

  it("falls back to current cursor", () => {
    expect(resolveMenuIndex(undefined, ["A", "B", "C"], 2)).toBe(2);
  });
});

