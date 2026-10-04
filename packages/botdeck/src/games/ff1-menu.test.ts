import { describe, expect, it } from "vitest";
import { NES_BUTTONS } from "@/types";
import {
  navigateVertical,
  navigateGrid,
  navigateDirection,
  resolveMenuIndex,
  resolveGridTarget,
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

describe("navigateGrid", () => {
  it("moves right and down from origin", () => {
    const steps = navigateGrid({ x: 0, y: 0 }, { x: 2, y: 1 });
    const rights = steps.filter((s) => s.button === NES_BUTTONS.RIGHT);
    const downs = steps.filter((s) => s.button === NES_BUTTONS.DOWN);
    expect(rights).toHaveLength(2);
    expect(downs).toHaveLength(1);
  });

  it("defaults to origin when current is unknown", () => {
    const steps = navigateGrid(undefined, { x: 1, y: 0 });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.button).toBe(NES_BUTTONS.RIGHT);
  });

  it("wraps horizontally when requested", () => {
    // width 3, x=0 -> x=2: forward 2 vs back 1 -> choose back 1.
    expect(navigateGrid({ x: 0, y: 0 }, { x: 2, y: 0 }, { width: 3, wrap: true })).toHaveLength(1);
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

describe("resolveGridTarget", () => {
  it("converts a numeric slot to grid coords", () => {
    expect(resolveGridTarget(4, [])).toEqual({ x: 1, y: 1 });
  });

  it("converts enemy_N labels", () => {
    expect(resolveGridTarget("enemy_3", [])).toEqual({ x: 2, y: 0 });
  });

  it("matches labels", () => {
    expect(resolveGridTarget("Goblin", ["Imp", "Goblin"])).toEqual({ x: 1, y: 0 });
  });

  it("returns undefined for unresolvable targets", () => {
    expect(resolveGridTarget("nope", [])).toBeUndefined();
  });
});
