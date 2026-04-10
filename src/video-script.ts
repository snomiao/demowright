/**
 * Video script — narration-driven video production for demowright.
 *
 * Extends the narration plan pattern with title cards, transitions,
 * auto-generated SRT subtitles, chapter markers, and direct MP4 render.
 *
 * ```ts
 * const script = createVideoScript()
 *   .title("My Product Tour")
 *   .segment("Welcome to the dashboard", async (pace) => {
 *     await page.goto("/dashboard");
 *     await pace();
 *   })
 *   .transition("fade", 500)
 *   .segment("Let's fill the form", async (pace) => {
 *     await clickEl(page, "#name");
 *     await pace();
 *     await typeKeys(page, "Alice");
 *   })
 *   .outro({ text: "Thanks for watching!" })
 *
 * const result = await script.render(page);
 * // result.mp4Path, result.srtPath, result.timeline
 * ```
 */
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { isHudActive, getTtsProvider, getGlobalTtsProvider, getGlobalOutputDir, storeAudioSegment, storeRenderJob } from "./hud-registry.js";

// ---------------------------------------------------------------------------
// TTS internals (shared with narration-plan.ts)
// ---------------------------------------------------------------------------

type TtsProviderType = string | ((text: string) => Promise<Buffer | ArrayBuffer>);

async function fetchTtsAudio(text: string, provider: TtsProviderType): Promise<Buffer> {
  if (typeof provider === "string") {
    const url = provider.replace(/%s/g, encodeURIComponent(text));
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TTS fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const result = await provider(text);
  return Buffer.isBuffer(result) ? result : Buffer.from(result);
}

function parseWavDuration(wavBuf: Buffer): number {
  const dataOffset = wavBuf.indexOf("data") + 8;
  if (dataOffset < 8) return 0;
  const sampleRate = wavBuf.readUInt32LE(24);
  const channels = wavBuf.readUInt16LE(22);
  const pcmData = wavBuf.subarray(dataOffset);
  const sampleCount = pcmData.length / 2;
  return (sampleCount / channels / sampleRate) * 1000;
}

function parseWav(wavBuf: Buffer) {
  const dataOffset = wavBuf.indexOf("data") + 8;
  if (dataOffset < 8) throw new Error("Invalid WAV");
  const sampleRate = wavBuf.readUInt32LE(24);
  const channels = wavBuf.readUInt16LE(22);
  const pcmData = wavBuf.subarray(dataOffset);
  const sampleCount = pcmData.length / 2;
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = pcmData.readInt16LE(i * 2) / 32768;
  }
  const durationMs = (sampleCount / channels / sampleRate) * 1000;
  return { float32, sampleRate, channels, sampleCount, durationMs };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pace function — call between actions to auto-distribute remaining narration time. */
export type PaceFn = () => Promise<void>;

type SegmentAction = (pace: PaceFn) => Promise<void>;

type TransitionType = "fade" | "crossfade" | "none";

interface TitleStep {
  kind: "title";
  text: string;
  subtitle?: string;
  /** Optional TTS narration read aloud over the card. When set, card
   *  duration becomes max(durationMs, narration audio length). */
  narration?: string;
  durationMs: number;
  background?: string;
}

interface SegmentStep {
  kind: "segment";
  text: string;
  action?: SegmentAction;
  /** Runs BEFORE narration starts — use for navigation, page.goto(), scrolls, etc. */
  setup?: () => Promise<void>;
}

interface TransitionStep {
  kind: "transition";
  type: TransitionType;
  durationMs: number;
}

interface OutroStep {
  kind: "outro";
  text: string;
  subtitle?: string;
  /** Optional TTS narration read aloud over the card. When set, card
   *  duration becomes max(durationMs, narration audio length). */
  narration?: string;
  durationMs: number;
  background?: string;
}

type ScriptStep = TitleStep | SegmentStep | TransitionStep | OutroStep;

interface PreparedSegment {
  wavBuf: Buffer;
  durationMs: number;
}

export interface TimelineEntry {
  id: string;
  kind: ScriptStep["kind"];
  text: string;
  startMs: number;
  durationMs: number;
  actionMs: number;
  overrunMs: number;
}

export interface VideoScriptResult {
  timeline: TimelineEntry[];
  totalMs: number;
  srtContent: string;
  srtPath?: string;
  chaptersContent: string;
  mp4Path?: string;
  wavPath?: string;
  /** Full ffmpeg command for post-processing (printed when render completes). */
  ffmpegCommand?: string;
}

export interface TitleOptions {
  subtitle?: string;
  /** TTS narration read aloud over the card overlay. Duration auto-extends to fit. */
  narration?: string;
  durationMs?: number;
  /** CSS background — default: radial gradient */
  background?: string;
}

export interface OutroOptions {
  text?: string;
  subtitle?: string;
  /** TTS narration read aloud over the card overlay. Duration auto-extends to fit. */
  narration?: string;
  durationMs?: number;
  background?: string;
}

export interface RenderOptions {
  /** Output directory for generated files. Default: tmp/ */
  outputDir?: string;
  /** Base name for output files (without extension). Default: auto-generated */
  baseName?: string;
}

// ---------------------------------------------------------------------------
// Title/outro card renderer
// ---------------------------------------------------------------------------

async function showCard(
  page: Page,
  text: string,
  subtitle: string | undefined,
  durationMs: number,
  background: string,
): Promise<void> {
  await page.evaluate(
    ([t, sub, d, bg]: [string, string | undefined, number, string]) => {
      const overlay = document.createElement("div");
      overlay.id = "qa-vs-card";
      overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        `background:${bg}`,
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "justify-content:center",
        "z-index:2147483646",
        "pointer-events:none",
        `animation:qa-vs-card-anim ${d}ms ease-in-out forwards`,
      ].join(";");

      const h = document.createElement("div");
      h.textContent = t;
      h.style.cssText = "font-family:'Segoe UI',system-ui,sans-serif;font-size:48px;font-weight:800;color:#fff;text-align:center;max-width:80vw;line-height:1.2;text-shadow:0 2px 20px rgba(0,0,0,0.5);";
      overlay.appendChild(h);

      if (sub) {
        const s = document.createElement("div");
        s.textContent = sub;
        s.style.cssText = "font-family:'Segoe UI',system-ui,sans-serif;font-size:22px;font-weight:400;color:rgba(255,255,255,0.7);margin-top:16px;text-align:center;max-width:70vw;";
        overlay.appendChild(s);
      }

      if (!document.querySelector("#qa-vs-card-style")) {
        const style = document.createElement("style");
        style.id = "qa-vs-card-style";
        style.textContent = `
          @keyframes qa-vs-card-anim {
            0%   { opacity: 0; }
            10%  { opacity: 1; }
            85%  { opacity: 1; }
            100% { opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), d);
    },
    [text, subtitle, durationMs, background] as [string, string | undefined, number, string],
  );
}

// ---------------------------------------------------------------------------
// Caption overlay (inline, same as narration-plan.ts)
// ---------------------------------------------------------------------------

async function showCaption(page: Page, text: string, durationMs: number): Promise<void> {
  await page.evaluate(
    ([t, d]: [string, number]) => {
      const el = document.createElement("div");
      el.textContent = t;
      el.style.cssText = [
        "position:fixed",
        "bottom:60px",
        "left:50%",
        "transform:translateX(-50%)",
        "background:rgba(0,0,0,0.8)",
        "color:#fff",
        "font-family:system-ui,sans-serif",
        "font-size:18px",
        "padding:10px 24px",
        "border-radius:8px",
        "z-index:2147483647",
        "pointer-events:none",
        "white-space:nowrap",
        "max-width:90vw",
        "text-align:center",
        `animation:qa-sub-fade ${d}ms ease-out forwards`,
      ].join(";");

      if (!document.querySelector("#qa-sub-style")) {
        const style = document.createElement("style");
        style.id = "qa-sub-style";
        style.textContent = `
          @keyframes qa-sub-fade {
            0%   { opacity: 0; transform: translateX(-50%) translateY(10px); }
            8%   { opacity: 1; transform: translateX(-50%) translateY(0); }
            85%  { opacity: 1; transform: translateX(-50%) translateY(0); }
            100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
          }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(el);
      setTimeout(() => el.remove(), d);
    },
    [text, durationMs] as [string, number],
  );
}

// ---------------------------------------------------------------------------
// SRT generation
// ---------------------------------------------------------------------------

function formatSrtTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const millis = Math.floor(ms % 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function generateSrt(timeline: TimelineEntry[]): string {
  const subs = timeline.filter((e) => e.kind === "segment" || e.kind === "title" || e.kind === "outro");
  return subs
    .map((entry, i) => {
      const start = formatSrtTimestamp(entry.startMs);
      const end = formatSrtTimestamp(entry.startMs + entry.durationMs);
      return `${i + 1}\n${start} --> ${end}\n${entry.text}\n`;
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Chapter metadata (ffmpeg chapter format)
// ---------------------------------------------------------------------------

function generateChapters(timeline: TimelineEntry[]): string {
  const chapters = timeline.filter((e) => e.kind === "segment" || e.kind === "title" || e.kind === "outro");
  return chapters
    .map((entry) => {
      return `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(entry.startMs)}\nEND=${Math.round(entry.startMs + entry.durationMs)}\ntitle=${entry.text.slice(0, 80)}`;
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// ffmpeg command builder
// ---------------------------------------------------------------------------

/**
 * Build a complete ffmpeg command that:
 * 1. Muxes video + audio
 * 2. Applies fade transitions at the correct offsets
 * 3. Burns in SRT subtitles
 * 4. Embeds chapter metadata
 */
export function buildFfmpegCommand(
  videoPath: string,
  wavPath: string,
  srtPath: string,
  chaptersPath: string,
  mp4Path: string,
  timeline: { kind: string; type?: string; startMs: number; durationMs: number }[],
): string {
  // Build video filter chain
  const filters: string[] = [];

  // Fade transitions at timeline offsets
  const transitions = timeline.filter((e) => e.kind === "transition");
  for (const t of transitions) {
    const startSec = (t.startMs / 1000).toFixed(3);
    const durSec = (t.durationMs / 1000).toFixed(3);
    const endSec = ((t.startMs + t.durationMs) / 1000).toFixed(3);
    filters.push(`fade=t=out:st=${startSec}:d=${durSec}`);
    filters.push(`fade=t=in:st=${endSec}:d=${durSec}`);
  }

  // Subtitle burn-in (escape path for ffmpeg filter syntax)
  const escapedSrt = srtPath.replace(/\\/g, "/").replace(/:/g, "\\\\:").replace(/'/g, "'\\''");
  filters.push(`subtitles='${escapedSrt}'`);

  const vf = filters.join(",");

  // Build command parts
  const parts = [
    "ffmpeg -y",
    `-i "${videoPath}"`,
    `-i "${wavPath}"`,
    `-i "${chaptersPath}"`,
    "-map_metadata 2",
    `-vf "${vf}"`,
    "-c:v libx264 -preset fast",
    "-c:a aac",
    "-shortest",
    `"${mp4Path}"`,
  ];

  return parts.join(" \\\n  ");
}

// ---------------------------------------------------------------------------
// Audio track builder
// ---------------------------------------------------------------------------

function buildWavTrack(
  segments: { offsetMs: number; wavBuf: Buffer }[],
  totalMs: number,
): Buffer | null {
  if (segments.length === 0) return null;

  const anySeg = segments[0];
  const { sampleRate } = parseWav(anySeg.wavBuf);
  const channels = 2;

  const totalSamples = Math.ceil((totalMs / 1000) * sampleRate * channels);
  const trackBuffer = new Float32Array(totalSamples);

  for (const seg of segments) {
    const parsed = parseWav(seg.wavBuf);
    const offsetSamples = Math.floor((seg.offsetMs / 1000) * sampleRate) * channels;

    const stereo = parsed.channels === 1
      ? (() => {
          const s = new Float32Array(parsed.sampleCount * 2);
          for (let i = 0; i < parsed.sampleCount; i++) {
            s[i * 2] = parsed.float32[i];
            s[i * 2 + 1] = parsed.float32[i];
          }
          return s;
        })()
      : parsed.float32;

    for (let i = 0; i < stereo.length && offsetSamples + i < trackBuffer.length; i++) {
      trackBuffer[offsetSamples + i] += stereo[i];
    }
  }

  // Convert to int16 WAV
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

  return buffer;
}

// ---------------------------------------------------------------------------
// VideoScript
// ---------------------------------------------------------------------------

const DEFAULT_BG = "radial-gradient(ellipse at 50% 40%, #1a1a3e 0%, #0b0b1a 100%)";

class VideoScriptImpl {
  private steps: ScriptStep[] = [];
  private counter = 0;
  private prepared = new Map<string, PreparedSegment>();

  // Process-global TTS cache — shared with NarrationPlanImpl
  private static ttsCache = new Map<string, PreparedSegment>();

  /**
   * Add a title card — full-screen overlay with text + optional subtitle.
   * Pass `narration` in opts to have TTS voiceover during the card.
   */
  title(text: string, opts?: TitleOptions): this {
    this.steps.push({
      kind: "title",
      text,
      subtitle: opts?.subtitle,
      narration: opts?.narration,
      durationMs: opts?.durationMs ?? 4000,
      background: opts?.background,
    });
    return this;
  }

  /**
   * Add a narrated segment — TTS audio drives timing, callback runs paced actions.
   *
   * Two signatures (backwards-compatible):
   *   .segment("narration", async (pace) => { ... })
   *   .segment("narration", { setup: async () => { ... }, action: async (pace) => { ... } })
   *
   * `setup` runs BEFORE narration starts — use for page.goto(), scrolling, etc.
   * `action` runs DURING narration — use for visual actions like safeMove, hover.
   */
  segment(text: string, actionOrOpts?: SegmentAction | { setup?: () => Promise<void>; action?: SegmentAction }): this {
    if (typeof actionOrOpts === "function") {
      // Original API: segment(text, action)
      this.steps.push({ kind: "segment", text, action: actionOrOpts });
    } else if (actionOrOpts && typeof actionOrOpts === "object") {
      // New API: segment(text, { setup, action })
      this.steps.push({ kind: "segment", text, action: actionOrOpts.action, setup: actionOrOpts.setup });
    } else {
      this.steps.push({ kind: "segment", text });
    }
    return this;
  }

  /**
   * Add a transition between segments.
   * Applied as an ffmpeg filter during render.
   */
  transition(type: TransitionType = "fade", durationMs = 500): this {
    this.steps.push({
      kind: "transition",
      type,
      durationMs,
    });
    return this;
  }

  /**
   * Add an outro card — full-screen overlay, similar to title.
   * Pass `narration` in opts to have TTS voiceover during the card.
   */
  outro(opts?: OutroOptions): this {
    this.steps.push({
      kind: "outro",
      text: opts?.text ?? "Thanks for watching!",
      subtitle: opts?.subtitle,
      narration: opts?.narration,
      durationMs: opts?.durationMs ?? 4000,
      background: opts?.background,
    });
    return this;
  }

  /**
   * Pre-generate all TTS audio for segment steps.
   * Call before page.goto() so video recording doesn't include TTS wait time.
   */
  async prepare(pageOrProvider?: Page | TtsProviderType): Promise<void> {
    let provider: TtsProviderType | false;
    if (!pageOrProvider) {
      provider = getGlobalTtsProvider();
    } else if (typeof pageOrProvider === "function" || typeof pageOrProvider === "string") {
      provider = pageOrProvider;
    } else {
      provider = getTtsProvider(pageOrProvider);
    }
    if (!provider) return;

    // Collect all steps that need TTS: segments + title/outro with narration
    const ttsSteps: { id: string; text: string }[] = [];
    let segIdx2 = 0;
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i];
      if (s.kind === "segment") {
        ttsSteps.push({ id: `step-${segIdx2++}`, text: s.text });
      } else if ((s.kind === "title" || s.kind === "outro") && s.narration) {
        ttsSteps.push({ id: `card-${i}`, text: s.narration });
      }
    }

    const results = await Promise.allSettled(
      ttsSteps.map(async (step) => {
        const cached = VideoScriptImpl.ttsCache.get(step.text);
        if (cached) return { id: step.id, ...cached };
        const wavBuf = await fetchTtsAudio(step.text, provider as TtsProviderType);
        const durationMs = parseWavDuration(wavBuf);
        return { id: step.id, wavBuf, durationMs };
      }),
    );

    let idx = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        const seg = { wavBuf: r.value.wavBuf, durationMs: r.value.durationMs };
        this.prepared.set(r.value.id, seg);
        const step = ttsSteps[idx];
        if (step) VideoScriptImpl.ttsCache.set(step.text, seg);
      }
      idx++;
    }
  }

  /**
   * Execute the script steps — run each step timed to its narration duration.
   * Returns timeline + totalMs. Audio segments are stored in the registry
   * for deferred track building at context close (setup.ts).
   */
  async run(page: Page): Promise<VideoScriptResult> {
    const { timeline, totalMs } = await this.executeSteps(page);
    const srtContent = generateSrt(timeline);
    const chaptersContent = generateChapters(timeline);
    return { timeline, totalMs, srtContent, chaptersContent };
  }

  /**
   * Execute the script and produce final output files:
   * WAV audio track, SRT subtitles, chapter metadata.
   * Audio mux with video happens at context close (setup.ts).
   */
  async render(page: Page, opts?: RenderOptions): Promise<VideoScriptResult> {
    const { timeline, totalMs, audioSegments } = await this.executeSteps(page);

    const srtContent = generateSrt(timeline);
    const chaptersContent = generateChapters(timeline);

    const outputDir = opts?.outputDir ?? join(process.cwd(), getGlobalOutputDir());
    const tmpDir = join(outputDir, "tmp");
    const baseName = opts?.baseName ?? `demowright-video-${Date.now()}`;

    mkdirSync(outputDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });
    const gitignorePath = join(outputDir, ".gitignore");
    if (!existsSync(gitignorePath)) writeFileSync(gitignorePath, "*\n");

    const wavPath = join(tmpDir, `${baseName}.wav`);
    const srtPath = join(tmpDir, `${baseName}.srt`);
    const chaptersPath = join(tmpDir, `${baseName}-chapters.txt`);
    const mp4Path = join(outputDir, `${baseName}.mp4`);

    writeFileSync(srtPath, srtContent);

    if (chaptersContent) {
      writeFileSync(chaptersPath, chaptersContent);
    }

    const wavBuf = buildWavTrack(audioSegments, totalMs);
    if (wavBuf) {
      writeFileSync(wavPath, wavBuf);
    }

    // Store render job for setup.ts close handler to finalize with actual video path
    if (wavBuf) {
      const job = {
        wavPath,
        srtPath,
        chaptersPath,
        mp4Path,
        timeline: timeline.map((e) => ({
          kind: e.kind,
          type: e.kind === "transition" ? e.text.replace(/^\[|\]$/g, "") : undefined,
          startMs: e.startMs,
          durationMs: e.durationMs,
        })),
        totalMs,
      };
      storeRenderJob(page, job);
      const cmd = buildFfmpegCommand("<video.webm>", wavPath, srtPath, chaptersPath, mp4Path, job.timeline);
      console.log(`[demowright] Render files ready. After test completes, run:\n${cmd}`);

      return {
        timeline,
        totalMs,
        srtContent,
        srtPath,
        chaptersContent,
        mp4Path: undefined,
        wavPath,
        ffmpegCommand: cmd,
      };
    }

    return {
      timeline,
      totalMs,
      srtContent,
      srtPath,
      chaptersContent,
    };
  }

  private async executeSteps(page: Page) {
    const active = await isHudActive(page);
    const provider = getTtsProvider(page);

    if (this.prepared.size === 0 && active && provider) {
      await this.prepare(page);
    }

    let segIdx = 0;
    const stepIds = this.steps.map((s) => {
      if (s.kind === "segment") return `step-${segIdx++}`;
      return `step-${s.kind}-${this.steps.indexOf(s)}`;
    });

    const timeline: TimelineEntry[] = [];
    const audioSegments: { offsetMs: number; wavBuf: Buffer }[] = [];
    const planStartMs = Date.now();

    let segmentIndex = 0;
    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      let stepStartMs = Date.now();

      if (step.kind === "title" || step.kind === "outro") {
        const bg = step.background ?? DEFAULT_BG;
        // Check for narrated card (TTS over the overlay)
        const cardTts = step.narration ? this.prepared.get(`card-${i}`) : undefined;
        const effectiveDuration = cardTts
          ? Math.max(step.durationMs, cardTts.durationMs + 500) // pad 500ms after narration
          : step.durationMs;

        if (active) {
          showCard(page, step.text, step.subtitle, effectiveDuration, bg).catch(() => {});
        }
        // Play narration audio over the card if present
        if (active && cardTts) {
          const offsetMs = Date.now() - planStartMs;
          audioSegments.push({ offsetMs, wavBuf: cardTts.wavBuf });
          storeAudioSegment(page, { timestampMs: Date.now(), wavBuf: cardTts.wavBuf });
          showCaption(page, step.narration!, cardTts.durationMs).catch(() => {});
        }
        await page.waitForTimeout(effectiveDuration);

        timeline.push({
          id: stepIds[i],
          kind: step.kind,
          text: step.narration ?? step.text,
          startMs: stepStartMs - planStartMs,
          durationMs: effectiveDuration,
          actionMs: 0,
          overrunMs: 0,
        });
      } else if (step.kind === "transition") {
        if (active) {
          await page.waitForTimeout(step.durationMs);
        }
        timeline.push({
          id: stepIds[i],
          kind: "transition",
          text: `[${step.type}]`,
          startMs: stepStartMs - planStartMs,
          durationMs: step.durationMs,
          actionMs: 0,
          overrunMs: 0,
        });
      } else if (step.kind === "segment") {
        // Run setup BEFORE narration — for page.goto(), scrolls, etc.
        if (step.setup) {
          await step.setup();
          stepStartMs = Date.now();
        }

        const segId = `step-${segmentIndex}`;
        segmentIndex++;
        const segment = this.prepared.get(segId);
        const targetMs = segment?.durationMs ?? 3000;

        if (active) {
          showCaption(page, step.text, targetMs).catch(() => {});
        }

        if (active && segment) {
          const offsetMs = Date.now() - planStartMs;
          audioSegments.push({ offsetMs, wavBuf: segment.wavBuf });
          storeAudioSegment(page, { timestampMs: Date.now(), wavBuf: segment.wavBuf });
        }

        let paceCallCount = 0;
        const paceEstimate = 8;
        const pace: PaceFn = async () => {
          paceCallCount++;
          const elapsed = Date.now() - stepStartMs;
          const remaining = targetMs - elapsed;
          const remainingPaces = Math.max(1, paceEstimate - paceCallCount);
          const delay = Math.max(50, remaining / remainingPaces);
          if (remaining > 50 && active) {
            await page.waitForTimeout(Math.min(delay, remaining));
          }
        };

        const actionStartMs = Date.now();
        await step.action?.(pace);
        const actionMs = Date.now() - actionStartMs;

        const elapsed = Date.now() - stepStartMs;
        const remaining = targetMs - elapsed;
        const overrunMs = Math.max(0, -remaining);
        if (remaining > 50 && active) {
          await page.waitForTimeout(remaining);
        }

        const actualDuration = Date.now() - stepStartMs;
        timeline.push({
          id: segId,
          kind: "segment",
          text: step.text,
          startMs: stepStartMs - planStartMs,
          durationMs: actualDuration,
          actionMs,
          overrunMs,
        });
      }
    }

    const totalMs = Date.now() - planStartMs;
    return { timeline, totalMs, audioSegments };
  }
}

/**
 * Create a video script — narration-driven video production with title cards,
 * transitions, auto-subtitles, and chapter markers.
 */
export function createVideoScript(): VideoScriptImpl {
  return new VideoScriptImpl();
}
