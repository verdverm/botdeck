import { describe, expect, it } from "vitest";
import { validateCommand } from "./validate.ts";
import type { TurnRequest, CommandSpec } from "./protocol.ts";

function makeRequest(
  state: Record<string, unknown>,
  options: CommandSpec[],
  mode = "battle",
  actor?: string,
): TurnRequest {
  return {
    gameId: "ff1",
    playId: "ff1/test",
    mode,
    state,
    options,
    actor,
  };
}

const BATTLE_OPTIONS: CommandSpec[] = [
  { name: "fight", description: "Attack", args: '{ "actor": "string", "target": "string" }' },
  { name: "magic", description: "Cast spell", args: '{ "actor": "string", "spell": "string", "target": "string" }' },
  { name: "use_item", description: "Use item", args: '{ "actor": "string", "item": "string", "target": "string" }' },
  { name: "run", description: "Run", args: '{ "actor": "string" }' },
];

function battleState(
  nextIndex: number,
  overrides: {
    dead?: number[];
    pending?: number[];
    spells?: Record<string, string[]>;
    enemies?: { name: string; alive?: boolean; hp?: number }[];
  } = {},
): Record<string, unknown> {
  const party = ["Stu", "Rias", "Zing", "Jaki"].map((name, index) => ({
    index,
    name,
    canAct: !(overrides.dead?.includes(index) ?? false) && !(overrides.pending?.includes(index) ?? false),
    pendingAction: overrides.pending?.includes(index) ? { command: "attack" } : undefined,
    spellsKnown: (overrides.spells?.[name] ?? []).map((spell) => ({ name: spell, level: 1, slot: 1, school: "black" })),
  }));
  const enemies = (overrides.enemies ?? [{ name: "Goblin" }, { name: "Goblin" }]).map((e, slot) => ({
    slot,
    name: e.name,
    hp: e.hp ?? (e.alive === false ? 0 : 10),
    alive: e.alive !== false,
    position: { row: 0, col: slot },
  }));
  return {
    ff1: {
      party,
      battle: {
        inBattle: true,
        party,
        enemies,
        activePartyIndex: nextIndex,
      },
      inventory: [
        { slot: 0, itemId: 0, itemInfo: { name: "Potion", type: "consumable" }, quantity: 3 },
        { slot: 1, itemId: 1, itemInfo: { name: "Tent", type: "consumable" }, quantity: 2 },
        { slot: 2, itemId: 2, itemInfo: { name: "Cure", type: "consumable" }, quantity: 0 },
      ],
    },
  };
}

describe("validateCommand", () => {
  it("accepts a valid fight command for the next actor", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "Goblin" } }, req);
    expect(result).toBeUndefined();
  });

  it("rejects a command for an actor who is not next in party order", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "Jaki", target: "Goblin" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Stu");
    expect(result!.error).toContain("Jaki");
    expect(result!.correction).toContain("The next actor is Stu");
  });

  it("rejects a command with an unknown actor name", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "Mog", target: "Goblin" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Mog");
    expect(result!.correction).toContain("Stu, Rias, Zing, Jaki");
  });

  it("accepts the next actor by slot number", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "slot 0", target: "Goblin" } }, req);
    expect(result).toBeUndefined();
  });

  it("accepts the next actor by bare index (regression: not tightened)", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "0", target: "Goblin" } }, req);
    expect(result).toBeUndefined();
  });

  it("accepts a use_item target by bare index (regression: not tightened)", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "use_item", args: { actor: "Stu", item: "Potion", target: "1" } }, req);
    expect(result).toBeUndefined();
  });

  it("accepts a fight target by bare enemy slot (regression: not tightened)", () => {
    const req = makeRequest(battleState(0, { enemies: [{ name: "Goblin" }, { name: "Wolf" }] }), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "1" } }, req);
    expect(result).toBeUndefined();
  });

  it("rejects the bare word 'slot' as an actor", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "slot", target: "Goblin" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("slot");
  });

  it("rejects an unknown spell and lists known spells", () => {
    const req = makeRequest(battleState(0, { spells: { Stu: ["FIRE", "LIT"] } }), BATTLE_OPTIONS);
    const result = validateCommand({ name: "magic", args: { actor: "Stu", spell: "Black Belt", target: "Goblin" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Black Belt");
    expect(result!.correction).toContain("FIRE");
    expect(result!.correction).toContain("LIT");
  });

  it("accepts a known spell", () => {
    const req = makeRequest(battleState(0, { spells: { Stu: ["FIRE", "LIT"] } }), BATTLE_OPTIONS);
    const result = validateCommand({ name: "magic", args: { actor: "Stu", spell: "FIRE", target: "Goblin" } }, req);
    expect(result).toBeUndefined();
  });

  it("rejects an invalid enemy target", () => {
    const req = makeRequest(battleState(0, { enemies: [{ name: "Goblin" }, { name: "Wolf" }] }), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "Dragon" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Dragon");
    expect(result!.correction).toContain("Goblin");
    expect(result!.correction).toContain("Wolf");
  });

  it("accepts a target by slot number", () => {
    const req = makeRequest(battleState(0, { enemies: [{ name: "Goblin" }, { name: "Wolf" }] }), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "slot 1" } }, req);
    expect(result).toBeUndefined();
  });

  it("rejects a dead enemy target and lists living targets", () => {
    const req = makeRequest(
      battleState(0, { enemies: [{ name: "Goblin", alive: false, hp: 0 }, { name: "Wolf" }] }),
      BATTLE_OPTIONS,
    );
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "Goblin" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("dead");
    expect(result!.correction).toContain("Wolf");
    expect(result!.correction).not.toContain("Goblin");
  });

  it("rejects a dead enemy target by slot", () => {
    const req = makeRequest(
      battleState(0, { enemies: [{ name: "Goblin", alive: false, hp: 0 }, { name: "Wolf" }] }),
      BATTLE_OPTIONS,
    );
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "slot 0" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("dead");
    expect(result!.correction).toContain("Wolf");
  });

  it("rejects targeting an empty enemy slot", () => {
    const req = makeRequest(
      battleState(0, { enemies: [{ name: "Goblin", alive: false, hp: 0 }] }),
      BATTLE_OPTIONS,
    );
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "slot 1" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("not valid");
    expect(result!.correction).toContain("All enemies are dead");
  });

  it("rejects an unavailable item", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "use_item", args: { actor: "Stu", item: "Elixir", target: "Stu" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Elixir");
    expect(result!.correction).toContain("Potion x3");
    expect(result!.correction).toContain("Tent x2");
  });

  it("rejects a zero-quantity item", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "use_item", args: { actor: "Stu", item: "Cure", target: "Stu" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Cure");
  });

  it("accepts an available consumable", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "use_item", args: { actor: "Stu", item: "Potion", target: "Stu" } }, req);
    expect(result).toBeUndefined();
  });

  it("rejects use_item target that is not a party member", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "use_item", args: { actor: "Stu", item: "Potion", target: "Goblin" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Goblin");
    expect(result!.correction).toContain("Stu");
  });

  it("skips actor order validation outside battle", () => {
    const req = makeRequest(
      {
        ff1: {
          party: [{ index: 0, name: "Stu" }, { index: 1, name: "Rias" }],
          inventory: [
            { slot: 0, itemId: 0, itemInfo: { name: "Potion", type: "consumable" }, quantity: 3 },
          ],
        },
      },
      [{ name: "use_item", description: "Use item", args: '{ "item": "string", "target": "string" }' }],
      "field",
    );
    const result = validateCommand({ name: "use_item", args: { item: "Potion", target: "Rias" } }, req);
    expect(result).toBeUndefined();
  });

  it("rejects commands not available in the current mode", () => {
    const req = makeRequest(battleState(0), BATTLE_OPTIONS);
    const result = validateCommand({ name: "goto", args: { location: "town" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("goto");
    expect(result!.correction).toContain("fight");
  });

  it("advances to the next living actor when the first has acted", () => {
    const req = makeRequest(battleState(0, { pending: [0] }), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "Goblin" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Rias");
    expect(result!.correction).toContain("The next actor is Rias");
  });

  it("accepts press_button with a valid button and no options", () => {
    const req = makeRequest({}, [], "field");
    const result = validateCommand({ name: "press_button", args: { button: "a" } }, req);
    expect(result).toBeUndefined();
  });

  it("accepts press_button with explicit frames", () => {
    const req = makeRequest({}, [], "field");
    const result = validateCommand({ name: "press_button", args: { button: "start", frames: 60 } }, req);
    expect(result).toBeUndefined();
  });

  it("rejects press_button with an unknown button", () => {
    const req = makeRequest({}, [], "field");
    const result = validateCommand({ name: "press_button", args: { button: "z" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("unknown button");
    expect(result!.correction).toContain("a, b");
  });

  it("rejects press_button with out-of-range frames", () => {
    const req = makeRequest({}, [], "field");
    const result = validateCommand({ name: "press_button", args: { button: "a", frames: 999 } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("frames");
  });
});

function realBattleState(overrides: {
  nextActor?: string;
  pending?: number[];
  dead?: number[];
  spells?: Record<string, string[]>;
  charges?: Record<string, { level: number; current: number; max: number }[]>;
} = {}): Record<string, unknown> {
  const names = ["Stu", "Rias", "Zing", "Jaki"];
  const fullParty = names.map((name, index) => ({
    index,
    name,
    classId: 0,
    level: 1,
    hp: 20,
    maxHp: 20,
    spellsKnown: (overrides.spells?.[name] ?? []).map((spell) => ({ name: spell, level: 1, slot: 1, school: "black" })),
    spellCharges: overrides.charges?.[name]
      ? { levels: overrides.charges[name] }
      : undefined,
    status: { ailments: [] },
  }));
  const battleParty = names.map((name, index) => ({
    index,
    name,
    canAct: !(overrides.dead?.includes(index) ?? false) && !(overrides.pending?.includes(index) ?? false),
    pendingAction: overrides.pending?.includes(index) ? { command: "attack" } : undefined,
    position: { row: 0, col: index },
  }));
  const activePartyIndex = overrides.nextActor ? names.indexOf(overrides.nextActor) : 0;
  return {
    ff1: {
      party: fullParty,
      battle: {
        inBattle: true,
        party: battleParty,
        enemies: [{ slot: 0, name: "Goblin", hp: 10, alive: true, position: { row: 0, col: 0 } }],
        activePartyIndex,
      },
    },
  };
}

describe("validateCommand real battle state shape", () => {
  it("rejects an out-of-order actor and names the expected next actor", () => {
    const req = makeRequest(realBattleState({ nextActor: "Stu" }), BATTLE_OPTIONS, "battle", "Stu");
    const result = validateCommand({ name: "fight", args: { actor: "Rias", target: "Goblin" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Stu");
    expect(result!.error).toContain("Rias");
    expect(result!.correction).toContain("The next actor is Stu");
  });

  it("accepts every spell known by the full-party actor in battle", () => {
    const spells = ["CURE", "LIT", "FIRE"];
    const req = makeRequest(
      realBattleState({ nextActor: "Rias", spells: { Rias: spells } }),
      BATTLE_OPTIONS,
      "battle",
      "Rias",
    );
    for (const spell of spells) {
      const result = validateCommand({ name: "magic", args: { actor: "Rias", spell, target: "Stu" } }, req);
      expect(result).toBeUndefined();
    }
  });

  it("rejects a spell the actor does not know even when the spell exists", () => {
    const req = makeRequest(
      realBattleState({ nextActor: "Rias", spells: { Rias: ["CURE"] } }),
      BATTLE_OPTIONS,
      "battle",
      "Rias",
    );
    const result = validateCommand({ name: "magic", args: { actor: "Rias", spell: "LIT", target: "Stu" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("LIT");
  });

  it("rejects magic when the actor has no MP for the spell's level", () => {
    const req = makeRequest(
      realBattleState({
        nextActor: "Rias",
        spells: { Rias: ["FIRE"] },
        charges: { Rias: [{ level: 1, current: 0, max: 2 }] },
      }),
      BATTLE_OPTIONS,
      "battle",
      "Rias",
    );
    const result = validateCommand(
      { name: "magic", args: { actor: "Rias", spell: "FIRE", target: "Goblin" } },
      req,
    );
    expect(result).toBeDefined();
    expect(result!.error).toContain("no MP");
    expect(result!.correction).toContain("MP 0/2");
  });

  it("resolves spells for an actor referenced by slot (regression: validateSpell slot)", () => {
    // Rias is index 1; the battle party shape omits spellsKnown, so the spell
    // list must come from the full roster matched via the resolved member.
    const req = makeRequest(
      realBattleState({ nextActor: "Rias", spells: { Rias: ["CURE", "LIT"] } }),
      BATTLE_OPTIONS,
      "battle",
      "Rias",
    );
    const ok = validateCommand({ name: "magic", args: { actor: "slot 1", spell: "LIT", target: "Goblin" } }, req);
    expect(ok).toBeUndefined();
    const bare = validateCommand({ name: "magic", args: { actor: "1", spell: "CURE", target: "Goblin" } }, req);
    expect(bare).toBeUndefined();
    const bad = validateCommand({ name: "magic", args: { actor: "slot 1", spell: "FIRE", target: "Goblin" } }, req);
    expect(bad).toBeDefined();
    expect(bad!.error).toContain("Rias");
    expect(bad!.correction).toContain("LIT");
  });
});

describe("validateCommand arg-value checks (field/menus)", () => {
  const FIELD_OPTIONS: CommandSpec[] = [
    { name: "goto", description: "Travel", args: '{ "location": "string" }' },
    { name: "grind", description: "Walk", args: '{ "x": "number", "y": "number", "distance": "number" }' },
    { name: "talk_to", description: "Talk", args: '{ "target": "string" }' },
    { name: "menu_navigate", description: "Cursor", args: '{ "direction": "string", "steps": "number" }' },
    { name: "sell", description: "Sell", args: '{ "item": "string" }' },
    { name: "buy", description: "Buy", args: '{ "item": "string" }' },
    { name: "dialog_advance", description: "Advance", args: '{ "presses": "number" }' },
  ];

  function fieldState(state: Record<string, unknown>): Record<string, unknown> {
    return { ff1: state };
  }

  const Locations = [
    { id: "coneria_castle", name: "Coneria Castle" },
    { id: "pravoka", name: "Pravoka" },
  ];

  it("rejects a goto with an unknown location and lists valid ones", () => {
    const req = makeRequest(fieldState({ availableLocations: Locations, world: { isOverworld: true } }), FIELD_OPTIONS, "field");
    const result = validateCommand({ name: "goto", args: { location: "Coneria In" } }, req);
    expect(result).toBeDefined();
    expect(result!.correction).toContain("Pravoka");
  });

  it("accepts a goto by exact name, id, or case-insensitive prefix", () => {
    const req = makeRequest(fieldState({ availableLocations: Locations, world: { isOverworld: true } }), FIELD_OPTIONS, "field");
    expect(validateCommand({ name: "goto", args: { location: "Coneria Castle" } }, req)).toBeUndefined();
    expect(validateCommand({ name: "goto", args: { location: "coneria_castle" } }, req)).toBeUndefined();
    expect(validateCommand({ name: "goto", args: { location: "pravo" } }, req)).toBeUndefined();
  });

  it("rejects a goto with a missing location", () => {
    const req = makeRequest(fieldState({ availableLocations: Locations, world: { isOverworld: true } }), FIELD_OPTIONS, "field");
    const result = validateCommand({ name: "goto", args: {} }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain('missing "location"');
  });

  it("rejects grind coordinates outside the current map's range", () => {
    const over = makeRequest(fieldState({ world: { isOverworld: true } }), FIELD_OPTIONS, "field");
    const standard = makeRequest(fieldState({ world: { isOverworld: false } }), FIELD_OPTIONS, "field");
    expect(validateCommand({ name: "grind", args: { x: 10, y: 10, distance: 4 } }, over)).toBeUndefined();
    expect(validateCommand({ name: "grind", args: { x: 300, y: 10, distance: 4 } }, over)).toBeDefined();
    expect(validateCommand({ name: "grind", args: { x: 100, y: 10, distance: 4 } }, standard)).toBeDefined();
    expect(validateCommand({ name: "grind", args: { x: 10, y: 10, distance: -1 } }, over)).toBeDefined();
    const missing = validateCommand({ name: "grind", args: { x: 10 } }, over);
    expect(missing).toBeDefined();
    expect(missing!.error).toContain("y");
  });

  it("validates talk_to targets against visible NPCs (index and name forms)", () => {
    const npcs = [{ index: 0, name: "Bridge Guard" }, { index: 1, name: "Pravoka Dissenter" }];
    const req = makeRequest(fieldState({ availableNpcs: npcs, world: { isStandardMap: true } }), FIELD_OPTIONS, "field");
    expect(validateCommand({ name: "talk_to", args: { target: "Bridge Guard" } }, req)).toBeUndefined();
    expect(validateCommand({ name: "talk_to", args: { target: "bridge" } }, req)).toBeUndefined();
    expect(validateCommand({ name: "talk_to", args: { target: "npc 1" } }, req)).toBeUndefined();
    expect(validateCommand({ name: "talk_to", args: { target: "slot 0" } }, req)).toBeUndefined();
    expect(validateCommand({ name: "talk_to", args: {} }, req)).toBeUndefined(); // empty -> first object
    const bad = validateCommand({ name: "talk_to", args: { target: "King" } }, req);
    expect(bad).toBeDefined();
    expect(bad!.error).toContain("King");
    expect(bad!.correction).toContain("Bridge Guard");
  });

  it("rejects talk_to when no NPCs are visible in state", () => {
    const req = makeRequest(fieldState({ world: { isStandardMap: true } }), FIELD_OPTIONS, "field");
    const result = validateCommand({ name: "talk_to", args: { target: "Anybody" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("no NPCs");
  });

  it("validates menu_navigate direction and steps", () => {
    const req = makeRequest(fieldState({}), FIELD_OPTIONS, "field");
    expect(validateCommand({ name: "menu_navigate", args: { direction: "up", steps: 2 } }, req)).toBeUndefined();
    expect(validateCommand({ name: "menu_navigate", args: {} }, req)).toBeUndefined();
    const badDir = validateCommand({ name: "menu_navigate", args: { direction: "northeast" } }, req);
    expect(badDir).toBeDefined();
    expect(badDir!.correction).toContain("left");
    const badSteps = validateCommand({ name: "menu_navigate", args: { direction: "down", steps: 0 } }, req);
    expect(badSteps).toBeDefined();
    expect(badSteps!.error).toContain("steps");
  });

  it("validates dialog_advance presses", () => {
    const req = makeRequest(fieldState({}), FIELD_OPTIONS, "field");
    expect(validateCommand({ name: "dialog_advance", args: {} }, req)).toBeUndefined();
    expect(validateCommand({ name: "dialog_advance", args: { presses: 5 } }, req)).toBeUndefined();
    expect(validateCommand({ name: "dialog_advance", args: { presses: 0 } }, req)).toBeDefined();
    expect(validateCommand({ name: "dialog_advance", args: { presses: 99 } }, req)).toBeDefined();
  });

  it("rejects an empty buy item", () => {
    const req = makeRequest(fieldState({}), FIELD_OPTIONS, "field");
    expect(validateCommand({ name: "buy", args: { item: "0" } }, req)).toBeUndefined();
    expect(validateCommand({ name: "buy", args: {} }, req)).toBeDefined();
  });

  it("validates a sell item against inventory", () => {
    const req = makeRequest(
      fieldState({
        inventory: [
          { itemInfo: { name: "Potion", type: "consumable" }, quantity: 2 },
          { itemInfo: { name: "Tent", type: "tool" }, quantity: 1 },
        ],
      }),
      FIELD_OPTIONS,
      "field",
    );
    expect(validateCommand({ name: "sell", args: { item: "Potion" } }, req)).toBeUndefined();
    expect(validateCommand({ name: "sell", args: { item: "pot" } }, req)).toBeUndefined();
    expect(validateCommand({ name: "sell", args: { item: "0" } }, req)).toBeUndefined();
    const bad = validateCommand({ name: "sell", args: { item: "Cabin" } }, req);
    expect(bad).toBeDefined();
    expect(bad!.correction).toContain("Potion");
    expect(validateCommand({ name: "sell", args: { item: "99" } }, req)).toBeDefined();
  });

  it("rejects non-object args payloads", () => {
    const req = makeRequest(fieldState({ availableLocations: Locations }), FIELD_OPTIONS, "field");
    const result = validateCommand({ name: "goto", args: ["Coneria Castle"] as unknown as Record<string, unknown> }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("JSON object");
  });
});
