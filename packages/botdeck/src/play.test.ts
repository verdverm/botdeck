import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GAME,
  DEFAULT_PLAY_ID,
  gamesUrl,
  parsePlayId,
  playConfigUrl,
  playsUrl,
  readGameId,
  readPlayId,
  romUrl,
  splashUrl,
  statesUrl,
  stepsUrl,
} from "./play";

describe("play", () => {
  describe("readGameId", () => {
    it("returns the default game when window is undefined", () => {
      expect(readGameId()).toBe(DEFAULT_GAME);
    });

    it("reads the game query param", () => {
      const originalLocation = window.location;
      // @ts-expect-error overriding readonly location for test
      delete window.location;
      // @ts-expect-error overriding readonly location for test
      window.location = new URL("http://localhost/?game=sm2");
      expect(readGameId()).toBe("sm2");
      // @ts-expect-error restoring readonly location
      window.location = originalLocation;
    });

    it("falls back to the default when query param is empty", () => {
      const originalLocation = window.location;
      // @ts-expect-error overriding readonly location for test
      delete window.location;
      // @ts-expect-error overriding readonly location for test
      window.location = new URL("http://localhost/?game=");
      expect(readGameId()).toBe(DEFAULT_GAME);
      // @ts-expect-error restoring readonly location
      window.location = originalLocation;
    });
  });

  describe("readPlayId", () => {
    it("returns the default play id for a game when window is undefined", () => {
      expect(readPlayId("sm2")).toBe(`sm2/${DEFAULT_PLAY_ID}`);
    });

    it("reads the play query param", () => {
      const originalLocation = window.location;
      // @ts-expect-error overriding readonly location for test
      delete window.location;
      // @ts-expect-error overriding readonly location for test
      window.location = new URL("http://localhost/?play=sm2/0001_a");
      expect(readPlayId("sm2")).toBe("sm2/0001_a");
      // @ts-expect-error restoring readonly location
      window.location = originalLocation;
    });
  });

  describe("parsePlayId", () => {
    it("splits a valid play id into game and id", () => {
      expect(parsePlayId("ff1/0000_dev")).toEqual({ game: "ff1", id: "0000_dev" });
    });

    it("throws for an invalid play id", () => {
      expect(() => parsePlayId("invalid")).toThrow('invalid play id "invalid"');
      expect(() => parsePlayId("")).toThrow('invalid play id ""');
    });
  });

  describe("url builders", () => {
    it("builds game list url", () => {
      expect(gamesUrl()).toBe("/api/games");
    });

    it("builds rom url with encoding", () => {
      expect(romUrl("ff1")).toBe("/api/games/ff1/rom");
      expect(romUrl("a/b")).toBe("/api/games/a%2Fb/rom");
    });

    it("builds splash url with encoding", () => {
      expect(splashUrl("ff1")).toBe("/api/games/ff1/splash");
    });

    it("builds play config url", () => {
      expect(playConfigUrl("ff1/0000_dev")).toBe("/api/plays/ff1/0000_dev/config");
    });

    it("builds plays url with optional game filter", () => {
      expect(playsUrl()).toBe("/api/plays");
      expect(playsUrl("ff1")).toBe("/api/plays?game=ff1");
      expect(playsUrl("a/b")).toBe("/api/plays?game=a%2Fb");
    });

    it("builds states and steps urls", () => {
      expect(statesUrl("ff1/0000_dev")).toBe("/api/plays/ff1/0000_dev/states");
      expect(stepsUrl("ff1/0000_dev")).toBe("/api/plays/ff1/0000_dev/steps");
    });
  });

  describe("loadRomBytes", () => {
    it("returns the array buffer on success", async () => {
      const buffer = new ArrayBuffer(4);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(buffer),
      });
      const { loadRomBytes } = await import("./play");
      await expect(loadRomBytes("ff1")).resolves.toBe(buffer);
    });

    it("throws when the response is not ok", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      const { loadRomBytes } = await import("./play");
      await expect(loadRomBytes("ff1")).rejects.toThrow('ROM for "ff1" (404)');
    });
  });
});
