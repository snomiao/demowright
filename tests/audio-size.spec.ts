/**
 * Regression test for #4: captured WAV must not grow with silence or with
 * the number of AudioContexts on the page.
 *
 * Chromium runs with --mute-audio so nothing is played on the host; the
 * Web Audio graph (and our tap) still processes samples.
 */
import fs from "node:fs";
import path from "node:path";
import { test, expect, chromium } from "@playwright/test";
import { applyHud } from "../src/setup.js";

// 5 AudioContexts, each beeping for 200ms, then silence.
const HTML = `<!DOCTYPE html><html><body><h1>Audio size</h1><script>
  for (let i = 0; i < 5; i++) {
    const ctx = new AudioContext();
    ctx.resume();
    const osc = ctx.createOscillator();
    osc.frequency.value = 440 + i * 110;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 200);
  }
</script></body></html>`;

test.skip(!!process.env.CI, "Audio capture requires real Chromium with audio support");

test("captured audio skips silence and stays small", async () => {
  const audioPath = path.join("tmp", "test-audio-size.wav");
  const browser = await chromium.launch({
    args: ["--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  const ctx = await browser.newContext();
  const writer = await applyHud(ctx, { cursor: false, keyboard: false, actionDelay: 0, audio: audioPath });
  const page = await ctx.newPage();
  await page.setContent(HTML);
  await page.waitForTimeout(6000);

  const capturedSec = writer!.totalSamples / 2 / writer!.rate;
  console.log(`captured ${capturedSec.toFixed(2)}s of samples over ~6s wall clock`);
  await ctx.close();
  await browser.close();

  const size = fs.statSync(audioPath).size;
  console.log(`wav size ${(size / 1024).toFixed(0)} KB`);
  // 5 contexts × 6s of continuous taps would be ~30s of samples; only the
  // ~0.2s beeps (plus one ScriptProcessor buffer of tail each) should be sent.
  expect(capturedSec).toBeLessThan(2);
  fs.unlinkSync(audioPath);
});
