/**
 * Regression test for #5: withDemowright() accepts a function TTS provider.
 * Runs a child Playwright process with tests/fixtures/config-tts/playwright.config.ts
 * because the option only takes effect through the config/register path.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "@playwright/test";

test("withDemowright forwards a function TTS provider to workers", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "runs once");
  // register.cjs hooks Module._load, which bun's require doesn't route through
  test.skip(!!process.versions.bun, "register approach needs Node.js");
  test.setTimeout(60_000);
  // Throws (and fails this test) if the child run fails
  const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
  execFileSync(process.execPath, [cli, "test", "--config", "tests/fixtures/config-tts/playwright.config.ts"], {
    stdio: "pipe",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
});
