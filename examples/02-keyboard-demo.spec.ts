/**
 * Example 2: Monaco Editor interaction
 * Full HUD demo — real VS Code editor with syntax highlighting, typing code,
 * keyboard shortcuts (Ctrl+S, Ctrl+Z, Ctrl+A, Shift+arrows), and tab switching.
 * Uses native Playwright keyboard methods — the HUD auto-patches them with delays
 * and the addInitScript listener captures keydown events for key badges.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";
import { moveToEl, clickEl } from "../src/helpers.js";
import { createVideoScript } from "../src/video-script.js";

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
      '// demowright — Playwright video overlay',
      'import { test, expect } from "demowright";',
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
      const tabs = { tab1: initialCode, tab2: '// utils.ts\\nexport function add(a: number, b: number) {\\n  return a + b;\\n}', tab3: '{\\n  "name": "demowright",\\n  "version": "1.0.0"\\n}' };
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
  const plan = createVideoScript()
    .segment(
      "Welcome to the Monaco Editor demo. We are loading a TypeScript file inside a VS Code style editor. Let's wait for it to initialize and then click into the editor to focus it.",
      async (pace) => {
        await page.waitForFunction(() => (window as any).__editorReady === true, null, { timeout: 30_000 });
        await pace();
        await page.click("#editor-container .view-lines");
        await pace();
      },
    )
    .segment(
      "Now we navigate to the end of the file using Control plus End, so we can append new code at the bottom.",
      async (pace) => {
        await page.keyboard.press("Control+End");
        await pace();
      },
    )
    .segment(
      "Let's type some new test code. We will add a comment, a test function with an assertion, and close the block. Watch the key badges appear as each character is typed into the editor in real time.",
      async (pace) => {
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await page.keyboard.type("// New test added by demowright", { delay: 55 });
        await pace();
        await page.keyboard.press("Enter");
        await page.keyboard.type('test("new", async () => {', { delay: 50 });
        await pace();
        await page.keyboard.press("Enter");
        await page.keyboard.type("  expect(true).toBe(true);", { delay: 45 });
        await pace();
        await page.keyboard.press("Enter");
        await page.keyboard.type("});", { delay: 60 });
        await pace();
      },
    )
    .segment(
      "Great, the code is written. Now let's save the file with Control plus S. You should see the saved indicator flash briefly in the status bar.",
      async (pace) => {
        await page.keyboard.press("Control+s");
        await pace();
      },
    )
    .segment(
      "Next we select all the code with Control plus A to highlight everything, then press Escape to deselect and return to normal editing mode.",
      async (pace) => {
        await page.keyboard.press("Control+a");
        await pace();
        await page.keyboard.press("Escape");
        await pace();
      },
    )
    .segment(
      "Let's test undo and redo. We press Control plus Z to undo the last change, then Control Shift Z to redo it back so our new code is restored.",
      async (pace) => {
        await page.keyboard.press("Control+z");
        await pace();
        await page.keyboard.press("Control+Shift+z");
        await pace();
      },
    )
    .segment(
      "Now we switch between editor tabs. First we click utils dot ts, then config dot json, and finally back to main dot ts to see our original file with the new test code.",
      async (pace) => {
        await clickEl(page, "#tab2");
        await pace();
        await clickEl(page, "#tab3");
        await pace();
        await clickEl(page, "#tab1");
        await pace();
      },
    )
    .segment(
      "Let's demonstrate arrow key navigation with selection. We jump to the top of the file with Control Home, then hold Shift and press Arrow Down three times to select multiple lines.",
      async (pace) => {
        await page.keyboard.press("Control+Home");
        await pace();
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press("Shift+ArrowDown");
          await pace();
        }
        await page.keyboard.press("Escape");
        await pace();
      },
    )
    .segment(
      "Finally, let's click the toolbar buttons. We move to the Run button and click it, then click the Format button. That completes our Monaco Editor keyboard demo.",
      async (pace) => {
        await moveToEl(page, "#btn-run");
        await pace();
        await clickEl(page, "#btn-run");
        await pace();
        await clickEl(page, "#btn-fmt");
        await pace();
      },
    );

  await page.goto(baseUrl);

  const result = await plan.run(page);

  for (const entry of result.timeline) {
    console.log(
      `  [${entry.startMs.toFixed(0).padStart(6)}ms] "${entry.text.slice(0, 50)}…" — ${entry.durationMs.toFixed(0)}ms`,
    );
  }
  console.log(`  Total: ${result.totalMs.toFixed(0)}ms`);

  // Verify the typed code is in the editor
  const content = await page.evaluate(() => (window as any).__monacoEditor.getValue());
  expect(content).toContain("// New test added by demowright");
  expect(content).toContain('test("new", async () => {');
  expect(content).toContain("expect(true).toBe(true);");
});
