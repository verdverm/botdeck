import { expect, test } from "playwright/test";

const GAME = "ff1";
const PLAY = "0000_dev";

async function runNamedSnippet(page: import("playwright").Page, name: string) {
  // Open the snippets tab and expand the target snippet.
  await page.getByRole("button", { name: "snippets" }).click();
  const row = page
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();
  await expect(row).toBeVisible();
  await row.click();

  const runButton = page.getByRole("button", { name: "Run" });
  await expect(runButton.first()).toBeVisible();
  await runButton.first().click();

  // Wait for the capture summary (before/after/diff) to render for this snippet.
  const summary = page.locator(`text=diff:`).first();
  await expect(summary).toBeVisible({ timeout: 30_000 });
}

test.describe("snippet capture", () => {
  test.setTimeout(120_000);

  test("menu-open snippet persists a before/after pair with a diff", async ({ page }) => {
    await page.goto("/");
    const apiHealthy = await page.evaluate(() =>
      fetch("/api/health").then((r) => r.ok),
    );
    test.skip(!apiHealthy, "vermbot API is not reachable");

    const romAvailable = await page.evaluate(
      (game) => fetch(`/api/games/${game}/rom`, { method: "HEAD" }).then((r) => r.ok),
      GAME,
    );
    test.skip(!romAvailable, `ROM not available for ${GAME}`);

    await page.goto(`/?play=${GAME}/${PLAY}`);
    await expect(page.locator("h1")).toContainText("botdeck");

    const powerButton = page.getByRole("button", { name: /Power (on|off)/ });
    await expect(powerButton).toBeVisible();
    const powerText = await powerButton.textContent();
    if (powerText?.includes("on")) {
      await powerButton.click();
    }
    await expect(page.getByText("power on")).toBeVisible();
    await page.waitForTimeout(1000);

    await runNamedSnippet(page, "FF1 Open START Menu");

    const states = await page.evaluate(
      ({ game, id }) =>
        fetch(`/api/plays/${game}/${id}/states`).then((r) => r.json()) as Promise<
          Array<{ filename: string; name: string; extractedPath?: string }>
        >,
      { game: GAME, id: PLAY },
    );

    const menuStates = states.filter((s) => s.name.startsWith("snippet_ff1-menu-open"));
    expect(menuStates.length).toBeGreaterThanOrEqual(2);
    const before = menuStates.find((s) => s.name.includes("_before"));
    const after = menuStates.find((s) => s.name.includes("_after"));
    expect(before?.extractedPath).toBeDefined();
    expect(after?.extractedPath).toBeDefined();

    const diff = await page.evaluate(
      ({ game, id, beforeFile, afterFile }) =>
        fetch(
          `/api/plays/${game}/${id}/diff?before=${encodeURIComponent(beforeFile)}&after=${encodeURIComponent(afterFile)}`,
        ).then((r) => r.json()) as Promise<Record<string, unknown>>,
      {
        game: GAME,
        id: PLAY,
        beforeFile: before!.filename,
        afterFile: after!.filename,
      },
    );

    console.log("menu-open diff:", JSON.stringify(diff, null, 2));
    expect(diff).toHaveProperty("changed");
    expect(diff).toHaveProperty("summary");
  });

  test("menu-down snippet moves the cursor", async ({ page }) => {
    await page.goto("/");
    const apiHealthy = await page.evaluate(() => fetch("/api/health").then((r) => r.ok));
    test.skip(!apiHealthy, "vermbot API is not reachable");

    await page.goto(`/?play=${GAME}/${PLAY}`);
    await expect(page.getByText(/standby|power on/)).toBeVisible();

    const powerButton = page.getByRole("button", { name: /Power (on|off)/ });
    const powerText = await powerButton.textContent();
    if (powerText?.includes("on")) await powerButton.click();
    await expect(page.getByText("power on")).toBeVisible();
    await page.waitForTimeout(1000);

    await runNamedSnippet(page, "FF1 Open START Menu + Move Cursor");

    const states = await page.evaluate(
      ({ game, id }) =>
        fetch(`/api/plays/${game}/${id}/states`).then((r) => r.json()) as Promise<
          Array<{ filename: string; name: string; extractedPath?: string }>
        >,
      { game: GAME, id: PLAY },
    );
    const downs = states.filter((s) => s.name.startsWith("snippet_ff1-menu-down"));
    const before = downs.find((s) => s.name.includes("_before"));
    const after = downs.find((s) => s.name.includes("_after"));
    expect(before && after).toBeTruthy();
    if (!before || !after) return;

    const diff = await page.evaluate(
      ({ game, id, beforeFile, afterFile }) =>
        fetch(
          `/api/plays/${game}/${id}/diff?before=${encodeURIComponent(beforeFile)}&after=${encodeURIComponent(afterFile)}`,
        ).then((r) => r.json()) as Promise<Record<string, unknown>>,
      { game: GAME, id: PLAY, beforeFile: before.filename, afterFile: after.filename },
    );
    console.log("menu-down diff:", JSON.stringify(diff, null, 2));
  });
});
