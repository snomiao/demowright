---
name: demowright
description: "Build narrated QA demo videos from Playwright tests. Use when creating product tours, onboarding videos, bug report recordings, or stakeholder demos with cursor overlay, TTS narration, title cards, transitions, and subtitles."
---

# demowright — Playwright Video Production

Turn Playwright tests into polished demo videos with visible cursor, keystroke badges, TTS narration, title cards, transitions, and auto-generated subtitles.

## Quick Setup

### 1. Install & configure

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
import { withDemowright } from "demowright/config";

export default withDemowright(
  defineConfig({
    use: {
      video: { mode: "on", size: { width: 1280, height: 720 } },
      viewport: { width: 1280, height: 720 },
    },
  }),
  { actionDelay: 300, audio: true },
);
```

### 2. Set up TTS (optional but recommended)

Set `GEMINI_API_KEY` in `.env.local` — demowright auto-detects it for Gemini TTS. Falls back to `espeak-ng` if installed, then browser `speechSynthesis`.

## Two Approaches

### Simple: Inline helpers

For quick recordings without narration-driven timing:

```ts
import { test } from "@playwright/test";
import { clickEl, typeKeys, annotate, hudWait } from "demowright/helpers";

test("demo", async ({ page }) => {
  await page.goto(url);
  await annotate(page, "Welcome to the app");
  await clickEl(page, "#login");
  await typeKeys(page, "user@example.com", 60, "#email");
  await hudWait(page, 500);
  await clickEl(page, "#submit");
});
```

### Advanced: Video script (narration-driven)

For polished videos with title cards, paced narration, transitions, and subtitles:

```ts
import { test } from "@playwright/test";
import { clickEl, typeKeys, moveToEl } from "demowright/helpers";
import { createVideoScript } from "demowright";

test("product tour", async ({ page }) => {
  await page.goto(url);

  const script = createVideoScript()
    .title("Product Tour", { subtitle: "v2.0", durationMs: 3000 })
    .segment("Welcome to the dashboard", async (pace) => {
      await moveToEl(page, ".hero h1");
      await pace();
      await moveToEl(page, ".cta-button");
      await pace();
    })
    .transition("fade", 400)
    .segment("Let's fill the signup form", async (pace) => {
      await clickEl(page, "#signup");
      await pace();
      await typeKeys(page, "Jane Doe", 65, "#name");
      await pace();
    })
    .outro({ text: "Thanks for watching!", durationMs: 3000 });

  const result = await script.render(page, { baseName: "product-tour" });
});
```

## API Reference

### `createVideoScript()`

Returns a chainable builder:

| Method | Description |
|--------|-------------|
| `.title(text, opts?)` | Full-screen title card overlay. `opts: { subtitle?, durationMs?, background? }` |
| `.segment(text, action?)` | Narrated segment — TTS drives timing. Callback receives `pace()` function |
| `.transition(type?, durationMs?)` | Visual pause between segments. `type: "fade" \| "crossfade" \| "none"` |
| `.outro(opts?)` | Closing card. `opts: { text?, subtitle?, durationMs?, background? }` |
| `.prepare(provider?)` | Pre-generate TTS audio. Call in `beforeAll` to avoid TTS latency during recording |
| `.run(page)` | Execute steps, return timeline. No file output — audio goes to context close handler |
| `.render(page, opts?)` | Execute + write WAV/SRT/chapters + auto-mux MP4 via ffmpeg. `opts: { outputDir?, baseName? }` |

### `pace()` function

Inside `.segment()` callbacks, call `pace()` between actions. It auto-distributes remaining narration time evenly, producing natural ~2 clicks/sec pacing.

### Helpers (from `demowright/helpers`)

| Function | Description |
|----------|-------------|
| `clickEl(page, selector)` | Animated cursor move + click ripple + DOM click |
| `typeKeys(page, text, delay?, selector?)` | Character-by-character typing with key badges |
| `moveToEl(page, selector)` | Smooth cursor animation to element center |
| `moveTo(page, x, y, steps?)` | Smooth cursor to coordinates |
| `narrate(page, text, callback?)` | TTS speech + optional parallel actions |
| `annotate(page, text, callback?)` | Caption + TTS together |
| `caption(page, text, durationMs?)` | Visual text overlay (no TTS) |
| `hudWait(page, ms)` | Delay only when HUD is active |

All helpers are **no-ops when HUD is inactive** — safe to leave in CI tests.

### Pre-generating TTS

For best results, pre-generate TTS in `beforeAll` so recording doesn't include API latency:

```ts
const narration = ["Welcome", "Let's explore", "That's it!"];
const pregen = createVideoScript();
for (const text of narration) pregen.segment(text);

test.beforeAll(async () => {
  await pregen.prepare(); // uses global TTS provider
});

test("demo", async ({ page }) => {
  // Build script with same texts — cache hit, no API calls
  const script = createVideoScript()
    .segment(narration[0], async (pace) => { /* ... */ })
    .segment(narration[1], async (pace) => { /* ... */ });
  await script.run(page);
});
```

## Output

Videos render to `.demowright/` (configurable via `outputDir` option):

```
.demowright/
├── product-tour.mp4    # final rendered video (H.264 + AAC)
└── tmp/                # intermediates (auto-cleaned after ffmpeg)
```

The output dir has a `.gitignore` with `*` — nothing is committed.

## Configuration

```ts
withDemowright(config, {
  actionDelay: 300,     // ms delay after each Playwright action (default: 120)
  audio: true,          // enable audio capture + TTS muxing
  tts: "url" | fn,      // TTS provider (auto-detected from GEMINI_API_KEY)
  outputDir: ".demowright", // output directory for rendered videos
  cursor: true,         // show cursor overlay
  keyboard: true,       // show keystroke badges
  cursorStyle: "default", // cursor style: "default" | "dot" | "crosshair"
  autoAnnotate: false,  // auto-narrate test titles
});
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Gemini TTS (auto-detected from `.env.local`) |
| `QA_HUD_OUTPUT_DIR` | Override output directory |
| `QA_HUD_DELAY=200` | Action delay in ms |
| `QA_HUD_AUDIO=1` | Enable audio capture |
| `QA_HUD_TTS=url` | TTS URL template (`%s` replaced with text) |

## Build & Run

```bash
bun run build                                    # tsdown → dist/
bunx playwright test --config examples/playwright.config.ts  # run all examples
```
