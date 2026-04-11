/**
 * Example 8: File upload / download demo
 *
 * Demonstrates Playwright's file handling:
 * - `page.setInputFiles()` for uploads — bypasses the native OS file picker
 *   entirely, so Docker is NOT needed (unlike example 07 which captures page
 *   audio). Playwright injects the file selection programmatically.
 * - `page.waitForEvent('download')` for downloads — captures the file to a
 *   known location without showing a native save dialog.
 *
 * The UI shows a drag-and-drop zone, file list with download/delete actions,
 * and toast notifications. Files are stored as blobs in memory and downloaded
 * via blob URLs + <a download>.
 */
import http from "node:http";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { moveToEl, clickEl, hudWait, annotate, prefetchTts } from "../src/helpers.js";

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
  .dropzone-btn { display: inline-block; margin-top: 14px; padding: 8px 20px; background: #3b82f6; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
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
      <div class="dropzone-text">Drag files here to upload</div>
      <div class="dropzone-hint">or</div>
      <button class="dropzone-btn" id="browse-btn">Browse Files</button>
      <input type="file" id="file-input" multiple style="display: none" />
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

    // In-memory file store: id → { name, blob, size, uploadedAt }
    const files = new Map();
    let nextId = 1;

    function showToast(msg, type = 'info') {
      toast.textContent = msg;
      toast.className = 'toast show ' + type;
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
      if (['pdf'].includes(ext)) return '📕';
      if (['zip', 'tar', 'gz'].includes(ext)) return '📦';
      return '📎';
    }

    function render() {
      // Clear list
      const existingItems = fileListBody.querySelectorAll('.file-item');
      existingItems.forEach(el => el.remove());

      if (files.size === 0) {
        emptyState.style.display = 'block';
      } else {
        emptyState.style.display = 'none';
      }

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

    // Browse button → native file picker (bypassed by Playwright setInputFiles)
    browseBtn.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('click', (e) => {
      if (e.target === dropzone || e.target.classList.contains('dropzone-icon') ||
          e.target.classList.contains('dropzone-text') || e.target.classList.contains('dropzone-hint')) {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        addFiles(Array.from(fileInput.files));
        fileInput.value = '';
      }
    });

    // Drag-and-drop upload
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', (e) => {
      if (!dropzone.contains(e.relatedTarget)) {
        dropzone.classList.remove('drag-over');
      }
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        addFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Download / delete actions (event delegation)
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

    // Expose for testing
    window.__fileManager = { files, addFiles };
  </script>
</body></html>`;

// Create sample files in a temp dir for the upload demo
const sampleDir = join(tmpdir(), "demowright-08-samples");
mkdirSync(sampleDir, { recursive: true });
const sampleFile1 = join(sampleDir, "meeting-notes.txt");
const sampleFile2 = join(sampleDir, "config.json");
writeFileSync(sampleFile1, "# Meeting Notes\n\n- Discussed Q2 roadmap\n- Reviewed design mocks\n- Scheduled next sync\n");
writeFileSync(sampleFile2, JSON.stringify({ theme: "dark", fontSize: 14, language: "en" }, null, 2));

// Download output directory
const downloadDir = join(process.cwd(), ".demowright", "downloads");
mkdirSync(downloadDir, { recursive: true });

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

test("file manager — upload, download, delete, drag-and-drop", async ({ browser }) => {
  const context = await browser.newContext({
    recordVideo: { dir: "tmp/", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  await page.goto(baseUrl);

  // Prefetch all narrations in parallel
  const narrations = [
    "Welcome to the file manager demo. We'll upload, download, and manage files using Playwright's file handling APIs",
    "Let's upload a text file by clicking the browse button. Playwright's setInputFiles bypasses the native OS file picker entirely",
    "The file appears in our list with its name, size, and upload time. Now let's download it back to verify the content",
    "Downloaded successfully. Playwright captures downloads programmatically, no native save dialog needed",
    "Let's upload another file — a JSON configuration file. Watch how the list updates with the new entry",
    "Now we'll delete the first file. Just click the delete button to remove it from the list",
    "File deleted. And that wraps up our file manager demo — uploads and downloads work without any system UI interaction",
  ];
  await prefetchTts(page, narrations);
  await hudWait(page, 500);

  // --- Introduction ---
  await annotate(page, narrations[0]);

  // --- Upload via browse button ---
  await annotate(page, narrations[1], async () => {
    await moveToEl(page, "#browse-btn");
    await hudWait(page, 500);
    // setInputFiles injects the file selection without opening any native dialog
    await page.locator("#file-input").setInputFiles(sampleFile1);
    await hudWait(page, 1500);
  });

  // Assert: file appears in the list
  const fileName1 = await page.locator(".file-item .file-name").first().textContent();
  expect(fileName1).toBe("meeting-notes.txt");

  // --- Download the file ---
  await annotate(page, narrations[2], async () => {
    await moveToEl(page, ".file-item .action-btn.download");
    await hudWait(page, 500);
  });

  // Capture the download — waitForEvent must start BEFORE the click that triggers it
  const downloadPromise = page.waitForEvent("download");
  await clickEl(page, ".file-item .action-btn.download");
  const download = await downloadPromise;
  const savedPath = join(downloadDir, download.suggestedFilename());
  await download.saveAs(savedPath);
  await hudWait(page, 1500);

  await annotate(page, narrations[3]);

  // Assert: downloaded file matches the uploaded one
  expect(existsSync(savedPath)).toBe(true);
  const uploadedContent = readFileSync(sampleFile1, "utf-8");
  const downloadedContent = readFileSync(savedPath, "utf-8");
  expect(downloadedContent).toBe(uploadedContent);

  // --- Upload a second file ---
  await annotate(page, narrations[4], async () => {
    await moveToEl(page, "#browse-btn");
    await hudWait(page, 500);
    await page.locator("#file-input").setInputFiles(sampleFile2);
    await hudWait(page, 1500);
  });

  // Assert: two files now in the list
  const fileItems = await page.locator(".file-item").count();
  expect(fileItems).toBe(2);

  // --- Delete the first file ---
  await annotate(page, narrations[5], async () => {
    await moveToEl(page, ".file-item .action-btn.delete");
    await hudWait(page, 500);
    await clickEl(page, ".file-item .action-btn.delete");
    await hudWait(page, 1500);
  });

  // Assert: one file remains and it's config.json
  const remainingCount = await page.locator(".file-item").count();
  expect(remainingCount).toBe(1);
  const remainingName = await page.locator(".file-item .file-name").textContent();
  expect(remainingName).toBe("config.json");

  // --- Wrap up ---
  await annotate(page, narrations[6]);

  await context.close();
});
