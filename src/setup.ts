/**
 * Core HUD setup logic — shared by all integration approaches.
 */
import type { BrowserContext, Page } from "@playwright/test";
import {
  generateListenerScript,
  getDomInjector,
  type HudOptions,
} from "./hud-overlay.js";

export type QaHudOptions = HudOptions & {
  actionDelay: number;
};

export const defaultOptions: QaHudOptions = {
  cursor: true,
  keyboard: true,
  cursorStyle: "default",
  keyFadeMs: 1500,
  actionDelay: 120,
};

/**
 * Apply the QA HUD to an existing BrowserContext.
 */
export async function applyHud(
  context: BrowserContext,
  options?: Partial<QaHudOptions>
): Promise<void> {
  const opts = { ...defaultOptions, ...options };

  // 1. Event listeners via addInitScript (no DOM mutation — survives navigations)
  await context.addInitScript(generateListenerScript());

  // 2. Prepare DOM injection (called after each navigation via page.evaluate)
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
  }

  for (const page of context.pages()) {
    setupPage(page);
  }
  context.on("page", (page) => setupPage(page));
}

/**
 * Wraps page navigation methods to inject HUD DOM after each navigation.
 */
function wrapNavigation(
  page: Page,
  domInjector: (opts: HudOptions) => void,
  hudOpts: HudOptions
) {
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
