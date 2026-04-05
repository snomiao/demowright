/**
 * qa-hud — Playwright HUD plugin
 *
 * Overlays a visible cursor, keystroke badges, click ripples, auto-slowdown,
 * TTS narration, and subtitles into test video recordings.
 *
 * ## Quick Start
 *
 *   import { withQaHud } from "qa-hud/config";
 *   export default withQaHud(defineConfig({ use: { video: "on" } }));
 *
 * ## Helpers (recording-only, no-ops when HUD inactive)
 *
 *   import { clickEl, typeKeys, narrate, annotate, hudWait } from "qa-hud";
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
//   import { test, expect } from 'qa-hud';
export { test } from "./fixture.js";

// Approach 4: Programmatic — call applyHud() on any BrowserContext
//   import { applyHud } from 'qa-hud';
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
  subtitle,
  annotate,
} from "./helpers.js";

export { expect } from "@playwright/test";
