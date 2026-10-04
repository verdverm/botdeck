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
  overrides: { dead?: number[]; pending?: number[]; spells?: Record<string, string[]>; enemies?: string[] } = {},
): Record<string, unknown> {
  const party = ["Stu", "Rias", "Zing", "Jaki"].map((name, index) => ({
    index,
    name,
    canAct: !(overrides.dead?.includes(index) ?? false) && !(overrides.pending?.includes(index) ?? false),
    pendingAction: overrides.pending?.includes(index) ? { command: "attack" } : undefined,
    spellsKnown: (overrides.spells?.[name] ?? []).map((spell) => ({ name: spell, level: 1, slot: 1, school: "black" })),
  }));
  const enemies = (overrides.enemies ?? ["Goblin", "Goblin"]).map((name, slot) => ({
    slot,
    name,
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
    const req = makeRequest(battleState(0, { enemies: ["Goblin", "Wolf"] }), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "Dragon" } }, req);
    expect(result).toBeDefined();
    expect(result!.error).toContain("Dragon");
    expect(result!.correction).toContain("Goblin");
    expect(result!.correction).toContain("Wolf");
  });

  it("accepts a target by slot number", () => {
    const req = makeRequest(battleState(0, { enemies: ["Goblin", "Wolf"] }), BATTLE_OPTIONS);
    const result = validateCommand({ name: "fight", args: { actor: "Stu", target: "slot 1" } }, req);
    expect(result).toBeUndefined();
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
});
