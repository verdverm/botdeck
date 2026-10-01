import { describe, test } from "vitest";
import { isValidTurnRequest, type TurnRequest } from "./protocol.ts";

const baseRequest: TurnRequest = {
  gameId: "ff1",
  state: {
    party: [
      { name: "Fighter", hp: 120, maxHp: 120 },
      { name: "Black Belt", hp: 90, maxHp: 90 },
      { name: "White Mage", hp: 60, maxHp: 60 },
      { name: "Thief", hp: 70, maxHp: 70 },
    ],
    location: "overworld",
    gold: 1234,
  },
  options: [
    { name: "move", description: "Move the party", args: "{direction}" },
    { name: "fight", description: "Enter combat" },
    { name: "item", description: "Use an item", args: "{item}" },
    { name: "magic", description: "Cast a spell", args: "{spell,target}" },
  ],
};

describe("protocol validation", () => {
  test("isValidTurnRequest() throughput", async ({ bench }) => {
    await bench("isValidTurnRequest() valid", () => {
      isValidTurnRequest(baseRequest);
    }).run();
  });

  test("isValidTurnRequest() rejects invalid", async ({ bench }) => {
    const invalid = { gameId: "", state: {}, options: [] };
    await bench("isValidTurnRequest() invalid", () => {
      isValidTurnRequest(invalid);
    }).run();
  });
});
