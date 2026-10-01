import { expect, test } from "playwright/test";

const FRAME_TIME_THRESHOLD_MS = 25;

interface BenchResult {
  name: string;
  averageMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
}

test("browser benchmark stays under frame-time threshold", async ({ page }) => {
  await page.goto("/bench/index.html");

  const runButton = page.getByRole("button", { name: "Run benchmark" });
  await expect(runButton).toBeVisible();
  await runButton.click();

  const status = page.locator("#status");
  await expect(status).toContainText("Effective FPS:", { timeout: 30000 });

  const results = await page.evaluate((): BenchResult[] => {
    const rows = document.querySelectorAll("#results > div");
    return Array.from(rows).map((row) => {
      const text = row.textContent ?? "";
      const avg = /Average:\s*([\d.]+)\s*ms/.exec(text);
      const median = /Median:\s*([\d.]+)\s*ms/.exec(text);
      const minMax = /Min \/ Max:\s*([\d.]+)\s*\/\s*([\d.]+)\s*ms/.exec(text);
      return {
        name: row.querySelector("h3")?.textContent ?? "",
        averageMs: avg ? Number.parseFloat(avg[1]!) : 0,
        medianMs: median ? Number.parseFloat(median[1]!) : 0,
        minMs: minMax ? Number.parseFloat(minMax[1]!) : 0,
        maxMs: minMax ? Number.parseFloat(minMax[2]!) : 0,
      };
    });
  });

  expect(results.length).toBeGreaterThanOrEqual(2);

  const frameResult = results.find((r) => r.name === "Full emulator frame");
  expect(frameResult, "frame result missing").toBeTruthy();
  expect(frameResult!.averageMs).toBeLessThan(FRAME_TIME_THRESHOLD_MS);

  const uploadResult = results.find(
    (r) => r.name === "Pixel conversion + putImageData",
  );
  expect(uploadResult, "upload result missing").toBeTruthy();
  expect(uploadResult!.averageMs).toBeLessThan(FRAME_TIME_THRESHOLD_MS);

  // Log results for manual inspection.
  console.table(results);
});
