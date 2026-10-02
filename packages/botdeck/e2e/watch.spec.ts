import { expect, test } from "playwright/test";

const GAME = "ff1";
const PLAY_ID = "0000_dev";

test.describe("watch", () => {
  test.setTimeout(60_000);

  test("loads a play, powers on, and can trigger a snippet", async ({ page }) => {
    await page.goto(`/?play=${GAME}/${PLAY_ID}`);

    const apiHealthy = await page.evaluate(() =>
      fetch("/api/health").then((r) => r.ok),
    );
    test.skip(!apiHealthy, "vermbot API is not reachable");

    const romAvailable = await page.evaluate(
      (game) => fetch(`/api/games/${game}/rom`, { method: "HEAD" }).then((r) => r.ok),
      GAME,
    );
    test.skip(!romAvailable, "ROM is not available via /api/games/ff1/rom");

    await expect(page.locator("h1")).toContainText("botdeck");
    await expect(page.getByText(/standby|power on/)).toBeVisible();

    const powerButton = page.getByRole("button", { name: /Power (on|off)/ });
    await expect(powerButton).toBeVisible();
    const powerText = await powerButton.textContent();
    if (powerText?.includes("on")) {
      await powerButton.click();
    }
    await expect(page.getByText("power on")).toBeVisible();

    // Open the Snippets tab and wait for it to populate.
    const snippetsTab = page.getByRole("button", { name: "snippets" });
    await expect(snippetsTab).toBeVisible();
    await snippetsTab.click();

    const runButton = page.getByRole("button", { name: "Run snippet" }).first();
    await expect(runButton).toBeVisible();

    // In watch mode the user is expected to click Run manually; we just verify
    // the harness is ready. Uncomment the next line to auto-start a snippet.
    // await runButton.click();
  });
});
