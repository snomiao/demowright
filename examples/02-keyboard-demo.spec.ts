/**
 * Example 2: Code editor interaction
 * Full HUD demo — cursor clicks line numbers, types code,
 * uses keyboard shortcuts (Ctrl+S, Ctrl+Z, Ctrl+A, Shift+arrows), Tab indentation.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";

const HTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #1e1e2e; color: #cdd6f4; }
  .toolbar { display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: #181825; border-bottom: 1px solid #313244; }
  .toolbar .file-tab { padding: 6px 14px; background: #1e1e2e; border-radius: 6px 6px 0 0; font-size: 13px; color: #cdd6f4; border: 1px solid #313244; border-bottom: none; cursor: pointer; }
  .toolbar .file-tab.active { background: #313244; color: #f5c2e7; }
  .toolbar .actions { margin-left: auto; display: flex; gap: 8px; }
  .toolbar .actions button { padding: 4px 10px; background: #313244; border: none; border-radius: 4px; color: #a6adc8; font-size: 12px; cursor: pointer; }
  .toolbar .actions button:hover { background: #45475a; }
  .editor-wrap { display: flex; height: calc(100vh - 80px); }
  .line-numbers { width: 50px; background: #181825; padding: 16px 0; text-align: right; user-select: none; }
  .line-numbers div { padding: 0 12px; font-family: ui-monospace, monospace; font-size: 14px; line-height: 24px; color: #585b70; }
  .line-numbers div.active { color: #cdd6f4; }
  .editor { flex: 1; padding: 16px 20px; font-family: ui-monospace, monospace; font-size: 14px; line-height: 24px; overflow: auto; }
  .editor .line { min-height: 24px; }
  .kw { color: #cba6f7; }
  .fn { color: #89b4fa; }
  .str { color: #a6e3a1; }
  .cm { color: #585b70; font-style: italic; }
  .num { color: #fab387; }
  .op { color: #89dceb; }
  .var { color: #f5e0dc; }
  .statusbar { display: flex; justify-content: space-between; padding: 4px 16px; background: #181825; border-top: 1px solid #313244; font-size: 12px; color: #585b70; }
  .statusbar .saved { color: #a6e3a1; display: none; }
  .statusbar .saved.show { display: inline; }
</style></head><body>
  <div class="toolbar">
    <div class="file-tab active" id="tab1">main.ts</div>
    <div class="file-tab" id="tab2">utils.ts</div>
    <div class="file-tab" id="tab3">config.json</div>
    <div class="actions">
      <button id="btn-run">▶ Run</button>
      <button id="btn-fmt">Format</button>
    </div>
  </div>
  <div class="editor-wrap">
    <div class="line-numbers" id="lineNums"></div>
    <div class="editor" id="editor"></div>
  </div>
  <div class="statusbar">
    <span>Ln 1, Col 1 · UTF-8 · TypeScript</span>
    <span><span class="saved" id="saved-indicator">✓ Saved</span> main.ts</span>
  </div>
  <script>
    const code = [
      '<span class="cm">// QA HUD — Playwright video overlay</span>',
      '<span class="kw">import</span> { <span class="var">test</span>, <span class="var">expect</span> } <span class="kw">from</span> <span class="str">"qa-hud"</span>;',
      '',
      '<span class="kw">const</span> <span class="var">config</span> <span class="op">=</span> {',
      '  <span class="var">cursor</span>: <span class="num">true</span>,',
      '  <span class="var">keyboard</span>: <span class="num">true</span>,',
      '  <span class="var">actionDelay</span>: <span class="num">150</span>,',
      '};',
      '',
      '<span class="fn">test</span>(<span class="str">"demo"</span>, <span class="kw">async</span> ({ <span class="var">page</span> }) <span class="op">=></span> {',
      '  <span class="kw">await</span> <span class="var">page</span>.<span class="fn">goto</span>(<span class="str">"https://example.com"</span>);',
      '  <span class="kw">await</span> <span class="var">page</span>.<span class="fn">click</span>(<span class="str">"button"</span>);',
      '  <span class="kw">await</span> <span class="fn">expect</span>(<span class="var">page</span>).<span class="fn">toHaveTitle</span>(<span class="str">"Example"</span>);',
      '});',
    ];
    const lineNums = document.getElementById('lineNums');
    const editor = document.getElementById('editor');
    code.forEach((line, i) => {
      lineNums.innerHTML += '<div' + (i === 0 ? ' class="active"' : '') + '>' + (i + 1) + '</div>';
      editor.innerHTML += '<div class="line">' + (line || '&nbsp;') + '</div>';
    });
    document.getElementById('btn-run').onclick = () => {};
    document.getElementById('btn-fmt').onclick = () => {};
    document.getElementById('tab2').onclick = function() {
      document.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    };
    document.getElementById('tab1').onclick = function() {
      document.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    };
  </script>
</body></html>`;

let server: http.Server;
let baseUrl: string;
test.beforeAll(async () => {
  server = http.createServer((_, res) => { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(HTML); });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});
test.afterAll(() => server?.close());

async function moveTo(page: any, x: number, y: number) {
  const s = await page.evaluate(() => ({ x: (window as any).__qaHud?.cx ?? 0, y: (window as any).__qaHud?.cy ?? 0 }));
  for (let i = 1; i <= 10; i++) { const t = i / 10; await page.evaluate(([mx, my]: [number, number]) => document.dispatchEvent(new MouseEvent("mousemove", { clientX: mx, clientY: my, bubbles: true })), [s.x + (x - s.x) * t, s.y + (y - s.y) * t] as [number, number]); await page.waitForTimeout(20); }
}
async function moveToEl(page: any, sel: string) {
  const c = await page.evaluate((s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  await moveTo(page, c.x, c.y); return c;
}
async function clickEl(page: any, sel: string) {
  const c = await moveToEl(page, sel); await page.waitForTimeout(150);
  await page.evaluate(([x, y]: [number, number]) => { document.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y, bubbles: true })); setTimeout(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y, bubbles: true })), 60); }, [c.x, c.y] as [number, number]);
  await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement)?.click(), sel);
  await page.waitForTimeout(100);
}
async function typeKeys(page: any, text: string, delay = 70) {
  for (const ch of text) { await page.evaluate((k: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })), ch); await page.waitForTimeout(delay); }
}
async function modKey(page: any, mod: string, key: string) {
  await page.evaluate((m: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key: m, bubbles: true })), mod);
  await page.waitForTimeout(120);
  const mods: Record<string, boolean> = {};
  if (mod === "Control") mods.ctrlKey = true;
  if (mod === "Shift") mods.shiftKey = true;
  if (mod === "Alt") mods.altKey = true;
  await page.evaluate(([k, m]: [string, any]) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k, ...m, bubbles: true })), [key, mods] as [string, any]);
  await page.waitForTimeout(200);
  await page.evaluate((m: string) => document.dispatchEvent(new KeyboardEvent("keyup", { key: m, bubbles: true })), mod);
  await page.waitForTimeout(150);
}

test("code editor — typing, shortcuts, tab switching", async ({ page }) => {
  await page.goto(baseUrl);
  await page.waitForTimeout(600);

  // 1. Click line 14 in the editor (after the last line)
  await moveToEl(page, ".editor .line:last-child");
  await page.waitForTimeout(200);
  const lastLine = await page.evaluate(() => {
    const el = document.querySelector(".editor .line:last-child")!;
    const r = el.getBoundingClientRect();
    return { x: r.x + 60, y: r.y + r.height + 12 };
  });
  await moveTo(page, lastLine.x, lastLine.y);
  await page.evaluate(([x, y]: [number, number]) => {
    document.dispatchEvent(new MouseEvent("mousedown", { clientX: x, clientY: y, bubbles: true }));
    setTimeout(() => document.dispatchEvent(new MouseEvent("mouseup", { clientX: x, clientY: y, bubbles: true })), 60);
  }, [lastLine.x, lastLine.y] as [number, number]);
  await page.waitForTimeout(300);

  // 2. Type new code
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await page.waitForTimeout(200);
  await typeKeys(page, "// New test added", 60);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await page.waitForTimeout(200);
  await typeKeys(page, 'test("new", async () => {', 55);
  await page.waitForTimeout(200);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await page.waitForTimeout(150);
  await typeKeys(page, "  expect(true).toBe(true);", 50);
  await page.waitForTimeout(200);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await page.waitForTimeout(150);
  await typeKeys(page, "});", 70);
  await page.waitForTimeout(400);

  // 3. Ctrl+S — save
  await modKey(page, "Control", "s");
  await page.evaluate(() => { document.getElementById("saved-indicator")!.classList.add("show"); });
  await page.waitForTimeout(500);

  // 4. Ctrl+A — select all
  await modKey(page, "Control", "a");
  await page.waitForTimeout(400);

  // 5. Ctrl+Z — undo
  await modKey(page, "Control", "z");
  await page.waitForTimeout(400);

  // 6. Switch tab — click utils.ts
  await clickEl(page, "#tab2");
  await page.waitForTimeout(400);

  // 7. Switch back — click main.ts
  await clickEl(page, "#tab1");
  await page.waitForTimeout(400);

  // 8. Click Run button
  await clickEl(page, "#btn-run");
  await page.waitForTimeout(300);

  // 9. Click Format
  await clickEl(page, "#btn-fmt");
  await page.waitForTimeout(300);

  // 10. Arrow key navigation
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await page.waitForTimeout(120);
  }
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })));
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(300);

  // 11. Shift+ArrowDown — select lines
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true })));
  await page.waitForTimeout(100);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true, bubbles: true })));
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", bubbles: true })));
  await page.waitForTimeout(300);

  // 12. Escape
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await page.waitForTimeout(500);

  expect(await page.evaluate(() => !!document.querySelector("[data-qa-hud]"))).toBe(true);
});
