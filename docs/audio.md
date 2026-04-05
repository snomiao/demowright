# Audio Recording in Playwright — Approaches Comparison

Playwright's built-in video recording uses CDP's `Page.startScreencast`, which captures **frames only — no audio**. There's an [open feature request (microsoft/playwright#4870)](https://github.com/microsoft/playwright/issues/4870) since 2021, still `P3-collecting-feedback`.

This document compares all known approaches to add audio to Playwright test recordings.

---

## Summary Table

| #   | Approach                                                                | Audio Source                      | Headless           | Cross-platform   | Complexity | Sync Quality   | Browser  |
| --- | ----------------------------------------------------------------------- | --------------------------------- | ------------------ | ---------------- | ---------- | -------------- | -------- |
| 1   | [PulseAudio + ffmpeg](#1-pulseaudio--ffmpeg)                            | System/tab audio via virtual sink | ✅                 | Linux only       | Low        | ⚠️ manual mux  | Any      |
| 2   | [Web Audio API capture](#2-web-audio-api-capture-in-page)               | In-page audio output              | ✅                 | ✅               | Medium     | ✅ frame-level | Any      |
| 3   | [Chrome Extension (tabCapture)](#3-chrome-extension-tabcapture)         | Tab audio stream                  | ❌ headed only     | ✅ Chromium only | High       | ✅ native      | Chromium |
| 4   | [puppeteer-stream](#4-puppeteer-stream)                                 | Tab screencast + audio            | ❌ headed only     | ✅ Chromium only | Low        | ✅ native      | Chromium |
| 5   | [Xvfb + ffmpeg screen recording](#5-xvfb--ffmpeg-full-screen-recording) | X11 display + PulseAudio          | ✅ virtual display | Linux only       | Medium     | ✅ real-time   | Any      |
| 6   | [CDP WebAudio domain](#6-cdp-webaudio-domain)                           | Metadata only                     | ✅                 | ✅               | Low        | N/A            | Chromium |
| 7   | [TTS narration overlay](#7-tts-narration-overlay-alternative)           | Synthesized speech                | ✅                 | ✅               | Low        | ✅ scripted    | Any      |

---

## 1. PulseAudio + ffmpeg

**How:** Create a virtual PulseAudio sink, route Chrome's audio to it, record from the sink monitor with ffmpeg in parallel. After test, mux audio with Playwright's video.

**Pros:** Simple, no browser extension needed, works in headless, captures all audio (media, Web Audio, system sounds).

**Cons:** Linux only (PulseAudio/PipeWire), requires ffmpeg post-processing, audio/video sync may drift slightly.

```bash
# Setup virtual sink
pactl load-module module-null-sink sink_name=pw_sink sink_properties=device.description=PlaywrightSink

# Start audio recording
ffmpeg -f pulse -i pw_sink.monitor -ac 1 -ar 44100 audio.wav &
AUDIO_PID=$!

# Launch Playwright with audio routed to sink
PULSE_SINK=pw_sink npx playwright test

# Stop audio recording
kill $AUDIO_PID

# Mux audio + video
ffmpeg -i test-results/video.webm -i audio.wav -c:v copy -c:a aac -shortest output.mp4
```

**Integration with qa-hud fixture:**

```ts
import { spawn, execSync } from "child_process";

test.beforeAll(() => {
  execSync("pactl load-module module-null-sink sink_name=pw_sink");
  process.env.PULSE_SINK = "pw_sink";
  audioProcess = spawn("ffmpeg", ["-f", "pulse", "-i", "pw_sink.monitor", "-ac", "1", "audio.wav"]);
});

test.afterAll(async () => {
  audioProcess.kill();
  execSync(
    "ffmpeg -i test-results/video.webm -i audio.wav -c:v copy -c:a aac -shortest output.mp4",
  );
});
```

---

## 2. Web Audio API Capture (in-page)

**How:** Monkey-patch `AudioContext` in `addInitScript` to insert a capture node (`AudioWorkletNode` or `ScriptProcessorNode`) on every audio destination. Capture PCM samples in-browser, send chunks to Node via `page.exposeFunction()`, write to WAV file.

**Pros:** Works headless, cross-platform, captures exactly what the page outputs, frame-accurate sync possible.

**Cons:** Only captures Web Audio / `<audio>` / `<video>` element audio — not system sounds. Adds CPU overhead from PCM transfer. `ScriptProcessorNode` is deprecated (use `AudioWorklet` instead).

```ts
// In addInitScript — intercept AudioContext.destination
const originalConnect = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (dest, ...args) {
  if (dest === this.context.destination) {
    // Insert capture node before destination
    const processor = this.context.createScriptProcessor(4096, 2, 2);
    processor.onaudioprocess = (e) => {
      const samples = e.inputBuffer.getChannelData(0);
      // Send to Node via exposed function
      window.__qaHudAudioChunk(Array.from(samples));
    };
    originalConnect.call(this, processor, ...args);
    originalConnect.call(processor, dest);
    return processor;
  }
  return originalConnect.call(this, dest, ...args);
};
```

```ts
// Node side — collect audio chunks
const chunks: Float32Array[] = [];
await page.exposeFunction("__qaHudAudioChunk", (samples: number[]) => {
  chunks.push(new Float32Array(samples));
});
// After test: encode chunks to WAV and mux with video
```

**AudioWorklet variant (recommended over ScriptProcessorNode):**

```ts
// capture-processor.js (AudioWorklet)
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    if (inputs[0]?.[0]) {
      this.port.postMessage(inputs[0][0]); // send Float32Array to main thread
    }
    return true;
  }
}
registerProcessor("capture-processor", CaptureProcessor);
```

---

## 3. Chrome Extension (tabCapture)

**How:** Load a custom Chrome extension via `--load-extension` that uses `chrome.tabCapture.getMediaStreamId()` to capture the tab's audio+video stream. The extension records with `MediaRecorder` and saves the result.

**Pros:** Captures true tab audio, native Chrome API, high quality, includes all audio sources.

**Cons:** Requires headed mode (no headless), Chromium only, requires user gesture workaround, extension complexity, `chrome.tabCapture` needs `activeTab` permission.

```ts
// Launch Playwright with extension
const browser = await chromium.launch({
  headless: false,
  args: [
    "--load-extension=/path/to/capture-extension",
    "--disable-extensions-except=/path/to/capture-extension",
  ],
});
```

```js
// Extension background.js (Manifest V3)
chrome.action.onClicked.addListener(async (tab) => {
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
  // Send streamId to offscreen document for recording
  chrome.runtime.sendMessage({ type: "start", streamId });
});
```

```js
// Extension offscreen.js
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
  video: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } },
});

const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
recorder.start();
// ... stop and download later
```

---

## 4. puppeteer-stream

**How:** Use the [`puppeteer-stream`](https://github.com/niclaslindstedt/puppeteer-stream) npm package, which wraps Chrome's `tabCapture` API internally. Not directly compatible with Playwright, but can be used alongside it or as an alternative for audio-needed tests.

**Pros:** Simple API, captures audio+video in one stream, battle-tested.

**Cons:** Puppeteer only (not Playwright), requires headed mode, Chromium only.

```ts
import puppeteer from "puppeteer";
import { getStream } from "puppeteer-stream";
import fs from "fs";

const browser = await puppeteer.launch({ headless: false });
const page = await browser.newPage();
await page.goto("https://example.com");

const stream = await getStream(page, { audio: true, video: true });
const file = fs.createWriteStream("recording.webm");
stream.pipe(file);

// ... run test ...

stream.destroy();
file.close();
```

**Hybrid approach — use Puppeteer for recording, Playwright for testing:**

```ts
// 1. Launch browser with Puppeteer (for audio capture)
// 2. Connect Playwright to the same browser via CDP endpoint
// 3. Run Playwright tests on the connected browser
// 4. Puppeteer handles the recording
const browser = await puppeteer.launch({ headless: false });
const wsEndpoint = browser.wsEndpoint();
const pwBrowser = await playwright.chromium.connectOverCDP(wsEndpoint);
```

---

## 5. Xvfb + ffmpeg Full Screen Recording

**How:** Run the browser in a virtual X11 display (Xvfb), record the entire display with ffmpeg's `x11grab` + PulseAudio audio capture. This replaces Playwright's built-in video entirely.

**Pros:** Captures everything (cursor, audio, popups, browser chrome), works with any browser, true WYSIWYG recording.

**Cons:** Linux only, higher resource usage, captures the entire display (not just the page), requires Xvfb setup, not headless (virtual headed).

```bash
# Start virtual display
Xvfb :99 -screen 0 1280x720x24 &
export DISPLAY=:99

# Start PulseAudio
pulseaudio --start --exit-idle-time=-1

# Start ffmpeg recording
ffmpeg -f x11grab -framerate 30 -video_size 1280x720 -i :99 \
       -f pulse -i default \
       -c:v libx264 -preset ultrafast -c:a aac \
       recording.mp4 &
FFMPEG_PID=$!

# Run Playwright tests (headed, on virtual display)
npx playwright test --headed

# Stop recording
kill $FFMPEG_PID
```

**Docker-friendly:** Works well in CI containers with `xvfb-run`.

---

## 6. CDP WebAudio Domain

**How:** Chrome DevTools Protocol has a [`WebAudio`](https://chromedevtools.github.io/devtools-protocol/tot/WebAudio/) domain that provides metadata about audio contexts, nodes, and connections. It does **not** provide raw audio data.

**Pros:** Zero overhead, useful for debugging audio issues.

**Cons:** **Cannot capture audio** — only reports graph structure and context state. Useful for verifying audio is playing, not for recording it.

```ts
const client = await page.context().newCDPSession(page);
await client.send("WebAudio.enable");

client.on("WebAudio.contextCreated", (event) => {
  console.log("AudioContext created:", event.context);
});

client.on("WebAudio.audioNodeCreated", (event) => {
  console.log("Audio node:", event.node.nodeType);
});
```

---

## 7. TTS Narration Overlay (alternative)

**How:** Instead of capturing browser audio, generate narration audio using TTS (text-to-speech) that describes what's happening in the test. Mux the narration with Playwright's video.

**Pros:** Works headless, cross-platform, deterministic, great for AI video analysis.

**Cons:** Not real browser audio — synthetic narration only. Requires TTS engine.

```ts
import { exec } from "child_process";

// Generate narration for each test step
const narrations = [
  { time: 0, text: "Opening the dashboard page" },
  { time: 3, text: "Clicking the search bar and typing orders" },
  { time: 7, text: "Opening the new order modal" },
];

// After test: generate audio and mux
for (const n of narrations) {
  exec(`espeak "${n.text}" -w step_${n.time}.wav`);
}
// Concatenate and mux with video using ffmpeg
```

---

## Recommendations

| Use Case                            | Recommended Approach                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| **CI/Linux pipelines**              | [#1 PulseAudio + ffmpeg](#1-pulseaudio--ffmpeg) — simplest, reliable                                |
| **Capturing page audio precisely**  | [#2 Web Audio API](#2-web-audio-api-capture-in-page) — cross-platform, headless                     |
| **Full-fidelity tab recording**     | [#3 Chrome Extension](#3-chrome-extension-tabcapture) or [#4 puppeteer-stream](#4-puppeteer-stream) |
| **AI video analysis (like Gemini)** | [#7 TTS narration](#7-tts-narration-overlay-alternative) + qa-hud visual overlay — no audio needed  |
| **WYSIWYG recording for demos**     | [#5 Xvfb + ffmpeg](#5-xvfb--ffmpeg-full-screen-recording)                                           |

For qa-hud's primary use case (making Playwright videos readable for AI analysis), **audio is usually not needed** — the visual HUD overlay (cursor + keyboard badges) provides all the context. If audio is required, approach #1 (PulseAudio) or #2 (Web Audio API) are the most practical to integrate as a qa-hud plugin.
