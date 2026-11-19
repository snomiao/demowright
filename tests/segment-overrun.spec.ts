/**
 * Regression test for #10: a segment action that outlasts its narration
 * leaves a silent gap in the audio track — demowright must say so.
 */
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { applyHud } from "../src/setup.js";
import { createVideoScript } from "../src/video-script.js";
import { fakeTts, wavInfo } from "./support/fake-tts.js";

test("warns when a segment action overruns its narration", async ({ browser }) => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: any[]) => { warnings.push(args.join(" ")); };
  try {
    const context = await browser.newContext();
    await applyHud(context, { tts: fakeTts, actionDelay: 0 });
    const page = await context.newPage();
    await page.setContent("<h1>overrun</h1>");
    const res = await createVideoScript()
      .segment("Short.", async () => { await page.waitForTimeout(3000); }) // ~0.5s of audio
      .segment("Next thing.", async () => {})
      .render(page, { baseName: "overrun-test" });

    const seg = res.timeline[0];
    expect(seg.overrunMs).toBeGreaterThan(2000);
    // Track spans the overrun: the second segment's audio starts ~3s in
    expect(wavInfo(fs.readFileSync(res.wavPath!)).durationMs).toBeGreaterThan(3000);
    await context.close();
  } finally {
    console.warn = origWarn;
  }
  const hits = warnings.filter((w) => w.includes("overran its narration"));
  expect(hits).toHaveLength(1);
  expect(hits[0]).toContain('"Short."');
});
