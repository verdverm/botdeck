// Standard map (town/castle/dungeon) extractor for FF1 (NES).
//
// One file per standard map under games/ff1/maps/:
//   <name>.json - tiles, per-tile properties, teleport locations, POIs
//   <name>.txt  - ASCII render with legend
// Names: ROM-verified for 0x00-0x0C; the rest are curated against the chains
// and the walkthrough (games/ff1/guide/main/24-maps.md); inferred entries are
// flagged `nameVerified: false`.
//
// Mechanism (VERIFIED vs disassembly):
//   - lut_SMPtrTbl[cur_map] (bank_0F.asm:4124) -> heads: DecompressMap
//     (bank_0F.asm:4227); 64x64 tiles, coords wrap mod 64 (AND #$3F).
//   - Per-tile partials from lut_SMTilesetProp at $8800+tileset*$100
//     (LoadSMTilesetData adds tileset to the address high byte;
//     bank_0F.asm:2872): 2 bytes/tile, tiles $00-$7F: byte1 [TTB ssssr]:
//     bits 7-6 teleport type, bit 5 battle marker, bits 4-1 special, bit 0
//     TP_NOMOVE. byte2 = teleport ID / chest / door parameter.
//   - Normal teleports (TT=%10) land via lut_NormTele_X/Y/Map, exits
//     (TT=%11) via lut_ExitTele_X/Y, warps (TT=%01) go back one floor.
import fs from "node:fs";
import path from "node:path";
import {
  loadRom,
  MAPS_DIR,
  ROM_PATH,
  STANDARD_MAP_NAMES,
  TP_NOMOVE,
  TP_SPEC_MASK,
  TP_TELE_MASK,
  TP_TELE_NONE,
  TP_TELE_WARP,
  TP_TELE_NORM,
  TP_TELE_EXIT,
  TP_BATTLEMARKER,
  buildSmGrid,
  smTilesetForMap,
  smTilesetProp,
  normalTeleportTables,
  exitTeleportTables,
} from "./ff1-lib.mjs";

// --- SR names ------------------------------------------------------------
// ROM table (verified) for 0x00-0x0C: lut_EntrTele_Name via STANDARD_MAP_NAMES.
// 'verified: false' rows are inferred from the teleport-graph chains and the
// FF1 walkthrough (guide/main/09 and 24-maps.md) - correct in place as
// evidence arrives; every file name follows the slug below.
const SM_NAMES = {
  0x00: { name: "Coneria", verified: true },
  0x01: { name: "Provoka", verified: true },
  0x02: { name: "Elfland", verified: true },
  0x03: { name: "Melmond", verified: true },
  0x04: { name: "Crescent Lake", verified: true },
  0x05: { name: "Gaia", verified: true },
  0x06: { name: "Onrac", verified: true },
  0x07: { name: "Caravan", verified: true },
  0x08: { name: "Coneria Castle", verified: true },
  0x09: { name: "Elfland Castle", verified: true },
  0x0a: { name: "Northwest Castle", verified: true },
  0x0b: { name: "Castle of Ordeals", verified: true },
  0x0c: { name: "Temple of Fiends", verified: true },
  0x0d: { name: "Terra Cavern 1F", verified: false },
  0x0e: { name: "Marsh Cave 1F", verified: false },
  0x0f: { name: "Mt Gulg 1F", verified: false },
  0x10: { name: "Cardia Islands", verified: false },
  0x11: { name: "Bahamut's Lair 1F", verified: false },
  0x12: { name: "Mt. Duergar", verified: false },
  0x13: { name: "Titan's Tunnel", verified: false },
  0x14: { name: "Giant's Cave", verified: false },
  0x15: { name: "Matoya's Cave", verified: false },
  0x16: { name: "Sarda's Cave 1F", verified: false },
  0x17: { name: "Tower of Mirage 1F", verified: false },
  0x18: { name: "Coneria Castle 2F", verified: true },
  0x19: { name: "Castle of Ordeals 2F", verified: true },
  0x1a: { name: "Castle of Ordeals 3F", verified: true },
  0x1b: { name: "Sarda's Cave 2F", verified: false },
  0x1c: { name: "Unknown Cave West 3F", verified: false },
  0x1d: { name: "Terra Cavern 2F", verified: false },
  0x1e: { name: "Terra Cavern 3F", verified: false },
  0x1f: { name: "Terra Cavern 4F", verified: false },
  0x20: { name: "Terra Cavern 5F", verified: false },
  0x21: { name: "Marsh Cave 2Fa", verified: false },
  0x22: { name: "Marsh Cave 2Fb", verified: false },
  0x23: { name: "Marsh Cave 3F", verified: false },
  0x24: { name: "Marsh Cave 4F", verified: false },
  0x25: { name: "Mt Gulg 2F", verified: false },
  0x26: { name: "Mt Gulg 3F", verified: false },
  0x27: { name: "Bahamut's Lair 2F", verified: false },
  0x28: { name: "Tower of Mirage 2F", verified: false },
  0x29: { name: "Tower of Mirage 3F", verified: false },
  0x2a: { name: "Waterfall Cavern", verified: false },
  0x2b: { name: "Sunken Shrine 2Fa", verified: false },
  0x2c: { name: "Sunken Shrine 1F", verified: true },
  0x2d: { name: "Sunken Shrine 2Fb", verified: false },
  0x2e: { name: "Sunken Shrine 3F", verified: false },
  0x2f: { name: "Flying Fortress 1F", verified: true },
  0x30: { name: "Flying Fortress 2F", verified: true },
  0x31: { name: "Flying Fortress 3F", verified: true },
  0x32: { name: "Flying Fortress 4F", verified: true },
  0x33: { name: "Flying Fortress 5F", verified: true },
  0x34: { name: "Temple of Chaos 1F", verified: false },
  0x35: { name: "Temple of Chaos 2F", verified: false },
  0x36: { name: "Temple of Chaos 3F", verified: false },
  0x37: { name: "Temple of Chaos Earth", verified: false },
  0x38: { name: "Temple of Chaos Fire", verified: false },
  0x39: { name: "Temple of Chaos Water", verified: false },
  0x3a: { name: "Temple of Chaos Air", verified: false },
  0x3b: { name: "Temple of Chaos Final", verified: false },
  0x3c: { name: "Unknown Cave West 1F", verified: false },
};

const rom = loadRom();
const norm = normalTeleportTables(rom);
const exitTele = exitTeleportTables(rom);

const validIds = [];
for (let id = 0; id < 64; id++) {
  let grid;
  try {
    grid = buildSmGrid(rom, id);
  } catch (err) {
    continue; // ids 0x3d-0x3f are $0000 padding.
  }
  validIds.push(id);
  const tileset = smTilesetForMap(rom, id);
  const prop = smTilesetProp(rom, tileset);
  const named = SM_NAMES[id] ?? { name: null, verified: false };

  // --- per-tile properties, keyed by tile id like the overworld keys "tile"
  const usedTileIds = new Set();
  for (const row of grid) for (const t of row) usedTileIds.add(t);

  // --- teleport tiles clustered: doorway clusters vs the out-of-map void ----
  // Clusters larger than DOOR_MAX_TILES are not doorways: they are the unused
  // "outside the rendered map" void (stepping there warps the party out of
  // the map). Those tiles are NOT walkable for navigation and render as 'x'.
  const DOOR_MAX_TILES = 32;
  const warpList = [];
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const p = prop[grid[y][x]];
      const type = p.prop & TP_TELE_MASK;
      if (type === TP_TELE_NONE) continue;
      warpList.push({
        x,
        y,
        type,
        tpId: type === TP_TELE_WARP ? null : p.param,
      });
    }
  }

  function splitClusters(list) {
    const set = new Set(list.map((w) => `${w.x},${w.y}`));
    const byPos = new Map(list.map((w) => [`${w.x},${w.y}`, w]));
    const seen = new Set();
    const out = [];
    for (const w of list) {
      const startKey = `${w.x},${w.y}`;
      if (seen.has(startKey)) continue;
      seen.add(startKey);
      const comp = [w];
      const stack = [w];
      while (stack.length) {
        const c = stack.pop();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nk = `${c.x + dx},${c.y + dy}`;
            if (set.has(nk) && !seen.has(nk)) {
              seen.add(nk);
              const n = byPos.get(nk);
              comp.push(n);
              stack.push(n);
            }
          }
        }
      }
      out.push(comp);
    }
    return out;
  }

  const groups = new Map();
  for (const w of warpList) {
    const key = `${w.type}:${w.tpId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }

  const voidKeys = new Set();
  const voidTiles = [];
  for (const [, list0] of groups) {
    for (const list of splitClusters(list0)) {
      if (list.length > DOOR_MAX_TILES) {
        voidTiles.push({
          type: { [TP_TELE_NORM]: "normal", [TP_TELE_EXIT]: "exit", [TP_TELE_WARP]: "warp" }[list[0].type],
          x: list[0].x,
          y: list[0].y,
          tiles: list.map((w) => [w.x, w.y]),
        });
        for (const w of list) voidKeys.add(`${w.x},${w.y}`);
      }
    }
  }

  const tileProps = {};
  for (const t of [...usedTileIds].sort((a, b) => a - b)) {
    const p = prop[t];
    const tpType = p.prop & TP_TELE_MASK;
    tileProps[t] = {
      noMove: (p.prop & TP_NOMOVE) !== 0,
      battle: (p.prop & TP_BATTLEMARKER) !== 0,
      special: p.prop & TP_SPEC_MASK,
      param: p.param,
      teleport: tpType === TP_TELE_NONE ? null : ({ [TP_TELE_WARP]: "warp", [TP_TELE_NORM]: "normal", [TP_TELE_EXIT]: "exit" }[tpType] ?? null),
      walkable: (p.prop & TP_NOMOVE) === 0,
    };
  }

  const locations = [];
  for (const [, list0] of groups) {
    for (const list of splitClusters(list0)) {
      // Giant clusters are the out-of-map void, not a doorway: they live in
      // voidTiles, not in the goto-able location list.
      if (list.length > DOOR_MAX_TILES) continue;
      let name = null;
      let destMapId = null;
      let destX = null;
      let destY = null;
      for (const w of list) {
        if (w.type === TP_TELE_NORM) {
          destMapId = norm.map[w.tpId];
          destX = norm.x[w.tpId];
          destY = norm.y[w.tpId];
        } else if (w.type === TP_TELE_EXIT) {
          destX = exitTele.x[w.tpId];
          destY = exitTele.y[w.tpId];
        }
      }
      if (list[0].type === TP_TELE_NORM) {
        const dest = SM_NAMES[destMapId];
        name = dest ? dest.name : null;
      }
      locations.push({
        type: { [TP_TELE_NORM]: "normal", [TP_TELE_EXIT]: "exit", [TP_TELE_WARP]: "warp" }[list[0].type],
        destMapId,
        destScroll: destX === null ? null : { x: destX, y: destY },
        teleportIds: [...new Set(list.map((w) => w.tpId))].sort((a, b) => a - b),
        x: list[0].x,
        y: list[0].y,
        warpTiles: list.map((w) => [w.x, w.y]),
        name,
      });
    }
  }
  locations.sort((a, b) => a.y - b.y || a.x - b.x);

  // --- points of interest: the special-bit squares on the map (Constants.inc
  // 298-312), grouped by contiguous cluster (each door/building = one entry
  // with its own glyph and legend line).
  // lut_ShopTypes (bank_0F.asm:10376): shop IDs are 1-based, blocks of 10 per
  // type (block 7 holds 9 item shops then the Caravan).
  function shopKindOf(shopId) {
    if (!(shopId >= 1 && shopId <= 70)) return null;
    if (shopId <= 9) return { kind: "weapon_shop", label: "Weapon Shop" };
    if (shopId <= 20) return { kind: "armor_shop", label: "Armor Shop" };
    if (shopId <= 30) return { kind: "white_magic_shop", label: "White Magic Shop" };
    if (shopId <= 40) return { kind: "black_magic_shop", label: "Black Magic Shop" };
    if (shopId <= 50) return { kind: "clinic", label: "Clinic" };
    if (shopId <= 60) return { kind: "inn", label: "Inn" };
    if (shopId <= 69) return { kind: "item_shop", label: "Item Shop" };
    return { kind: "caravan", label: "Caravan" };
  }

  const POI_KINDS = {
    0x02: { kind: "door", label: "Room door" },
    0x04: { kind: "lockedDoor", label: "Locked door" },
    // 0x06 is TP_SPEC_CLOSEROOM. In towns it is the walkable sidewalk tile
    // directly in front of a door (the tile the party stands on to interact
    // with the door above). It is not a door itself, so skip it as a POI.
    0x08: { kind: "treasure", label: "Treasure chest" },
    0x0a: { kind: "battle", label: "Fixed battle" },
    0x0c: { kind: "damage", label: "Damage square" },
    0x0e: { kind: "needCrown", label: "Needs Crown" },
    0x10: { kind: "needCube", label: "Needs Cube" },
    0x12: { kind: "need4Orbs", label: "Needs 4 orbs" },
    0x14: { kind: "useRod", label: "Use Rod" },
    0x16: { kind: "useLute", label: "Use Lute" },
    0x18: { kind: "earthOrb", label: "Earth orb altar" },
    0x1a: { kind: "fireOrb", label: "Fire orb altar" },
    0x1c: { kind: "waterOrb", label: "Water orb altar" },
    0x1e: { kind: "airOrb", label: "Air orb altar" },
  };

  // Collect spec tiles, then 4-connect them by kind to form POI clusters.
  // Skip TP_SPEC_CLOSEROOM (0x06): in towns it is the walkable sidewalk tile
  // in front of a door, not an interactive object on its own.
  const SKIPPED_SPECS = new Set([0x06]);
  const poiTiles = [];
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const p = prop[grid[y][x]];
      const spec = p.prop & TP_SPEC_MASK;
      if (spec === 0 || SKIPPED_SPECS.has(spec)) continue;
      const known = POI_KINDS[spec];
      const shop = shopKindOf(p.param);
      poiTiles.push({
        x,
        y,
        kind: known ? known.kind : `spec0x${spec.toString(16)}`,
        label: known ? known.label : "(unknown spec)",
        param: p.param,
      });
    }
  }
  const pois = [];
  const poiSeen = new Map();
  for (const t of poiTiles.sort((a, b) => a.y - b.y || a.x - b.x)) {
    // merging key: kind + param + contiguity with an existing cluster
    let merged = null;
    for (const poi of pois) {
      if (poi.kind !== t.kind || poi.param !== t.param) continue;
      if (poi.tiles.some(([xx, yy]) => Math.abs(xx - t.x) <= 2 && Math.abs(yy - t.y) <= 2)) {
        merged = poi;
        break;
      }
    }
    if (!merged) {
      merged = { kind: t.kind, label: t.label, param: t.param, x: t.x, y: t.y, tiles: [] };
      pois.push(merged);
    }
    merged.tiles.push([t.x, t.y]);
    // rename: doors take their shop kind's name; others get cluster numbering.
    const shop = shopKindOf(t.param);
    if (t.kind === "door" && shop) {
      merged.label = `${shop.label} door`;
      merged.shop = shop.kind;
    } else if (t.kind !== "door" || !shop) {
      const same = pois.filter((p) => p.kind === t.kind);
      merged.label = `${t.label}${same.length > 1 ? ` #${same.length}` : ""}`;
    }
    merged.x = merged.tiles[0][0];
    merged.y = merged.tiles[0][1];
  }

  const mapFile = {
    id,
    name: named.name,
    nameVerified: named.verified,
    tileset,
    width: 64,
    height: 64,
    tiles: grid,
    tileProps,
    // Out-of-map void: teleport-tile clusters larger than DOOR_MAX_TILES.
    // Navigation must treat these tiles as non-walkable; the render shows them
    // as 'x' (distinct from in-map walls '#').
    voidTiles,
    locations,
    poi: pois,
  };

  // --- ASCII render per map -------------------------------------------------
  // Render chars per tile class:
  //   '.' walkable, '#' wall (no-move tile adjacent to the walkable area),
  //   'X' no-move void unreachable from walkable, 'x' out-of-map teleport
  //   void (voidTiles), location/location doors / POI glyphs on top.
  const chars = [];
  for (let y = 0; y < 64; y++) {
    const row = [];
    for (let x = 0; x < 64; x++) {
      const key = `${x},${y}`;
      if (voidKeys.has(key)) {
        row.push("x");
        continue;
      }
      const tile = mapFile.tileProps[grid[y][x]];
      row.push(tile.walkable ? "." : null);
    }
    chars.push(row);
  }
  // BFS from all walkable tiles through no-move tiles: reached = '#'.
  const seenNM = new Set();
  const queue = [];
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (chars[y][x] === null) continue;
    }
  }
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (chars[y][x] !== ".") continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = (x + dx + 64) % 64;
        const ny = (y + dy + 64) % 64;
        if (chars[ny][nx] === null && !seenNM.has(`${nx},${ny}`)) {
          seenNM.add(`${nx},${ny}`);
          queue.push([nx, ny]);
        }
      }
    }
  }
  while (queue.length) {
    const [x, y] = queue.shift();
    chars[y][x] = "#";
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = (x + dx + 64) % 64;
      const ny = (y + dy + 64) % 64;
      if (chars[ny][nx] === null && !seenNM.has(`${nx},${ny}`)) {
        seenNM.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
  }
  // Remaining no-move tiles are voids unreachable from the walkable area.
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if (chars[y][x] === null) chars[y][x] = "X";
    }
  }

  // POI glyph pool: lowercase letters + digits (kept disjoint from the A-Z/0-9
  // location pool).
  const POI_CHARS = "abcdefghijklmnopqrstuvwxyz";
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const locGlyph = new Map();
  const legend = [];
  locations.forEach((loc, idx) => {
    const g = GLYPHS[idx % GLYPHS.length];
    const dest =
      loc.destMapId !== null && SM_NAMES[loc.destMapId]
        ? `-> ${SM_NAMES[loc.destMapId].name}`
        : loc.type === "exit"
          ? `-> overworld at (${loc.destScroll.x},${loc.destScroll.y})`
          : loc.type === "warp"
            ? "-> previous floor"
            : "";
    legend.push(`${g} = ${loc.type} ${loc.name ?? dest} @ (${loc.x},${loc.y})`);
    // The unused map voids (huge warp regions) get a legend line but not a
    // glyph per tile: a 3400-tile 'A' flood makes the render unreadable.
    if (loc.warpTiles.length <= 32) {
      for (const [wx, wy] of loc.warpTiles) locGlyph.set(`${wx},${wy}`, g);
    }
  });
  const poiGlyph = new Map();
  const poiLegend = [];
  pois.forEach((poi, idx) => {
    const g = POI_CHARS[idx % POI_CHARS.length];
    poiLegend.push(`${g} = ${poi.label}${poi.param ? ` (param ${poi.param})` : ""} @ (${poi.x},${poi.y})`);
    for (const [px, py] of poi.tiles) if (!locGlyph.has(`${px},${py}`)) poiGlyph.set(`${px},${py}`, g);
  });

  const lines = [];
  lines.push(`=== ${named.name ?? "(unnamed)"} (standard map 0x${id.toString(16).padStart(2, "0")}, tileset ${tileset}) ===`);
  if (!named.verified) lines.push("[!] name is inferred - verify against the walkthrough/ROM before trusting it.");
  lines.push("'.' walkable  '#' wall  'x' out-of-map warp void  'X' walled-off void  A-Z/0-9 locations  a-z poi");
  lines.push(`locations: ${locations.length}  poi: ${pois.length}`);
  for (let y = 0; y < 64; y++) {
    let row = "";
    for (let x = 0; x < 64; x++) {
      const key = `${x},${y}`;
      const c = locGlyph.get(key) ?? poiGlyph.get(key);
      row += c ?? chars[y][x];
    }
    lines.push(row);
  }
  lines.push("LEGEND - locations");
  lines.push(...legend);
  lines.push("LEGEND - poi");
  lines.push(...poiLegend);

  const slug = (named.name ?? `sm_${id.toString(16)}`).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  fs.writeFileSync(path.join(MAPS_DIR, `${slug}.json`), JSON.stringify(mapFile, null, 2));
  fs.writeFileSync(path.join(MAPS_DIR, `${slug}.txt`), lines.join("\n") + "\n");
  console.log(`${slug}.json <- 0x${id.toString(16)} ${named.name}`);
}

console.log(`\nWrote ${validIds.length} map files into ${MAPS_DIR}/`);
