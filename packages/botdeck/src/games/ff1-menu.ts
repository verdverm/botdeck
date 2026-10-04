/**
 * Shared menu-navigation compiler for FF1.
 *
 * Menus, battles, and shops are all cursor-driven menus. These helpers turn a
 * target index/label/position into a deterministic ButtonStep[] sequence. Where
 * the current cursor is readable from RAM, the compiler moves efficiently from
 * the current position; where it is not, it trusts the provided relative steps.
 */

import { NES_BUTTONS, type ButtonStep } from "@/types";

export const HOLD_FRAMES = 4;
export const GAP_FRAMES = 4;
export const MENU_GAP_FRAMES = 12;

export function press(button: number, hold = HOLD_FRAMES, gap = MENU_GAP_FRAMES): ButtonStep {
  return { button, holdFrames: hold, gapFrames: gap };
}

export function pressA(hold?: number, gap?: number): ButtonStep {
  return press(NES_BUTTONS.A, hold, gap);
}

export function pressB(hold?: number, gap?: number): ButtonStep {
  return press(NES_BUTTONS.B, hold, gap);
}

export function pressStart(hold?: number, gap?: number): ButtonStep {
  return press(NES_BUTTONS.START, hold, gap);
}

export function pressSelect(hold?: number, gap?: number): ButtonStep {
  return press(NES_BUTTONS.SELECT, hold, gap);
}

const DIRECTION_BUTTONS: Readonly<Record<string, number>> = {
  up: NES_BUTTONS.UP,
  down: NES_BUTTONS.DOWN,
  left: NES_BUTTONS.LEFT,
  right: NES_BUTTONS.RIGHT,
};

export function navigateDirection(direction: string, steps = 1): ButtonStep[] {
  const button = DIRECTION_BUTTONS[direction.toLowerCase()];
  if (button === undefined) return [];
  const out: ButtonStep[] = [];
  for (let i = 0; i < steps; i++) {
    out.push(press(button));
  }
  return out;
}

export function navigateVertical(
  current: number | undefined,
  target: number,
  options: { max?: number; wrap?: boolean } = {},
): ButtonStep[] {
  if (current === undefined) {
    // No cursor feedback: trust the target as a relative down count.
    return navigateDirection("down", Math.max(0, target));
  }
  const max = options.max;
  const effectiveMax = max !== undefined && max > 0 ? max : Math.max(current, target) + 1;
  let delta = target - current;
  if (options.wrap && effectiveMax > 0) {
    const wrapDown = ((target - current) % effectiveMax + effectiveMax) % effectiveMax;
    const wrapUp = ((current - target) % effectiveMax + effectiveMax) % effectiveMax;
    delta = wrapDown <= wrapUp ? wrapDown : -wrapUp;
  }
  if (delta === 0) return [];
  return navigateDirection(delta > 0 ? "down" : "up", Math.abs(delta));
}

export function navigateGrid(
  current: { x: number; y: number } | undefined,
  target: { x: number; y: number },
  options: { width?: number; height?: number; wrap?: boolean } = {},
): ButtonStep[] {
  const start = current ?? { x: 0, y: 0 };
  const steps: ButtonStep[] = [];
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const width = options.width ?? 3;
  const height = options.height ?? 3;

  function axisMove(delta: number, axisSize: number, positiveDir: string, negativeDir: string): ButtonStep[] {
    if (delta === 0) return [];
    if (options.wrap && axisSize > 0) {
      const positive = ((delta % axisSize) + axisSize) % axisSize;
      const negative = ((-delta % axisSize) + axisSize) % axisSize;
      if (positive <= negative) {
        return navigateDirection(positiveDir, positive);
      }
      return navigateDirection(negativeDir, negative);
    }
    return navigateDirection(delta > 0 ? positiveDir : negativeDir, Math.abs(delta));
  }

  // Move horizontal first, then vertical. Either order is acceptable for a
  // first pass because the cursor is free-moving in target selection.
  steps.push(...axisMove(dx, width, "right", "left"));
  steps.push(...axisMove(dy, height, "down", "up"));
  return steps;
}

export function indexFromLabel(label: string, labels: string[]): number | undefined {
  const normalized = label.toLowerCase().trim();
  const exact = labels.findIndex((l) => l.toLowerCase() === normalized);
  if (exact >= 0) return exact;
  const prefix = labels.findIndex((l) => l.toLowerCase().startsWith(normalized));
  if (prefix >= 0) return prefix;
  return undefined;
}

export function resolveMenuIndex(
  target: number | string | undefined,
  labels: string[],
  current: number | undefined,
): number {
  if (typeof target === "number") return target;
  if (typeof target === "string") {
    const parsed = Number(target);
    if (!Number.isNaN(parsed)) return parsed;
    const fromLabel = indexFromLabel(target, labels);
    if (fromLabel !== undefined) return fromLabel;
  }
  return current ?? 0;
}

export function resolveGridTarget(
  target: number | string | undefined,
  labels: string[],
): { x: number; y: number } | undefined {
  if (typeof target === "number") {
    return { x: target % 3, y: Math.floor(target / 3) };
  }
  if (typeof target === "string") {
    const parsed = Number(target);
    if (!Number.isNaN(parsed)) {
      return { x: parsed % 3, y: Math.floor(parsed / 3) };
    }
    const fromLabel = indexFromLabel(target, labels);
    if (fromLabel !== undefined) {
      return { x: fromLabel % 3, y: Math.floor(fromLabel / 3) };
    }
    // Allow "enemy_N" slot labels.
    const slotMatch = target.match(/(?:enemy[_\s]?|slot[_\s]?)(\d+)/i);
    if (slotMatch) {
      const slot = Number(slotMatch[1]) - 1;
      if (slot >= 0) {
        return { x: slot % 3, y: Math.floor(slot / 3) };
      }
    }
  }
  return undefined;
}

export function slotFromEnemyIndex(index: number): { x: number; y: number } {
  return { x: index % 3, y: Math.floor(index / 3) };
}
