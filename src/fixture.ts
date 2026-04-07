/**
 * Approach 1: Fixture-based integration (import replacement).
 *
 *   import { test, expect } from 'demowright';
 */
import { test as base } from "@playwright/test";
import { applyHud, type QaHudOptions } from "./setup.js";
import { annotate } from "./helpers.js";

export type { QaHudOptions };

export const test = base.extend<{ qaHud: Partial<QaHudOptions> }>({
  qaHud: [{}, { option: true }],

  context: async ({ context, qaHud }, use) => {
    await applyHud(context, qaHud);
    await use(context);
  },

  page: async ({ page, qaHud }, use, testInfo) => {
    if (qaHud.autoAnnotate) {
      const title = testInfo.titlePath.length > 1
        ? testInfo.titlePath.join(" › ")
        : testInfo.title;
      await annotate(page, title);
    }
    await use(page);
  },
});
