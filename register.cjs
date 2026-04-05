/**
 * CJS preload for NODE_OPTIONS="--require qa-hud/register" (zero test changes).
 *
 *   NODE_OPTIONS="--require qa-hud/register" npx playwright test
 *
 * Patches Browser.newContext() to automatically inject QA HUD.
 *
 * Config via env vars: QA_HUD=0, QA_HUD_CURSOR=0, QA_HUD_KEYBOARD=0,
 *   QA_HUD_DELAY=200, QA_HUD_CURSOR_STYLE=dot, QA_HUD_KEY_FADE=2000
 */
"use strict";

if (process.env.QA_HUD === "0") {
  // Explicitly disabled
} else {
  const Module = require("node:module");
  const originalLoad = Module._load;
  let contextProtoPatched = false;

  Module._load = function qaHudLoad(request, parent, isMain) {
    const result = originalLoad.call(this, request, parent, isMain);

    // We need to patch BrowserContext.prototype, but it's not exported.
    // Instead, we patch the BrowserType launch methods to intercept
    // the Browser they return, then patch Browser.newContext.
    if (!contextProtoPatched && request === "playwright-core") {
      contextProtoPatched = true;

      // Patch each browser type's launch method
      for (const browserType of [result.chromium, result.firefox, result.webkit]) {
        if (!browserType?.launch) continue;

        const origLaunch = browserType.launch.bind(browserType);
        browserType.launch = async function (...args) {
          const browser = await origLaunch(...args);
          patchBrowser(browser);
          return browser;
        };
      }
    }

    return result;
  };

  function patchBrowser(browser) {
    if (browser.__qaHudPatched) return;
    browser.__qaHudPatched = true;

    const origNewContext = browser.newContext.bind(browser);
    browser.newContext = async function (...args) {
      const context = await origNewContext(...args);
      await applyHudToContext(context);
      return context;
    };
  }

  let applyHudCache = null;
  async function applyHudToContext(context) {
    try {
      if (!applyHudCache) {
        const mod = await import("./dist/setup.js");
        applyHudCache = mod.applyHud;
      }
      const opts = {
        cursor: process.env.QA_HUD_CURSOR !== "0",
        keyboard: process.env.QA_HUD_KEYBOARD !== "0",
        cursorStyle: process.env.QA_HUD_CURSOR_STYLE || "default",
        keyFadeMs: Number(process.env.QA_HUD_KEY_FADE) || 1500,
        actionDelay: Number(process.env.QA_HUD_DELAY) || 120,
        tts: process.env.QA_HUD_TTS || false,
      };
      await applyHudCache(context, opts);
    } catch (e) {
      console.warn("[qa-hud] Failed to apply HUD:", e.message);
    }
  }
}
