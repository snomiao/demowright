/**
 * Example 6: Native Playwright API — zero demowright helpers
 *
 * This demo proves that demowright works with ZERO custom helpers.
 * Only native Playwright methods are used: page.click(), page.fill(),
 * page.selectOption(), page.check(), page.press().
 *
 * The HUD overlay (cursor trail, key badges, click ripples) still appears
 * because `withDemowright` in the config injects an `addInitScript` listener
 * and DOM injector automatically. The `patchPageDelay` wrapper adds a small
 * delay after every native action so the video recording stays watchable.
 *
 * No imports from ../src/helpers.js — just @playwright/test.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";

const HTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #f0f2f5; color: #333; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); width: 480px; padding: 40px; }
  .card h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; color: #1a1a2e; }
  .card p.subtitle { font-size: 14px; color: #888; margin-bottom: 28px; }
  .field { margin-bottom: 18px; }
  .field label { display: block; font-size: 13px; font-weight: 600; color: #555; margin-bottom: 6px; }
  .field input, .field textarea, .field select {
    width: 100%; padding: 10px 14px; border: 2px solid #e0e0e0; border-radius: 8px;
    font-size: 14px; font-family: inherit; transition: border-color 0.2s;
  }
  .field input:focus, .field textarea:focus, .field select:focus { outline: none; border-color: #6c5ce7; }
  .field textarea { resize: vertical; min-height: 80px; }
  .checkbox-field { display: flex; align-items: center; gap: 8px; margin-bottom: 22px; }
  .checkbox-field input[type="checkbox"] { width: 18px; height: 18px; accent-color: #6c5ce7; cursor: pointer; }
  .checkbox-field label { font-size: 14px; color: #555; cursor: pointer; }
  button#submit {
    width: 100%; padding: 12px; background: #6c5ce7; color: #fff; border: none;
    border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s;
  }
  button#submit:hover { background: #5a4bd1; }
  .toast {
    display: none; position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
    background: #00b894; color: #fff; padding: 14px 28px; border-radius: 10px;
    font-size: 15px; font-weight: 600; box-shadow: 0 4px 16px rgba(0,184,148,0.3);
    z-index: 1000; animation: slideDown 0.3s ease;
  }
  .toast.show { display: block; }
  @keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
</style></head><body>
  <div class="card">
    <h1>Contact Us</h1>
    <p class="subtitle">We'd love to hear from you. Fill out the form below.</p>
    <div class="field"><label for="name">Name</label><input id="name" placeholder="Your name" /></div>
    <div class="field"><label for="email">Email</label><input id="email" type="email" placeholder="you@example.com" /></div>
    <div class="field"><label for="message">Message</label><textarea id="message" placeholder="How can we help?"></textarea></div>
    <div class="field"><label for="priority">Priority</label>
      <select id="priority">
        <option value="low">Low</option>
        <option value="medium" selected>Medium</option>
        <option value="high">High</option>
      </select>
    </div>
    <div class="checkbox-field"><input type="checkbox" id="urgent" /><label for="urgent">Mark as urgent</label></div>
    <button id="submit">Send Message</button>
  </div>
  <div class="toast" id="toast">✅ Message sent successfully!</div>
  <script>
    document.getElementById('submit').addEventListener('click', () => {
      document.getElementById('toast').classList.add('show');
    });
  </script>
</body></html>`;

let server: http.Server;
let baseUrl: string;
test.beforeAll(async () => {
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});
test.afterAll(() => server?.close());

test("contact form — native Playwright API only, zero helpers", async ({ page }) => {
  await page.goto(baseUrl);
  await page.waitForTimeout(500);

  // Fill the form using only native Playwright methods
  await page.fill("#name", "Alice Johnson");
  await page.fill("#email", "alice@example.com");
  await page.fill("#message", "I need help with my account");
  await page.selectOption("#priority", "high");
  await page.check("#urgent");
  await page.click("#submit");

  // Verify success toast
  await expect(page.locator("#toast")).toBeVisible();
});
