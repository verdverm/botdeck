import { expect, test } from "playwright/test";
import {
  copyPlaySnippet,
  createTestPlay,
  deleteTestPlay,
  tempPlayId,
} from "./test-play.ts";

const GAME = "ff1";
const SOURCE_PLAY_ID = "0000_dev";

let currentPlayId: string | undefined;

test.afterEach(() => {
  deleteTestPlay(GAME, currentPlayId);
  currentPlayId = undefined;
});

test.describe("watch", () => {
  test.setTimeout(60_000);

  test("loads a play, powers on, and can trigger a snippet", async ({ page }) => {
    await page.goto("/");

    const apiHealthy = await page.evaluate(() =>
      fetch("/api/health").then((r) => r.ok),
    );
    test.skip(!apiHealthy, "vermbot API is not reachable");

    const romAvailable = await page.evaluate(
      (game) => fetch(`/api/games/${game}/rom`, { method: "HEAD" }).then((r) => r.ok),
      GAME,
    );
    test.skip(!romAvailable, "ROM is not available via /api/games/ff1/rom");

    currentPlayId = tempPlayId("watch");
    await createTestPlay(page, GAME, currentPlayId, "e2e watch");
    copyPlaySnippet(GAME, SOURCE_PLAY_ID, currentPlayId, "ff1-menu-open");

    await page.goto(`/?play=${GAME}/${currentPlayId}`);

    await expect(page.locator("h1")).toContainText("botdeck");
    await expect(page.getByText(/standby|power on/)).toBeVisible();

    const powerButton = page.getByRole("button", { name: /Power (on|off)/ });
    await expect(powerButton).toBeVisible();
    const powerText = await powerButton.textContent();
    if (powerText?.includes("on")) {
      await powerButton.click();
    }
    await expect(page.getByText("power on")).toBeVisible();

    const snippetsTab = page.getByRole("button", { name: "snippets", exact: true });
    await expect(snippetsTab).toBeVisible();
    await snippetsTab.click();

    const firstRow = page.locator("li").first();
    await firstRow.locator("button").first().click();

    const runButton = page.getByRole("button", { name: "Run", exact: true }).first();
    await expect(runButton).toBeVisible();
  });
});
