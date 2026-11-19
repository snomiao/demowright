/**
 * Regression test for #6: narrating without a TTS provider must warn instead
 * of silently producing a video with no narration audio.
 */
import { test, expect } from "@playwright/test";
import { applyHud } from "../src/setup.js";
import { narrate } from "../src/helpers.js";

test("warns once when narrating without a TTS provider", async ({ browser }) => {
  (globalThis as any).__qaHudGlobal.warnedNoTts = false;
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: any[]) => { warnings.push(args.join(" ")); };
  try {
    const context = await browser.newContext();
    await applyHud(context, { actionDelay: 0, tts: false });
    const page = await context.newPage();
    await page.setContent("<h1>no tts</h1>");
    await narrate(page, "first");
    await narrate(page, "second");
    await context.close();
  } finally {
    console.warn = origWarn;
  }
  const hits = warnings.filter((w) => w.includes("no TTS provider configured"));
  expect(hits).toHaveLength(1);
});
