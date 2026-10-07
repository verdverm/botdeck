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

/**
 * Compile an enemy/ally target-slot request into the button presses the game's
 * linear target cursor actually expects.
 *
 * Both `SelectEnemyTarget` (bank_0C.asm) and `SelectPlayerTarget` reset their
 * cursor to the first *legal* stop when the menu opens, then move UP/DOWN only
 * (never LEFT/RIGHT), skipping empty/dead slots, and wrap past the last stop
 * back to the first. The cursor walks a fixed slot order (`cursorOrder`, the
 * ROM's per-formation `lut_EnemyIndex*` for enemies, party index order for
 * allies). So the only thing to compute is how many DOWN presses move from the
 * first-legal cursor stop to the stop that lands on `targetSlot`.
 *
 * Returns the number of DOWN presses, or `undefined` when the requested slot is
 * not selectable (dead/empty/not in the order), so callers can fail loud rather
 * than press toward a cursor position that can never resolve.
 */
export function targetCursorDownPresses(
  targetSlot: number,
  cursorOrder: number[],
  aliveSlots: number[],
): number | undefined {
  const alive = new Set(aliveSlots);
  // The stops the cursor can actually land on, in navigation order: the slot
  // order filtered to alive entries.
  const stops = cursorOrder.filter((s) => alive.has(s));
  if (stops.length === 0) return undefined;
  const pos = stops.indexOf(targetSlot);
  if (pos < 0) return undefined;
  // Cursor enters on stops[0]; DOWN advances one stop at a time and wraps.
  return pos % stops.length;
}

/**
 * Resolve a target argument to a concrete enemy slot index from the live enemy
 * roster. Accepts the canonical 0-based `"Name (slot N)"` label, a bare numeric
 * slot, a `"slot N"` reference, or a leading-enemy name. Slot identity is
 * preserved against dead slots so the returned index can be matched against the
 * navigation order's alive filter.
 */
export function resolveEnemySlot(
  target: number | string | undefined,
  enemies: { slot: number; name?: string; alive?: boolean }[],
): number | undefined {
  if (typeof target === "number") return Number.isFinite(target) ? target : undefined;
  if (typeof target !== "string") return undefined;
  const raw = target.trim();
  if (raw === "") return undefined;
  // Canonical / explicit slot reference: "(slot N)" or "slot N". 0-based.
  const slotMatch = raw.match(/slot\s*(\d+)/i);
  if (slotMatch) return Number(slotMatch[1]);
  // Bare numeric index (0-based), e.g. "1" or "enemy_2" -> 2 (1-based legacy).
  const enemyN = raw.match(/(?:enemy[_\s]?)(\d+)/i);
  if (enemyN) return Number(enemyN[1]) - 1;
  const bare = Number(raw);
  if (Number.isFinite(bare) && raw !== "") return bare;
  // Name match against the roster (first alive with that name).
  const normalized = raw.toLowerCase();
  const byName = enemies.find(
    (e) => (e.name ?? "").toLowerCase() === normalized || (e.name ?? "").toLowerCase().startsWith(normalized),
  );
  return byName?.slot;
}

/**
 * Resolve a target argument to a party member index (0-based). Accepts a name
 * or a `(slot N)` / bare-numeric index reference.
 */
export function resolveAllySlot(
  target: number | string | undefined,
  party: { index: number; name?: string; alive?: boolean }[],
): number | undefined {
  if (typeof target === "number") return Number.isFinite(target) ? target : undefined;
  if (typeof target !== "string") return undefined;
  const raw = target.trim();
  if (raw === "") return undefined;
  const slotMatch = raw.match(/slot\s*(\d+)/i);
  if (slotMatch) return Number(slotMatch[1]);
  const bare = Number(raw);
  if (Number.isFinite(bare) && raw !== "") return bare;
  const normalized = raw.toLowerCase();
  const byName = party.find(
    (m) => (m.name ?? "").toLowerCase() === normalized || (m.name ?? "").toLowerCase().startsWith(normalized),
  );
  return byName?.index;
}

