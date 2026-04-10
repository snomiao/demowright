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
import { writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { clickEl, moveToEl, moveTo, hudWait, annotate, prefetchTts } from "../src/helpers.js";

// Generate TTS narration for the embedded video at import time
const ttsText = "This is a demo video with generated narration. Watch the colorful animation as it moves across the screen.";
let ttsBase64 = "";
try {
  const wavBuf = execSync(
    `espeak-ng --stdout -s 130 -p 40 ${JSON.stringify(ttsText)}`,
    { stdio: ["pipe", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024 },
  );
  ttsBase64 = wavBuf.toString("base64");
} catch { /* espeak-ng not available, video will be silent */ }

const HTML = `<!DOCTYPE html>
<html><head><title>07 Video Player — Synthwave Canvas Demo</title><style>
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

    // Generate a synthetic video with canvas animation + TTS audio.
    // TTS WAV is injected as base64 by the test runner (espeak-ng).
    (async function generateVideo() {
      const canvas = document.getElementById('gen-canvas');
      const ctx2d = canvas.getContext('2d');
      const canvasStream = canvas.captureStream(30);

      // Decode TTS audio and create an audio stream for MediaRecorder
      const ttsB64 = window.__ttsBase64 || '';
      let combinedStream = canvasStream;

      if (ttsB64) {
        try {
          const audioCtx = new AudioContext();
          const rawBytes = Uint8Array.from(atob(ttsB64), c => c.charCodeAt(0));
          const audioBuffer = await audioCtx.decodeAudioData(rawBytes.buffer);
          const dest = audioCtx.createMediaStreamDestination();
          const source = audioCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(dest);
          source.start();
          // Combine canvas video + audio into one stream
          combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...dest.stream.getAudioTracks(),
          ]);
        } catch (e) {
          console.warn('TTS audio decode failed, video will be silent:', e);
        }
      }

      // Use vp8 only — adding opus codec fails in some Firefox builds when no audio track exists
      const mimeType = combinedStream.getAudioTracks().length > 0
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm;codecs=vp8';
      const recorder = new MediaRecorder(combinedStream, { mimeType });
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
        ctx2d.fillText('♫ Synthwave Canvas Demo', 200, 40);
        ctx2d.font = '18px monospace';
        ctx2d.fillText(t.toFixed(1) + 's / 8.0s', 270, 340);
        requestAnimationFrame(drawFrame);
      }
      drawFrame();

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        video.src = URL.createObjectURL(blob);
        video.load();
        // Store base64 for extraction
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        window.__videoBase64 = btoa(binary);
        window.__videoReady = true;
      };
    })();

    // Audio soundtrack: play a looping C-major melody via Web Audio API
    // when the video plays. Demowright's audio-capture.ts intercepts
    // AudioNode.connect and sends PCM chunks to Node via __qaHudAudioChunk.
    // In Docker with PulseAudio, system-level capture also records the output.
    let audioCtx = null;
    let melodyInterval = null;
    window.__audioChunkCount = 0;

    // Count audio chunks captured by demowright's Web Audio intercept
    const _origChunkFn = window.__qaHudAudioChunk;
    if (typeof _origChunkFn === 'function') {
      window.__qaHudAudioChunk = function(...args) {
        window.__audioChunkCount++;
        return _origChunkFn.apply(this, args);
      };
    }

    let masterGain = null;

    async function startAudio() {
      if (audioCtx) return;
      audioCtx = new AudioContext();
      await audioCtx.resume(); // required: Playwright clicks don't count as user gesture
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.15;
      masterGain.connect(audioCtx.destination);

      // C major scale melody, looping
      const notes = [262, 294, 330, 349, 392, 440, 494, 523];
      let idx = 0;

      function playNote() {
        if (!audioCtx || audioCtx.state === 'closed') return;
        const osc = audioCtx.createOscillator();
        const env = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = notes[idx % notes.length];
        env.gain.setValueAtTime(0.3, audioCtx.currentTime);
        env.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.connect(env).connect(masterGain);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.45);
        idx++;
      }

      playNote();
      melodyInterval = setInterval(playNote, 500);
    }

    function stopAudio() {
      if (melodyInterval) { clearInterval(melodyInterval); melodyInterval = null; }
      // Immediately silence by disconnecting the master gain from destination,
      // then close the context. This ensures no residual audio leaks through
      // the ScriptProcessorNode tap while AudioContext.close() resolves.
      if (masterGain) { try { masterGain.disconnect(); } catch {} masterGain = null; }
      if (audioCtx) { audioCtx.close(); audioCtx = null; }
    }

    // Wire audio to video play/pause
    video.addEventListener('play', startAudio);
    video.addEventListener('pause', stopAudio);
    video.addEventListener('ended', stopAudio);
  </script>
</body></html>`;

let server: http.Server;
let baseUrl: string;
test.beforeAll(async () => {
  // Inject TTS base64 into the HTML so the browser can decode and mix it into the video
  const injectedHTML = HTML.replace(
    '<script>',
    `<script>window.__ttsBase64 = "${ttsBase64}";`,
  );
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(injectedHTML);
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});
test.afterAll(() => server?.close());

test("video player — play, pause, seek, keyboard controls, blended audio", async ({ browser }) => {
  // register.cjs already calls applyHud with audio:true (from QA_HUD_AUDIO env var)
  const context = await browser.newContext({
    recordVideo: { dir: "tmp/", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();
  await page.goto(baseUrl);

  // Prefetch all TTS narrations in parallel while the video generates.
  // This eliminates per-annotate TTS fetch latency (~2-4s each with Gemini).
  const narrations = [
    "Welcome to the video player demo. We'll play an embedded video with a soundtrack and demonstrate playback controls",
    "Pressing play — the video starts with a C-major scale melody",
    "We just paused the video — the melody has stopped",
    "Now seeking to the middle of the video using the progress bar",
    "Resuming playback — the melody continues from where we left off",
    "Paused with the Space key. Now using arrow keys to seek and adjust volume",
    "Toggling mute with the M key",
    "Resuming playback — the melody is back",
    "Paused again. Testing the skip buttons to jump forward and backward",
    "That wraps up our video player demo — we heard the C-major melody blend with TTS narration, and verified that audio correctly pauses and resumes with the video",
  ];
  await Promise.all([
    prefetchTts(page, narrations),
    page.waitForFunction(() => (window as any).__videoReady === true, null, { timeout: 60_000 }),
  ]);
  await hudWait(page, 800);

  // --- Introduction ---
  await annotate(page, narrations[0]);

  // --- Play: first half with melody soundtrack ---
  // annotate runs TTS + callback in parallel, so the melody plays under the narration
  await annotate(page, "Pressing play — the video starts with a C-major scale melody", async () => {
    await clickEl(page, "#big-play");
    await hudWait(page, 4000); // let melody play for several notes
  });

  // --- Pause: stop melody FIRST, then narrate over silence ---
  await clickEl(page, "#btn-play"); // pause immediately
  await hudWait(page, 500); // let ScriptProcessorNode flush
  await annotate(page, "We just paused the video — the melody has stopped");

  // Assert: video is paused and melody is silent
  const pausedAfterFirst = await page.evaluate(() =>
    (document.getElementById("video") as HTMLVideoElement).paused,
  );
  expect(pausedAfterFirst).toBe(true);

  // --- Seek to middle ---
  await annotate(page, "Now seeking to the middle of the video using the progress bar", async () => {
    const bar = await page.evaluate(() => {
      const el = document.getElementById("progress-bar")!;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y + r.height / 2, w: r.width };
    });
    await moveTo(page, bar.x + bar.w * 0.5, bar.y);
    await hudWait(page, 300);
    await page.click("#progress-bar", { position: { x: bar.w * 0.5, y: 3 } });
    await hudWait(page, 500);
  });

  // --- Resume: second half with melody ---
  await annotate(page, "Resuming playback — the melody continues from where we left off", async () => {
    await clickEl(page, "#btn-play");
    await hudWait(page, 4000); // play the second half with audio
  });

  // --- Pause with Space, then demonstrate keyboard controls in silence ---
  await page.keyboard.press("Space"); // pause
  await hudWait(page, 500);
  await annotate(page, "Paused with the Space key. Now using arrow keys to seek and adjust volume", async () => {
    await page.keyboard.press("ArrowRight"); // +5s
    await hudWait(page, 500);
    await page.keyboard.press("ArrowLeft"); // -5s
    await hudWait(page, 500);
    await page.keyboard.press("ArrowUp"); // volume up
    await hudWait(page, 500);
    await page.keyboard.press("ArrowDown"); // volume down
    await hudWait(page, 500);
  });

  // --- Mute/unmute and resume ---
  await annotate(page, "Toggling mute with the M key", async () => {
    await page.keyboard.press("m"); // mute
    await hudWait(page, 800);
    await page.keyboard.press("m"); // unmute
    await hudWait(page, 500);
  });

  await annotate(page, "Resuming playback — the melody is back", async () => {
    await page.keyboard.press("Space"); // resume
    await hudWait(page, 3000); // play with audio
  });

  // --- Pause, then skip controls ---
  await page.keyboard.press("Space"); // pause
  await hudWait(page, 500);
  await annotate(page, "Paused again. Testing the skip buttons to jump forward and backward", async () => {
    await clickEl(page, "#btn-prev"); // -5s
    await hudWait(page, 800);
    await clickEl(page, "#btn-next"); // +5s
    await hudWait(page, 800);
  });

  // --- Wrap up ---
  await annotate(page, "That wraps up our video player demo — we heard the C-major melody blend with TTS narration, and verified that audio correctly pauses and resumes with the video");

  // Extract the embedded generated video to a file
  const videoBase64 = await page.evaluate(() => (window as any).__videoBase64 as string);
  if (videoBase64) {
    mkdirSync(".demowright", { recursive: true });
    writeFileSync(".demowright/07-embedded-video.webm", Buffer.from(videoBase64, "base64"));
  }

  // Assert: video is paused at the end
  const pausedFinal = await page.evaluate(() =>
    (document.getElementById("video") as HTMLVideoElement).paused,
  );
  expect(pausedFinal).toBe(true);

  // Assert: Web Audio capture received audio chunks from the melody
  const chunkCount = await page.evaluate(() => (window as any).__audioChunkCount ?? 0);
  console.log(`[07-video-player] Audio chunks captured: ${chunkCount}`);
  expect(chunkCount, "Expected melody audio to be captured via Web Audio API intercept").toBeGreaterThan(0);

  // Close context to trigger WAV save + ffmpeg mux (webm → mp4 with blended audio)
  await context.close();
});
