import { describe, expect, it } from "vitest";
import { isValidTurnRequest, type TurnRequest } from "./protocol.ts";

describe("isValidTurnRequest", () => {
  it("accepts a well-formed request", () => {
    const req: TurnRequest = {
      gameId: "ff1",
      state: { location: "overworld" },
      options: [
        { name: "move", description: "Move the party", args: "{direction}" },
      ],
    };
    expect(isValidTurnRequest(req)).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isValidTurnRequest(null)).toBe(false);
    expect(isValidTurnRequest("string")).toBe(false);
    expect(isValidTurnRequest(123)).toBe(false);
  });

  it("requires a non-empty gameId", () => {
    expect(
      isValidTurnRequest({
        gameId: "",
        state: {},
        options: [],
      }),
    ).toBe(false);
    expect(
      isValidTurnRequest({
        state: {},
        options: [],
      }),
    ).toBe(false);
  });

  it("requires a state object", () => {
    expect(
      isValidTurnRequest({
        gameId: "ff1",
        options: [],
      }),
    ).toBe(false);
  });

  it("requires options to be command specs", () => {
    expect(
      isValidTurnRequest({
        gameId: "ff1",
        state: {},
        options: [{ description: "missing name" }],
      }),
    ).toBe(false);
    expect(
      isValidTurnRequest({
        gameId: "ff1",
        state: {},
        options: [{ name: "wait" }],
      }),
    ).toBe(false);
  });
});
