// Approach 1: Import replacement
//   import { test, expect } from 'qa-hud';
export { test } from "./fixture.js";

// Approach 4: Programmatic — call applyHud() on any BrowserContext
//   import { applyHud } from 'qa-hud';
export { applyHud } from "./setup.js";

export type { QaHudOptions } from "./setup.js";
export { AudioWriter } from "./audio-writer.js";
export { expect } from "@playwright/test";
