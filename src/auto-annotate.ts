/**
 * Auto-annotation hook for config/register integrations.
 *
 * Automatically calls `annotate()` with the test title at the start of
 * each test, so every test section gets a caption + TTS narration in the
 * video recording — zero changes to test bodies needed.
 *
 * Usage (one-time setup in your test config or shared fixture):
 *
 *   // tests/setup.ts
 *   import { test } from '@playwright/test';
 *   import { installAutoAnnotate } from 'demowright/auto-annotate';
 *   installAutoAnnotate(test);
 *
 * Works with both `withDemowright()` config and `NODE_OPTIONS` register approaches.
 * The annotation is a no-op when demowright is inactive.
 */
import type { test as testType } from "@playwright/test";

export function installAutoAnnotate(test: typeof testType): void {
  test.beforeEach(async ({ page }, testInfo) => {
    const { annotate } = await import("./helpers.js");
    const title = testInfo.titlePath.length > 1
      ? testInfo.titlePath.join(" › ")
      : testInfo.title;
    await annotate(page, title);
  });
}
