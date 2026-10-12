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
  terrain: string;
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

/** Stable string key for a tile coordinate, used by obstacle sets. */
export function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Build a set of tiles occupied by map objects, optionally excluding a target tile (e.g. the NPC we want to talk to). */
export function objectBlockedTiles(objects: { physicalX: number; physicalY: number }[], exclude?: { x: number; y: number }): Set<string> {
  const set = new Set<string>();
  for (const obj of objects) {
    if (exclude && obj.physicalX === exclude.x && obj.physicalY === exclude.y) continue;
    set.add(tileKey(obj.physicalX, obj.physicalY));
  }
  return set;
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
export function findPath(from: Tile, to: Tile, vehicle: Vehicle, blocked?: Set<string>): PathResult & { found: boolean } {
  const start = wrapTile(from.x, from.y);
  const goal = wrapTile(to.x, to.y);
  const blockedKey = (x: number, y: number) => blocked?.has(tileKey(x, y)) ?? false;
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
      if (blockedKey(next.x, next.y) && !(next.x === goal.x && next.y === goal.y)) continue;
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
  blocked?: Set<string>,
): { location: MapLocation; goal: Tile; result: PathResult & { found: boolean } } | { error: string } {
  const loc = resolveLocation(name);
  if (!loc) {
    return { error: `goto: unknown location "${name}". Use one of the available locations listed in the state.` };
  }
  const goal = entranceFor(loc, from);
  const result = findPath(from, goal, vehicle, blocked);
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

/**
 * A planned route, ready to compile into buttons.
 */
export interface RoutePlan {
  /** Map the plan was computed on: overworld or a standard-map id. */
  mapId: number | "overworld";
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

export const RUN_BUTTONS: Readonly<Record<MoveRun["direction"], number>> = {
  up: NES_BUTTONS.UP,
  down: NES_BUTTONS.DOWN,
  left: NES_BUTTONS.LEFT,
  right: NES_BUTTONS.RIGHT,
};

/**
 * Compile a raw tile path into button presses, using the standard one-press-
 * per-tile timing. This is useful when a caller already has a path and just
 * needs the d-pad sequence (e.g. walking to an NPC before talking).
 */
export function walkPathToSteps(from: Tile, path: Tile[], hold = OW_STEP_HOLD_FRAMES, gap = OW_STEP_GAP_FRAMES): ButtonStep[] {
  const steps: ButtonStep[] = [];
  let cursor = from;
  for (const step of path) {
    const direction = stepDirection(cursor, step);
    if (direction === undefined) continue;
    steps.push(press(RUN_BUTTONS[direction], hold, gap));
    cursor = step;
  }
  return steps;
}

/**
 * Compile a route into the d-pad macro that walks it: one press per tile.
 *
 * @param plan - A planned route, from `gotoMacro`.
 * @param vehicle - Vehicle whose step timing applies.
 */
export function routeToSteps(plan: RoutePlan, vehicle?: Vehicle): ButtonStep[] {
  // Step timing is the same for every overworld move_speed except the
  // airship; nothing currently routes by airship, so keep the parameter for
  // call sites that name the vehicle and mark it intentionally unused.
  void vehicle;
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
  blocked?: Set<string>,
): { steps: ButtonStep[]; plan: RoutePlan } {
  const planned = planRoute(name, from, vehicle, blocked);
  if ("error" in planned) throw new Error(planned.error);
  const plan: RoutePlan = {
    mapId: "overworld",
    location: planned.location,
    from,
    goal: planned.goal,
    path: planned.result.path,
    runs: toMoveRuns(from, planned.result.path),
    tiles: planned.result.path.length,
  };
  return { steps: routeToSteps(plan, vehicle), plan };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Standard maps (towns / castles / dungeon floors).
 *
 * The grid comes from the per-map `games/ff1/maps/<name>.json` files, produced by
 * `games/ff1/scripts/extract-sm-map.mjs` (same process as the overworld map:
 * lut_SMPtrTbl pointer -> DecompressMap -> 64x64 tiles, tile properties from
 * lut_SMTilesetProp). Same coordinate system as the overworld: the party's
 * tile is $68/$69 directly in RAM, wrapped mod 64 on every axis (AND #$3F).
 * ═══════════════════════════════════════════════════════════════════════════ */

export interface SmTileProps {
  noMove: boolean;
  battle: boolean;
  /** TP_SPEC_* bits (Constants.inc). 0x02 room door, 0x04 locked door. */
  special: number;
  param: number;
  walkable: boolean;
}

/**
 * Locked-door special bit (TP_SPEC_LOCKED, Constants.inc). The tile is
 * no-move in the extracted grid; the game's `SMMove_Door` only permits a step
 * onto it while `item_mystickey` is set (`bank_0F.asm:3471+`). It rewrites the
 * PPU door graphic, never the RAM `mapdata` tile, so there is no persistent
 * "open" tile to read: passability is exactly the Mystic-Key flag.
 */
export const TP_SPEC_LOCKED = 0x04;

/** A doorway/teleport cluster or POI inside a standard map. */
export interface SmLocation {
  /** normal = teleport to another standard map; exit = to the overworld; warp = back one floor via stack; poi = a door/tile the party walks onto to interact. */
  type: "normal" | "exit" | "warp" | "poi";
  destMapId: number | null;
  destScroll: { x: number; y: number } | null;
  teleportIds: (number | null)[];
  x: number;
  y: number;
  warpTiles: [number, number][];
  name: string | null;
  /** True for synthesized out-of-map void exits (goal-only walkability). */
  void?: boolean;
  /** POI kind, when type === "poi". */
  poiKind?: string;
}

interface RawSmPoi {
  kind: string;
  label: string;
  param: number;
  x: number;
  y: number;
  tiles: [number, number][];
}

interface RawSmMap {
  id: number;
  name: string | null;
  nameVerified?: boolean;
  tileset: number;
  width: number;
  height: number;
  tiles: number[][];
  tileProps: Record<string, SmTileProps>;
  /** Out-of-map warp void clusters (stepping onto one exits the map). */
  voidTiles?: { type: string; x: number; y: number; tiles: [number, number][] }[];
  locations: SmLocation[];
  /** Points of interest: shop/inn/clinic doors, chests, etc. */
  poi?: RawSmPoi[];
}

const smModules = import.meta.glob("@games/ff1-map/*.json", { eager: true }) as Record<
  string,
  { default: unknown }
>;
const rawSmMaps: Record<string, RawSmMap> = {};
for (const [, mod] of Object.entries(smModules)) {
  const m = mod.default as unknown;
  if (m && typeof m === "object" && "tiles" in (m as RawSmMap) && "locations" in (m as RawSmMap)) {
    const map = m as RawSmMap;
    rawSmMaps[String(map.id)] = map;
  }
}

export function standardMap(mapId: number): RawSmMap | undefined {
  return rawSmMaps[String(mapId)];
}

function mapPropsAt(map: RawSmMap, x: number, y: number): SmTileProps | undefined {
  const tile = map.tiles[y]?.[x];
  if (tile === undefined) return undefined;
  return map.tileProps[String(tile)];
}

const voidSetCache = new Map<number, Set<string>>();

/** Any four-neighbor of (x,y) that party-walkable (never into the void)? */
function smHasWalkableNeighbor(map: RawSmMap, x: number, y: number): boolean {
  for (const d of DIRECTIONS) {
    const nx = (x + d.dx + map.width) % map.width;
    const ny = (y + d.dy + map.height) % map.height;
    if (smIsWalkable(map, nx, ny)) return true;
  }
  return false;
}

/** "x,y" keys of a map's out-of-map warp-void tiles (empty when none). */
function smVoidSet(map: RawSmMap): Set<string> {
  const hit = voidSetCache.get(map.id);
  if (hit) return hit;
  const set = new Set<string>();
  for (const v of map.voidTiles ?? []) {
    for (const [x, y] of v.tiles) set.add(`${x},${y}`);
  }
  voidSetCache.set(map.id, set);
  return set;
}

/**
 * Standard maps walk on foot only; TP_NOMOVE is the single walkability bit.
 *
 * @param openLockedDoors - When the party holds the Mystic Key, locked-door
 * tiles (special 0x04) become steppable, matching `SMMove_Door`. Off by
 * default so callers that do not model the key keep the door as a wall.
 */
export function smIsWalkable(
  map: RawSmMap,
  x: number,
  y: number,
  openLockedDoors = false,
): boolean {
  const props = mapPropsAt(map, x, y);
  if (!props) return false;
  // A locked door is a wall only while the key is absent; with it the tile is
  // an ordinary step. Checked before the walkable bit because the door tile is
  // itself flagged no-move in the static grid.
  if (openLockedDoors && props.special === TP_SPEC_LOCKED) return true;
  if (!props.walkable) return false;
  // Out-of-map warp-void tiles are not navigable steps: stepping on them
  // exits the map, so A* must treat them as walls (they can only be a goal).
  if (smVoidSet(map).has(`${x},${y}`)) return false;
  return true;
}

/**
 * Low-level A* over a 4-connected grid with optional per-axis wrap (the game
 * wraps overworld coords mod 256 and standard-map coords mod 64 with AND #$3F,
 * so both map families are toroidal).
 */
interface GridSpec {
  width: number;
  height: number;
  wrapX: boolean;
  wrapY: boolean;
  passable(x: number, y: number): boolean;
}

/**
 * A* options: `goalPass` loosens the passability check for the GOAL tile only
 * (never for intermediate steps). Used when the goal is a tile the party can
 * only stand on as a terminal action, e.g. a town's out-of-map warp void.
 */
interface AstarOptions {
  goalPass?: (tile: Tile) => boolean;
  blocked?: Set<string>;
  /** Party holds the Mystic Key: locked-door tiles (special 0x04) are steppable. */
  openLockedDoors?: boolean;
}

function astarOnGrid(spec: GridSpec, from: Tile, to: Tile, opts?: AstarOptions): PathResult & { found: boolean } {
  const mod = (v: number, n: number) => ((v % n) + n) % n;
  const wrapTileTo = (s: GridSpec, x: number, y: number): Tile => ({
    x: s.wrapX ? mod(x, s.width) : x,
    y: s.wrapY ? mod(y, s.height) : y,
  });
  const start = wrapTileTo(spec, from.x, from.y);
  const goal = wrapTileTo(spec, to.x, to.y);
  const blockedKey = (x: number, y: number) => opts?.blocked?.has(tileKey(x, y)) ?? false;
  if (!spec.passable(goal.x, goal.y) && !(opts?.goalPass?.(goal) ?? false)) {
    return { found: false, path: [], cost: 0 };
  }
  if (start.x === goal.x && start.y === goal.y) return { found: true, path: [], cost: 0 };

  const delta = (a: number, b: number, n: number) => {
    if (spec.wrapX || spec.wrapY) return Math.min(Math.abs(a - b), n - Math.abs(a - b));
    return Math.abs(a - b);
  };
  const heuristic = (x: number, y: number) => delta(x, goal.x, spec.width) + delta(y, goal.y, spec.height);

  const key = (x: number, y: number) => y * spec.width + x;
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
        path.push({ x: walk % spec.width, y: Math.floor(walk / spec.width) });
        const prev = cameFrom.get(walk);
        if (prev === undefined) break;
        walk = prev;
      }
      path.reverse();
      return { found: true, path, cost: currentG };
    }

    for (const { dx, dy } of DIRECTIONS) {
      // Standard maps do not wrap (they are hard-bounded by no-move void);
      // the torus only applies where the spec says so.
      if (spec.wrapX || spec.wrapY) {
        // wrapped step below
      } else if (cx + dx < 0 || cx + dx >= spec.width || cy + dy < 0 || cy + dy >= spec.height) {
        continue;
      }
      const next = wrapTileTo(spec, cx + dx, cy + dy);
      const nextKey = key(next.x, next.y);
      // Normal walkability, except the goal tile may be a terminal-only step
      // (goalPass) when the caller allows it, e.g. an out-of-map warp void.
      const terminalGoal = nextKey === goalKey && (opts?.goalPass?.(next) ?? false);
      if ((!spec.passable(next.x, next.y) || blockedKey(next.x, next.y)) && !terminalGoal) continue;
      if (closed.has(nextKey)) continue;
      const g = currentG + 1;
      if (cameFrom.has(nextKey)) continue;
      cameFrom.set(nextKey, currentKey);
      open.push({ f: g + heuristic(next.x, next.y), g, x: next.x, y: next.y });
    }
  }

  return { found: false, path: [], cost: 0 };
}

/**
 * A* for the current standard map.
 *
 * @param mapId - Standard-map id (`world.mapId`).
 * @param from - Party tile (`world.standardMapX/Y`).
 */
export function findSmPath(mapId: number, from: Tile, to: Tile, opts?: AstarOptions): PathResult & { found: boolean } {
  const map = standardMap(mapId);
  if (!map) return { found: false, path: [], cost: 0 };
  // Standard maps are hard-bounded by no-move void; the party cannot wrap
  // around the edges. Only the overworld is a true torus.
  return astarOnGrid(
    { width: map.width, height: map.height, wrapX: false, wrapY: false, passable: (x, y) => smIsWalkable(map, x, y, opts?.openLockedDoors ?? false) },
    from,
    to,
    opts,
  );
}

/** POIs the party can walk onto to interact with (shops, inn, clinic, etc.).
 *
 * Door sprites in the ROM are marked TP_SPEC_DOOR (special 0x02) and are
 * no-move. The walkable tile directly in front of the door (usually south)
 * carries TP_SPEC_CLOSEROOM (special 0x06) and is the actual place the party
 * stands to enter. The extractor labels the 0x06 tile "Close-rooms door",
 * which is misleading; for navigation we want the sidewalk tile, so this
 * function returns the walkable neighbor of each real door POI as the target.
 */
function smPoiLocations(mapId: number): SmLocation[] {
  const map = standardMap(mapId);
  if (!map || !map.poi) return [];
  const doors = map.poi.filter((p) => p.kind === "door" || p.kind === "lockedDoor");
  const out: SmLocation[] = [];
  for (const d of doors) {
    // The door itself may be no-move; find the adjacent walkable tile the
    // party stands on to use it. Prefer the tile below, then any neighbor.
    let entrance: { x: number; y: number } | null = null;
    for (const { dx, dy } of [
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ]) {
      const ex = d.x + dx;
      const ey = d.y + dy;
      if (smIsWalkable(map, ex, ey)) {
        entrance = { x: ex, y: ey };
        break;
      }
    }
    if (!entrance) continue;
    out.push({
      type: "poi" as const,
      destMapId: null,
      destScroll: null,
      teleportIds: [],
      // Keep the actual door tile as the POI origin; route planning will walk
      // onto it as the terminal step and trigger the interior transition.
      x: d.x,
      y: d.y,
      warpTiles: [[entrance.x, entrance.y]],
      name: normalizePoiName(d.label ?? ""),
      poiKind: d.kind,
    });
  }
  return out;
}

function normalizePoiName(name: string): string {
  return name.toLowerCase().replace(/\s+door\s*$/g, "").trim();
}

/**
 * Candidate `goto` targets on the current standard map for a name.
 *
 * Normal teleports are matched by *destination map name* (they carry the name
 * of the map they lead to) and are unambiguous; "exit" matches every exit and
 * warp tile, which is inherently ambiguous, so the caller picks the nearest one
 * (`planSmRoute` does) the same way the overworld picks the nearest door with
 * `entranceFor`.
 *
 * POIs (shops, inn, clinic doors) are also valid targets: the party walks onto
 * the door tile, which the game then uses as the entrance to the interior map.
 */
export function resolveSmLocation(mapId: number, name: string): SmLocation[] {
  const map = standardMap(mapId);
  if (!map) return [];
  const wanted = trimLoc(name);
  const named = map.locations.filter(
    (loc) => loc.type === "normal" && loc.name &&
      (loc.name.toLowerCase() === wanted || loc.name.toLowerCase().startsWith(wanted)),
  );
  if (named.length > 0) return named;
  if (wanted === "exit" || wanted === "overworld" || wanted === "world map") {
    return map.locations.filter((loc) => loc.type !== "normal");
  }
  // Match POIs by their full label or by the "Weapon Shop" part of "Weapon Shop door".
  const pois = smPoiLocations(mapId).filter((loc) => {
    if (!loc.name) return false;
    const base = normalizePoiName(loc.name);
    const lower = loc.name.toLowerCase();
    return lower === wanted || lower.startsWith(wanted) || base === wanted || base.startsWith(wanted);
  });
  if (pois.length > 0) return pois;
  return [];
}

function trimLoc(name: string): string {
  return name.trim().toLowerCase().replace(/[_\s-]+/g, " ");
}

/** Walkability spec for a standard map, ready for `astarOnGrid`. */
export function smGridSpec(mapId: number): GridSpec | undefined {
  const map = standardMap(mapId);
  if (!map) return undefined;
  // Standard maps do not wrap; see findSmPath.
  return { width: map.width, height: map.height, wrapX: false, wrapY: false, passable: (x, y) => smIsWalkable(map, x, y) };
}

/** Walkability spec for the overworld for one vehicle. */
function owGridSpec(vehicle: Vehicle): GridSpec {
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    wrapX: true,
    wrapY: true,
    passable: (x, y) => isWalkable(x, y, vehicle),
  };
}

/**
 * Plan a route to one of the current standard map's teleport clusters.
 *
 * @param name - "exit", a destination map name ("Coneria Castle"), or prefix.
 * @param from - Party tile on the standard map.
 */
export function planSmRoute(
  mapId: number,
  name: string,
  from: Tile,
  blocked?: Set<string>,
  openLockedDoors = false,
): { location: SmLocation; goal: Tile; result: PathResult & { found: boolean } } | { error: string } {
  const cands = resolveSmLocation(mapId, name);
  const map = standardMap(mapId)!;
  let voidExit = false;
  const wantedExit = ["exit/end of map", "exit", "overworld", "world map"].includes(trimLoc(name));
  if (cands.length === 0 && wantedExit && (map.voidTiles?.length ?? 0) > 0) {
    // No explicit exit doorways: the map is left through its out-of-map warp
    // void (e.g. Coneria town). Route to the nearest void tile; stepping on it
    // is the terminal action.
    voidExit = true;
  } else if (cands.length === 0) {
    return { error: `goto: no such doorway "${name}" on this map. Use one of the available locations listed in the state.` };
  }
  const ambiguous = cands.filter((loc) => loc.type === "normal");
  if (ambiguous.length > 1) {
    return { error: `goto: "${name}" matches ${ambiguous.length} named teleports; be more specific.` };
  }

  if (voidExit) {
    // Nearest void tile adjacent to walkable ground, by torus distance.
    const cands: { tile: Tile; d: number }[] = [];
    for (const v of map.voidTiles!) {
      for (const [x, y] of v.tiles) {
        if (!smHasWalkableNeighbor(map, x, y)) continue;
        cands.push({ tile: { x, y }, d: Math.abs(x - from.x) + Math.abs(y - from.y) });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    if (cands.length === 0) {
      return { error: `goto: no reachable void exit found on this map.` };
    }
    // Try candidates in distance order until one is path-reachable.
    let goal: Tile | null = null;
    let result: PathResult & { found: boolean } = { found: false, path: [], cost: 0 };
    for (const cand of cands) {
      const finalAction = (t: Tile) => t.x === cand.tile.x && t.y === cand.tile.y;
      const attempt = findSmPath(mapId, from, cand.tile, { goalPass: finalAction, blocked, openLockedDoors });
      if (attempt.found) {
        goal = cand.tile;
        result = attempt;
        break;
      }
    }
    if (!goal) {
      return { error: `goto: no path from (${from.x},${from.y}) to the ${map.name ?? "map"} exit.` };
    }
    const voidLoc: SmLocation = {
      type: "warp",
      destMapId: null,
      destScroll: null,
      teleportIds: [null],
      x: goal.x,
      y: goal.y,
      warpTiles: [[goal.x, goal.y]],
      name: (map.name ? `${map.name} exit` : "exit"),
      void: true,
    };
    return { location: voidLoc, goal, result };
  }

  // Doorway clusters resolve to the nearest tile of the nearest cluster,
  // mirroring the overworld's entranceFor().
  const loc = pickSmDoor(cands, from);
  // For POI doors, the goal is the door tile itself: the party walks onto it
  // as the terminal step, which triggers the transition into the building.
  // For normal exits/teleports, the goal is the nearest usable warp tile.
  const goal = loc.type === "poi" ? { x: loc.x, y: loc.y } : nearestSmWarpTile(loc, from);

  // POI door tiles and out-of-map warp void tiles are no-move as intermediate
  // steps, but walking onto them is the terminal action. Treat the goal tile as
  // passable only as the final step.
  const isPoi = loc.type === "poi";
  const result = findSmPath(
    mapId,
    from,
    goal,
    isPoi || loc.void ? { goalPass: (t) => t.x === goal.x && t.y === goal.y, blocked, openLockedDoors } : { blocked, openLockedDoors },
  );
  if (!result.found) {
    return { error: `goto: no path from (${from.x},${from.y}) to the ${loc.type} at (${goal.x},${goal.y}).` };
  }
  return { location: loc, goal, result };
}

/**
 * Pick the nearest of the candidate clusters (same nearest-door rule as the
 * overworld's entranceFor).
 */
function smDist(a: Tile, b: Tile): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function pickSmDoor(cands: SmLocation[], from: Tile): SmLocation {
  if (cands.length === 1) return cands[0]!;
  let loc = cands[0]!;
  let best = nearestSmWarpTile(loc, from);
  let bestD = smDist(best, from);
  for (const cand of cands.slice(1)) {
    const t = nearestSmWarpTile(cand, from);
    const d = smDist(t, from);
    if (d < bestD) {
      bestD = d;
      best = t;
      loc = cand;
    }
  }
  return loc;
}

function smallerDoor(a: SmLocation, b: SmLocation, from: Tile): SmLocation {
  const da = nearestSmWarpTile(a, from);
  const db = nearestSmWarpTile(b, from);
  return smDist(db, from) < smDist(da, from) ? b : a;
}
void smallerDoor;

/** Entrance tile for a standard-map location: the warp tile nearest the party. */
export function nearestSmWarpTile(loc: SmLocation, from: Tile): Tile {
  let best: Tile = { x: loc.x, y: loc.y };
  let bestD = Infinity;
  for (const [wx, wy] of loc.warpTiles) {
    const d = smDist({ x: wx, y: wy }, from);
    if (d < bestD) {
      bestD = d;
      best = { x: wx, y: wy };
    }
  }
  return best;
}

/** Signed difference folded into the shortest direction across a torus. */
export function wrapDelta(d: number, size: number): number {
  if (Math.abs(d) <= size / 2) return d;
  return d > 0 ? d - size : d + size;
}

/** Human-readable list of the doors/teleports/POIs one standard map offers. */
export function smAvailableLocations(mapId: number): { id: string; name: string; type: "point" }[] {
  const map = standardMap(mapId);
  if (!map) return [];
  const out: { id: string; name: string; type: "point" }[] = [];
  for (const loc of map.locations) {
    if (loc.type === "normal") {
      const name = loc.name ?? `map 0x${loc.destMapId?.toString(16) ?? "?"}`;
      out.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name, type: "point" });
    } else if (loc.type === "exit") {
      out.push({ id: "exit", name: "Exit", type: "point" });
    }
  }
  for (const poi of smPoiLocations(mapId)) {
    if (!poi.name) continue;
    const name = normalizePoiName(poi.name);
    out.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name, type: "point" });
  }
  // Dedup by name: several doors can lead to the same destination.
  const seen = new Set<string>();
  return out.filter((l) => (seen.has(l.name) ? false : (seen.add(l.name), true)));
}

/**
 * Goal for `goto`-in-a-town: the party walks onto a teleport/exit tile, which
 * the game then turns into the map transition itself (no extra A press).
 */
export function gotoSmMacro(
  mapId: number,
  name: string,
  from: Tile,
  blocked?: Set<string>,
  openLockedDoors = false,
): { steps: ButtonStep[]; plan: RoutePlan } {
  const planned = planSmRoute(mapId, name, from, blocked, openLockedDoors);
  if ("error" in planned) throw new Error(planned.error);
  const plan: RoutePlan = {
    mapId,
    location: { destMapId: planned.location.destMapId ?? -1, teleportIds: [], x: planned.location.x, y: planned.location.y, warpTiles: planned.location.warpTiles, name: planned.location.name, glyph: "" },
    from,
    goal: planned.goal,
    path: planned.result.path,
    runs: toMoveRuns(from, planned.result.path),
    tiles: planned.result.path.length,
  };
  return { steps: routeToSteps(plan, "foot"), plan };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Random walk ("grind").
 *
 * Steps are chosen randomly among legal directions, confined to tiles within
 * `distance` (Manhattan, walked-torus metric) of the center. The macro aborts
 * on battle, so "walk around until a battle is encountered" needs no explicit
 * stop condition: the abort ends the macro when the encounter arrives.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Deterministic PRNG (mulberry32) so a plan can be replayed from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GrindSpec {
  /** Center of the walk area. */
  center: Tile;
  /** Max torus-Manhattan distance from center the walk may leave. */
  distance: number;
  /** Grid topology and walkability. */
  grid: GridSpec;
  /** Cap on compiled random steps; the macro aborts on battle before this. */
  maxSteps?: number;
  /** Optional PRNG; defaults to a fresh mulberry32 from Date.now(). */
  rng?: () => number;
  /** Optional set of tiles occupied by objects/NPCs that the walk may not enter. */
  blocked?: Set<string>;
}

/** Where on the grid can the walk step? Never steps onto an impassable or blocked tile. */
function grindNeighborOk(spec: GrindSpec, node: Tile, next: Tile): boolean {
  const { grid, center, distance, blocked } = spec;
  if (!grid.passable(next.x, next.y)) return false;
  const pos = { x: grid.wrapX ? ((next.x % grid.width) + grid.width) % grid.width : next.x, y: grid.wrapY ? ((next.y % grid.height) + grid.height) % grid.height : next.y };
  if (blocked?.has(tileKey(pos.x, pos.y))) return false;
  const d = Math.abs(wrapDelta(pos.x - center.x, grid.width)) + Math.abs(wrapDelta(pos.y - center.y, grid.height));
  if (d > distance) return false;
  void node;
  return true;
}

/**
 * Compile a random-walk drive on the given grid. Returns one pad-press per
 * tile, one step at a time; the walk prefers to keep walking (it only turns
 * back when the distance cap or the terrain forces it).
 *
 * @returns `steps` to press plus the tiles actually walked (deduped cursor),
 *   counted separately so the caller can log "distance walked".
 */
export function randomWalkSteps(spec: GrindSpec): ButtonStep[] {
  const {
    center, grid, maxSteps = 160, rng = mulberry32(Date.now()),
  } = spec;
  const hold = OW_STEP_HOLD_FRAMES;
  const gap = OW_STEP_GAP_FRAMES;
  const steps: ButtonStep[] = [];

  // Bias the first steps toward the center from outside the radius.
  let cursor = clampToTile(grid, center);
  let biased = true;

  for (let n = 0; n < maxSteps; n++) {
    const options = DIRECTIONS.map((d, i) => ({ d, i }))
      .map(({ d, i }) => ({ d, i, next: wrapTileOn(grid, cursor.x + d.dx, cursor.y + d.dy) }))
      .filter(({ next }) => grindNeighborOk(spec, cursor, next));
    if (options.length === 0) break;

    let chosen: { next: Tile; i: number };
    if (biased) {
      // Step toward the center while any toward-center option remains legal.
      const dir = biasedStep(grid, cursor, center, options.map((o) => o.i));
      chosen = dir !== undefined
        ? options[dir]!
        : options[Math.floor(rng() * options.length)]!;
      const distNow = manhattanOnTorus(cursor, center, grid);
      if (distNow <= 1) biased = false;
    } else {
      chosen = options[Math.floor(rng() * options.length)]!;
    }
    cursor = chosen.next;
    const d = DIRECTIONS[chosen.i]!;
    steps.push(press(buttonForD(d), hold, gap));
  }
  return steps;
}

function clampToTile(grid: GridSpec, t: Tile): Tile {
  return wrapTileOn(grid, t.x, t.y);
}

function wrapTileOn(grid: GridSpec, x: number, y: number): Tile {
  const w = (v: number, n: number, wrap: boolean) => (wrap ? ((v % n) + n) % n : Math.min(Math.max(v, 0), n - 1));
  return { x: w(x, grid.width, grid.wrapX), y: w(y, grid.height, grid.wrapY) };
}

function manhattanOnTorus(a: Tile, b: Tile, grid: GridSpec): number {
  const dx = Math.abs(wrapDelta(a.x - b.x, grid.width));
  const dy = Math.abs(wrapDelta(a.y - b.y, grid.height));
  return dx + dy;
}

function biasedStep(grid: GridSpec, cursor: Tile, center: Tile, allowed: number[]): number | undefined {
  const dx = wrapDelta(center.x - cursor.x, grid.width);
  const dy = wrapDelta(center.y - cursor.y, grid.height);
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
    const idx = dx > 0 ? 3 : 2; // right, left
    if (allowed.includes(idx)) return idx;
  }
  if (dy !== 0) {
    const idx = dy > 0 ? 1 : 0; // down, up
    if (allowed.includes(idx)) return idx;
  }
  return undefined;
}

function buttonForD(d: { dx: number; dy: number }): number {
  if (d.dy === -1) return NES_BUTTONS.UP;
  if (d.dy === 1) return NES_BUTTONS.DOWN;
  if (d.dx === -1) return NES_BUTTONS.LEFT;
  return NES_BUTTONS.RIGHT;
}

/**
 * Plan and compile a `grind` in one call: A* to the center on the current map
 * family, then random walk inside the radius until the macro abort hits.
 *
 * @param coords - Center coordinate to walk around.
 * @param distance - Max Manhattan distance from the center. Required.
 * @param from - The party's tile on the current map.
 * @param where - "overworld" with a vehicle, or a standard-map id.
 */
export function grindMacro(
  coords: Tile,
  distance: number,
  from: Tile,
  where: { kind: "overworld"; vehicle: Vehicle } | { kind: "standard"; mapId: number },
  blocked?: Set<string>,
): { steps: ButtonStep[]; plan: { center: Tile; distance: number; approach: Tile[]; walkSteps: number } } {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new Error("grind: distance must be a non-negative number of tiles.");
  }
  const grid = where.kind === "overworld" ? owGridSpec(where.vehicle) : smGridSpec(where.mapId);
  if (!grid) throw new Error(`grind: unknown standard map ${where.kind === "standard" ? where.mapId : ""}.`);

  // A* approach to the center (skip when already on it).
  const approach = findPathOnGrid(grid, from, coords, blocked);
  if (!approach.found) {
    throw new Error(
      `grind: the walk-area center (${coords.x},${coords.y}) is unreachable from (${from.x},${from.y}) on this map.`,
    );
  }
  const approachSteps = approach.found ? routeToSteps({ mapId: where.kind === "overworld" ? "overworld" : where.mapId, location: { destMapId: -1, teleportIds: [], x: coords.x, y: coords.y, warpTiles: [], name: null, glyph: "" }, from, goal: coords, path: approach.path, runs: [], tiles: approach.path.length }, "foot") : [];

  const center = wrapTileOn(grid, coords.x, coords.y);
  const walk = randomWalkSteps({ center, distance, grid });
  return {
    steps: [...approachSteps, ...walk],
    plan: { center, distance, approach: approach.path, walkSteps: walk.length },
  };
}

/** Route a path over a spec'd grid by reusing it through astarOnGrid. */
function findPathOnGrid(spec: GridSpec, from: Tile, to: Tile, blocked?: Set<string>): PathResult & { found: boolean } {
  return astarOnGrid(spec, from, to, { blocked });
}
