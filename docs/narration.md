# Narration & Subtitles

qa-hud can add spoken narration and visual subtitles to your test recordings — perfect for stakeholder demos, onboarding videos, and bug reports.

## Import
```ts
import { narrate, subtitle, annotate } from "qa-hud/helpers";
// or
import { narrate, subtitle, annotate } from "qa-hud";
```

## Functions

### `subtitle(page, text, durationMs?)`
Show a visual text overlay at the bottom of the page. Fades in, stays visible, then fades out. No-op when HUD inactive.
- `durationMs` — total display time (default 3000)
```ts
await subtitle(page, "Filling in the checkout form");
await subtitle(page, "Watch closely!", 5000); // visible for 5 seconds
```
The subtitle appears as a dark rounded badge centered at the bottom of the viewport, above the key display area.

### `narrate(page, text, options?)`
Speak text via TTS. Uses the configured TTS provider (URL or function), falling back to browser `speechSynthesis`.
- `options.rate` — speech rate (default 1)
- `options.pitch` — speech pitch (default 1)
- `options.volume` — volume (default 1)
- `options.voice` — voice name or language code
```ts
await narrate(page, "Now we click the submit button");
await narrate(page, "Quick note", { rate: 1.2 });
```
⚠️ Browser `speechSynthesis` only works in **headed Chromium**. For headless/CI, configure a TTS provider. See [TTS Setup](./tts.md).

### `annotate(page, text, options?)`
Combined: shows a subtitle AND speaks the text simultaneously. The most commonly used narration function.
- `options.durationMs` — subtitle display time (default 4000)
- `options.rate` — TTS speech rate
- `options.voice` — TTS voice
```ts
await annotate(page, "Welcome to the product tour");
await annotate(page, "Let's check the pricing", { durationMs: 5000, rate: 1.1 });
```

## TTS Provider Setup
Brief mention that TTS requires configuration for headless. Link to [TTS Setup](./tts.md) for details:
```ts
export default withQaHud(defineConfig({...}), {
  tts: "http://localhost:5000/tts?text=%s",
});
```

## Examples
Show a short annotated test flow:
```ts
test("product tour", async ({ page }) => {
  await page.goto(url);
  await annotate(page, "Welcome to AcmeApp");
  await clickEl(page, "#features");
  await subtitle(page, "Browsing features");
  await moveToEl(page, ".feature-card:nth-child(1)");
  await hudWait(page, 300);
  await annotate(page, "Let's sign up!");
  await clickEl(page, "#signup");
});
```

## Tips
- `annotate()` waits for both subtitle and narration to finish before returning
- Subtitles stack if shown rapidly — add `hudWait()` between them
- Narration without a TTS provider silently falls back (no error thrown)
- All three functions are no-ops when HUD is inactive — safe to leave in production tests
