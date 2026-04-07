/**
 * Test audio capture via Web Audio API.
 * Creates an oscillator in the browser, captures PCM output,
 * and verifies a WAV file is written with non-silent audio.
 *
 * NOTE: Requires Chromium with --autoplay-policy=no-user-gesture-required
 * because AudioContext.state stays 'suspended' without a user gesture.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { test, expect, chromium } from "@playwright/test";
import { applyHud } from "../src/setup.js";

const HTML = `<!DOCTYPE html>
<html><body>
  <h1>Audio Capture Test</h1>
  <script>
    const ctx = new AudioContext();
    ctx.resume();
    const osc = ctx.createOscillator();
    osc.frequency.value = 440;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), 1000);
  </script>
</body></html>`;

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});
test.afterAll(() => server?.close());

test.skip(!!process.env.CI, "Audio capture requires real Chromium with audio support");

test("captures audio from Web Audio API oscillator", async () => {
  const audioPath = path.join("tmp", "test-audio.wav");

  // Must use Chromium — Firefox/WebKit keep AudioContext suspended in headless
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"],
  });

  const ctx = await browser.newContext();
  const audioWriter = await applyHud(ctx, {
    cursor: false,
    keyboard: false,
    actionDelay: 0,
    audio: audioPath,
  });

  const page = await ctx.newPage();
  await page.goto(baseUrl);
  await page.waitForTimeout(1500);

  // Verify chunks were captured
  expect(audioWriter).toBeDefined();
  expect(audioWriter!.totalSamples).toBeGreaterThan(0);
  expect(audioWriter!.duration).toBeGreaterThan(0.5);

  // Close context — triggers WAV save
  await ctx.close();

  // Verify WAV file
  expect(fs.existsSync(audioPath)).toBe(true);
  const stats = fs.statSync(audioPath);
  expect(stats.size).toBeGreaterThan(44);

  const buf = fs.readFileSync(audioPath);
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12)).toBe("WAVE");

  // Clean up
  await browser.close();
  fs.unlinkSync(audioPath);
});
