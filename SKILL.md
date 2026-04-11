---
name: record-demo-video
description: Use when the user wants to record a demo video of a web app or CLI tool — with voice narration, cursor animations, and subtitles. Covers browser demos (Playwright-based) and terminal demos (Docker screen capture). Activate when keywords like "demo video", "record", "screencast", "walkthrough video", or "product tour" appear.
---

# record-demo-video

## Which recording mode do I need?

| What the page does | Recording mode | Docker? | Example |
|--------------------|---------------|---------|---------|
| Static UI interactions (clicks, typing, navigation) | **Playwright video** | No | 01–06 |
| Plays audio (AudioContext, `<video>`, `<audio>`) | **Docker + PulseAudio** | Yes | 07 |
| Opens system dialogs (file picker, print, auth) | **Docker + ffmpeg x11grab** | Yes | 08 |
| CLI tool in a terminal (not a browser) | **CLI 2-pass pipeline** | Yes | — |

demowright handles the first three. The decision is automatic based on config — you just need Docker when audio or system UI is involved.

---

## Quick Start

```bash
bun i demowright
```

`playwright.config.ts`:
```ts
import { withDemowright } from "demowright/config";
export default withDemowright(defineConfig({
  use: { video: "on", viewport: { width: 1280, height: 720 } },
  projects: [{ name: "firefox", use: { browserName: "firefox" } }],
}), { actionDelay: 300, audio: true });
```

`.env.local`:
```bash
GEMINI_API_KEY=your-key   # for TTS narration (or install espeak-ng as free fallback)
```

Run:
```bash
bun run build && bunx playwright test --config examples/playwright.config.ts
# → .demowright/*.mp4
```

---

## Writing Demo Tests

### Basic: `annotate()` — narration + actions in parallel

```ts
import { clickEl, annotate, hudWait, prefetchTts } from "demowright/helpers";

// annotate() plays TTS and runs the callback simultaneously.
// The narration voice talks while the cursor acts.
await annotate(page, "Let's click the submit button", async () => {
  await clickEl(page, "#submit");
  await hudWait(page, 2000);
});
```

### Timing pattern: action BEFORE narration

When an action should complete before the narrator describes it (e.g. pause, stop, close), do the action **outside** the annotate callback:

```ts
// BAD: melody still plays while TTS says "we paused"
await annotate(page, "Pausing the video", async () => {
  await clickEl(page, "#pause"); // melody leaks into TTS
});

// GOOD: pause first, then narrate over silence
await clickEl(page, "#pause");
await hudWait(page, 500); // let audio buffers flush
await annotate(page, "We just paused the video — the melody has stopped");
```

### Performance: `prefetchTts()` — batch-fetch all narrations upfront

Each `annotate()` call fetches TTS on demand (~2-4s per call with Gemini). For a test with 10 narrations, that's 20-40s of dead air. Pre-fetch them all at the start:

```ts
const narrations = [
  "Welcome to the demo",
  "Clicking the dashboard tab",
  "That wraps up our tour",
];

// Fetch all TTS in parallel — runs alongside page setup
await Promise.all([
  prefetchTts(page, narrations),
  page.waitForLoadState("networkidle"),
]);

// Now each annotate() hits the cache instantly
await annotate(page, narrations[0], async () => { ... });
await annotate(page, narrations[1], async () => { ... });
await annotate(page, narrations[2]);
```

### Production: `createVideoScript()` — title cards, transitions, chapters

For polished output with title/outro cards, fade transitions, SRT subtitles, and chapter markers:

```ts
import { createVideoScript } from "demowright/video-script";

const script = createVideoScript()
  .title("Product Tour", { subtitle: "Q2 2026" })
  .segment("Welcome to the dashboard", async (pace) => {
    await clickEl(page, "#dashboard");
    await pace(); // waits for remaining narration duration
  })
  .transition()
  .segment("Let's check the settings", async (pace) => {
    await clickEl(page, "#settings");
    await pace();
  })
  .outro("Thanks for watching");

// .prepare() batch-fetches ALL TTS in parallel (like prefetchTts)
await script.prepare(page);
const result = await script.run(page);
// → auto-renders MP4 with transitions, burned subtitles, chapter metadata
```

### Drag-and-drop

```ts
// Playwright's built-in dragTo
await page.locator("#card-1").dragTo(page.locator("#column-done"));

// With demowright cursor overlay (hover first for visual)
await moveToEl(page, "#card-1");
await pace();
await page.locator("#card-1").dragTo(page.locator("#column-done"));
```

### File upload (system picker visible in Docker)

```ts
// Local: bypasses system dialog (no Docker needed)
await page.locator("#file-input").setInputFiles("/path/to/file.txt");

// Docker: real GTK file picker via xdotool (see "System UI" section below)
await xdoClick(page, "#browse-btn");  // X11-level click → dialog opens
```

### File download

```ts
const downloadPromise = page.waitForEvent("download");
await clickEl(page, ".download-btn");
const download = await downloadPromise;
await download.saveAs("/path/to/save");
```

---

## Docker

### When Docker is needed

Docker provides three things Playwright can't do alone:

1. **PulseAudio** — virtual audio sink for capturing page audio output
2. **Xvfb + fluxbox** — virtual display + window manager for headed browser
3. **ffmpeg x11grab** — full-screen recording that captures system dialogs

### Quick Run

```bash
./docker-run.sh                                    # all examples
./docker-run.sh examples/07-video-player.spec.ts   # page audio capture
./docker-run.sh examples/08-file-upload-download.spec.ts  # system UI capture
```

`docker-run.sh` automatically detects example 08 and wraps it with `docker-record-screen.sh` (ffmpeg x11grab). All other examples use Playwright's built-in video recorder.

### Architecture

```
┌─ Docker Container ───────────────────────────────────────────┐
│  dbus            → PulseAudio module loading                 │
│  Xvfb :99        → virtual display (1280×720)                │
│  fluxbox         → window manager (system dialogs need it)   │
│  PulseAudio      → virtual audio sink (module-pipe-sink)     │
│                                                              │
│  Firefox (headed) → renders to :99, audio to PulseAudio      │
│  Playwright       → controls Firefox                         │
│  demowright       → cursor overlay, TTS, audio capture       │
│                                                              │
│  Recording:                                                  │
│    Mode A: Playwright video (DOM only) + PulseAudio WAV      │
│    Mode B: ffmpeg x11grab (full screen incl. system dialogs) │
│                                                              │
│  Post: ffmpeg mux video + TTS WAV + page audio → MP4         │
└──────────────────────────────────────────────────────────────┘
```

### Key environment variables

| Variable | Set by | Purpose |
|----------|--------|---------|
| `DISPLAY=:99` | entrypoint | Xvfb display for headed browser |
| `XDG_RUNTIME_DIR` | entrypoint | PulseAudio socket discovery |
| `PULSE_SERVER` | entrypoint | Explicit PulseAudio socket path |
| `DEMOWRIGHT_DOCKER=1` | docker-run.sh | Enables system-picker mode in example 08 |
| `GEMINI_API_KEY` | .env.local | TTS narration provider |

### Page audio capture (PulseAudio)

When `audio: true` is set in config, demowright:

1. Creates `module-pipe-sink` named `demowright_sink` (main process, before workers)
2. Sets it as default sink → Firefox routes audio there
3. Workers read raw PCM from the FIFO pipe
4. On context close: PCM → WAV → mixed with TTS segments → ffmpeg mux

Two capture layers work together:
- **Web Audio API intercept** (`audio-capture.ts`) — monkey-patches `AudioNode.prototype.connect`, captures PCM via ScriptProcessorNode. Works without Docker.
- **PulseAudio pipe-sink** — system-level capture of ALL browser audio. Docker only.

**Important**: `AudioContext` created in response to Playwright clicks stays `suspended` (autoplay policy). Always call `await ctx.resume()` explicitly.

### System UI capture (xdotool + x11grab)

Playwright video records page DOM only — OS dialogs (file picker, print, auth) are invisible. To capture them:

1. **ffmpeg x11grab** records the entire Xvfb display (sees everything)
2. **xdotool** clicks at OS level (bypasses Playwright's filechooser intercept)
3. **xdotool** drives the dialog (Ctrl+L → path → Enter for GTK file chooser)

Key techniques:

```ts
// Get absolute screen coordinates (Firefox-specific API)
const pos = await page.evaluate(() => ({
  x: (window as any).mozInnerScreenX + rect.x,
  y: (window as any).mozInnerScreenY + rect.y,
}));

// Click at OS level — Playwright doesn't intercept this
execSync(`xdotool mousemove ${pos.x} ${pos.y} click 1`);

// Wait for dialog by iterating windows (search --name is unreliable)
for (const winId of allWindows) {
  const name = execSync(`xdotool getwindowname ${winId}`);
  if (name.includes("File Upload")) { /* found it */ }
}

// Drive the dialog
execSync(`xdotool windowactivate --sync ${dialogId}`);
execSync("xdotool key ctrl+l");
execSync(`xdotool type --delay 30 "${filePath}"`);
execSync("xdotool key Return");
```

---

## TTS Providers

| Provider | Quality | Latency | Setup |
|----------|---------|---------|-------|
| **Gemini 2.5 Flash TTS** | High | ~2s | `GEMINI_API_KEY` |
| **ElevenLabs Eleven v3** | Highest | ~1s | `ELEVENLABS_API_KEY` |
| **OpenAI gpt-4o-mini-tts** | High | ~1s | `OPENAI_API_KEY` |
| espeak-ng | Low | <0.1s | `apt install espeak-ng` |
| Custom URL | Varies | Varies | `QA_HUD_TTS=https://...?text=%s` |
| Custom function | Varies | Varies | `tts: async (text) => wavBuffer` |

**Gemini TTS gotcha**: returns raw PCM (`audio/L16;codec=pcm;rate=24000`), not WAV. Must add a 44-byte WAV header before use.

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| TTS waiting 2-4s per annotate | Each call fetches on demand | Use `prefetchTts()` or `script.prepare()` to batch-fetch upfront |
| Audio plays during pause in output | AudioWriter discards silence gaps | Fixed: chunks are timestamped, silence gaps preserved |
| `AudioContext.state === "suspended"` | Playwright clicks aren't user gestures | `await ctx.resume()` after creating AudioContext |
| File picker not visible in video | Playwright video captures DOM only | Use Docker with ffmpeg x11grab (example 08) |
| `xdotool search --name` misses dialog | Regex matching unreliable for Firefox | Iterate windows with `getwindowname` instead |
| Click misses button via xdotool | `window.screenY` returns 0 | Use `mozInnerScreenX/Y` (Firefox-specific) |
| Local test overwrites Docker video | Both write to same `.demowright/` path | `test.skip(!process.env.DEMOWRIGHT_DOCKER)` for Docker-only tests |
| Gemini raw PCM sounds like noise | PCM returned without WAV header | Add 44-byte RIFF/WAV header |

---

## CLI 2-Pass Pipeline (Terminal Demos)

For CLI tools that don't run in a browser. Separate from demowright — uses a narration-driven 2-pass Docker pipeline.

**Pass 1**: Silent screen capture (Xvfb + xterm + ffmpeg x11grab)
**Pass 2**: Pre-generated TTS overlaid in post-mix, subtitles burned in

```
generate-narration.py  →  narration_track.wav + durations.sh + meta.json
docker build → docker run  →  ffmpeg x11grab + demo.sh (narration-timed)
post-mix  →  adelay + subtitle burn  →  screen-recording-final.mp4
```

Core pattern — `narrate()` / `narrate_end()` in bash:

```bash
narrate() {
  local var="DUR_${1//-/_}"
  __NARRATE_DUR_MS="${!var:-4000}"
  __NARRATE_START_MS=$(date +%s%3N)
}
narrate_end() {
  local remaining=$(( __NARRATE_DUR_MS - ($(date +%s%3N) - __NARRATE_START_MS) ))
  [ "$remaining" -gt 50 ] && sleep "$(awk "BEGIN{printf \"%.3f\", ${remaining}/1000}")"
}

narrate "02_launch" "Launching..."
myapp start &
narrate_end   # sleeps for remaining duration
```

Full template with Dockerfile, TTS generation, post-mix, thumbnail, and YouTube upload: see `~/.claude/skills/record-demo-video/template/`.
