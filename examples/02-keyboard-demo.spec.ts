/**
 * Example 2: Monaco Editor interaction
 * Full HUD demo — real VS Code editor with syntax highlighting, typing code,
 * keyboard shortcuts (Ctrl+S, Ctrl+Z, Ctrl+A, Shift+arrows), and tab switching.
 * Uses native Playwright keyboard methods — the HUD auto-patches them with delays
 * and the addInitScript listener captures keydown events for key badges.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";
import { clickEl, hudWait, subtitle, moveToEl } from "../src/helpers.js";

const HTML = `<!DOCTYPE html>
<html><head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #1e1e1e; color: #ccc; overflow: hidden; }
  .toolbar { display: flex; align-items: center; gap: 0; padding: 0 12px; background: #252526; border-bottom: 1px solid #3c3c3c; height: 36px; }
  .file-tab {
    padding: 6px 16px; background: #2d2d2d; font-size: 13px; color: #969696;
    border-right: 1px solid #252526; cursor: pointer; display: flex; align-items: center; gap: 6px;
    height: 100%; transition: background 0.15s;
  }
  .file-tab.active { background: #1e1e1e; color: #fff; border-bottom: 2px solid #007acc; }
  .file-tab .icon { font-size: 11px; }
  .file-tab:hover { background: #2a2d2e; }
  .actions { margin-left: auto; display: flex; gap: 6px; padding-right: 4px; }
  .actions button {
    padding: 4px 10px; background: transparent; border: 1px solid #3c3c3c;
    border-radius: 3px; color: #969696; font-size: 12px; cursor: pointer;
  }
  .actions button:hover { background: #3c3c3c; color: #fff; }
  #editor-container { height: calc(100vh - 60px); }
  .statusbar {
    display: flex; justify-content: space-between; align-items: center;
    padding: 0 12px; background: #007acc; height: 24px; font-size: 12px; color: #fff;
  }
  .statusbar .right { display: flex; gap: 16px; }
  .statusbar .saved { opacity: 0; transition: opacity 0.3s; }
  .statusbar .saved.show { opacity: 1; }
</style>
</head><body>
  <div class="toolbar">
    <div class="file-tab active" id="tab1"><span class="icon">TS</span> main.ts</div>
    <div class="file-tab" id="tab2"><span class="icon">TS</span> utils.ts</div>
    <div class="file-tab" id="tab3"><span class="icon">{}</span> config.json</div>
    <div class="actions">
      <button id="btn-run">▶ Run</button>
      <button id="btn-fmt">⎈ Format</button>
    </div>
  </div>
  <div id="editor-container"></div>
  <div class="statusbar">
    <span id="cursor-pos">Ln 1, Col 1</span>
    <div class="right">
      <span class="saved" id="saved-indicator">✓ Saved</span>
      <span>UTF-8</span>
      <span>TypeScript</span>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js"></script>
  <script>
    const initialCode = [
      '// QA HUD — Playwright video overlay',
      'import { test, expect } from "qa-hud";',
      '',
      'const config = {',
      '  cursor: true,',
      '  keyboard: true,',
      '  actionDelay: 150,',
      '};',
      '',
      'test("demo", async ({ page }) => {',
      '  await page.goto("https://example.com");',
      '  await page.click("button");',
      '  await expect(page).toHaveTitle("Example");',
      '});',
    ].join('\\n');

    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' }});
    require(['vs/editor/editor.main'], function () {
      const editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: initialCode,
        language: 'typescript',
        theme: 'vs-dark',
        fontSize: 14,
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        renderWhitespace: 'none',
        padding: { top: 10 },
      });

      // Update cursor position in statusbar
      editor.onDidChangeCursorPosition((e) => {
        document.getElementById('cursor-pos').textContent =
          'Ln ' + e.position.lineNumber + ', Col ' + e.position.column;
      });

      // Ctrl+S handler
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        const el = document.getElementById('saved-indicator');
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2000);
      });

      // Tab switching
      const tabs = { tab1: initialCode, tab2: '// utils.ts\\nexport function add(a: number, b: number) {\\n  return a + b;\\n}', tab3: '{\\n  "name": "qa-hud",\\n  "version": "1.0.0"\\n}' };
      const langs = { tab1: 'typescript', tab2: 'typescript', tab3: 'json' };
      let currentTab = 'tab1';

      document.querySelectorAll('.file-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          tabs[currentTab] = editor.getValue();
          currentTab = tab.id;
          document.querySelectorAll('.file-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          monaco.editor.setModelLanguage(editor.getModel(), langs[currentTab]);
          editor.setValue(tabs[currentTab]);
          editor.focus();
        });
      });

      // Expose for Playwright assertions
      window.__monacoEditor = editor;
      window.__editorReady = true;
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

test("monaco editor — typing, shortcuts, tab switching", async ({ page }) => {
  await page.goto(baseUrl);

  // Wait for Monaco to load from CDN and initialize
  await page.waitForFunction(() => (window as any).__editorReady === true, null, { timeout: 30_000 });
  await hudWait(page, 600);

  // 1. Click into the editor to focus it
  await page.click("#editor-container .view-lines");
  await hudWait(page, 300);

  // 2. Go to end of file
  await subtitle(page, "Navigating to end of file");
  await page.keyboard.press("Control+End");
  await hudWait(page, 400);

  // 3. Type new code using native keyboard — HUD captures key badges automatically
  await subtitle(page, "Writing new test code");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("// New test added by QA HUD", { delay: 55 });
  await hudWait(page, 300);

  await page.keyboard.press("Enter");
  await page.keyboard.type('test("new", async () => {', { delay: 50 });
  await hudWait(page, 200);

  await page.keyboard.press("Enter");
  await page.keyboard.type("  expect(true).toBe(true);", { delay: 45 });
  await hudWait(page, 200);

  await page.keyboard.press("Enter");
  await page.keyboard.type("});", { delay: 60 });
  await hudWait(page, 500);

  // 4. Ctrl+S — save
  await subtitle(page, "Saving with Ctrl+S");
  await page.keyboard.press("Control+s");
  await hudWait(page, 800);

  // 5. Select all (Ctrl+A) then deselect
  await subtitle(page, "Selecting all code");
  await page.keyboard.press("Control+a");
  await hudWait(page, 600);
  await page.keyboard.press("Escape");
  await hudWait(page, 300);

  // 6. Undo last change (Ctrl+Z)
  await subtitle(page, "Undoing with Ctrl+Z");
  await page.keyboard.press("Control+z");
  await hudWait(page, 300);
  // Redo it back
  await page.keyboard.press("Control+Shift+z");
  await hudWait(page, 500);

  // 7. Switch tabs
  await subtitle(page, "Switching editor tabs");
  await clickEl(page, "#tab2");
  await hudWait(page, 600);

  await clickEl(page, "#tab3");
  await hudWait(page, 600);

  await clickEl(page, "#tab1");
  await hudWait(page, 400);

  // 8. Arrow key navigation with Shift selection
  await subtitle(page, "Selecting with Shift+Arrow");
  await page.keyboard.press("Control+Home");
  await hudWait(page, 200);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Shift+ArrowDown");
    await hudWait(page, 150);
  }
  await hudWait(page, 400);
  await page.keyboard.press("Escape");
  await hudWait(page, 300);

  // 9. Click toolbar buttons
  await moveToEl(page, "#btn-run");
  await hudWait(page, 200);
  await clickEl(page, "#btn-run");
  await hudWait(page, 300);
  await clickEl(page, "#btn-fmt");
  await hudWait(page, 500);

  // Verify the typed code is in the editor
  const content = await page.evaluate(() => (window as any).__monacoEditor.getValue());
  expect(content).toContain("// New test added by QA HUD");
  expect(content).toContain('test("new", async () => {');
  expect(content).toContain("expect(true).toBe(true);");
});
