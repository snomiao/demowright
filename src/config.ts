/**
 * Approach 3: Config helper (one line in playwright.config.ts).
 *
 *   import { defineConfig } from '@playwright/test';
 *   import { withQaHud } from 'qa-hud/config';
 *
 *   export default withQaHud(defineConfig({ ... }));
 *
 * Sets NODE_OPTIONS to --require qa-hud/register so the HUD is injected
 * into every BrowserContext automatically. No test file changes needed.
 */
import { createRequire } from "node:module";
import type { PlaywrightTestConfig } from "@playwright/test";
import { type QaHudOptions, defaultOptions } from "./setup.js";

export type { QaHudOptions };

export function withQaHud(
  config: PlaywrightTestConfig,
  options?: Partial<QaHudOptions>,
): PlaywrightTestConfig {
  const opts = { ...defaultOptions, ...options };

  // Resolve the CJS register script path
  const require = createRequire(import.meta.url);
  const registerPath = require.resolve("../register.cjs");

  // Forward HUD options as env vars for the register preload
  if (!opts.cursor) process.env.QA_HUD_CURSOR = "0";
  if (!opts.keyboard) process.env.QA_HUD_KEYBOARD = "0";
  if (opts.actionDelay !== defaultOptions.actionDelay)
    process.env.QA_HUD_DELAY = String(opts.actionDelay);
  if (opts.cursorStyle !== defaultOptions.cursorStyle)
    process.env.QA_HUD_CURSOR_STYLE = opts.cursorStyle;
  if (opts.keyFadeMs !== defaultOptions.keyFadeMs)
    process.env.QA_HUD_KEY_FADE = String(opts.keyFadeMs);
  if (typeof opts.tts === "string") process.env.QA_HUD_TTS = opts.tts;

  // Inject --require into NODE_OPTIONS so it runs in every worker
  const flag = `--require ${registerPath}`;
  const existing = process.env.NODE_OPTIONS || "";
  if (!existing.includes(flag)) {
    process.env.NODE_OPTIONS = existing ? `${existing} ${flag}` : flag;
  }

  return config;
}
