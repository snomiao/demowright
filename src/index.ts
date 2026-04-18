/**
 * demowright — Playwright video production plugin
 *
 * Overlays a visible cursor, keystroke badges, click ripples, auto-slowdown,
 * TTS narration, and subtitles into test video recordings.
 *
 * ## Quick Start
 *
 *   import { withDemowright } from "demowright/config";
 *   export default withDemowright(defineConfig({ use: { video: "on" } }));
 *
 * ## Helpers (recording-only, no-ops when HUD inactive)
 *
 *   import { clickEl, typeKeys, narrate, annotate, hudWait } from "demowright";
 *
 * ## Documentation
 *
 * - Getting Started:     docs/getting-started.md
 * - Helpers API:         docs/helpers.md
 * - Narration:           docs/narration.md
 * - TTS Setup:           docs/tts.md
 * - Cursor & Keyboard:   docs/cursor-keyboard.md
 * - Audio Capture:       docs/audio.md
 * - Examples:            docs/examples.md
 * - Wrapper Strategies:  docs/wrapper.md
 *
 * @packageDocumentation
 */

// Approach 1: Import replacement
//   import { test, expect } from 'demowright';
export { test } from "./fixture.js";

// Approach 4: Programmatic — call applyHud() on any BrowserContext
//   import { applyHud } from 'demowright';
export { applyHud } from "./setup.js";

export type { QaHudOptions, TtsProvider } from "./setup.js";
export { AudioWriter } from "./audio-writer.js";

// Helpers — recording-only convenience functions
export {
  hudWait,
  moveTo,
  moveToEl,
  clickEl,
  typeKeys,
  narrate,
  caption,
  subtitle,
  annotate,
  prefetchTts,
} from "./helpers.js";

// Auto-annotation hook for config/register integrations
export { installAutoAnnotate } from "./auto-annotate.js";

// Video script — narration-driven video production (title cards, segments, transitions, SRT, chapters)
export { createVideoScript, buildFfmpegCommand, showTitleCard, hideTitleCard } from "./video-script.js";
export type { VideoScriptResult, TimelineEntry, PaceFn, TitleOptions, OutroOptions, RenderOptions } from "./video-script.js";
export { getGlobalTtsProvider } from "./hud-registry.js";

export { expect } from "@playwright/test";
