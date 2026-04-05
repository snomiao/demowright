/**
 * Core HUD setup logic — shared by all integration approaches.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { generateListenerScript, getDomInjector, type HudOptions } from "./hud-overlay.js";
import { generateAudioCaptureScript } from "./audio-capture.js";
import { AudioWriter } from "./audio-writer.js";

export type QaHudOptions = HudOptions & {
  actionDelay: number;
  /** Enable audio capture via Web Audio API. Set to a file path to save WAV. */
  audio: false | string;
};

export const defaultOptions: QaHudOptions = {
  cursor: true,
  keyboard: true,
  cursorStyle: "default",
  keyFadeMs: 1500,
  actionDelay: 120,
  audio: false,
};

/**
 * Apply the QA HUD to an existing BrowserContext.
 * Returns an AudioWriter if audio capture is enabled (call .save() after test).
 */
export async function applyHud(
  context: BrowserContext,
  options?: Partial<QaHudOptions>,
): Promise<AudioWriter | undefined> {
  const opts = { ...defaultOptions, ...options };

  // 1. Event listeners via addInitScript (no DOM mutation — survives navigations)
  await context.addInitScript(generateListenerScript());

  // 2. Audio capture via Web Audio API
  let audioWriter: AudioWriter | undefined;
  if (opts.audio) {
    audioWriter = new AudioWriter();
    await context.addInitScript(generateAudioCaptureScript());
  }

  // 3. Prepare DOM injection (called after each navigation via page.evaluate)
  const hudOpts: HudOptions = {
    cursor: opts.cursor,
    keyboard: opts.keyboard,
    cursorStyle: opts.cursorStyle,
    keyFadeMs: opts.keyFadeMs,
  };
  const domInjector = getDomInjector();

  function setupPage(page: Page) {
    wrapNavigation(page, domInjector, hudOpts);
    if (opts.actionDelay > 0) {
      patchPageDelay(page, opts.actionDelay);
    }
    if (audioWriter) {
      setupAudioCapture(page, audioWriter);
    }
  }

  for (const page of context.pages()) {
    setupPage(page);
  }
  context.on("page", (page) => setupPage(page));

  // Save audio on context close
  if (audioWriter && opts.audio) {
    const audioPath = opts.audio;
    context.on("close", () => {
      if (audioWriter!.totalSamples > 0) {
        audioWriter!.save(audioPath);
      }
    });
  }

  return audioWriter;
}

/**
 * Wraps page navigation methods to inject HUD DOM after each navigation.
 */
function wrapNavigation(page: Page, domInjector: (opts: HudOptions) => void, hudOpts: HudOptions) {
  async function injectDom() {
    try {
      // Check if page is still usable before injecting
      if (page.isClosed()) return;
      await page.evaluate(domInjector, hudOpts);
    } catch {
      // Page closed or crashed — ignore
    }
  }

  // Wrap goto
  const originalGoto = page.goto.bind(page);
  (page as any).goto = async function (...args: any[]) {
    const result = await originalGoto(...(args as [any, ...any[]]));
    await injectDom();
    return result;
  };

  // Wrap reload
  const originalReload = page.reload.bind(page);
  (page as any).reload = async function (...args: any[]) {
    const result = await originalReload(...(args as [any]));
    await injectDom();
    return result;
  };

  // Wrap setContent
  const originalSetContent = page.setContent.bind(page);
  (page as any).setContent = async function (...args: any[]) {
    const result = await originalSetContent(...(args as [any, ...any[]]));
    await injectDom();
    return result;
  };

  // Wrap goBack/goForward
  for (const method of ["goBack", "goForward"] as const) {
    const original = (page as any)[method].bind(page);
    (page as any)[method] = async function (...args: any[]) {
      const result = await original(...args);
      await injectDom();
      return result;
    };
  }
}

function patchPageDelay(page: Page, delay: number) {
  const pageMethods = [
    "click",
    "dblclick",
    "fill",
    "press",
    "type",
    "check",
    "uncheck",
    "selectOption",
    "hover",
    "tap",
    "dragAndDrop",
  ] as const;

  for (const method of pageMethods) {
    const original = (page as any)[method];
    if (typeof original === "function") {
      (page as any)[method] = async function (...args: any[]) {
        const result = await original.apply(this, args);
        await page.waitForTimeout(delay);
        return result;
      };
    }
  }

  const kb = page.keyboard;
  for (const method of ["press", "type", "insertText"] as const) {
    const original = (kb as any)[method];
    if (typeof original === "function") {
      (kb as any)[method] = async function (...args: any[]) {
        const result = await original.apply(this, args);
        await page.waitForTimeout(delay);
        return result;
      };
    }
  }
}

/**
 * Expose the audio chunk receiver on the page so the browser-side
 * capture script can send PCM data to Node.
 */
async function setupAudioCapture(page: Page, writer: AudioWriter) {
  try {
    await page.exposeFunction(
      "__qaHudAudioChunk",
      (samples: number[], sampleRate: number) => {
        writer.addChunk(samples, sampleRate);
      }
    );
  } catch {
    // exposeFunction may fail if already exposed on this page (e.g. SPA navigation)
  }
}
