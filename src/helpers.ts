/**
 * Convenience helpers for QA HUD recordings.
 *
 * All functions are no-ops (or fast pass-throughs) when qa-hud is not active
 * on the page, so tests remain fast in normal CI runs.
 *
 *   import { narrate, clickEl, typeKeys, hudWait } from 'qa-hud/helpers';
 */
import type { Page } from "@playwright/test";
import { isHudActive, getTtsProvider } from "./hud-registry.js";

// ---------------------------------------------------------------------------
// hudWait — delay that only runs when HUD is active
// ---------------------------------------------------------------------------

/**
 * Wait for `ms` milliseconds, but only when QA HUD is active.
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
    // Fast path — just set the value
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
// TTS Narration
// ---------------------------------------------------------------------------

/**
 * Fetch audio from a TTS provider (Node-side), base64-encode it,
 * send to the browser, and play via AudioContext so it gets captured
 * by the Web Audio tap.
 */
async function narrateViaProvider(
  page: Page,
  text: string,
  provider: string | ((text: string) => Promise<Buffer | ArrayBuffer>),
): Promise<void> {
  let audioBuf: ArrayBuffer;
  if (typeof provider === "string") {
    const url = provider.replace(/%s/g, encodeURIComponent(text));
    const res = await fetch(url);
    if (!res.ok) return;
    audioBuf = await res.arrayBuffer();
  } else {
    const result = await provider(text);
    audioBuf = result instanceof ArrayBuffer ? result : (result.buffer as ArrayBuffer).slice(result.byteOffset, result.byteOffset + result.byteLength);
  }
  const b64 = Buffer.from(audioBuf).toString("base64");

  await page.evaluate(async (data: string) => {
    try {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(bytes.buffer);
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.connect(ctx.destination); // captured by our Web Audio tap
      source.start();
      await new Promise<void>((resolve) => {
        source.onended = () => resolve();
        setTimeout(resolve, (decoded.duration + 0.5) * 1000);
      });
    } catch {
      // decode or playback failed — skip silently
    }
  }, b64);
}

/**
 * Speak `text` via the configured TTS provider, or fall back to
 * the browser's speechSynthesis API.
 *
 * TTS provider is configured via the `tts` option in applyHud / withQaHud:
 * - URL template: `"https://api.example.com/tts?text=%s"` (returns audio)
 * - Function: `async (text) => Buffer`
 * - false: use speechSynthesis (may not work in headless browsers)
 *
 * When HUD is inactive, this is a no-op.
 */
export async function narrate(
  page: Page,
  text: string,
  options?: {
    rate?: number;
    pitch?: number;
    volume?: number;
    voice?: string;
    waitForEnd?: boolean;
  },
): Promise<void> {
  if (!(await isHudActive(page))) return;

  // Check for a configured TTS provider
  const provider = getTtsProvider(page);
  if (provider) {
    try {
      await narrateViaProvider(page, text, provider);
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

  await page.evaluate(
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

          // Safety timeout — headless browsers may not fire onend
          const timeout = Math.min(5000, Math.max(1000, t.length * 80));
          setTimeout(resolve, timeout);

          synth.speak(utter);
        } catch {
          resolve();
        }
      });
    },
    [text, opts] as [string, typeof opts],
  );
}

// ---------------------------------------------------------------------------
// Subtitle / annotation overlay
// ---------------------------------------------------------------------------

/**
 * Show a subtitle text overlay on the page for `durationMs` milliseconds.
 * Useful as a visual annotation in recordings. No-op when HUD is inactive.
 */
export async function subtitle(page: Page, text: string, durationMs = 3000): Promise<void> {
  if (!(await isHudActive(page))) return;

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

      // Inject animation if not present
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

/**
 * Show a subtitle + speak it via TTS simultaneously.
 * No-op when HUD is inactive.
 */
export async function annotate(
  page: Page,
  text: string,
  options?: { durationMs?: number; rate?: number; voice?: string },
): Promise<void> {
  if (!(await isHudActive(page))) return;

  const durationMs = options?.durationMs ?? 4000;
  await Promise.all([
    subtitle(page, text, durationMs),
    narrate(page, text, { rate: options?.rate, voice: options?.voice }),
  ]);
}
