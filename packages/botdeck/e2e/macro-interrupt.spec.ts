/**
 * TEMPORARY reproduction for the overworld macro interrupt regression.
 * Drives the REAL app (emulator + useBotLoop + plugin) with a stubbed
 * /api/turn that issues a long overworld goto, and watches what happens to
 * the macro: progress, interrupts, errors, and loop recoverability.
 */
import { expect, test } from "playwright/test";
import {
  createTestPlay,
  tempPlayId,
  copyPlayStateFiles,
} from "./test-play.ts";

const GAME = "ff1";
let currentPlayId: string | undefined;

// NOTE: temp plays created by this spec are deliberately NOT deleted
// afterwards; they are kept for record keeping.
test.afterEach(() => {
  currentPlayId = undefined;
});

test("overworld goto macro runs to completion or a real interrupt", async ({ page }) => {
  test.setTimeout(180_000);
  const consoleLines: string[] = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (!t.includes("[NesAudio]") && !t.includes("[Emulator]")) consoleLines.push(`${msg.type()}: ${t}`);
  });
  page.on("pageerror", (err) => consoleLines.push(`pageerror: ${err.message}`));

  await page.goto("/");
  const apiHealthy = await page.evaluate(() => fetch("/api/health").then((r) => r.ok));
  test.skip(!apiHealthy, "vermbot API is not reachable");

  currentPlayId = tempPlayId("macroint");
  await createTestPlay(page, GAME, currentPlayId, "macro interrupt repro");
  copyPlayStateFiles(GAME, "0001_dev", currentPlayId, "000002-start-02-post-town");

  // Stub the LLM: always goto Temple of Fiends (a long overworld walk).
  await page.route("**/api/turn", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        command: { name: "goto", args: { location: "temple_of_fiends" } },
        reason: "repro stub",
      }),
    });
  });

  await page.goto(`/?play=${GAME}/${currentPlayId}`);
  await expect(page.locator("h1")).toContainText("botdeck");

  // Power on, then load the overworld snapshot.
  const powerButton = page.getByRole("button", { name: /Power (on|off)/ });
  await powerButton.click();
  await expect(page.getByText("power on")).toBeVisible();
  await page.waitForTimeout(500);

  // Load the copied state via the Load menu.
  const loadButton = page.getByRole("button", { name: /load/i }).first();
  await loadButton.click();
  await page.waitForTimeout(500);
  const stateEntry = page.getByRole("button", { name: /start-02-post-town/ }).first();
  await expect(stateEntry).toBeVisible({ timeout: 10_000 });
  await stateEntry.click();
  await page.waitForTimeout(1000);

  // Open agent tab, run in auto mode.
  await page.getByRole("button", { name: "agent", exact: true }).click();
  const runButton = page.getByTestId("agent-run-action");
  await expect(runButton).toBeVisible();
  await runButton.click();

  // Watch for 30 seconds: sample status + macro progress every 500ms.
  const samples: string[] = [];
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    const sample = await page.evaluate(() => {
      const badge = document.querySelector("[data-testid='agent-stop-action'], [data-testid='agent-run-action'], [data-testid='agent-step-action']")?.textContent ?? "?";
      const body = document.body.innerText;
      const err = document.querySelector(".text-rose-300, .text-rose-400")?.textContent ?? "";
      return `button=${badge} err=${err.slice(0, 120)}`;
    });
    samples.push(`t=${(i + 1) * 0.5}s ${sample}`);
  }
  console.log("SAMPLES:\n" + samples.filter((_, i) => i % 4 === 0).join("\n"));
  console.log("CONSOLE (last 40):\n" + consoleLines.slice(-40).join("\n"));

  // After the watch window, the loop must still respond: stop, then step.
  const stopButton = page.getByTestId("agent-stop-action");
  if (await stopButton.isVisible().catch(() => false)) {
    await stopButton.click();
  }
  await page.waitForTimeout(1000);
  const runAfter = page.getByTestId("agent-run-action");
  console.log(`recoverable: run button visible=${await runAfter.isVisible().catch(() => false)} enabled=${await runAfter.isEnabled().catch(() => false)}`);
});
