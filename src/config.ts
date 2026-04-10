/**
 * Approach 3: Config helper (one line in playwright.config.ts).
 *
 *   import { defineConfig } from '@playwright/test';
 *   import { withDemowright } from 'demowright/config';
 *
 *   export default withDemowright(defineConfig({ ... }));
 *
 * Sets NODE_OPTIONS to --require demowright/register so the HUD is injected
 * into every BrowserContext automatically. No test file changes needed.
 */
import { createRequire } from "node:module";
import { readdirSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import type { PlaywrightTestConfig } from "@playwright/test";
import { type QaHudOptions, defaultOptions } from "./setup.js";

export type { QaHudOptions };

export function withDemowright(
  config: PlaywrightTestConfig,
  options?: Partial<QaHudOptions>,
): PlaywrightTestConfig {
  const opts = { ...defaultOptions, ...options };

  // Resolve the CJS register script path
  const require = createRequire(import.meta.url);
  const registerPath = require.resolve("../register.cjs");

  // Forward HUD options as env vars for the register preload
  if (!opts.cursor) process.env.QA_HUD_CURSOR = "0";
  if (!opts.keyboard) process.env.QA_HUD_KEYBOARD = "0";
  if (opts.actionDelay !== defaultOptions.actionDelay)
    process.env.QA_HUD_DELAY = String(opts.actionDelay);
  if (opts.cursorStyle !== defaultOptions.cursorStyle)
    process.env.QA_HUD_CURSOR_STYLE = opts.cursorStyle;
  if (opts.keyFadeMs !== defaultOptions.keyFadeMs)
    process.env.QA_HUD_KEY_FADE = String(opts.keyFadeMs);
  if (typeof opts.tts === "string") process.env.QA_HUD_TTS = opts.tts;
  if (opts.audio) process.env.QA_HUD_AUDIO = typeof opts.audio === "string" ? opts.audio : "1";
  if (opts.autoAnnotate) process.env.QA_HUD_AUTO_ANNOTATE = "1";
  if (opts.outputDir !== defaultOptions.outputDir)
    process.env.QA_HUD_OUTPUT_DIR = opts.outputDir;

  // Inject --require into NODE_OPTIONS so it runs in every worker
  const flag = `--require ${registerPath}`;
  const existing = process.env.NODE_OPTIONS || "";
  if (!existing.includes(flag)) {
    process.env.NODE_OPTIONS = existing ? `${existing} ${flag}` : flag;
  }

  // When audio capture is enabled, force headed mode so the browser
  // outputs audio to PulseAudio (headless mode produces no audio).
  if (opts.audio) {
    // Find a working local X display (Xvfb) for headed mode
    const display = findLocalDisplay();
    if (display) {
      process.env.DISPLAY = display;
      const use = (config.use ??= {}) as Record<string, any>;
      const launch = (use.launchOptions ??= {}) as Record<string, any>;
      if (launch.headless === undefined) {
        launch.headless = false;
      }
    }
    // Create the PulseAudio pipe-sink in the MAIN process (before workers spawn).
    // Workers read from the pipe via env var. This is necessary because the browser
    // process and the pipe reader must share the same FIFO, and pipe-sink monitors
    // created inside worker processes capture silence.
    const pipePath = setupPulsePipeSink(opts.outputDir);
    if (pipePath) {
      process.env.__DEMOWRIGHT_PULSE_PIPE = pipePath;
    }
  }

  return config;
}

/**
 * Create a PulseAudio pipe-sink in the main process.
 * Returns the FIFO path, or undefined if PulseAudio is unavailable.
 */
function setupPulsePipeSink(outputDir: string): string | undefined {
  try {
    execSync("pactl info", { stdio: "pipe" });
  } catch {
    return undefined;
  }

  const tmpDir = join(process.cwd(), outputDir, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const pipePath = join(tmpDir, `pulse-pipe-${Date.now()}.raw`);

  // Unload any stale demowright sinks
  try {
    const modules = execSync("pactl list modules short", { encoding: "utf-8" });
    for (const line of modules.split("\n")) {
      if (line.includes("demowright_sink")) {
        const modId = line.split("\t")[0];
        try { execSync(`pactl unload-module ${modId}`, { stdio: "pipe" }); } catch {}
      }
    }
  } catch {}

  try {
    execSync(
      `pactl load-module module-pipe-sink sink_name=demowright_sink file="${pipePath}" rate=44100 channels=2 format=s16le sink_properties=device.description="Demowright_Audio_Capture"`,
      { stdio: "pipe" },
    );
    execSync("pactl set-default-sink demowright_sink", { stdio: "pipe" });
    return pipePath;
  } catch {
    return undefined;
  }
}

/**
 * Find a local X display (Xvfb) suitable for headed browser.
 * Prefers :99, then :98, then any local display.
 */
function findLocalDisplay(): string | undefined {
  // Check /tmp/.X11-unix for available displays
  try {
    const sockets = readdirSync("/tmp/.X11-unix");
    const displays = sockets
      .filter((s: string) => s.startsWith("X"))
      .map((s: string) => `:${s.slice(1)}`)
      .sort((a: string, b: string) => {
        const na = parseInt(a.slice(1)), nb = parseInt(b.slice(1));
        if (na >= 98) return nb >= 98 ? na - nb : -1;
        if (nb >= 98) return 1;
        return na - nb;
      });
    for (const d of displays) {
      try {
        execSync(`DISPLAY=${d} xdpyinfo`, { stdio: "pipe", timeout: 2000 });
        return d;
      } catch {}
    }
  } catch {}

  // Fall back to current DISPLAY if it's local (not SSH forwarding)
  const cur = process.env.DISPLAY;
  if (cur && !cur.includes("localhost") && !cur.includes(":10")) {
    return cur;
  }
  return undefined;
}
