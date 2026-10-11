/**
 * TEMPORARY reproduction: full session flow - load a battle state, auto-fight
 * it to completion with a request-aware /api/turn stub, then issue a long
 * overworld goto and watch whether the macro is spuriously interrupted and
 * whether the loop stays recoverable.
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

test("battle -> victory -> overworld goto must not phantom-abort", async ({ page }) => {
  test.setTimeout(300_000);
  const consoleLines: string[] = [];
  page.on("console", (msg) => {
    const t = msg.text();
    if (!t.includes("[NesAudio]") && !t.includes("[Emulator]")) consoleLines.push(`${msg.type()}: ${t}`);
  });
  page.on("pageerror", (err) => consoleLines.push(`pageerror: ${err.message}`));

  await page.goto("/");
  const apiHealthy = await page.evaluate(() => fetch("/api/health").then((r) => r.ok));
  test.skip(!apiHealthy, "vermbot API is not reachable");

  currentPlayId = tempPlayId("afterbattle");
  await createTestPlay(page, GAME, currentPlayId, "after-battle repro");
  copyPlayStateFiles(GAME, "0001_dev", currentPlayId, "000003-fight-01-start");

  const turnLog: string[] = [];
  await page.route("**/api/turn", async (route) => {
    const req = route.request().postDataJSON() as {
      mode?: string;
      actor?: string;
      state?: { ff1?: { battle?: { inBattle?: boolean; phase?: string; enemies?: { alive: boolean }[] } } };
    };
    const b = req.state?.ff1?.battle;
    let command: unknown;
    if (b?.inBattle) {
      // Target the first LIVING enemy slot (the reader keeps dead slots in the
      // roster with alive=false; the target cursor skips them).
      const enemies = (req.state?.ff1?.battle as { enemies?: { slot: number; alive: boolean }[] } | undefined)?.enemies ?? [];
      const living = enemies.find((e) => e.alive);
      command = { name: "fight", args: { actor: req.actor ?? "Stu", target: `slot ${living?.slot ?? 0}` } };
    } else {
      command = { name: "goto", args: { location: "temple_of_fiends" } };
    }
    turnLog.push(`mode=${req.mode} actor=${req.actor ?? "-"} battle=${b?.inBattle} phase=${b?.phase} alive=${b?.enemies?.filter((e) => e.alive).length ?? "-"} -> ${JSON.stringify(command)}`);
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command, reason: "repro stub" }),
    });
  });

  await page.goto(`/?play=${GAME}/${currentPlayId}`);
  await expect(page.locator("h1")).toContainText("botdeck");
  const powerButton = page.getByRole("button", { name: /Power (on|off)/ });
  await powerButton.click();
  await expect(page.getByText("power on")).toBeVisible();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: /load/i }).first().click();
  await page.waitForTimeout(500);
  const stateEntry = page.getByRole("button", { name: /fight-01-start/ }).first();
  await expect(stateEntry).toBeVisible({ timeout: 10_000 });
  await stateEntry.click();
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: "agent", exact: true }).click();
  const runButton = page.getByTestId("agent-run-action");
  await expect(runButton).toBeVisible();
  await runButton.click();

  // Watch for 3 minutes: sample badge/error every 2s.
  let lastLogLen = 0;
  let sawGotoMacro = false;
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(2000);
    const sample = await page.evaluate(() => {
      const badge = document.querySelector(".rounded-full.bg-amber-500\\/20, .rounded-full.bg-violet-500\\/20, .rounded-full.bg-blue-500\\/20, .rounded-full.bg-emerald-500\\/20, .rounded-full.bg-rose-500\\/20")?.textContent?.trim() ?? "?";
      const err = document.querySelector("[data-testid='agent-error'], .text-rose-300, .text-rose-400")?.textContent ?? "";
      return `badge=${badge} err=${err.slice(0, 150)}`;
    });
    if (i % 5 === 0 || sample.includes("err=") === false) {
      console.log(`t=${(i + 1) * 2}s ${sample}`);
    }
    if (turnLog.length !== lastLogLen) {
      for (const l of turnLog.slice(lastLogLen)) console.log(`  TURN ${l}`);
      lastLogLen = turnLog.length;
    }
    // Stop early once the battle is over and a goto has been issued and had
    // time to play several steps.
    const lastTurn = turnLog[turnLog.length - 1] ?? "";
    if (lastTurn.includes("battle=false")) {
      sawGotoMacro = true;
      if (sawGotoMacro && i > 0 && turnLog.filter((l) => l.includes("battle=false")).length >= 2) break;
      await page.waitForTimeout(8000);
    }
  }
  console.log("CONSOLE (last 30):\n" + consoleLines.slice(-30).join("\n"));

  const stopButton = page.getByTestId("agent-stop-action");
  if (await stopButton.isVisible().catch(() => false)) await stopButton.click();
  await page.waitForTimeout(1000);
  const runAfter = page.getByTestId("agent-run-action");
  console.log(`recoverable: run visible=${await runAfter.isVisible().catch(() => false)} enabled=${await runAfter.isEnabled().catch(() => false)}`);
});
