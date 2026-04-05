import http from "node:http";
import { test, expect } from "../src/index.js";

const HTML = `<!DOCTYPE html>
<html><head><style>
  body { font-family: system-ui, sans-serif; margin: 40px; background: #1a1a2e; color: #eee; }
  h1 { color: #e94560; margin-bottom: 20px; }
  .box { padding: 20px; margin: 16px 0; background: #16213e; border-radius: 12px; border: 1px solid #0f3460; }
  input { padding: 10px 14px; font-size: 16px; border: 1px solid #0f3460; border-radius: 6px; width: 320px; background: #1a1a2e; color: #eee; }
  input:focus { outline: 2px solid #e94560; }
  button { padding: 10px 20px; font-size: 16px; background: #e94560; color: #fff; border: none; border-radius: 6px; cursor: pointer; margin: 6px; transition: all 0.2s; }
  button:hover { background: #c73a52; transform: scale(1.05); }
  #out { color: #53cf8c; font-weight: bold; margin-top: 8px; }
  a { color: #7ec8e3; }
</style></head><body>
  <h1>🎯 QA HUD Demo</h1>
  <div class="box">
    <p>Watch the cursor and keyboard HUD in the video recording!</p>
    <label for="name">Enter your name:</label><br><br>
    <input id="name" type="text" placeholder="Type here..." />
  </div>
  <div class="box">
    <button id="btn1" onclick="document.getElementById('out').textContent='✅ Button 1 clicked!'">Button 1</button>
    <button id="btn2" onclick="document.getElementById('out').textContent='✅ Button 2 clicked!'">Button 2</button>
    <button id="btn3" onclick="document.getElementById('out').textContent='✅ Button 3 clicked!'">Button 3</button>
    <p id="out"></p>
  </div>
  <div class="box">
    <p>Try pressing keyboard shortcuts ↓</p>
    <a href="#bottom">Jump to bottom</a>
  </div>
  <div class="box" id="bottom" style="margin-top: 100px;">
    <h2>📍 Bottom Section</h2>
    <p>You scrolled here! The HUD tracked everything.</p>
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
    actionDelay: 200,
    cursorStyle: "default",
    keyFadeMs: 2000,
  },
});

test("full demo — cursor, keyboard, and interactions", async ({ page }) => {
  await page.goto(baseUrl);
  await page.waitForTimeout(500);

  // Mouse movement simulation
  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 400, clientY: 100, bubbles: true }),
    );
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 200, clientY: 250, bubbles: true }),
    );
  });
  await page.waitForTimeout(200);

  // Click the input and type
  await page.evaluate(() => {
    const inp = document.getElementById("name") as HTMLInputElement;
    inp.focus();
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 300, clientY: 220, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 300, clientY: 220, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent("mouseup", { clientX: 300, clientY: 220, bubbles: true }),
    );
  });
  await page.waitForTimeout(300);

  // Type keys one by one
  for (const char of "Hello QA HUD!") {
    await page.evaluate((key) => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }, char);
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(400);

  // Press Enter
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await page.waitForTimeout(300);

  // Move to buttons and click
  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 150, clientY: 380, bubbles: true }),
    );
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 150, clientY: 380, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent("mouseup", { clientX: 150, clientY: 380, bubbles: true }),
    );
    (document.getElementById("btn1") as HTMLElement).click();
  });
  await page.waitForTimeout(400);

  // Click button 2
  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: 280, clientY: 380, bubbles: true }),
    );
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    document.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 280, clientY: 380, bubbles: true }),
    );
    document.dispatchEvent(
      new MouseEvent("mouseup", { clientX: 280, clientY: 380, bubbles: true }),
    );
    (document.getElementById("btn2") as HTMLElement).click();
  });
  await page.waitForTimeout(400);

  // Keyboard shortcuts demo — Shift held
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
    );
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true }));
  });
  await page.waitForTimeout(200);

  // Ctrl+A
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", bubbles: true }));
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "a", ctrlKey: true, bubbles: true }),
    );
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", bubbles: true }));
  });
  await page.waitForTimeout(500);

  // Verify HUD is present
  const hudExists = await page.evaluate(() => !!document.querySelector("[data-qa-hud]"));
  expect(hudExists).toBe(true);
});
