import http from "node:http";
import { test, expect } from "../src/index.js";
import { moveToEl, clickEl } from "../src/helpers.js";

const HTML = `<!DOCTYPE html>
<html><head><style>
  body { font-family: system-ui, sans-serif; margin: 40px; background: #f5f5f5; }
  h1 { color: #333; }
  .box { padding: 20px; margin: 20px 0; background: #fff; border-radius: 8px; border: 1px solid #ddd; }
  input { padding: 8px 12px; font-size: 16px; border: 1px solid #ccc; border-radius: 4px; width: 300px; }
  button { padding: 8px 16px; font-size: 16px; background: #0066ff; color: #fff; border: none; border-radius: 4px; cursor: pointer; margin: 4px; }
  button:hover { background: #0052cc; }
</style></head><body>
  <h1>QA HUD Demo</h1>
  <div class="box">
    <label for="name">Name:</label><br>
    <input id="name" type="text" placeholder="Type something here..." />
  </div>
  <div class="box">
    <button id="btn1" onclick="document.getElementById('out').textContent='Button 1 clicked!'">Button 1</button>
    <button id="btn2" onclick="document.getElementById('out').textContent='Button 2 clicked!'">Button 2</button>
    <p id="out" style="color: green; font-weight: bold;"></p>
  </div>
</body></html>`;

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
  });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  baseUrl = `http://localhost:${typeof addr === "object" ? addr!.port : addr}`;
});

test.afterAll(async () => {
  server?.close();
});

test.use({
  qaHud: {
    cursor: true,
    keyboard: true,
    actionDelay: 0,
    cursorStyle: "default",
    keyFadeMs: 1500,
  },
});

test("HUD overlay is injected after page load", async ({ page }) => {
  await page.goto(baseUrl);
  const hudExists = await page.evaluate(() => !!document.querySelector("[data-qa-hud]"));
  expect(hudExists).toBe(true);

  const cursorExists = await page.evaluate(
    () => !!document.querySelector("[data-qa-hud] .qa-cursor"),
  );
  expect(cursorExists).toBe(true);
});

test("cursor tracks mouse and keyboard shows keys", async ({ page }) => {
  await page.goto(baseUrl);

  // Simulate mouse movement
  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 250, clientY: 150, bubbles: true }),
    );
  });
  await page.waitForTimeout(50);

  const transform = await page.evaluate(() => {
    const c = document.querySelector("[data-qa-hud] .qa-cursor") as HTMLElement;
    return c?.style.transform;
  });
  expect(transform).toContain("250");

  // Simulate click ripple
  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 250, clientY: 150, bubbles: true }),
    );
  });
  await page.waitForTimeout(50);
  const ripple = await page.evaluate(() => !!document.querySelector("[data-qa-hud] .qa-ripple"));
  expect(ripple).toBe(true);

  // Simulate key press
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await page.waitForTimeout(50);
  const keyCount = await page.evaluate(
    () => document.querySelectorAll("[data-qa-hud] .qa-key").length,
  );
  expect(keyCount).toBeGreaterThan(0);
});

test("modifier keys show persistent badges", async ({ page }) => {
  await page.goto(baseUrl);

  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
  });
  await page.waitForTimeout(50);
  expect(
    await page.evaluate(() => !!document.querySelector("[data-qa-hud] .qa-key.modifier")),
  ).toBe(true);

  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
  });
  await page.waitForTimeout(50);
  expect(await page.evaluate(() => !document.querySelector("[data-qa-hud] .qa-key.modifier"))).toBe(
    true,
  );
});

test("moveToEl returns null on missing selector and clickEl is a no-op", async ({ page }) => {
  await page.goto(baseUrl);

  // Lock in HUD-active coverage so a regression in setup can't silently
  // turn this into a fast-path no-op test.
  expect(await page.evaluate(() => !!(window as any).__qaHud)).toBe(true);

  const pos = await moveToEl(page, "#does-not-exist");
  expect(pos).toBeNull();

  // Should not throw even though the element is missing.
  await expect(clickEl(page, "#does-not-exist")).resolves.toBeUndefined();
});

test("HUD does not block page interactions", async ({ page }) => {
  await page.goto(baseUrl);

  await page.evaluate(() => (document.querySelector("#btn1") as HTMLElement)?.click());
  const result = await page.evaluate(() => document.querySelector("#out")?.textContent);
  expect(result).toBe("Button 1 clicked!");
});
