/**
 * Example 7: Video player interaction with audio capture
 *
 * Demonstrates: play/pause, progress bar seeking, media keyboard shortcuts,
 * and audio capture of both TTS narration and the video's own soundtrack.
 *
 * Uses the programmatic approach (applyHud) to enable audio capture per-test.
 * The resulting WAV file contains both the narrator and the video audio mixed.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";
import { clickEl, moveToEl, moveTo, hudWait, annotate } from "../src/helpers.js";

const HTML = `<!DOCTYPE html>
<html><head><title>07 Video Player</title><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #fff; font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .player { width: 720px; background: #111; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.6); }
  .video-wrap { position: relative; background: #000; aspect-ratio: 16/9; }
  video { width: 100%; height: 100%; display: block; }
  .overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.3); opacity: 0; transition: opacity 0.3s; pointer-events: none; }
  .video-wrap:hover .overlay, .overlay.show { opacity: 1; }
  .big-play { width: 64px; height: 64px; background: rgba(255,255,255,0.9); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #111; pointer-events: auto; cursor: pointer; }
  .controls { padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; background: #1a1a1a; }
  .progress-row { display: flex; align-items: center; gap: 10px; }
  .progress-bar { flex: 1; height: 6px; background: #333; border-radius: 3px; cursor: pointer; position: relative; overflow: hidden; }
  .progress-fill { height: 100%; background: #e53e3e; border-radius: 3px; width: 0%; transition: width 0.1s; }
  .progress-bar:hover .progress-fill { background: #fc8181; }
  .time { font-size: 12px; color: #888; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .btn-row { display: flex; align-items: center; gap: 10px; }
  .ctrl-btn { background: none; border: none; color: #ccc; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px; transition: all 0.15s; }
  .ctrl-btn:hover { background: #333; color: #fff; }
  .ctrl-btn.active { color: #e53e3e; }
  .volume-wrap { display: flex; align-items: center; gap: 6px; margin-left: auto; }
  .volume-slider { width: 80px; accent-color: #e53e3e; }
  .speed-badge { font-size: 11px; background: #333; color: #aaa; padding: 2px 8px; border-radius: 4px; }
  .toast { position: fixed; top: 20px; right: 20px; background: rgba(0,0,0,0.85); color: #fff; padding: 10px 20px; border-radius: 8px; font-size: 14px; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 100; }
  .toast.show { opacity: 1; }
</style></head><body>
  <div class="player">
    <div class="video-wrap" id="video-wrap">
      <video id="video" preload="auto" loop></video>
      <canvas id="gen-canvas" width="640" height="360" style="display:none"></canvas>
      <div class="overlay" id="overlay">
        <div class="big-play" id="big-play">▶</div>
      </div>
    </div>
    <div class="controls">
      <div class="progress-row">
        <span class="time" id="time-current">0:00</span>
        <div class="progress-bar" id="progress-bar">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
        <span class="time" id="time-total">0:00</span>
      </div>
      <div class="btn-row">
        <button class="ctrl-btn" id="btn-prev" title="Previous">⏮</button>
        <button class="ctrl-btn" id="btn-play" title="Play/Pause">▶</button>
        <button class="ctrl-btn" id="btn-next" title="Next">⏭</button>
        <button class="ctrl-btn" id="btn-mute" title="Mute">🔊</button>
        <div class="volume-wrap">
          <input type="range" class="volume-slider" id="volume" min="0" max="100" value="80" />
        </div>
        <span class="speed-badge" id="speed-badge">1×</span>
        <button class="ctrl-btn" id="btn-fullscreen" title="Fullscreen">⛶</button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>

  <script>
    const video = document.getElementById('video');
    const btnPlay = document.getElementById('btn-play');
    const bigPlay = document.getElementById('big-play');
    const overlay = document.getElementById('overlay');
    const progressBar = document.getElementById('progress-bar');
    const progressFill = document.getElementById('progress-fill');
    const timeCurrent = document.getElementById('time-current');
    const timeTotal = document.getElementById('time-total');
    const volumeSlider = document.getElementById('volume');
    const btnMute = document.getElementById('btn-mute');
    const speedBadge = document.getElementById('speed-badge');
    const toast = document.getElementById('toast');

    function fmt(s) { const m = Math.floor(s/60); return m + ':' + String(Math.floor(s%60)).padStart(2,'0'); }
    function showToast(msg) { toast.textContent = msg; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1500); }

    video.addEventListener('loadedmetadata', () => { timeTotal.textContent = fmt(video.duration); });
    video.addEventListener('timeupdate', () => {
      if (!video.duration) return;
      progressFill.style.width = (video.currentTime / video.duration * 100) + '%';
      timeCurrent.textContent = fmt(video.currentTime);
    });

    function togglePlay() {
      if (video.paused) { video.play(); btnPlay.textContent = '⏸'; overlay.classList.remove('show'); showToast('Playing'); }
      else { video.pause(); btnPlay.textContent = '▶'; overlay.classList.add('show'); showToast('Paused'); }
    }

    btnPlay.addEventListener('click', togglePlay);
    bigPlay.addEventListener('click', togglePlay);
    document.getElementById('video-wrap').addEventListener('click', (e) => {
      if (e.target === video) togglePlay();
    });

    // Progress bar seeking
    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      video.currentTime = pct * video.duration;
      showToast('Seeked to ' + fmt(video.currentTime));
    });

    // Volume
    volumeSlider.addEventListener('input', () => {
      video.volume = volumeSlider.value / 100;
      btnMute.textContent = video.volume === 0 ? '🔇' : video.volume < 0.5 ? '🔉' : '🔊';
    });
    video.volume = 0.8;

    btnMute.addEventListener('click', () => {
      video.muted = !video.muted;
      btnMute.textContent = video.muted ? '🔇' : '🔊';
      showToast(video.muted ? 'Muted' : 'Unmuted');
    });

    // Skip buttons
    document.getElementById('btn-prev').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime - 5); showToast('-5s'); });
    document.getElementById('btn-next').addEventListener('click', () => { video.currentTime = Math.min(video.duration, video.currentTime + 5); showToast('+5s'); });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay(); }
      else if (e.key === 'ArrowRight') { video.currentTime = Math.min(video.duration, video.currentTime + 5); showToast('+5s'); }
      else if (e.key === 'ArrowLeft') { video.currentTime = Math.max(0, video.currentTime - 5); showToast('-5s'); }
      else if (e.key === 'ArrowUp') { video.volume = Math.min(1, video.volume + 0.1); volumeSlider.value = video.volume * 100; showToast('Volume ' + Math.round(video.volume*100) + '%'); }
      else if (e.key === 'ArrowDown') { video.volume = Math.max(0, video.volume - 0.1); volumeSlider.value = video.volume * 100; showToast('Volume ' + Math.round(video.volume*100) + '%'); }
      else if (e.key === 'm') { video.muted = !video.muted; btnMute.textContent = video.muted ? '🔇' : '🔊'; showToast(video.muted ? 'Muted' : 'Unmuted'); }
    });

    // Show overlay initially
    overlay.classList.add('show');

    // Generate a synthetic video with canvas animation (video-only, no AudioContext).
    // Audio is played live via AudioContext when the user clicks play (respects autoplay policy).
    (async function generateVideo() {
      const canvas = document.getElementById('gen-canvas');
      const ctx2d = canvas.getContext('2d');
      const canvasStream = canvas.captureStream(30);

      const recorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm;codecs=vp8' });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.start();
      const startTime = Date.now();

      function drawFrame() {
        const t = (Date.now() - startTime) / 1000;
        if (t > 8) { recorder.stop(); return; }
        const grad = ctx2d.createLinearGradient(0, 0, 640, 360);
        grad.addColorStop(0, 'hsl(' + (t * 30 % 360) + ', 70%, 20%)');
        grad.addColorStop(1, 'hsl(' + ((t * 30 + 120) % 360) + ', 70%, 30%)');
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(0, 0, 640, 360);
        const cx = 320 + Math.sin(t * 2) * 200;
        const cy = 180 + Math.cos(t * 3) * 100;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, 30, 0, Math.PI * 2);
        ctx2d.fillStyle = 'hsl(' + (t * 60 % 360) + ', 80%, 60%)';
        ctx2d.fill();
        ctx2d.fillStyle = '#fff';
        ctx2d.font = '24px system-ui';
        ctx2d.fillText('♫ Generated Video', 200, 40);
        ctx2d.font = '18px monospace';
        ctx2d.fillText(t.toFixed(1) + 's / 8.0s', 270, 340);
        requestAnimationFrame(drawFrame);
      }
      drawFrame();

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        video.src = URL.createObjectURL(blob);
        video.load();
        window.__videoReady = true;
      };
    })();

    // Play a live melody via AudioContext when play is clicked (user gesture enables audio)
    let audioCtx, audioGain;
    const notes = [440, 494, 523, 587, 659, 698, 784, 880];
    function startAudio() {
      if (audioCtx) { audioCtx.resume(); return; }
      audioCtx = new AudioContext();
      const osc = audioCtx.createOscillator();
      audioGain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 440;
      audioGain.gain.value = 0.3;
      osc.connect(audioGain);
      audioGain.connect(audioCtx.destination);
      osc.start();
      (function changeNote() {
        if (!audioCtx) return;
        osc.frequency.value = notes[Math.floor(audioCtx.currentTime) % notes.length];
        setTimeout(changeNote, 500);
      })();
    }
    function stopAudio() { if (audioCtx) audioCtx.suspend(); }
    video.addEventListener('play', startAudio);
    video.addEventListener('pause', stopAudio);
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

test("video player — play, pause, seek, media keys, audio capture", async ({ browser }) => {
  // register.cjs already calls applyHud with audio:true (from QA_HUD_AUDIO env var)
  const context = await browser.newContext({
    recordVideo: { dir: "tmp/", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();
  await page.goto(baseUrl);
  // Wait for synthetic video to generate (~8s recording + encoding)
  await page.waitForFunction(() => (window as any).__videoReady === true, null, { timeout: 30_000 });
  await hudWait(page, 800);

  // 1. Introduction
  await annotate(page, "Let's explore this video player");

  // Play the video — audio starts via AudioContext on play event
  await annotate(page, "Playing the video", async () => {
    await clickEl(page, "#big-play");
    await hudWait(page, 3000); // let video play with audio
  });

  // Pause and seek
  await annotate(page, "Pausing and seeking to the middle", async () => {
    await clickEl(page, "#btn-play");
    await hudWait(page, 500);
    const bar = await page.evaluate(() => {
      const el = document.getElementById("progress-bar")!;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y + r.height / 2, w: r.width };
    });
    await moveTo(page, bar.x + bar.w * 0.6, bar.y);
    await hudWait(page, 300);
    await page.click("#progress-bar", { position: { x: bar.w * 0.6, y: 3 } });
  });

  // Resume and use keyboard shortcuts
  await annotate(page, "Resuming with keyboard shortcuts", async () => {
    await clickEl(page, "#btn-play");
    await hudWait(page, 2000);
    await page.keyboard.press("Space"); // pause
    await hudWait(page, 500);
    await page.keyboard.press("ArrowRight");
    await hudWait(page, 300);
    await page.keyboard.press("ArrowLeft");
    await hudWait(page, 300);
    await page.keyboard.press("ArrowUp"); // volume up
    await hudWait(page, 300);
    await page.keyboard.press("ArrowDown"); // volume down
  });

  // Mute, unmute, and resume
  await annotate(page, "Testing mute and skip controls", async () => {
    await page.keyboard.press("m"); // mute
    await hudWait(page, 500);
    await page.keyboard.press("m"); // unmute
    await hudWait(page, 500);
    await page.keyboard.press("Space"); // resume
    await hudWait(page, 2000); // play with audio
    await clickEl(page, "#btn-prev");
    await hudWait(page, 500);
    await clickEl(page, "#btn-next");
  });

  // Volume slider and finish
  await annotate(page, "That's our video player demo!", async () => {
    await moveToEl(page, "#volume");
    await page.fill("#volume", "30");
    await page.evaluate(() => {
      const v = document.getElementById("volume") as HTMLInputElement;
      v.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await hudWait(page, 500);
    await page.keyboard.press("Space"); // pause
  });

  // Verify video state
  const paused = await page.evaluate(() => (document.getElementById("video") as HTMLVideoElement).paused);
  expect(paused).toBe(true);

  // Close context to trigger WAV save + ffmpeg mux (webm → mp4 with audio)
  await context.close();
});
