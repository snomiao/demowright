/**
 * Tracks which Pages have demowright active and their TTS config.
 * Shared between setup.ts and helpers.ts so helpers can detect HUD mode.
 *
 * Uses a Node-side WeakMap for fast sync checks, with a browser-side
 * fallback (window.__qaHud) for the config/register approach where the
 * module instances may differ between worker and test code.
 *
 * TTS provider is also stored on a process-global so it survives across
 * module instances (config/register approach loads setup.ts and helpers.ts
 * from different entry points, creating separate WeakMaps).
 */

import type { Page } from "@playwright/test";
import type { TtsProvider } from "./setup.js";

export type AudioSegment = {
  timestampMs: number;
  wavBuf: Buffer;
};

export type HudPageConfig = {
  tts: TtsProvider;
};

const hudPages = new WeakMap<Page, HudPageConfig>();
const audioSegments = new WeakMap<Page, AudioSegment[]>();

// Process-global TTS provider + audio segments — shared across module instances
const g = globalThis as any;
if (!g.__qaHudGlobal) g.__qaHudGlobal = { tts: false as TtsProvider, audioSegments: new Map<string, AudioSegment[]>(), outputDir: ".demowright" };

export function registerHudPage(page: Page, config?: HudPageConfig): void {
  hudPages.set(page, config ?? { tts: false });
  // Also store TTS provider globally for cross-module access
  if (config?.tts) g.__qaHudGlobal.tts = config.tts;
}

/**
 * Check if demowright is active on this page.
 * Checks the Node-side registry first (fast), falls back to querying
 * the browser for window.__qaHud (covers the config/register approach).
 */
export async function isHudActive(page: Page): Promise<boolean> {
  if (hudPages.has(page)) return true;
  try {
    const active = await page.evaluate(() => !!(window as any).__qaHud);
    if (active) {
      // Cache with global TTS provider (may have been set by another module instance)
      hudPages.set(page, { tts: g.__qaHudGlobal.tts || false });
    }
    return active;
  } catch {
    return false;
  }
}

/**
 * Get TTS provider configured for this page (if any).
 */
export function getTtsProvider(page: Page): TtsProvider {
  return hudPages.get(page)?.tts || g.__qaHudGlobal.tts || false;
}

/**
 * Get the global TTS provider (set by register.cjs or applyHud).
 * Useful for pre-generating audio before a page/context exists.
 */
export function getGlobalTtsProvider(): TtsProvider {
  return g.__qaHudGlobal.tts || false;
}

export function setGlobalOutputDir(dir: string): void {
  g.__qaHudGlobal.outputDir = dir;
}

export function getGlobalOutputDir(): string {
  return g.__qaHudGlobal.outputDir || ".demowright";
}

/**
 * Store a TTS audio segment with its wall-clock timestamp.
 * Used for deferred audio track building at context close.
 */
export function storeAudioSegment(page: Page, segment: AudioSegment): void {
  let segs = audioSegments.get(page);
  if (!segs) {
    segs = [];
    audioSegments.set(page, segs);
  }
  segs.push(segment);
  // Also store in global map for cross-module access
  const pageId = (page as any)._guid || String(Date.now());
  if (!g.__qaHudGlobal.audioSegments.has(pageId)) {
    g.__qaHudGlobal.audioSegments.set(pageId, segs);
  }
}

/**
 * Get all stored audio segments for a page.
 */
export function getAudioSegments(page: Page): AudioSegment[] {
  const local = audioSegments.get(page);
  if (local && local.length > 0) return local;
  // Fallback to global
  const pageId = (page as any)._guid;
  if (pageId) return g.__qaHudGlobal.audioSegments.get(pageId) ?? [];
  return [];
}

// ---------------------------------------------------------------------------
// Video render job — stored by video-script.ts render(), consumed by setup.ts
// ---------------------------------------------------------------------------

export type VideoRenderJob = {
  wavPath: string;
  srtPath: string;
  chaptersPath: string;
  mp4Path: string;
  timeline: { kind: string; type?: string; startMs: number; durationMs: number }[];
  totalMs: number;
};

const renderJobs = new WeakMap<Page, VideoRenderJob>();

export function storeRenderJob(page: Page, job: VideoRenderJob): void {
  renderJobs.set(page, job);
  const pageId = (page as any)._guid || String(Date.now());
  if (!g.__qaHudGlobal.renderJobs) g.__qaHudGlobal.renderJobs = new Map();
  g.__qaHudGlobal.renderJobs.set(pageId, job);
}

export function getRenderJob(page: Page): VideoRenderJob | undefined {
  const local = renderJobs.get(page);
  if (local) return local;
  const pageId = (page as any)._guid;
  if (pageId) return g.__qaHudGlobal.renderJobs?.get(pageId);
  return undefined;
}
