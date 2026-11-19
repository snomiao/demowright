import { test, expect } from "@playwright/test";
import { getTtsProvider } from "../../../src/hud-registry.js";
import { createVideoScript } from "../../../src/video-script.js";

test("function TTS from withDemowright reaches the worker", async ({ page }) => {
  await page.setContent("<h1>config tts</h1>");
  expect(typeof getTtsProvider(page)).toBe("function");
  const res = await createVideoScript().segment("Hello from the config.", async () => {}).run(page);
  // Stub TTS is ~60 ms/char — a real provider-driven segment, not the 3s fallback
  expect(res.timeline[0].durationMs).toBeGreaterThan(1000);
  expect(res.timeline[0].durationMs).toBeLessThan(2500);
});
