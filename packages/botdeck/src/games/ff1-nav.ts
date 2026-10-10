/**
 * FF1 overworld navigation: the extracted tile grid plus A* pathfinding.
 *
 * The grid comes from `games/ff1/maps/overworld.json`, produced by
 * `games/ff1/scripts/extract-ow-map.mjs` and verified against the live
 * emulator's resident `mapdata` window. It is imported as a static module
 * (alias `@games/ff1-map/`), never fetched over `/api`.
 *
 * Coordinate system (VERIFIED, `OWCanMove @Calc`, bank_0F.asm:1086+): RAM
 * `$0027/$0028` are the overworld SCROLL, i.e. the top-left tile of the screen.
 * The party's own tile is `scroll + 7` on each axis, wrapped mod 256. Callers
 * must go through `playerTile()` rather than treating `world.overworldX/Y` as a
 * position.
 *
 * Movement timing (VERIFIED, `StartMapMove` + `OWMove_*`, bank_0F.asm:3879,745):
 * the game moves `move_speed` pixels per frame and a tile is 16 pixels, so one
 * tile costs `16 / move_speed` frames: foot 16, canoe 16, ship 8, airship 4.
 * A partial tile always completes, so holding a direction for
 * `tiles * framesPerTile` frames advances exactly that many tiles.
 */

import overworldJson from "@games/ff1-map/overworld.json";
import { NES_BUTTONS, type ButtonStep } from "@/types";
import { press } from "./ff1-menu";

/** Vehicles the walkability masks are keyed by. */
export type Vehicle = "foot" | "canoe" | "ship" | "airship";

export interface Tile {
  x: number;
  y: number;
}

export interface TileProps {
  blockMask: number;
  special: number;
  minimap: number;
  pass: Record<Vehicle, boolean>;
}

export interface MapLocation {
  destMapId: number;
  teleportIds: number[];
  x: number;
  y: number;
  warpTiles: [number, number][];
  name: string | null;
  glyph: string;
}

interface RawOverworld {
  width: number;
  height: number;
  tiles: number[][];
  tileProps: Record<string, TileProps>;
  locations: MapLocation[];
}

const raw = overworldJson as unknown as RawOverworld;

export const MAP_WIDTH = raw.width;
export const MAP_HEIGHT = raw.height;

/** tiles[y][x] -> tileset property entry. */
function propsAt(x: number, y: number): TileProps | undefined {
  const row = raw.tiles[y];
  if (row === undefined) return undefined;
  const id = row[x];
  if (id === undefined) return undefined;
  return raw.tileProps[String(id)];
}

/** Tile ID at a position, or undefined when off the grid. */
export function tileIdAt(x: number, y: number): number | undefined {
  return raw.tiles[y]?.[x];
}

/**
 * Can the given vehicle occupy this tile? Out-of-bounds is not walkable; the
 * world wraps at 256 in both axes, so callers wrap coordinates before asking.
 */
export function isWalkable(x: number, y: number, vehicle: Vehicle): boolean {
  if (vehicle === "airship") {
    // OWCanMove short-circuits for the airship: no collision anywhere.
    return inBounds(x, y);
  }
  const props = propsAt(x, y);
  if (!props) return false;
  return props.pass[vehicle];
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT;
}

/** Wrap a coordinate pair into the 256x256 toroidal world. */
export function wrapTile(x: number, y: number): Tile {
  return { x: ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH, y: ((y % MAP_HEIGHT) + MAP_HEIGHT) % MAP_HEIGHT };
}

/**
 * Convert the reader's scroll position into the party's actual tile. Kept here
 * so the grid module is testable on its own; production callers should use
 * `world.overworldPlayerX/Y`, which the reader derives with the same offset.
 *
 * @param scrollX - `world.overworldX` ($0027).
 * @param scrollY - `world.overworldY` ($0028).
 */
export function playerTile(scrollX: number, scrollY: number): Tile {
  return wrapTile(scrollX + 7, scrollY + 7);
}

/** Locations the agent can name in `goto`: only the ones with a real name. */
export function namedLocations(): MapLocation[] {
  return raw.locations.filter((loc) => !!loc.name);
}

/** All extracted locations, named or not. */
export function allLocations(): MapLocation[] {
  return raw.locations;
}

/**
 * Resolve a `goto` location argument to a named location. Matches the full
 * name, the id-style slug (`coneria` from "Coneria"), or a unique prefix.
 */
export function resolveLocation(name: string): MapLocation | undefined {
  const wanted = name.trim().toLowerCase().replace(/[_\s]+/g, " ");
  const slug = (loc: MapLocation) => loc.name!.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const list = namedLocations();
  const exact = list.find((loc) => loc.name!.toLowerCase() === wanted.replace(" ", ""));
  if (exact) return exact;
  const byName = list.filter((loc) => loc.name!.toLowerCase() === wanted);
  if (byName.length === 1) return byName[0];
  const bySlug = list.filter((loc) => slug(loc) === wanted.replace(/ /g, "_"));
  if (bySlug.length === 1) return bySlug[0];
  const prefix = list.filter(
    (loc) => loc.name!.toLowerCase().startsWith(wanted) || slug(loc).startsWith(wanted.replace(/ /g, "_")),
  );
  return prefix.length === 1 ? prefix[0] : undefined;
}

/** Frames the party spends crossing one tile in the given vehicle. */
export const FRAMES_PER_TILE: Record<Vehicle, number> = {
  foot: 16,
  canoe: 16,
  ship: 8,
  airship: 4,
};

/**
 * Frames a d-pad button is held to start one tile step.
 *
 * MEASURED (`games/ff1/scripts/probe-ow-move.mjs`, headless jsnes against
 * recorded save states): the game latches a step on the first frame it reads the
 * pad, and an in-progress tile always completes even after release. Two frames
 * is comfortably enough to be read once.
 */
export const OW_STEP_HOLD_FRAMES = 2;

/**
 * Idle frames after a step, long enough for the tile crossing to finish with the
 * pad released so the party stops exactly on the intended tile.
 *
 * A hold-only timing model is not usable: stepping UP/LEFT changes the scroll on
 * the frame after the press (the ROM decrements the scroll while its pixel
 * counter is still zero) while DOWN/RIGHT changes it on the sixteenth, so
 * `k * FRAMES_PER_TILE` moves `k` tiles in one pair of directions and `k - 1` in
 * the other. Pressing once per tile sidesteps that phase difference entirely.
 */
export const OW_STEP_GAP_FRAMES = 20;

const DIRECTIONS: readonly { dx: number; dy: number }[] = [
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 1, dy: 0 },
];

export interface PathResult {
  /** Tiles walked, excluding the start tile and including the goal tile. */
  path: Tile[];
  /** Movement cost of the path in tiles. */
  cost: number;
}

/** An open-list node: a candidate tile with its A* scores. */
interface OpenNode {
  f: number;
  g: number;
  x: number;
  y: number;
}

/**
 * Minimal binary min-heap on `f`. The overworld is 65k tiles, so the open set
 * gets large enough that a linear scan costs visible frame time.
 */
class OpenHeap {
  private items: OpenNode[] = [];

  get size(): number {
    return this.items.length;
  }

  push(node: OpenNode): void {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent]!.f <= items[i]!.f) break;
      [items[parent], items[i]] = [items[i]!, items[parent]!];
      i = parent;
    }
  }

  pop(): OpenNode | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length === 0 || last === undefined) return top;
    items[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < items.length && items[left]!.f < items[smallest]!.f) smallest = left;
      if (right < items.length && items[right]!.f < items[smallest]!.f) smallest = right;
      if (smallest === i) break;
      [items[i], items[smallest]] = [items[smallest]!, items[i]!];
      i = smallest;
    }
    return top;
  }
}

/**
 * A* over the 4-connected overworld grid.
 *
 * Both endpoints are wrapped into the world. Returns `found: false` when the
 * goal is unreachable with this vehicle instead of returning a partial route.
 *
 * @param from - Starting tile (the party's real tile, see `playerTile`).
 * @param to - Goal tile (typically a location's entrance).
 * @param vehicle - Vehicle whose walkability mask governs movement.
 */
export function findPath(from: Tile, to: Tile, vehicle: Vehicle): PathResult & { found: boolean } {
  const start = wrapTile(from.x, from.y);
  const goal = wrapTile(to.x, to.y);
  if (!isWalkable(goal.x, goal.y, vehicle)) {
    return { found: false, path: [], cost: 0 };
  }
  if (start.x === goal.x && start.y === goal.y) {
    return { found: true, path: [], cost: 0 };
  }

  // Shortest path in a toroidal 4-grid, measured per axis so wrapping works.
  const heuristic = (x: number, y: number) => {
    const dx = Math.min(Math.abs(x - goal.x), MAP_WIDTH - Math.abs(x - goal.x));
    const dy = Math.min(Math.abs(y - goal.y), MAP_HEIGHT - Math.abs(y - goal.y));
    return dx + dy;
  };

  const key = (x: number, y: number) => y * MAP_WIDTH + x;
  const startKey = key(start.x, start.y);
  const goalKey = key(goal.x, goal.y);

  const cameFrom = new Map<number, number>();
  const closed = new Set<number>();
  const open = new OpenHeap();
  open.push({ f: heuristic(start.x, start.y), g: 0, x: start.x, y: start.y });

  while (open.size > 0) {
    const node = open.pop()!;
    const { g: currentG, x: cx, y: cy } = node;
    const currentKey = key(cx, cy);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (currentKey === goalKey) {
      const path: Tile[] = [];
      let walk = currentKey;
      while (walk !== startKey) {
        path.push({ x: walk % MAP_WIDTH, y: Math.floor(walk / MAP_WIDTH) });
        const prev = cameFrom.get(walk);
        if (prev === undefined) break;
        walk = prev;
      }
      path.reverse();
      return { found: true, path, cost: currentG };
    }

    for (const { dx, dy } of DIRECTIONS) {
      const next = wrapTile(cx + dx, cy + dy);
      if (!isWalkable(next.x, next.y, vehicle)) continue;
      const nextKey = key(next.x, next.y);
      if (closed.has(nextKey)) continue;
      const g = currentG + 1;
      cameFrom.set(nextKey, currentKey);
      open.push({ f: g + heuristic(next.x, next.y), g, x: next.x, y: next.y });
    }
  }

  return { found: false, path: [], cost: 0 };
}

/**
 * Entrance tile for a named location, chosen as the warp tile closest to the
 * party. Locations have several warp tiles (one per door); walking onto any of
 * them enters the destination map.
 */
export function entranceFor(loc: MapLocation, from: Tile): Tile {
  let best: Tile = { x: loc.x, y: loc.y };
  let bestD = Infinity;
  for (const [wx, wy] of loc.warpTiles) {
    const d = Math.abs(wx - from.x) + Math.abs(wy - from.y);
    if (d < bestD) {
      bestD = d;
      best = { x: wx, y: wy };
    }
  }
  return best;
}

/**
 * Plan a route from the party's current tile to a named location.
 *
 * @param name - Location name or slug, as the agent types it.
 * @param from - The party's tile (`world.overworldPlayerX/Y`).
 * @param vehicle - Current vehicle; defaults to foot.
 */
export function planRoute(
  name: string,
  from: Tile,
  vehicle: Vehicle = "foot",
): { location: MapLocation; goal: Tile; result: PathResult & { found: boolean } } | { error: string } {
  const loc = resolveLocation(name);
  if (!loc) {
    return { error: `goto: unknown location "${name}". Use one of the available locations listed in the state.` };
  }
  const goal = entranceFor(loc, from);
  const result = findPath(from, goal, vehicle);
  if (!result.found) {
    return { error: `goto: no ${vehicle} path from (${from.x},${from.y}) to ${loc.name} at (${goal.x},${goal.y}).` };
  }
  return { location: loc, goal, result };
}

/** A straight run of tiles in one direction. */
export interface MoveRun {
  direction: "up" | "down" | "left" | "right";
  tiles: number;
}

/**
 * Collapse a tile path into straight runs. Each run is one held d-pad
 * direction; the game's own tile-stepping does the rest.
 *
 * @param path - Tiles from `findPath`, excluding the start tile.
 */
/**
 * Collapse a path into straight runs. Each run is one held d-pad direction;
 * the game's own tile-stepping handles the per-tile advancing.
 *
 * @param from - The tile the party stands on before the first step.
 * @param path - Tiles from `findPath`, excluding `from` and including the goal.
 */
export function toMoveRuns(from: Tile, path: Tile[]): MoveRun[] {
  const runs: MoveRun[] = [];
  let cursor = from;
  for (const step of path) {
    const direction = stepDirection(cursor, step);
    if (direction === undefined) continue;
    const last = runs[runs.length - 1];
    if (last && last.direction === direction) last.tiles += 1;
    else runs.push({ direction, tiles: 1 });
    cursor = step;
  }
  return runs;
}

/**
 * Direction of a single tile step, treating a >1 delta as a world wrap. Returns
 * undefined when the two tiles are the same.
 */
function stepDirection(from: Tile, to: Tile): MoveRun["direction"] | undefined {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  // A wrapped step spans the whole grid; its sign flips because the party left
  // one edge and appeared on the other, still travelling the same way.
  if (Math.abs(dx) > 1) dx = dx > 0 ? -1 : 1;
  if (Math.abs(dy) > 1) dy = dy > 0 ? -1 : 1;
  if (dy === -1 && dx === 0) return "up";
  if (dy === 1 && dx === 0) return "down";
  if (dx === -1 && dy === 0) return "left";
  if (dx === 1 && dy === 0) return "right";
  return undefined;
}

/**
 * BFS over the walkable grid from a starting tile: the exact set of tiles the
 * current vehicle can occupy. Cheaper than running A* once per location, and it
 * answers the "what can I actually reach" question the location list needs.
 *
 * @param from - Starting tile (the party's real tile, see `playerTile`).
 * @param vehicle - Vehicle whose walkability mask governs movement.
 * @returns A Set of `y * 256 + x` keys. The airship reaches everything.
 */
export function reachableTiles(from: Tile, vehicle: Vehicle): Set<number> {
  const seen = new Set<number>();
  if (vehicle === "airship") {
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) seen.add(y * MAP_WIDTH + x);
    }
    return seen;
  }
  const start = wrapTile(from.x, from.y);
  if (!isWalkable(start.x, start.y, vehicle)) return seen;
  const stack = [start];
  seen.add(start.y * MAP_WIDTH + start.x);
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const { dx, dy } of DIRECTIONS) {
      const next = wrapTile(cur.x + dx, cur.y + dy);
      const key = next.y * MAP_WIDTH + next.x;
      if (seen.has(key) || !isWalkable(next.x, next.y, vehicle)) continue;
      seen.add(key);
      stack.push(next);
    }
  }
  return seen;
}

/**
 * Named locations the party can actually walk into right now: those with at
 * least one warp tile inside the reachable tile set. Results are cached per
 * (tile, vehicle) because the set changes only when the party moves.
 */
const reachCache = new Map<string, MapLocation[]>();

export function reachableNamedLocations(from: Tile, vehicle: Vehicle): MapLocation[] {
  const cacheKey = `${from.x},${from.y},${vehicle}`;
  const hit = reachCache.get(cacheKey);
  if (hit) return hit;
  const seen = reachableTiles(from, vehicle);
  const list = namedLocations().filter((loc) =>
    loc.warpTiles.some(([wx, wy]) => seen.has(wy * MAP_WIDTH + wx)),
  );
  if (reachCache.size > 64) reachCache.clear();
  reachCache.set(cacheKey, list);
  return list;
}

/** A planned route, ready to compile into buttons. */
export interface RoutePlan {
  location: MapLocation;
  from: Tile;
  goal: Tile;
  /** Tiles walked, excluding `from` and including `goal`. */
  path: Tile[];
  /** The same route expressed as straight runs, for display. */
  runs: MoveRun[];
  /** Tiles walked, i.e. the length of `path`. */
  tiles: number;
}

const RUN_BUTTONS: Readonly<Record<MoveRun["direction"], number>> = {
  up: NES_BUTTONS.UP,
  down: NES_BUTTONS.DOWN,
  left: NES_BUTTONS.LEFT,
  right: NES_BUTTONS.RIGHT,
};

/**
 * Compile a route into the d-pad macro that walks it: one press per tile.
 *
 * @param plan - A planned route, from `gotoMacro`.
 * @param vehicle - Vehicle whose step timing applies.
 */
export function routeToSteps(plan: RoutePlan, vehicle: Vehicle): ButtonStep[] {
  const steps: ButtonStep[] = [];
  let cursor = plan.from;
  for (const step of plan.path) {
    const direction = stepDirection(cursor, step);
    if (direction === undefined) continue;
    steps.push(press(RUN_BUTTONS[direction], OW_STEP_HOLD_FRAMES, OW_STEP_GAP_FRAMES));
    cursor = step;
  }
  return steps;
}

/**
 * Plan and compile a `goto` in one call.
 *
 * @throws Error when the name is unknown or no path exists for this vehicle, so
 * the agent sees a real failure instead of a silent no-op macro.
 */
export function gotoMacro(
  name: string,
  from: Tile,
  vehicle: Vehicle = "foot",
): { steps: ButtonStep[]; plan: RoutePlan } {
  const planned = planRoute(name, from, vehicle);
  if ("error" in planned) throw new Error(planned.error);
  const plan: RoutePlan = {
    location: planned.location,
    from,
    goal: planned.goal,
    path: planned.result.path,
    runs: toMoveRuns(from, planned.result.path),
    tiles: planned.result.path.length,
  };
  return { steps: routeToSteps(plan, vehicle), plan };
}
