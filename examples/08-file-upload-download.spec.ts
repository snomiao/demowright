/**
 * Example 8: File upload / download with REAL system file picker
 *
 * Demonstrates capturing the native OS file chooser dialog in a demo video.
 * Requires Docker (Xvfb + fluxbox + xdotool + ffmpeg x11grab) because:
 *   1. Playwright's video recorder captures only the page DOM, NOT system UI.
 *      The native GTK file chooser is rendered by the OS, not by the page,
 *      so it would be invisible in a normal Playwright recording.
 *   2. The native dialog can only be opened by an X11-level click (via xdotool).
 *      Calling page.locator().click() goes through Playwright's protocol which
 *      auto-intercepts the file chooser and prevents the dialog from opening.
 *
 * Run inside Docker with screen capture:
 *   ./docker-run.sh examples/08-file-upload-download.spec.ts
 *
 * The test:
 *   - Computes the absolute screen coordinates of the browse button using
 *     Firefox's mozInnerScreenX/Y (content area position on the desktop)
 *   - Uses xdotool to issue an X11 mouse click → Firefox opens the GTK dialog
 *   - Drives the dialog with xdotool keystrokes (Ctrl+L → path → Enter)
 *   - The container's outer ffmpeg x11grab captures the entire screen,
 *     including the dialog
 *   - For the download flow, uses Playwright's normal download capture API
 */
import http from "node:http";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { moveToEl, clickEl, hudWait, annotate, prefetchTts } from "../src/helpers.js";

// Whether to use the system file picker via xdotool. Enabled when running
// inside the Docker container which has Xvfb + xdotool available.
const USE_SYSTEM_PICKER = !!process.env.DEMOWRIGHT_DOCKER && (() => {
  try { execSync("which xdotool", { stdio: "pipe" }); return true; }
  catch { return false; }
})();

const HTML = `<!DOCTYPE html>
<html><head><title>08 File Manager</title><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 40px 20px; }
  .container { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 8px; color: #f1f5f9; }
  .subtitle { color: #94a3b8; margin-bottom: 32px; font-size: 14px; }

  .dropzone { border: 2px dashed #475569; border-radius: 12px; padding: 48px 24px; text-align: center; background: #1e293b; transition: all 0.25s ease; cursor: pointer; }
  .dropzone:hover { border-color: #3b82f6; background: #1e293b; }
  .dropzone.drag-over { border-color: #3b82f6; background: #1e3a8a; transform: scale(1.01); }
  .dropzone-icon { font-size: 40px; margin-bottom: 12px; display: block; }
  .dropzone-text { color: #cbd5e1; font-size: 16px; margin-bottom: 4px; }
  .dropzone-hint { color: #64748b; font-size: 13px; }
  .dropzone-btn { display: inline-block; margin-top: 14px; padding: 10px 28px; background: #3b82f6; color: #fff; border: none; border-radius: 6px; font-size: 15px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
  .dropzone-btn:hover { background: #2563eb; }

  .file-list { margin-top: 24px; }
  .file-list-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 4px; color: #94a3b8; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .file-count { color: #3b82f6; }

  .file-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; margin-bottom: 8px; transition: all 0.2s ease; opacity: 0; transform: translateY(-6px); }
  .file-item.shown { opacity: 1; transform: translateY(0); }
  .file-item:hover { border-color: #475569; }
  .file-icon { font-size: 24px; width: 32px; text-align: center; }
  .file-info { flex: 1; min-width: 0; }
  .file-name { color: #f1f5f9; font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .file-meta { color: #64748b; font-size: 12px; margin-top: 2px; }
  .file-actions { display: flex; gap: 6px; }
  .action-btn { padding: 6px 12px; background: transparent; border: 1px solid #475569; color: #cbd5e1; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.15s; }
  .action-btn:hover { background: #334155; color: #f1f5f9; border-color: #64748b; }
  .action-btn.download:hover { background: #1e3a8a; border-color: #3b82f6; color: #60a5fa; }
  .action-btn.delete:hover { background: #7f1d1d; border-color: #ef4444; color: #fca5a5; }

  .empty-state { text-align: center; padding: 32px; color: #64748b; font-size: 14px; }

  .toast { position: fixed; bottom: 24px; right: 24px; background: #1e293b; color: #f1f5f9; padding: 12px 20px; border-radius: 8px; font-size: 14px; border-left: 3px solid #3b82f6; box-shadow: 0 4px 12px rgba(0,0,0,0.4); opacity: 0; transform: translateY(10px); transition: all 0.3s; pointer-events: none; }
  .toast.show { opacity: 1; transform: translateY(0); }
  .toast.success { border-left-color: #10b981; }
  .toast.error { border-left-color: #ef4444; }
</style></head><body>
  <div class="container">
    <h1>📁 File Manager</h1>
    <p class="subtitle">Upload, download, and manage your files</p>

    <div class="dropzone" id="dropzone">
      <span class="dropzone-icon">⬆️</span>
      <div class="dropzone-text">Click the button to choose a file</div>
      <button class="dropzone-btn" id="browse-btn">Browse Files</button>
      <input type="file" id="file-input" multiple />
    </div>

    <div class="file-list">
      <div class="file-list-header">
        <span>Your Files</span>
        <span class="file-count" id="file-count">0 files</span>
      </div>
      <div id="file-list-body">
        <div class="empty-state" id="empty-state">No files uploaded yet</div>
      </div>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const fileListBody = document.getElementById('file-list-body');
    const fileCount = document.getElementById('file-count');
    const emptyState = document.getElementById('empty-state');
    const toast = document.getElementById('toast');

    const files = new Map();
    let nextId = 1;

    function showToast(msg, type) {
      toast.textContent = msg;
      toast.className = 'toast show ' + (type || 'info');
      setTimeout(() => toast.classList.remove('show'), 2500);
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    function iconFor(name) {
      const ext = name.split('.').pop().toLowerCase();
      if (['txt', 'md'].includes(ext)) return '📄';
      if (['json', 'js', 'ts', 'py'].includes(ext)) return '💻';
      if (['png', 'jpg', 'gif', 'webp'].includes(ext)) return '🖼️';
      return '📎';
    }

    function render() {
      fileListBody.querySelectorAll('.file-item').forEach(el => el.remove());
      emptyState.style.display = files.size === 0 ? 'block' : 'none';

      files.forEach((file, id) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.dataset.fileId = String(id);
        item.innerHTML = \`
          <span class="file-icon">\${iconFor(file.name)}</span>
          <div class="file-info">
            <div class="file-name">\${file.name}</div>
            <div class="file-meta">\${formatSize(file.size)} · uploaded \${file.uploadedAt}</div>
          </div>
          <div class="file-actions">
            <button class="action-btn download" data-action="download" data-id="\${id}">⬇ Download</button>
            <button class="action-btn delete" data-action="delete" data-id="\${id}">🗑 Delete</button>
          </div>
        \`;
        fileListBody.appendChild(item);
        requestAnimationFrame(() => item.classList.add('shown'));
      });

      fileCount.textContent = files.size + (files.size === 1 ? ' file' : ' files');
    }

    function addFiles(fileList) {
      const added = [];
      for (const f of fileList) {
        const id = nextId++;
        const now = new Date();
        const uploadedAt = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        files.set(id, { name: f.name, blob: f, size: f.size, uploadedAt });
        added.push(f.name);
      }
      render();
      if (added.length === 1) showToast('Uploaded "' + added[0] + '"', 'success');
      else if (added.length > 1) showToast('Uploaded ' + added.length + ' files', 'success');
    }

    browseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        addFiles(Array.from(fileInput.files));
        fileInput.value = '';
      }
    });

    fileListBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button.action-btn');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const file = files.get(id);
      if (!file) return;

      if (btn.dataset.action === 'download') {
        const url = URL.createObjectURL(file.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Downloaded "' + file.name + '"', 'success');
      } else if (btn.dataset.action === 'delete') {
        const name = file.name;
        files.delete(id);
        render();
        showToast('Deleted "' + name + '"', 'error');
      }
    });
  </script>
</body></html>`;

// Sample files for the upload demo (created in temp dir)
const sampleDir = join(tmpdir(), "demowright-08-samples");
mkdirSync(sampleDir, { recursive: true });
const sampleFile1 = join(sampleDir, "meeting-notes.txt");
const sampleFile2 = join(sampleDir, "config.json");
writeFileSync(sampleFile1, "# Meeting Notes\n\n- Discussed Q2 roadmap\n- Reviewed design mocks\n- Scheduled next sync\n");
writeFileSync(sampleFile2, JSON.stringify({ theme: "dark", fontSize: 14, language: "en" }, null, 2));

const downloadDir = join(process.cwd(), ".demowright", "downloads");
mkdirSync(downloadDir, { recursive: true });

// --- xdotool helpers (Docker only) ---

/** Get the absolute screen coordinates of an element's center using mozInnerScreenX/Y. */
async function getScreenCenter(page: any, selector: string): Promise<{ x: number; y: number }> {
  return await page.evaluate((sel: string) => {
    const el = document.querySelector(sel) as HTMLElement;
    const r = el.getBoundingClientRect();
    const w = window as any;
    const screenX = w.mozInnerScreenX ?? window.screenX;
    const screenY = w.mozInnerScreenY ?? window.screenY;
    return {
      x: Math.round(screenX + r.x + r.width / 2),
      y: Math.round(screenY + r.y + r.height / 2),
    };
  }, selector);
}

/** Click an element via xdotool — bypasses Playwright's protocol so the
 *  filechooser intercept doesn't trigger and the native dialog can open.
 *  Activates the Firefox window first so the click reaches the right window. */
async function xdoClick(page: any, selector: string): Promise<void> {
  const { x, y } = await getScreenCenter(page, selector);
  // Activate the main Firefox content window (not a dialog) so the click
  // reaches the page. We pick the window whose title matches the page title.
  try {
    const all = execSync("xdotool search --class firefox 2>/dev/null", { encoding: "utf-8" }).trim().split("\n");
    for (const w of all) {
      try {
        const name = execSync(`xdotool getwindowname ${w} 2>/dev/null`, { encoding: "utf-8" }).trim();
        // Main window has the page title; dialogs have "File Upload - ..." prefix
        if (name && !name.startsWith("File Upload")) {
          execSync(`xdotool windowactivate --sync ${w}`);
          break;
        }
      } catch {}
    }
  } catch {}
  execSync("sleep 0.2");
  execSync(`xdotool mousemove ${x} ${y}`);
  execSync("sleep 0.1");
  execSync("xdotool click 1");
}

/** Wait for a window whose title contains `nameSubstring`. Iterates all
 *  windows and checks getwindowname (xdotool's `search --name` regex doesn't
 *  reliably match Firefox file dialogs in some environments). */
function waitForWindow(nameSubstring: string, timeoutMs = 5000): string | undefined {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const all = execSync("xdotool search --name '' 2>/dev/null", { encoding: "utf-8" }).trim().split("\n");
      for (const w of all) {
        if (!w) continue;
        try {
          const name = execSync(`xdotool getwindowname ${w} 2>/dev/null`, { encoding: "utf-8" }).trim();
          if (name && name.includes(nameSubstring)) return w;
        } catch {}
      }
    } catch {}
    execSync("sleep 0.1");
  }
  return undefined;
}

/** Type a path into a GTK file chooser using Ctrl+L → text → Return. */
function gtkPickerEnterPath(path: string): void {
  // Ctrl+L opens the location/path entry box in the GTK file chooser
  execSync("xdotool key ctrl+l");
  execSync("sleep 0.3");
  // Use xdotool type to enter the path character by character
  execSync(`xdotool type --delay 30 ${JSON.stringify(path)}`);
  execSync("sleep 0.3");
  execSync("xdotool key Return");
}

// When using system file picker, disable Playwright video — the outer ffmpeg
// x11grab handles screen recording (Playwright video can't capture system UI).
if (USE_SYSTEM_PICKER) {
  test.use({ video: "off" });
}

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

test("file manager — system file picker via xdotool, downloads", async ({ browser }) => {
  // When using xdotool/system picker, we don't need Playwright's video
  // (the outer ffmpeg x11grab records the screen including the dialog).
  const context = await browser.newContext({
    recordVideo: USE_SYSTEM_PICKER ? undefined : { dir: "tmp/", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  await page.goto(baseUrl);

  const narrations = USE_SYSTEM_PICKER
    ? [
        "Welcome to the file manager demo. We'll upload files using the real native system file picker, captured via screen recording",
        "Clicking the browse button. Watch as the native file chooser dialog opens — this is the actual operating system UI, not a web component",
        "Now we'll type the file path directly using the GTK location entry, then press Enter to select it",
        "The file appears in our list. Now let's download it back to verify the content",
        "Downloaded successfully. Now let's upload another file the same way — through the native picker",
        "Two files are now uploaded. Let's delete the first one to clean up",
        "And that wraps up our demo — the system file picker was captured because we used screen recording, not Playwright's DOM-only video recorder",
      ]
    : [
        "Welcome to the file manager demo. NOTE: this run uses Playwright's setInputFiles which bypasses the system picker. Run inside Docker to see the real native dialog",
        "Uploading a text file via setInputFiles",
        "File appears in the list. Downloading it back to verify",
        "Downloaded successfully",
        "Uploading another file",
        "Deleting the first file",
        "Demo complete",
      ];
  await prefetchTts(page, narrations);
  await hudWait(page, 500);

  // --- Introduction ---
  await annotate(page, narrations[0]);

  // --- Upload file 1 ---
  if (USE_SYSTEM_PICKER) {
    await annotate(page, narrations[1], async () => {
      await moveToEl(page, "#browse-btn");
      await hudWait(page, 800);
      // X11 click bypasses Playwright's filechooser intercept → native dialog opens
      await xdoClick(page, "#browse-btn");
      // Wait for the GTK "File Upload" dialog
      const dialogWin = waitForWindow("File Upload");
      if (!dialogWin) throw new Error("GTK file picker did not open");
      // Activate the dialog so xdotool key sends go to it
      execSync(`xdotool windowactivate --sync ${dialogWin}`);
      await hudWait(page, 1500);
    });

    await annotate(page, narrations[2], async () => {
      gtkPickerEnterPath(sampleFile1);
      await hudWait(page, 1500);
    });
  } else {
    await annotate(page, narrations[1], async () => {
      await moveToEl(page, "#browse-btn");
      await hudWait(page, 500);
      await page.locator("#file-input").setInputFiles(sampleFile1);
      await hudWait(page, 1500);
    });
  }

  // Wait for the file to actually appear (the GTK dialog dismissal is async)
  await page.waitForSelector(".file-item .file-name", { timeout: 10_000 });
  const fileName1 = await page.locator(".file-item .file-name").first().textContent();
  expect(fileName1).toBe("meeting-notes.txt");

  // --- Download flow (always uses Playwright API — no system save dialog) ---
  await annotate(page, narrations[3], async () => {
    await moveToEl(page, ".file-item .action-btn.download");
    await hudWait(page, 500);
  });

  const downloadPromise = page.waitForEvent("download");
  await clickEl(page, ".file-item .action-btn.download");
  const download = await downloadPromise;
  const savedPath = join(downloadDir, download.suggestedFilename());
  await download.saveAs(savedPath);
  await hudWait(page, 1500);

  expect(existsSync(savedPath)).toBe(true);
  expect(readFileSync(savedPath, "utf-8")).toBe(readFileSync(sampleFile1, "utf-8"));

  // --- Upload file 2 ---
  if (USE_SYSTEM_PICKER) {
    await annotate(page, narrations[4], async () => {
      await moveToEl(page, "#browse-btn");
      await hudWait(page, 800);
      await xdoClick(page, "#browse-btn");
      const dialogWin = waitForWindow("File Upload");
      if (!dialogWin) throw new Error("GTK file picker did not open");
      // Activate the dialog so xdotool key sends go to it
      execSync(`xdotool windowactivate --sync ${dialogWin}`);
      await hudWait(page, 1000);
      gtkPickerEnterPath(sampleFile2);
      await hudWait(page, 1500);
    });
  } else {
    await annotate(page, narrations[4], async () => {
      await moveToEl(page, "#browse-btn");
      await hudWait(page, 500);
      await page.locator("#file-input").setInputFiles(sampleFile2);
      await hudWait(page, 1500);
    });
  }

  await page.waitForFunction(() => document.querySelectorAll(".file-item").length === 2, null, { timeout: 10_000 });
  const fileItems = await page.locator(".file-item").count();
  expect(fileItems).toBe(2);

  // --- Delete first file ---
  await annotate(page, narrations[5], async () => {
    await moveToEl(page, ".file-item .action-btn.delete");
    await hudWait(page, 500);
    await clickEl(page, ".file-item .action-btn.delete");
    await hudWait(page, 1500);
  });

  await page.waitForFunction(() => document.querySelectorAll(".file-item").length === 1, null, { timeout: 5000 });
  const remainingCount = await page.locator(".file-item").count();
  expect(remainingCount).toBe(1);

  // --- Wrap up ---
  await annotate(page, narrations[6]);

  await context.close();
});
