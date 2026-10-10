import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GAME,
  DEFAULT_PLAY_ID,
  diffUrl,
  fetchDiff,
  gamesUrl,
  listPlays,
  createPlay,
  renamePlay,
  deletePlay,
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

  describe("play CRUD", () => {
    it("listPlays fetches the game-filtered list", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([{ game: "ff1", id: "0000" }]),
      });
      const list = await listPlays("ff1");
      expect(list).toEqual([{ game: "ff1", id: "0000" }]);
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/plays?game=ff1");
    });

    it("createPlay posts {game} and returns the server-assigned config", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "0001", game: "ff1" }),
      });
      const config = await createPlay("ff1");
      expect(config).toEqual({ id: "0001", game: "ff1" });
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/plays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game: "ff1" }),
      });
    });

    it("createPlay throws on a non-ok response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        text: vi.fn().mockResolvedValue("exists"),
      });
      await expect(createPlay("ff1")).rejects.toThrow("create play failed (409): exists");
    });

    it("renamePlay patches the config label", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "0001", game: "ff1", label: "new" }),
      });
      const config = await renamePlay("ff1/0001", "new");
      expect(config.label).toBe("new");
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/plays/ff1/0001", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: "new" }),
      });
    });

    it("deletePlay issues a DELETE to the play metadata url", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      await deletePlay("ff1/0001");
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/plays/ff1/0001", { method: "DELETE" });
    });

    it("deletePlay throws on a non-ok response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: vi.fn().mockResolvedValue("not found"),
      });
      await expect(deletePlay("ff1/9999")).rejects.toThrow("delete play failed (404): not found");
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

  describe("diffUrl", () => {
    it("uses filenames as-is", () => {
      expect(diffUrl("ff1/0000_dev", "000001-step_before.state.json", "000002-step_after.state.json")).toBe(
        "/api/plays/ff1/0000_dev/diff?before=000001-step_before.state.json&after=000002-step_after.state.json",
      );
    });

    it("strips repo-relative paths to basenames", () => {
      expect(
        diffUrl(
          "ff1/0000_dev",
          "plays/ff1/0000_dev/states/000001-step_before.state.json",
          "plays/ff1/0000_dev/states/000002-step_after.state.json",
        ),
      ).toBe(
        "/api/plays/ff1/0000_dev/diff?before=000001-step_before.state.json&after=000002-step_after.state.json",
      );
    });

    it("handles Windows-style backslash paths", () => {
      expect(diffUrl("ff1/0000_dev", "states\\000001-step_before.state.json", "states\\000002-step_after.state.json")).toBe(
        "/api/plays/ff1/0000_dev/diff?before=000001-step_before.state.json&after=000002-step_after.state.json",
      );
    });
  });

  describe("fetchDiff", () => {
    it("passes basename-only params and returns parsed JSON", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ changed: true, summary: "moved" }),
      });
      const result = await fetchDiff(
        "ff1/0000_dev",
        "plays/ff1/0000_dev/states/000001-step_before.state.json",
        "plays/ff1/0000_dev/states/000002-step_after.state.json",
      );
      expect(result).toEqual({ changed: true, summary: "moved" });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/plays/ff1/0000_dev/diff?before=000001-step_before.state.json&after=000002-step_after.state.json",
      );
    });

    it("throws when the response is not ok", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue("invalid filename"),
      });
      await expect(fetchDiff("ff1/0000_dev", "000001.state.json", "000002.state.json")).rejects.toThrow(
        "diff failed (400): invalid filename",
      );
    });
  });
});
