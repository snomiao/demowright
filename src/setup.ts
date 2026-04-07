/**
 * Core HUD setup logic — shared by all integration approaches.
 */
import { execSync } from "node:child_process";
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext, Page } from "@playwright/test";
import { generateListenerScript, getDomInjector, type HudOptions } from "./hud-overlay.js";
import { generateAudioCaptureScript } from "./audio-capture.js";
import { AudioWriter } from "./audio-writer.js";
import { registerHudPage, getAudioSegments, getRenderJob, setGlobalOutputDir, type AudioSegment } from "./hud-registry.js";

/**
 * TTS provider for narrate().
 * - string: URL template — %s is replaced with encodeURIComponent(text).
 *   Must return audio (mp3/wav/ogg).
 *   Example: "https://api.example.com/tts?text=%s"
 * - function: receives text, returns audio Buffer/ArrayBuffer.
 * - false: disabled (falls back to speechSynthesis, which may not work headless).
 */
export type TtsProvider = false | string | ((text: string) => Promise<Buffer | ArrayBuffer>);

export type QaHudOptions = HudOptions & {
  actionDelay: number;
  /** Enable audio capture via Web Audio API. Set to a file path to save WAV, or `true` for auto-path. */
  audio: boolean | string;
  /** TTS provider for narrate(). See TtsProvider type. */
  tts: TtsProvider;
  /** Automatically annotate (caption + TTS) the test title at the start of each test. */
  autoAnnotate: boolean;
  /** Output directory for rendered videos. Default: `.demowright` */
  outputDir: string;
};

export const defaultOptions: QaHudOptions = {
  cursor: true,
  keyboard: true,
  cursorStyle: "default",
  keyFadeMs: 1500,
  actionDelay: 120,
  audio: false,
  tts: false,
  autoAnnotate: false,
  outputDir: ".demowright",
};

/**
 * Apply the demowright HUD to an existing BrowserContext.
 * Returns an AudioWriter if audio capture is enabled (call .save() after test).
 */
export async function applyHud(
  context: BrowserContext,
  options?: Partial<QaHudOptions>,
): Promise<AudioWriter | undefined> {
  const opts = { ...defaultOptions, ...options };
  setGlobalOutputDir(opts.outputDir);
  const contextStartMs = Date.now();

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

  const videoPaths: string[] = [];

  async function setupPage(page: Page) {
    registerHudPage(page, { tts: opts.tts });
    wrapNavigation(page, domInjector, hudOpts);
    if (opts.actionDelay > 0) {
      patchPageDelay(page, opts.actionDelay);
    }
    if (audioWriter) {
      await setupAudioCapture(page, audioWriter);
      // Eagerly resolve video path while page is alive
      try {
        const vp = await page.video()?.path();
        if (vp) videoPaths.push(vp);
      } catch { /* no video recording */ }
    }
  }

  for (const page of context.pages()) {
    await setupPage(page);
  }
  context.on("page", (page) => setupPage(page));

  // Save audio + mux with video
  if (audioWriter && opts.audio) {
    const outDir = join(process.cwd(), opts.outputDir);
    const tmpDir = join(outDir, "tmp");
    mkdirSync(tmpDir, { recursive: true });
    const audioPath = typeof opts.audio === "string"
      ? opts.audio
      : join(tmpDir, `demowright-audio-${Date.now()}.wav`);

    // Track all pages for segment collection
    const allPages: Page[] = [...context.pages()];
    context.on("page", (pg) => allPages.push(pg));

    context.on("close", () => {
      // Check for video render jobs from createVideoScript().render()
      for (const pg of allPages) {
        const job = getRenderJob(pg);
        if (job) {
          finalizeRenderJob(job, videoPaths);
          return; // render job handles everything — skip legacy audio path
        }
      }

      // Legacy path: build audio track from stored TTS segments
      const segments: AudioSegment[] = [];
      for (const pg of allPages) {
        segments.push(...getAudioSegments(pg));
      }

      let audioOffsetMs = 0;
      if (segments.length > 0) {
        const firstSegMs = segments[0].timestampMs;
        audioOffsetMs = firstSegMs - contextStartMs;
        buildAndSaveAudioTrack(segments, audioPath, firstSegMs);
      } else if (audioWriter!.totalSamples > 0) {
        audioWriter!.save(audioPath);
      } else {
        return;
      }

      // MP4 goes to output root (.demowright/), not the tmp subdir
      const mp4Name = audioPath.split("/").pop()!.replace(/\.wav$/, ".mp4");
      const mp4Path = join(outDir, mp4Name);
      const trimSec = (audioOffsetMs / 1000).toFixed(3);
      let muxed = false;
      for (const videoPath of videoPaths) {
        try {
          if (!existsSync(videoPath)) continue;
          execSync(
            `ffmpeg -y -ss ${trimSec} -i "${videoPath}" -i "${audioPath}" -c:v libx264 -preset fast -c:a aac -shortest "${mp4Path}"`,
            { stdio: "pipe" },
          );
          muxed = true;
          try { unlinkSync(audioPath); } catch {}
          console.log(`[demowright] ✓ Rendered: ${mp4Path}`);
        } catch {
          // ffmpeg not available or mux failed
        }
      }
      if (!muxed) {
        console.log(`[demowright] Audio saved: ${audioPath}`);
        console.log(`[demowright] Mux: ffmpeg -y -ss ${trimSec} -i <video.webm> -i "${audioPath}" -c:v libx264 -preset fast -c:a aac -shortest "${mp4Path}"`);
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
    await page.exposeFunction("__qaHudAudioChunk", (samples: number[], sampleRate: number) => {
      writer.addChunk(samples, sampleRate);
    });
  } catch {
    // exposeFunction may fail if already exposed on this page (e.g. SPA navigation)
  }
}

/**
 * Build a WAV file from stored TTS segments placed at their actual
 * wall-clock timestamps. Silence fills gaps between segments.
 * This eliminates drift caused by page.evaluate overhead.
 */
function buildAndSaveAudioTrack(segments: AudioSegment[], outputPath: string, contextStartMs: number): void {
  if (segments.length === 0) return;

  // Parse first segment to get sample rate
  const firstBuf = segments[0].wavBuf;
  const dataOffset0 = firstBuf.indexOf("data") + 8;
  if (dataOffset0 < 8) return;
  const sampleRate = firstBuf.readUInt32LE(24);
  const channels = 2; // output stereo

  // Use context creation time as base — audio track includes silence for pre-narration period
  const baseMs = contextStartMs;
  let totalMs = 0;
  for (const seg of segments) {
    const dOff = seg.wavBuf.indexOf("data") + 8;
    if (dOff < 8) continue;
    const sr = seg.wavBuf.readUInt32LE(24);
    const ch = seg.wavBuf.readUInt16LE(22);
    const pcm = seg.wavBuf.subarray(dOff);
    const segDur = (pcm.length / 2 / ch / sr) * 1000;
    const endMs = (seg.timestampMs - baseMs) + segDur;
    if (endMs > totalMs) totalMs = endMs;
  }

  // Create buffer for entire track
  const totalSamples = Math.ceil((totalMs / 1000) * sampleRate * channels);
  const trackBuffer = new Float32Array(totalSamples);

  // Place each segment at its correct offset
  for (const seg of segments) {
    const dOff = seg.wavBuf.indexOf("data") + 8;
    if (dOff < 8) continue;
    const sr = seg.wavBuf.readUInt32LE(24);
    const ch = seg.wavBuf.readUInt16LE(22);
    const pcmData = seg.wavBuf.subarray(dOff);
    const sampleCount = pcmData.length / 2;

    // Decode PCM to float32
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = pcmData.readInt16LE(i * 2) / 32768;
    }

    // Convert to stereo interleaved
    const stereo = ch === 1
      ? (() => {
          const s = new Float32Array(sampleCount * 2);
          for (let i = 0; i < sampleCount; i++) {
            s[i * 2] = float32[i];
            s[i * 2 + 1] = float32[i];
          }
          return s;
        })()
      : float32;

    // Place at correct timeline offset
    const offsetMs = seg.timestampMs - baseMs;
    const offsetSamples = Math.floor((offsetMs / 1000) * sampleRate) * channels;
    for (let i = 0; i < stereo.length && offsetSamples + i < trackBuffer.length; i++) {
      trackBuffer[offsetSamples + i] += stereo[i];
    }
  }

  // Write WAV
  const int16 = new Int16Array(trackBuffer.length);
  for (let i = 0; i < trackBuffer.length; i++) {
    const s = Math.max(-1, Math.min(1, trackBuffer[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const dataBytes = int16.length * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * 2, 28);
  buffer.writeUInt16LE(channels * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataBytes, 40);
  Buffer.from(int16.buffer).copy(buffer, 44);

  writeFileSync(outputPath, buffer);
}

/**
 * Finalize a video render job: run ffmpeg with the actual video path,
 * applying fade transitions, subtitle burn-in, and chapter metadata.
 */
function finalizeRenderJob(
  job: import("./hud-registry.js").VideoRenderJob,
  videoPaths: string[],
): void {
  for (const videoPath of videoPaths) {
    try {
      if (!existsSync(videoPath)) continue;

      // Build video filter chain
      const filters: string[] = [];

      // Fade transitions
      const transitions = job.timeline.filter((e) => e.kind === "transition");
      for (const t of transitions) {
        const startSec = (t.startMs / 1000).toFixed(3);
        const durSec = (t.durationMs / 1000).toFixed(3);
        const endSec = ((t.startMs + t.durationMs) / 1000).toFixed(3);
        filters.push(`fade=t=out:st=${startSec}:d=${durSec}`);
        filters.push(`fade=t=in:st=${endSec}:d=${durSec}`);
      }

      // Subtitle burn-in
      if (existsSync(job.srtPath)) {
        const escapedSrt = job.srtPath.replace(/\\/g, "/").replace(/:/g, "\\\\:").replace(/'/g, "'\\''");
        filters.push(`subtitles='${escapedSrt}'`);
      }

      const vf = filters.length > 0 ? `-vf "${filters.join(",")}"` : "";

      // Chapter metadata
      const chapterArgs = existsSync(job.chaptersPath)
        ? `-i "${job.chaptersPath}" -map_metadata 2`
        : "";

      const cmd = [
        `ffmpeg -y`,
        `-i "${videoPath}"`,
        `-i "${job.wavPath}"`,
        chapterArgs,
        vf,
        `-c:v libx264 -preset fast`,
        `-c:a aac`,
        `-shortest`,
        `"${job.mp4Path}"`,
      ].filter(Boolean).join(" ");

      execSync(cmd, { stdio: "pipe" });
      // Clean up intermediates
      for (const f of [job.wavPath, job.srtPath, job.chaptersPath]) {
        try { unlinkSync(f); } catch {}
      }
      console.log(`[demowright] ✓ Rendered: ${job.mp4Path}`);
      return;
    } catch (e: any) {
      console.log(`[demowright] ffmpeg failed: ${e.message}`);
    }
  }

  // ffmpeg not available — print the command for manual use
  if (videoPaths.length > 0) {
    const { buildFfmpegCommand } = require("./video-script.js");
    if (typeof buildFfmpegCommand === "function") {
      const cmd = buildFfmpegCommand(
        videoPaths[0] ?? "<video.webm>",
        job.wavPath,
        job.srtPath,
        job.chaptersPath,
        job.mp4Path,
        job.timeline,
      );
      console.log(`[demowright] Run manually:\n${cmd}`);
    }
  }
}
