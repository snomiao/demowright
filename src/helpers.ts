/**
 * Convenience helpers for demowright recordings.
 *
 * All functions are no-ops (or fast pass-throughs) when demowright is not active
 * on the page, so tests remain fast in normal CI runs.
 *
 *   import { narrate, clickEl, typeKeys, caption, hudWait } from 'demowright/helpers';
 */
import type { Page } from "@playwright/test";
import { isHudActive, getTtsProvider, storeAudioSegment } from "./hud-registry.js";

// ---------------------------------------------------------------------------
// evaluateWithTimeout — page.evaluate that won't hang on blocked event loops
// ---------------------------------------------------------------------------

/**
 * Run `page.evaluate(fn, arg)` but bail out after `timeoutMs` if the page
 * event loop is blocked (heavy SSR hydration, busy service worker, etc.).
 *
 * On timeout, logs a warning and resolves with `undefined` so recordings
 * keep going instead of hitting the full Playwright test timeout. The
 * underlying `page.evaluate` promise is left to settle on its own.
 */
async function evaluateWithTimeout<A, R>(
  page: Page,
  fn: (arg: A) => R | Promise<R>,
  arg: A,
  timeoutMs = 10_000,
  label = "page.evaluate",
): Promise<R | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race<R | undefined>([
      page.evaluate<R, A>(fn, arg),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => {
          // eslint-disable-next-line no-console
          console.warn(
            `[demowright] ${label} timed out after ${timeoutMs}ms — page event loop likely blocked. Skipping.`,
          );
          resolve(undefined);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// hudWait — delay that only runs when HUD is active
// ---------------------------------------------------------------------------

/**
 * Wait for `ms` milliseconds, but only when demowright is active.
 * Use this instead of `page.waitForTimeout()` for recording-only pauses.
 */
export async function hudWait(page: Page, ms: number): Promise<void> {
  if (!(await isHudActive(page))) return;
  await page.waitForTimeout(ms);
}

// ---------------------------------------------------------------------------
// Cursor movement
// ---------------------------------------------------------------------------

/**
 * Smoothly move the HUD cursor to (x, y) over `steps` frames.
 * No-op when HUD is inactive.
 */
export async function moveTo(page: Page, x: number, y: number, steps = 10): Promise<void> {
  if (!(await isHudActive(page))) return;

  const start = await page.evaluate(() => ({
    x: (window as any).__qaHud?.cx ?? 0,
    y: (window as any).__qaHud?.cy ?? 0,
  }));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.evaluate(
      ([mx, my]: [number, number]) =>
        document.dispatchEvent(
          new MouseEvent("mousemove", { clientX: mx, clientY: my, bubbles: true }),
        ),
      [start.x + (x - start.x) * t, start.y + (y - start.y) * t] as [number, number],
    );
    await page.waitForTimeout(20);
  }
}

/**
 * Smoothly move the HUD cursor to the center of `selector`.
 * Returns the element center coordinates.
 * When HUD is inactive, resolves coordinates but skips the animation.
 */
export async function moveToEl(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const center = await page.evaluate((s: string) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);

  if (await isHudActive(page)) {
    await moveTo(page, center.x, center.y);
  }

  return center;
}

// ---------------------------------------------------------------------------
// Click
// ---------------------------------------------------------------------------

/**
 * Animated click on `selector` — moves cursor, fires mousedown/mouseup
 * ripple, then performs the actual DOM click.
 * When HUD is inactive, performs only the DOM click (no animation/delays).
 */
export async function clickEl(page: Page, selector: string): Promise<void> {
  const active = await isHudActive(page);
  if (active) {
    const c = await moveToEl(page, selector);
    await page.waitForTimeout(150);
    await page.evaluate(
      ([x, y]: [number, number]) => {
        document.dispatchEvent(
          new MouseEvent("mousedown", { clientX: x, clientY: y, bubbles: true }),
        );
        setTimeout(
          () =>
            document.dispatchEvent(
              new MouseEvent("mouseup", { clientX: x, clientY: y, bubbles: true }),
            ),
          60,
        );
      },
      [c.x, c.y] as [number, number],
    );
  }

  await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement)?.click(), selector);

  if (active) {
    await page.waitForTimeout(100);
  }
}

// ---------------------------------------------------------------------------
// Typing
// ---------------------------------------------------------------------------

/**
 * Type `text` character-by-character with visible key badges.
 * When HUD is inactive, sets the input value directly.
 *
 * @param inputSelector — optional selector for the input element to update.
 *   If omitted, uses `document.activeElement`.
 */
export async function typeKeys(
  page: Page,
  text: string,
  delay = 65,
  inputSelector?: string,
): Promise<void> {
  if (!(await isHudActive(page))) {
    await page.evaluate(
      ([t, sel]: [string, string | undefined]) => {
        const el = sel
          ? (document.querySelector(sel) as HTMLInputElement)
          : (document.activeElement as HTMLInputElement);
        if (el && "value" in el) {
          el.value = t;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      },
      [text, inputSelector] as [string, string | undefined],
    );
    return;
  }

  for (let i = 0; i < text.length; i++) {
    await page.evaluate(
      ([k, sel, partial]: [string, string | undefined, string]) => {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
        const el = sel
          ? (document.querySelector(sel) as HTMLInputElement)
          : (document.activeElement as HTMLInputElement);
        if (el && "value" in el) el.value = partial;
      },
      [text[i], inputSelector, text.slice(0, i + 1)] as [string, string | undefined, string],
    );
    await page.waitForTimeout(delay);
  }
}

// ---------------------------------------------------------------------------
// TTS internals
// ---------------------------------------------------------------------------

type TtsProviderType = string | ((text: string) => Promise<Buffer | ArrayBuffer>);

/** Fetch audio from a TTS provider. Returns a WAV Buffer. */
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

/** Parse WAV and return { float32, sampleRate, channels, durationMs }. */
function parseWav(wavBuf: Buffer) {
  const dataOffset = wavBuf.indexOf("data") + 8;
  if (dataOffset < 8) throw new Error("Invalid WAV");
  const sampleRate = wavBuf.readUInt32LE(24);
  const channels = wavBuf.readUInt16LE(22);
  const pcmData = wavBuf.subarray(dataOffset);
  const sampleCount = pcmData.length / 2; // 16-bit
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = pcmData.readInt16LE(i * 2) / 32768;
  }
  const durationMs = (sampleCount / channels / sampleRate) * 1000;
  return { float32, sampleRate, channels, sampleCount, durationMs };
}

/**
 * Store TTS audio segment with its timestamp for deferred track building.
 * The complete audio track is assembled at context close using actual
 * wall-clock timestamps, eliminating drift from page.evaluate overhead.
 */
async function playTtsAudio(page: Page, wavBuf: Buffer): Promise<void> {
  const { durationMs } = parseWav(wavBuf);

  // Store segment with wall-clock timestamp — track is built at context close
  storeAudioSegment(page, { timestampMs: Date.now(), wavBuf });

  // Wait for the narration duration so actions don't outpace the voice
  await page.waitForTimeout(durationMs);
}

// ---------------------------------------------------------------------------
// narrate — TTS narration with optional callback
// ---------------------------------------------------------------------------

/**
 * Speak `text` via the configured TTS provider, or fall back to
 * the browser's speechSynthesis API.
 *
 * When called with a callback, pre-fetches the TTS audio, then runs
 * the callback actions in parallel with audio playback — waiting for
 * whichever takes longer. This keeps narration and actions in sync.
 *
 * ```ts
 * // TTS only
 * await narrate(page, "Processing complete");
 *
 * // TTS + actions timed together
 * await narrate(page, "Now let's fill the form", async () => {
 *   await clickEl(page, "#name");
 *   await typeKeys(page, "Alice");
 * });
 * ```
 *
 * When HUD is inactive, only the callback runs (instantly, no TTS).
 */
export async function narrate(
  page: Page,
  text: string,
  callbackOrOptions?: (() => Promise<void>) | { rate?: number; pitch?: number; volume?: number; voice?: string },
  callback?: () => Promise<void>,
): Promise<void> {
  // Parse overloaded args
  const cb = typeof callbackOrOptions === "function" ? callbackOrOptions : callback;
  const options = typeof callbackOrOptions === "object" ? callbackOrOptions : undefined;

  if (!(await isHudActive(page))) {
    await cb?.();
    return;
  }

  // Check for a configured TTS provider
  const provider = getTtsProvider(page);
  if (provider) {
    try {
      // Pre-fetch TTS audio
      const wavBuf = await fetchTtsAudio(text, provider);

      if (cb) {
        // Run audio playback + callback in parallel, wait for both
        await Promise.all([playTtsAudio(page, wavBuf), cb()]);
      } else {
        await playTtsAudio(page, wavBuf);
      }
      return;
    } catch {
      // Provider failed — fall through to speechSynthesis
    }
  }

  // Fallback: browser speechSynthesis (works in headed Chromium, not headless)
  const opts = {
    rate: options?.rate ?? 1,
    pitch: options?.pitch ?? 1,
    volume: options?.volume ?? 1,
    voice: options?.voice,
  };

  const speechPromise = evaluateWithTimeout(
    page,
    ([t, o]: [string, typeof opts]) => {
      return new Promise<void>((resolve) => {
        const synth = window.speechSynthesis;
        if (!synth) { resolve(); return; }
        try {
          const utter = new SpeechSynthesisUtterance(t);
          utter.rate = o.rate;
          utter.pitch = o.pitch;
          utter.volume = o.volume;
          if (o.voice) {
            const voices = synth.getVoices();
            const match = voices.find((v) => v.name === o.voice || v.lang === o.voice);
            if (match) utter.voice = match;
          }
          utter.onend = () => resolve();
          utter.onerror = () => resolve();
          const timeout = Math.min(5000, Math.max(1000, t.length * 80));
          setTimeout(resolve, timeout);
          synth.speak(utter);
        } catch { resolve(); }
      });
    },
    [text, opts] as [string, typeof opts],
    10_000,
    "narrate(speechSynthesis)",
  );

  if (cb) {
    await Promise.all([speechPromise, cb()]);
  } else {
    await speechPromise;
  }
}

// ---------------------------------------------------------------------------
// caption — visual text overlay
// ---------------------------------------------------------------------------

/**
 * Show a caption text overlay on the page for `durationMs` milliseconds.
 * Useful as a visual annotation in recordings. No-op when HUD is inactive.
 */
export async function caption(page: Page, text: string, durationMs = 3000): Promise<void> {
  if (!(await isHudActive(page))) return;

  await evaluateWithTimeout(
    page,
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
    10_000,
    "caption",
  );
}

/** @deprecated Use `caption()` instead. */
export const subtitle = caption;

// ---------------------------------------------------------------------------
// annotate — caption + narration + optional callback
// ---------------------------------------------------------------------------

/**
 * Show a caption + speak it via TTS simultaneously.
 * When called with a callback, runs the actions in parallel with
 * the narration — waiting for whichever takes longer.
 *
 * ```ts
 * // Caption + TTS
 * await annotate(page, "Welcome to the tour");
 *
 * // Caption + TTS + actions
 * await annotate(page, "Let's fill the form", async () => {
 *   await clickEl(page, "#name");
 *   await typeKeys(page, "Alice");
 * });
 * ```
 *
 * No-op when HUD is inactive (callback still runs).
 */
export async function annotate(
  page: Page,
  text: string,
  callbackOrOptions?: (() => Promise<void>) | { durationMs?: number; rate?: number; voice?: string },
  callback?: () => Promise<void>,
): Promise<void> {
  const cb = typeof callbackOrOptions === "function" ? callbackOrOptions : callback;
  const options = typeof callbackOrOptions === "object" ? callbackOrOptions : undefined;

  if (!(await isHudActive(page))) {
    await cb?.();
    return;
  }

  const durationMs = options?.durationMs ?? 4000;
  await Promise.all([
    caption(page, text, durationMs),
    narrate(page, text, { rate: options?.rate, voice: options?.voice }, cb),
  ]);
}
