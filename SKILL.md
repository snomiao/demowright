---
name: record-demo-video
description: Record polished demo videos with cursor overlays, TTS narration, subtitles, and optional page-audio capture. Uses demowright (Playwright plugin) for browser demos, with Docker (Xvfb + PulseAudio) when pages play audio. Also covers CLI demo recording via a 2-pass Docker pipeline (silent screen capture + TTS post-mix).
---

# record-demo-video — Demo Video Production

Two recording approaches for different use cases:

| Approach | Best for | Audio capture | Setup |
|----------|----------|---------------|-------|
| **demowright** (Playwright plugin) | Browser/web app demos | Web Audio API intercept + PulseAudio (Docker) | `bun`, Playwright |
| **CLI 2-pass pipeline** | Terminal/CLI tool demos | Pre-generated TTS post-mixed in ffmpeg | Docker, Python 3 |

---

## Approach 1 — demowright (Browser Demos)

Playwright test = demo script. demowright adds cursor overlay, keystroke badges, TTS narration, click ripples, and subtitles into the recorded video.

### Quick Start

```bash
bun i demowright
```

Four integration methods (pick one):

```ts
// 1. Config helper — zero test changes
import { withDemowright } from "demowright/config";
export default withDemowright(defineConfig({ ... }), { audio: true });

// 2. CLI preload
// NODE_OPTIONS="--require demowright/register" bunx playwright test

// 3. Import replacement
import { test } from "demowright";

// 4. Programmatic
import { applyHud } from "demowright";
await applyHud(context, { audio: true, tts: myTtsProvider });
```

### Writing a Demo Test

```ts
import { test } from "@playwright/test";
import { clickEl, annotate, hudWait } from "demowright/helpers";

test("product tour", async ({ page }) => {
  await page.goto("https://myapp.com");

  // annotate() = TTS narration + subtitle + callback (runs in parallel)
  await annotate(page, "Welcome to MyApp — let's explore the dashboard", async () => {
    await clickEl(page, "#dashboard-tab");
    await hudWait(page, 2000);
  });

  // For pause/stop moments: do the action FIRST, then narrate over silence
  await clickEl(page, "#pause-btn");
  await hudWait(page, 500);
  await annotate(page, "We just paused the playback");
});
```

### TTS Providers

Set one in `.env.local`:

```bash
# Gemini (recommended — also used for thumbnail generation)
GEMINI_API_KEY=your-key

# Or espeak-ng (free, auto-detected if installed)
# No config needed — just `apt install espeak-ng` or `brew install espeak`
```

| Provider | Quality | Setup |
|----------|---------|-------|
| Gemini 2.5 Flash TTS | High (natural voice) | `GEMINI_API_KEY` |
| espeak-ng | Low (robotic) | Install system package |
| Custom URL | Varies | `QA_HUD_TTS=https://api.example.com/tts?text=%s` |
| Custom function | Varies | Pass `tts: async (text) => wavBuffer` |

### Run Examples

```bash
bun run build
bunx playwright test --config examples/playwright.config.ts
# Output: .demowright/*.mp4
```

---

### Docker — When Pages Play Audio

Playwright's video recorder captures **video only, not audio**. For pages that play sound (video players, games, music apps), you need Docker to provide a virtual audio sink.

**When to use Docker:**
- Page creates `AudioContext` and plays sound
- Page has `<video>` or `<audio>` elements with audio tracks
- You want system-level audio capture as backup

**When Docker is NOT needed:**
- TTS narration only (captured Node-side, always works)
- Pages with no audio output

#### Quick Run

```bash
./docker-run.sh                                    # all examples
./docker-run.sh examples/07-video-player.spec.ts   # single example
```

#### How It Works

```
┌─ Docker Container ──────────────────────────────────┐
│  Xvfb :99          → virtual display (1280×720)     │
│  PulseAudio        → virtual audio sink             │
│  Firefox (headed)  → renders to Xvfb, audio to PA   │
│  Playwright        → controls Firefox, records video │
│  demowright        → captures audio via:             │
│    1. Web Audio API intercept (ScriptProcessorNode)  │
│    2. PulseAudio module-pipe-sink (system-level)     │
│  ffmpeg            → mux video + audio → MP4         │
└─────────────────────────────────────────────────────┘
```

#### Docker Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Xvfb + PulseAudio + Firefox + ffmpeg + bun |
| `docker-entrypoint.sh` | Starts Xvfb, dbus, PulseAudio, exports `PULSE_SERVER` |
| `docker-run.sh` | Build + run wrapper (passes `.env.local`, GPU detection) |
| `.dockerignore` | Excludes node_modules, dist, .demowright |

#### Dockerfile Anatomy

```dockerfile
FROM node:22-bookworm

# Core: virtual display + audio + video encoding
RUN apt-get install -y xvfb pulseaudio ffmpeg dbus

# Firefox system libs (Playwright installs the binary itself)
RUN apt-get install -y libgtk-3-0 libdbus-glib-1-2 libxt6 libasound2 \
    libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxshmfence1

# Optional: free TTS fallback, CJK fonts
RUN apt-get install -y espeak-ng fonts-noto fonts-noto-cjk

# Runtime
RUN curl -fsSL https://bun.sh/install | bash
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
RUN bunx playwright install firefox
COPY . .
RUN bun run build

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["bunx", "playwright", "test", "--config", "examples/playwright.config.ts"]
```

#### Entrypoint: Xvfb + PulseAudio Setup

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. dbus (PulseAudio needs it for module loading)
mkdir -p /run/dbus
dbus-daemon --system --nofork &>/dev/null &

# 2. Virtual display
Xvfb :99 -screen 0 1280x720x24 -ac 2>/dev/null &
export DISPLAY=:99
# Wait for X socket
while [ ! -e /tmp/.X11-unix/X99 ]; do sleep 0.1; done

# 3. PulseAudio with discoverable socket
export XDG_RUNTIME_DIR=/tmp/pulse-runtime
mkdir -p "$XDG_RUNTIME_DIR"
pulseaudio --start --exit-idle-time=-1 --disable-shm=true 2>/dev/null
while ! pactl info >/dev/null 2>&1; do sleep 0.1; done

# 4. Export socket so Firefox finds it
PULSE_SOCKET=$(pactl info | grep "Server String:" | awk '{print $3}')
export PULSE_SERVER="unix:${PULSE_SOCKET}"

exec "$@"
```

**Key details:**
- `XDG_RUNTIME_DIR` must be set — without it, Firefox can't discover PulseAudio
- `PULSE_SERVER` must be exported — Playwright workers inherit it
- `--disable-shm=true` — required in containers (no shared memory segment)
- `dbus` must run first — PulseAudio needs it for `module-pipe-sink` loading

#### PulseAudio Audio Capture Flow

1. `withDemowright()` (config.ts) runs in the **main process** before workers spawn
2. Creates `module-pipe-sink` named `demowright_sink` → writes raw PCM to a FIFO
3. Sets `demowright_sink` as default → Firefox outputs audio there
4. Workers read from the FIFO via `startPulseCapture()` (setup.ts)
5. On context close: raw PCM → WAV header → mixed with TTS → ffmpeg mux

#### GPU Pass-through (Optional)

For hardware-accelerated video decoding in the browser:

```bash
# docker-run.sh auto-detects nvidia runtime
docker run --gpus all ...

# Or manually:
docker run --gpus all -e NVIDIA_VISIBLE_DEVICES=all ...
```

#### Troubleshooting Docker Audio

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Pulse audio: 0.0MB received` | Firefox not connecting to PulseAudio | Check `PULSE_SERVER` and `XDG_RUNTIME_DIR` are exported |
| `Denied access to client` | PulseAudio auth cookie mismatch | Use `--start` mode (not `--system`), ensure `XDG_RUNTIME_DIR` |
| Melody plays but not captured | `AudioContext.state === "suspended"` | Call `await ctx.resume()` — Playwright clicks don't count as user gesture |
| Audio leaks during pause | `AudioWriter` concatenates without timestamps | Fixed: chunks are now timestamped, silence gaps preserved |
| `sink-inputs` empty | Firefox not outputting audio | Verify headed mode (`headless: false`), check `DISPLAY=:99` |

---

## Approach 2 — CLI 2-Pass Pipeline (Terminal Demos)

For CLI tools that run in a terminal (not a browser). Uses a narration-driven 2-pass pipeline:

1. **Pass 1**: Silent screen recording inside Docker (Xvfb + xterm + ffmpeg x11grab)
2. **Pass 2**: Pre-generated TTS audio overlaid in post, subtitles burned in

### Pipeline

```
generate-narration.py  →  narration_track.wav + durations.sh + meta.json
         │
         ▼
docker build → docker run  →  Xvfb :99 → ffmpeg x11grab → screen-recording.mp4
                               demo.sh (narration-driven timing)
                               record.sh post-mix:
                                 adelay = demo_start_ms − ffmpeg_start_ms
                                 ffmpeg overlay narration_track.wav
                                 burn subtitles from meta.json
         │
         ▼
screen-recording-final.mp4  (video + audio + subtitles)
```

### Narration-Driven Timing

The demo script uses `narrate()` / `narrate_end()` helpers. Each section waits exactly as long as its TTS audio clip:

```bash
# demo.sh — sourced from durations.sh
narrate() {
  local name="$1"
  local var="DUR_${name//-/_}"
  __NARRATE_DUR_MS="${!var:-4000}"
  __NARRATE_START_MS=$(date +%s%3N)
}
narrate_end() {
  local remaining=$(( __NARRATE_DUR_MS - ($(date +%s%3N) - __NARRATE_START_MS) ))
  [ "$remaining" -gt 50 ] && sleep "$(awk "BEGIN{printf \"%.3f\", ${remaining}/1000}")"
}

# Usage:
narrate "02_launch" "Launching the app..."
show_cmd 'myapp start'
myapp start &
narrate_end   # sleeps for remaining DUR_02_launch ms
```

### TTS Generation

```python
# generate-narration.py
SEGMENTS = [
    ("01_intro",   "Your tool does X — here's how."),
    ("02_launch",  "First, we launch the app with..."),
]
```

```bash
python3 generate-narration.py
# → narration/*.wav, narration_track.wav, durations.sh, meta.json
```

### Post-Mix

```bash
# Compute delay between ffmpeg start and demo start
audio_delay_ms=$((demo_start_ms - ffmpeg_start_ms))

# Overlay narration track
ffmpeg -i video.mp4 -i narration_track.wav \
  -filter_complex "[1:a]adelay=${d}|${d}[aout]" \
  -map 0:v -map "[aout]" -c:v libx264 -c:a aac output.mp4

# Burn subtitles (generated from meta.json)
ffmpeg -i output.mp4 \
  -vf "subtitles=subs.srt:force_style='FontSize=16'" \
  -c:a copy final.mp4
```

### Thumbnail Generation (Optional)

```bash
python3 generate-thumbnail.py  # → thumbnail.jpg (16:9)

# Prepend as 3-second intro frame
ffmpeg -loop 1 -t 3 -i thumbnail.jpg -i final.mp4 \
  -filter_complex "[0:v]scale=1280:800[t];[1:v]scale=1280:800[m];
    [t][m]concat=n=2:v=1:a=0[v];[1:a]adelay=3000|3000[a]" \
  -map "[v]" -map "[a]" final-with-intro.mp4
```

---

## TTS Provider Reference

| Provider · Model | Strength | Best for |
|---|---|---|
| **ElevenLabs Eleven v3** | Most expressive; audio tags, 70+ languages | Top voice quality |
| **OpenAI `gpt-4o-mini-tts`** | Natural-language style instructions, streaming | Fast prototyping |
| **Google Gemini 2.5 TTS** | Style/accent/pace via prompt; single key with image gen | Single-vendor convenience |
| espeak-ng | Free, offline | CI/testing fallback |

**Gemini TTS gotcha**: returns raw PCM (`audio/L16;codec=pcm;rate=24000`), not WAV. Must wrap with WAV header before use.

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Audio plays during pause in output | `AudioWriter` discards silence gaps | Fixed: timestamped chunks preserve gaps |
| `AudioContext.state === "suspended"` | Playwright clicks aren't user gestures | Call `await ctx.resume()` after creating AudioContext |
| All CLI narration plays at once | `paplay seg.wav &` during recording | Use 2-pass post-mix; no live audio playback |
| Silent gap in CLI demo | Missing narration segment | Add segments for every action, including page loads |
| Raw PCM sounds like noise | Gemini returns PCM, not WAV | Add WAV header with `wave` module |
| 1–2s drift in CLI demo | Bash overhead ~10–50ms/segment | Acceptable; for frame-accurate sync use visual pulse |
