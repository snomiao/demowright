# Getting Started

## What is qa-hud?

Playwright plugin that overlays a visible cursor, keystroke badges, click ripples, and auto-slowdown into test video recordings. Makes videos readable by humans and AI.

## Installation

```bash
npm install qa-hud
```

## Four Integration Methods

### Method 1: Config helper (recommended)

Zero test file changes. Wrap your config with `withQaHud`:

```ts
import { defineConfig } from "@playwright/test";
import { withQaHud } from "qa-hud/config";

export default withQaHud(defineConfig({ use: { video: "on" } }));
```

### Method 2: CLI flag

Zero code changes at all:

```bash
NODE_OPTIONS="--require qa-hud/register" npx playwright test
```

### Method 3: Import replacement

```ts
import { test, expect } from "qa-hud"; // instead of @playwright/test
```

### Method 4: Programmatic

```ts
import { applyHud } from "qa-hud";

await applyHud(context, { cursor: true, keyboard: true, actionDelay: 150 });
```

## Configuration Options

All fields on `QaHudOptions` are optional — sensible defaults are built in.

| Option         | Type                                       | Default     | Description                        |
| -------------- | ------------------------------------------ | ----------- | ---------------------------------- |
| `cursor`       | `boolean`                                  | `true`      | Show cursor overlay                |
| `keyboard`     | `boolean`                                  | `true`      | Show keystroke display             |
| `cursorStyle`  | `'default' \| 'dot' \| 'crosshair'`       | `'default'` | Cursor appearance                  |
| `keyFadeMs`    | `number`                                   | `1500`      | Key badge fade time (ms)           |
| `actionDelay`  | `number`                                   | `120`       | Delay after each action (ms)       |
| `audio`        | `false \| string`                          | `false`     | Path to save WAV file              |
| `tts`          | `TtsProvider`                              | `false`     | TTS provider for `narrate()`       |

## Environment Variables

When using [Method 2](#method-2-cli-flag) or [Method 1](#method-1-config-helper-recommended), options are forwarded as environment variables:

| Variable              | Effect                                      |
| --------------------- | ------------------------------------------- |
| `QA_HUD`              | Set to `0` to disable the HUD entirely      |
| `QA_HUD_CURSOR`       | Set to `0` to hide the cursor overlay        |
| `QA_HUD_KEYBOARD`     | Set to `0` to hide the keystroke display     |
| `QA_HUD_DELAY`        | Override `actionDelay` (e.g. `200`)          |
| `QA_HUD_CURSOR_STYLE` | Override `cursorStyle` (`dot`, `crosshair`)  |
| `QA_HUD_KEY_FADE`     | Override `keyFadeMs` (e.g. `2000`)           |
| `QA_HUD_TTS`          | TTS URL template (`%s` is replaced by text)  |

## How It Works

1. **`addInitScript` listeners** — mouse, keyboard, and click event listeners are registered via `context.addInitScript()`. No DOM mutation, so they survive navigations and run before any page code.
2. **DOM injection after navigation** — on each page load, `page.evaluate()` creates the overlay elements (cursor SVG, key badge container, ripple canvas) and wires them to the listener state.
3. **`pointer-events: none` overlay** — all HUD elements sit in an absolutely-positioned layer with `pointer-events: none`, so they never interfere with the page under test.
4. **Action method wrapping for delays** — Playwright action methods (`click`, `fill`, `type`, etc.) are wrapped to insert a configurable delay after each call, giving the video encoder time to capture each step.

## What's Next?

- [Helpers API](./helpers.md) — `clickEl`, `typeKeys`, `moveTo`, and recording-only delays
- [Narration & Subtitles](./narration.md) — `narrate()`, `subtitle()`, `annotate()`
- [TTS Setup](./tts.md) — configuring text-to-speech providers
- [Audio Capture](./audio.md) — recording browser audio to WAV
- [Cursor & Keyboard](./cursor-keyboard.md) — cursor styles, key badges, click ripples
- [Wrapper Strategies](./wrapper.md) — making native Playwright calls show the HUD
- [Examples](../examples/) — 6 runnable demo scenarios
