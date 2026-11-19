import { test, expect } from "@playwright/test";

test("withDemowright applies the HUD with no test changes", async ({ page }) => {
  await page.setContent("<h1>register</h1>");
  expect(await page.evaluate(() => typeof (window as any).__qaHud)).toBe("object");
});
