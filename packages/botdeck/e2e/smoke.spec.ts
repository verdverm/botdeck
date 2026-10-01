import { expect, test } from "playwright/test";

test("smoke: app renders the botdeck header", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("botdeck");
  await expect(page.getByText(/standby|power on/)).toBeVisible();
});
