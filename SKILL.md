---
name: record-demo-video
description: Records narrated demo videos — MP4 with cursor overlay, TTS narration, subtitles. TRIGGER on "demo video", "record", "screencast", "walkthrough", "product tour". Three modes — Playwright, Docker+PulseAudio (audio), Docker+x11grab (system UI).
---

# record-demo-video

## Which recording mode?

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

Docker provides PulseAudio (page audio), Xvfb + fluxbox (headed display), and ffmpeg x11grab (system UI capture). See [docs/docker.md](docs/docker.md) for architecture, env vars, and troubleshooting.

```bash
./docker-run.sh                                    # all examples
./docker-run.sh examples/07-video-player.spec.ts   # page audio capture
./docker-run.sh examples/08-file-upload-download.spec.ts  # system UI capture
```

`docker-run.sh` auto-detects example 08 and wraps it with `docker-record-screen.sh` (ffmpeg x11grab). All other examples use Playwright's video recorder + PulseAudio mux.

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

| Problem | Fix |
|---------|-----|
| TTS waiting 2-4s per annotate | `prefetchTts()` or `script.prepare()` to batch-fetch upfront |
| Audio plays during pause in output | Do the action OUTSIDE `annotate()` callback (see timing pattern above) |
| `AudioContext.state === "suspended"` | `await ctx.resume()` — Playwright clicks aren't user gestures |
| File picker not visible in video | Use Docker + x11grab (example 08). See [docs/docker.md](docs/docker.md) |
| Gemini TTS sounds like noise | Raw PCM needs a 44-byte WAV header before use |
| Local test overwrites Docker video | `test.skip(!process.env.DEMOWRIGHT_DOCKER)` for Docker-only tests |

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
