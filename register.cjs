/**
 * CJS preload for NODE_OPTIONS="--require demowright/register" (zero test changes).
 *
 *   NODE_OPTIONS="--require demowright/register" npx playwright test
 *
 * Patches Browser.newContext() to automatically inject demowright.
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

  // Track the current spec file for naming output videos
  const g = globalThis;
  if (!g.__qaHudGlobal) g.__qaHudGlobal = { audioSegments: new Map() };

  Module._load = function qaHudLoad(request, parent, isMain) {
    const result = originalLoad.call(this, request, parent, isMain);

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
    // Detect spec filename from the call stack or Playwright context metadata
    try {
      const stack = new Error().stack || "";
      const specMatch = stack.match(/([\/\\][\w.-]+\.spec\.[tj]s)/);
      if (specMatch) {
        const path = require("node:path");
        g.__qaHudGlobal.currentSpec = path.basename(specMatch[1]).replace(/\.spec\.[tj]s$/, "");
      }
    } catch {}
    try {
      if (!applyHudCache) {
        const mod = await import("./src/setup.ts");
        applyHudCache = mod.applyHud;
      }
      const ttsUrl = process.env.QA_HUD_TTS || false;
      let tts = ttsUrl;
      // Built-in Gemini TTS provider
      if (process.env.GEMINI_API_KEY && !ttsUrl) {
        const apiKey = process.env.GEMINI_API_KEY;
        tts = async function geminiTts(text) {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text }] }],
                generationConfig: {
                  responseModalities: ["AUDIO"],
                  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
                },
              }),
            },
          );
          if (!res.ok) throw new Error(`Gemini TTS ${res.status}`);
          const json = await res.json();
          const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!b64) throw new Error("No audio in Gemini response");
          const pcm = Buffer.from(b64, "base64");
          // Wrap raw PCM (s16le 24kHz mono) in WAV header
          const hdr = Buffer.alloc(44);
          hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + pcm.length, 4);
          hdr.write("WAVE", 8); hdr.write("fmt ", 12);
          hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
          hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(24000, 24);
          hdr.writeUInt32LE(48000, 28); hdr.writeUInt16LE(2, 32);
          hdr.writeUInt16LE(16, 34); hdr.write("data", 36);
          hdr.writeUInt32LE(pcm.length, 40);
          return Buffer.concat([hdr, pcm]);
        };
      }

      // Fallback: espeak-ng (free, no API key needed)
      if (!tts) {
        try {
          const { execFileSync } = require("node:child_process");
          execFileSync("espeak-ng", ["--version"], { stdio: "ignore" });
          tts = async function espeakTts(text) {
            const wav = execFileSync("espeak-ng", [
              "--stdout", "-s", "160", "-p", "50", text,
            ], { maxBuffer: 10 * 1024 * 1024 });
            return wav;
          };
        } catch { /* espeak-ng not installed — skip */ }
      }

      // Output directory
      const outputDir = process.env.QA_HUD_OUTPUT_DIR || ".demowright";

      // Audio capture: QA_HUD_AUDIO can be a path template or "1" for auto-path
      let audio = false;
      if (process.env.QA_HUD_AUDIO) {
        const val = process.env.QA_HUD_AUDIO;
        if (val === "1") {
          audio = true;
        } else {
          audio = val;
        }
      }

      const opts = {
        cursor: process.env.QA_HUD_CURSOR !== "0",
        keyboard: process.env.QA_HUD_KEYBOARD !== "0",
        cursorStyle: process.env.QA_HUD_CURSOR_STYLE || "default",
        keyFadeMs: Number(process.env.QA_HUD_KEY_FADE) || 1500,
        actionDelay: Number(process.env.QA_HUD_DELAY) || 120,
        tts,
        audio,
        outputDir,
      };
      await applyHudCache(context, opts);
    } catch (e) {
      console.warn("[demowright] Failed to apply HUD:", e.message);
    }
  }
}
