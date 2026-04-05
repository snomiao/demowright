/**
 * Tracks which Pages have QA HUD active and their TTS config.
 * Shared between setup.ts and helpers.ts so helpers can detect HUD mode.
 *
 * Uses a Node-side WeakMap for fast sync checks, with a browser-side
 * fallback (window.__qaHud) for the config/register approach where the
 * module instances may differ between worker and test code.
 */

import type { Page } from "@playwright/test";
import type { TtsProvider } from "./setup.js";

export type HudPageConfig = {
  tts: TtsProvider;
};

const hudPages = new WeakMap<Page, HudPageConfig>();

export function registerHudPage(page: Page, config?: HudPageConfig): void {
  hudPages.set(page, config ?? { tts: false });
}

/**
 * Check if QA HUD is active on this page.
 * Checks the Node-side registry first (fast), falls back to querying
 * the browser for window.__qaHud (covers the config/register approach).
 */
export async function isHudActive(page: Page): Promise<boolean> {
  if (hudPages.has(page)) return true;
  try {
    const active = await page.evaluate(() => !!(window as any).__qaHud);
    if (active) hudPages.set(page, { tts: false }); // cache with default
    return active;
  } catch {
    return false;
  }
}

/**
 * Get TTS provider configured for this page (if any).
 */
export function getTtsProvider(page: Page): TtsProvider {
  return hudPages.get(page)?.tts ?? false;
}
