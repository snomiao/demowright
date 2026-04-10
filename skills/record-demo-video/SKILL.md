---
name: record-demo-video
description: Record a polished demo video using demowright's Playwright-based HUD overlay, TTS narration (Gemini/espeak-ng), and ffmpeg post-mix. Use this skill when producing an MP4 demo video with synchronized voice narration, subtitles, and optional AI-generated thumbnails. No Docker or Xvfb needed — demowright handles recording, TTS capture, and audio mux natively.
---

# record-demo-video — Demowright Demo Video Production

Produce a polished MP4 demo video using demowright's Playwright-based pipeline:
1. **Narration-driven script** using `createVideoScript()` or `narrate()` helpers
2. **TTS narration** via Gemini, OpenAI, or espeak-ng (auto-captured by demowright)
3. **Automatic mux** — video + audio + subtitles handled by demowright's setup.ts

No Docker, Xvfb, or manual ffmpeg needed — demowright handles everything inside Playwright.

## Prerequisites

- **demowright** installed (`npm install demowright` or use this repo directly)
- **Playwright** with Firefox (for video recording)
- **(Optional) TTS API key** — for high-quality narration:

  | Provider | Model | Setup |
  |---|---|---|
  | **espeak-ng** (default, free) | Local synthesis | `apt install espeak-ng` |
  | **Gemini TTS** (recommended) | `gemini-2.5-flash-preview-tts` | `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local` |
  | **OpenAI TTS** | `gpt-4o-mini-tts` | `OPENAI_API_KEY` in `.env.local` |
  | **ElevenLabs** | Eleven v3 | `ELEVENLABS_API_KEY` in `.env.local` |

  See [`MODEL_REFERENCES.md`](./MODEL_REFERENCES.md) for a fuller comparison.

## Pipeline Overview

```
Playwright test (.spec.ts)
  ├── createVideoScript() or narrate()/annotate() helpers
  │     ├── TTS provider generates audio per segment
  │     ├── Audio played in browser via AudioContext
  │     └── PulseAudio pipe-sink captures all audio
  │
  ├── Playwright recordVideo captures screen
  │
  └── context.close() triggers:
        ├── WAV audio track assembly (setup.ts)
        ├── SRT subtitle generation
        ├── ffmpeg mux: video + audio + subtitles → .mp4
        └── Output: .demowright/<test-name>.mp4
```

## Approach 1: Video Script (recommended for multi-segment demos)

```typescript
import { test } from "@playwright/test";
import { applyHud } from "demowright";
import { createVideoScript } from "demowright/helpers";

test("my demo", async ({ browser }) => {
  const context = await browser.newContext({
    recordVideo: { dir: "tmp/", size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
  });

  await applyHud(context, {
    actionDelay: 300,
    audio: true,
    tts: "https://...tts-endpoint?text={{text}}", // or espeak-ng auto-detected
  });

  const page = await context.newPage();
  const script = createVideoScript();

  script.title("My Tool Demo", { durationMs: 3000 });

  script.segment("Getting Started", async () => {
    await page.goto("https://example.com");
    // Visual actions happen here, timed to narration
  });

  script.segment("Key Feature", async () => {
    await page.click("#feature-btn");
  });

  script.outro("Thanks for watching!", { durationMs: 2000 });

  const result = await script.render(page);
  // result.srtContent, result.chaptersContent available

  await context.close();
  // → .demowright/my-demo.mp4 (video + audio + subtitles)
});
```

## Approach 2: Simple narrate() helpers

```typescript
import { test } from "@playwright/test";
import { applyHud } from "demowright";
import { narrate, clickEl, hudWait, annotate } from "demowright/helpers";

test("quick demo", async ({ browser }) => {
  const context = await browser.newContext({
    recordVideo: { dir: "tmp/", size: { width: 1280, height: 720 } },
  });

  await applyHud(context, { actionDelay: 300, audio: true });
  const page = await context.newPage();

  await narrate(page, "Welcome to our tool demo");
  await page.goto("https://example.com");

  await annotate(page, "Let's click the main button", async () => {
    await clickEl(page, "#main-btn");
    await hudWait(page, 1000);
  });

  await context.close();
});
```

## TTS Provider Setup

### espeak-ng (default, zero config)

Works automatically if `espeak-ng` is installed. No API key needed.

### Gemini TTS (best quality/convenience balance)

```bash
echo 'GOOGLE_GENERATIVE_AI_API_KEY=your-key' > .env.local
```

Configure in `playwright.config.ts`:
```typescript
export default withDemowright(defineConfig({...}), {
  audio: true,
  tts: async (text: string) => {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }], role: "user" }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
          },
        }),
      },
    );
    const data = await resp.json();
    const pcm = Buffer.from(data.candidates[0].content.parts[0].inlineData.data, "base64");
    // Gemini returns raw PCM (24kHz, 16-bit, mono) — wrap in WAV header
    return pcmToWav(pcm, 24000);
  },
});
```

### Pre-generating TTS with Python (for reproducible builds)

For deterministic timing or batch generation, use the included Python script:

```bash
# Edit SEGMENTS in the script first
python3 skills/record-demo-video/template/generate-narration.py
```

Key detail: Gemini TTS returns raw PCM (`audio/L16;codec=pcm;rate=24000`), not WAV.
Must add WAV header before use:

```python
def pcm_to_wav(pcm_bytes, path, rate=24000, channels=1, bits=16):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(channels); w.setsampwidth(bits // 8)
        w.setframerate(rate);     w.writeframes(pcm_bytes)
```

## Thumbnail Generation (optional)

```bash
python3 skills/record-demo-video/template/generate-thumbnail.py
```

Uses Gemini image generation by default. Edit `PROMPT` in the script.

Prepend as 3-second intro frame:
```bash
ffmpeg -y -loop 1 -t 3 -i thumbnail.jpg -i .demowright/demo.mp4 \
  -filter_complex "[0:v]scale=1280:720,setsar=1[t];[1:v][t]concat=n=2:v=1:a=0[v];[1:a]adelay=3000|3000[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -c:a aac final.mp4
```

## YouTube Upload (optional)

```bash
python3 skills/record-demo-video/template/youtube_upload.py .demowright/demo.mp4
```

Requires `client_secret.json` from Google Cloud Console (OAuth Desktop client, YouTube Data API v3).

## Demowright vs Docker Pipeline

| Aspect | Demowright (this project) | Docker/Xvfb (template/) |
|---|---|---|
| Recording | Playwright `recordVideo` | Xvfb + ffmpeg x11grab |
| Audio capture | PulseAudio pipe-sink (automatic) | Post-mix only (no live audio) |
| TTS timing | `narrate()` / `pace()` auto-syncs | `narrate()`/`narrate_end()` bash helpers |
| Subtitles | Auto-generated SRT via `createVideoScript()` | Post-mix from meta.json |
| Mux | Automatic on `context.close()` | Manual ffmpeg in record.sh |
| HUD overlay | Cursor, key badges, click ripples | None (raw screen capture) |
| Setup | `bun i` + Playwright | Docker build + Xvfb + fluxbox |
| Best for | **Web app demos** | **CLI tool demos** |

## Quick Reference

```bash
# 1. Write your test with narrate()/createVideoScript()
# 2. Run the test
bunx playwright test examples/09-video-script.spec.ts --config examples/playwright.config.ts

# 3. Output: .demowright/<test-name>.mp4

# 4. (Optional) Generate thumbnail
python3 skills/record-demo-video/template/generate-thumbnail.py

# 5. (Optional) Upload to YouTube
python3 skills/record-demo-video/template/youtube_upload.py .demowright/demo.mp4
```

## Template Files (for Docker/CLI demos)

The `template/` directory contains the Docker-based pipeline from playwright-multi-tab,
useful as a reference or for recording CLI tools that don't run in a browser:

| File | Purpose | Edit per project? |
|---|---|---|
| `generate-narration.py` | Gemini TTS → wav segments + `durations.sh` + `meta.json` | **Yes** — edit `SEGMENTS` |
| `demo.sh` | Narration-driven CLI demo script | **Yes** — edit visual actions |
| `record.sh` | Xvfb + ffmpeg recorder + post-mix | Rarely |
| `Dockerfile` | Recording environment | **Yes** — install your tool |
| `generate-thumbnail.py` | Gemini image gen → `thumbnail.jpg` | **Yes** — edit `PROMPT` |
| `youtube_upload.py` | OAuth + resumable upload to YouTube | Rarely |

## Common Pitfalls

| Problem | Fix |
|---|---|
| No audio in output | Ensure `audio: true` in config and PulseAudio is running |
| TTS sounds robotic | Switch from espeak-ng to Gemini or ElevenLabs |
| Narration out of sync | Use `createVideoScript()` with `pace()` for precise timing |
| Raw PCM sounds like noise | Gemini returns PCM, not WAV — add WAV header |
| Video too long | Reduce `actionDelay`, use shorter `hudWait()` values |
| Firefox-only recording | Playwright video recording works best with Firefox |
