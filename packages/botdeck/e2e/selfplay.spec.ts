import { expect, test } from "playwright/test";
import {
  createTestPlay,
  deleteTestPlay,
  tempPlayId,
} from "./test-play.ts";

const GAME = "ff1";

let currentPlayId: string | undefined;

test.afterEach(() => {
  deleteTestPlay(GAME, currentPlayId);
  currentPlayId = undefined;
});

test.describe("self-play", () => {
  test.setTimeout(120_000);

  test("takes agent turns and persists steps", async ({ page }) => {
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

    currentPlayId = tempPlayId("selfplay");
    await createTestPlay(page, GAME, currentPlayId, "e2e self-play");

    if (!process.env.USE_REAL_LLM) {
      await page.route("**/api/turn", async (route) => {
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ command: { name: "interact" }, reason: "stub" }),
        });
      });
    }

    await page.goto(`/?play=${GAME}/${currentPlayId}`);

    await expect(page.locator("h1")).toContainText("botdeck");

    const powerButton = page.getByRole("button", { name: /Power (on|off)/ });
    await expect(powerButton).toBeVisible();
    await powerButton.click();
    await expect(page.getByText("power on")).toBeVisible();

    await page.waitForTimeout(1000);

    const agentTab = page.getByRole("button", { name: "agent", exact: true });
    await expect(agentTab).toBeVisible();
    await agentTab.click();

    const runModeStep = page.getByRole("button", { name: "Step" }).first();
    await runModeStep.click();
    const stepButton = page.getByTestId("agent-step-action");
    await expect(stepButton).toBeVisible();

    const turnCount = 3;
    for (let i = 0; i < turnCount; i++) {
      await stepButton.click();
      const runButton = page.getByTestId("pending-run");
      await expect(runButton).toBeVisible({ timeout: 30_000 });
      await runButton.click();
      await expect(page.getByText(/idle|error/)).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(200);
    }

    const steps = await page.evaluate(
      ({ game, id }) =>
        fetch(`/api/plays/${game}/${id}/steps`).then((r) => {
          if (!r.ok) throw new Error(`steps list failed: ${r.status}`);
          return r.json() as Promise<Array<{ stepId: string; commandName: string }>>;
        }),
      { game: GAME, id: currentPlayId },
    );
    expect(steps.length).toBeGreaterThanOrEqual(turnCount);

    const states = await page.evaluate(
      ({ game, id }) =>
        fetch(`/api/plays/${game}/${id}/states`).then((r) => {
          if (!r.ok) throw new Error(`states list failed: ${r.status}`);
          return r.json() as Promise<
            Array<{ filename: string; extractedPath?: string; name: string }>
          >;
        }),
      { game: GAME, id: currentPlayId },
    );
    expect(states.length).toBeGreaterThanOrEqual(2);
    const stepStates = states.filter((s) => s.name.startsWith("step_"));
    expect(stepStates.length).toBeGreaterThanOrEqual(2);

    const sorted = [...stepStates].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const before = sorted[sorted.length - 2]!;
    const after = sorted[sorted.length - 1]!;
    expect(before.extractedPath).toBeDefined();
    expect(after.extractedPath).toBeDefined();

    const diff = await page.evaluate(
      ({ game, id, beforeFile, afterFile }) =>
        fetch(
          `/api/plays/${game}/${id}/diff?before=${encodeURIComponent(beforeFile)}&after=${encodeURIComponent(afterFile)}`,
        ).then((r) => {
          if (!r.ok) throw new Error(`diff failed: ${r.status}`);
          return r.json() as Promise<Record<string, unknown>>;
        }),
      {
        game: GAME,
        id: currentPlayId,
        beforeFile: before.filename,
        afterFile: after.filename,
      },
    );
    expect(diff).toHaveProperty("changed");
    expect(diff).toHaveProperty("summary");
  });
});
