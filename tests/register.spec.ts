/**
 * Regression test for #16: withDemowright()/register.cjs must apply the HUD
 * under both Node and bun. Runs a child Playwright on the same runtime as
 * this test (process.execPath) with tests/fixtures/register/playwright.config.ts.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "@playwright/test";

test("withDemowright applies the HUD in workers", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "runs once");
  test.setTimeout(60_000);
  const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
  // Throws (and fails this test) if the child run fails
  execFileSync(process.execPath, [cli, "test", "--config", "tests/fixtures/register/playwright.config.ts"], {
    stdio: "pipe",
    env: { ...process.env, NODE_OPTIONS: "" },
  });
});
