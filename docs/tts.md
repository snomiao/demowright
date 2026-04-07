# Text-to-Speech (TTS) Narration

demowright can narrate your test recordings with spoken audio via `narrate()` and `annotate()`.
There are two ways to get TTS working:

---

## Option 1: Custom TTS Provider (recommended)

Pass a `tts` option to `applyHud()` or `withDemowright()`. The provider runs **Node-side**, fetches audio, and plays it in the browser via `AudioContext` — captured by the Web Audio tap when `audio` is enabled.

### URL Template

Any HTTP endpoint that accepts text and returns audio (mp3/wav/ogg).
Use `%s` as a placeholder for `encodeURIComponent(text)`.

```ts
// playwright.config.ts
import { withDemowright } from 'demowright/config';

export default withDemowright(defineConfig({ ... }), {
  tts: "https://api.example.com/tts?text=%s&voice=en-US",
  audio: "test-audio.wav",
});
```

**Popular TTS APIs:**

| Provider | URL Template |
|---|---|
| [Google Cloud TTS](https://cloud.google.com/text-to-speech) | Use the function approach below |
| [ElevenLabs](https://elevenlabs.io) | `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` (POST, use function) |
| [OpenAI TTS](https://platform.openai.com/docs/guides/text-to-speech) | Use the function approach below |
| Local [Piper](https://github.com/rhasspy/piper) | `http://localhost:5000/tts?text=%s` |
| Local [espeak-ng HTTP wrapper](https://github.com/nicepkg/espeak-http) | `http://localhost:8080/speak?text=%s` |

### Function Provider

For APIs that require auth headers, POST bodies, or custom logic:

```ts
import { applyHud } from 'demowright';

await applyHud(context, {
  audio: "recording.wav",
  tts: async (text) => {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "alloy",
        input: text,
      }),
    });
    return Buffer.from(await res.arrayBuffer());
  },
});
```

### Local espeak-ng via child_process

Zero-cost, works offline, no API key:

```ts
import { execSync } from "node:child_process";

await applyHud(context, {
  audio: "recording.wav",
  tts: async (text) => {
    // espeak-ng outputs WAV to stdout
    return execSync(`espeak-ng --stdout "${text.replace(/"/g, '\\"')}"`);
  },
});
```

### Environment Variable

When using the config approach (`withDemowright`), URL templates are forwarded via `QA_HUD_TTS`:

```bash
QA_HUD_TTS="http://localhost:5000/tts?text=%s" npx playwright test
```

---

## Option 2: Browser speechSynthesis (fallback)

The default fallback uses the browser's built-in `speechSynthesis` API.
This **only works in headed Chromium** — headless browsers and Firefox don't ship speech engines.

### Making speechSynthesis work

**Headed Chromium (easiest):**

```ts
// playwright.config.ts
export default defineConfig({
  use: {
    headless: false,
    browserName: "chromium",
    launchOptions: {
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
});
```

**Linux CI with speech-dispatcher:**

```bash
# Install speech synthesis (Ubuntu/Debian)
sudo apt-get install -y speech-dispatcher espeak-ng

# Start the daemon
speech-dispatcher -d

# Run tests with a virtual display
xvfb-run npx playwright test --headed
```

> ⚠️ This is fragile in CI. **Option 1 (custom provider) is strongly recommended** for reliable TTS in recordings.

---

## How it works

```
narrate("Hello world")
        │
        ├─ TTS provider configured?
        │     ├─ URL template → fetch(url) → audio bytes
        │     └─ Function → provider(text) → audio bytes
        │           │
        │     base64-encode → page.evaluate() → AudioContext.decodeAudioData()
        │           │
        │     BufferSource → connect(destination) → plays in browser
        │           │                                    │
        │     (captured by Web Audio tap if audio: true) │
        │                                                ▼
        │                                          WAV file on close
        │
        └─ No provider → speechSynthesis.speak()
              (works in headed Chromium only)
```

## Quick start

```ts
import { defineConfig } from "@playwright/test";
import { withDemowright } from "demowright/config";

export default withDemowright(
  defineConfig({
    use: {
      video: "on",
      launchOptions: {
        args: ["--autoplay-policy=no-user-gesture-required"],
      },
    },
  }),
  {
    audio: "test-results/audio.wav",
    tts: "http://localhost:5000/tts?text=%s", // local Piper server
  },
);
```

Then in your test:

```ts
import { narrate, annotate, clickEl } from "demowright/helpers";

test("demo", async ({ page }) => {
  await page.goto("https://example.com");
  await annotate(page, "Welcome to the product tour"); // subtitle + TTS
  await clickEl(page, "#get-started");
  await narrate(page, "Now let's fill out the form");  // TTS only
});
```
