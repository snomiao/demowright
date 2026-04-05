/**
 * Approach 1: Fixture-based integration (import replacement).
 *
 *   import { test, expect } from 'qa-hud';
 */
import { test as base } from "@playwright/test";
import { applyHud, type QaHudOptions } from "./setup.js";

export type { QaHudOptions };

export const test = base.extend<{ qaHud: Partial<QaHudOptions> }>({
  qaHud: [{}, { option: true }],

  context: async ({ context, qaHud }, use) => {
    await applyHud(context, qaHud);
    await use(context);
  },
});
