# demowright — Project Guide

Playwright video production plugin that overlays a visible cursor, keystroke badges, click ripples, auto-slowdown, TTS narration, and subtitles into test video recordings.

## Architecture

```
src/
├── setup.ts          # Core: applyHud(), patchPageDelay(), wrapNavigation()
├── hud-overlay.ts    # Browser-side: listener script (addInitScript) + DOM injector
├── hud-registry.ts   # WeakMap tracking HUD-active pages + TTS config
├── helpers.ts        # Recording helpers: clickEl, typeKeys, narrate, subtitle, etc.
├── video-script.ts   # Video production: createVideoScript(), title/segment/transition/outro
├── fixture.ts        # Playwright fixture (import replacement approach)
├── config.ts         # withDemowright() config helper
├── audio-capture.ts  # Browser-side Web Audio tap (monkey-patches AudioContext)
├── audio-writer.ts   # Node-side WAV file writer
├── index.ts          # Main entry point — re-exports everything
register.cjs          # CJS preload for NODE_OPTIONS approach
```

## Key Concepts

- **Listener script** runs via `addInitScript()` — captures mouse/keyboard events, stores state on `window.__qaHud`. No DOM mutations, survives navigations.
- **DOM injector** runs via `page.evaluate()` after each navigation — creates the overlay, wires it to listener state.
- **Helpers** detect HUD activation via `isHudActive(page)` which checks a Node-side WeakMap first, then falls back to `window.__qaHud` in the browser (needed for config/register approach where module instances differ).
- **Video script** (`createVideoScript()`) provides narration-driven video production: title cards, narrated segments with `pace()`, transitions, auto-generated SRT subtitles, and chapter markers.
- **TTS provider** is stored per-page in the registry. `narrate()` checks for a provider (URL template or function), fetches audio Node-side, base64-encodes, plays in browser via AudioContext.

## Four Integration Methods

1. **Config helper**: `withDemowright(defineConfig({...}))` — zero test changes
2. **CLI**: `NODE_OPTIONS="--require demowright/register" npx playwright test`
3. **Import replacement**: `import { test } from "demowright"`
4. **Programmatic**: `await applyHud(context, options)`

## Build & Test

```bash
bun run build          # tsdown → dist/
bun run typecheck      # tsgo --noEmit
bun run lint           # oxlint src
bun test               # runs tests/ with main playwright.config.ts
bunx playwright test --config examples/playwright.config.ts  # run all examples
```

## Docker (audio capture)

Pages that play audio (e.g. example 07) need Docker to capture the page's audio output.
Playwright's built-in video recorder only captures video, not audio. The Docker container
provides Xvfb + PulseAudio so headed Firefox outputs audio to a virtual sink that demowright
records via `module-pipe-sink`.

```bash
./docker-run.sh                                    # all examples with audio capture
./docker-run.sh examples/07-video-player.spec.ts   # single example
```

Without Docker, demowright still captures Web Audio API output (oscillators, media elements)
via its browser-side `audio-capture.ts` intercept. Docker adds system-level PulseAudio capture
as a second audio source.

## Package Manager

Use `bun` — never `npm`. Install deps with `bun i`, run scripts with `bun run`.

## Documentation

| File | Content |
|------|---------|
| [docs/getting-started.md](docs/getting-started.md) | Installation, integration methods, configuration |
| [docs/helpers.md](docs/helpers.md) | `clickEl`, `typeKeys`, `moveTo`, `hudWait` API reference |
| [docs/narration.md](docs/narration.md) | `narrate()`, `subtitle()`, `annotate()` |
| [docs/tts.md](docs/tts.md) | TTS provider setup (URL, function, espeak, OpenAI) |
| [docs/cursor-keyboard.md](docs/cursor-keyboard.md) | Cursor styles, key badges, click ripples, auto-slowdown |
| [docs/audio.md](docs/audio.md) | Browser audio capture approaches |
| [docs/examples.md](docs/examples.md) | 6 runnable demo scenarios |
| [docs/wrapper.md](docs/wrapper.md) | Strategies for native Playwright call interception |

## Examples

| # | File | What it demonstrates |
|---|------|---------------------|
| 01 | `examples/01-cursor-demo.spec.ts` | Dashboard — cursor, clicks, Ctrl+K, modal forms |
| 02 | `examples/02-keyboard-demo.spec.ts` | Monaco Editor — real typing, Ctrl+S/Z/A, tab switching |
| 03 | `examples/03-form-interaction.spec.ts` | E-commerce checkout with narrated segments |
| 04 | `examples/04-narrated-tour.spec.ts` | SaaS landing page tour — heavy `.segment()` usage |
| 05 | `examples/05-kanban-board.spec.ts` | Kanban board — card selection, moving, adding tasks |
| 06 | `examples/06-native-api.spec.ts` | Native Playwright API — zero helpers, auto-delay only |
| 07 | `examples/07-video-player.spec.ts` | Video player — play, pause, seek, media keys, audio |
| 08 | `examples/08-narration-plan.spec.ts` | Narration-driven tour — pre-gen TTS, `pace()` timing |
| 09 | `examples/09-video-script.spec.ts` | Full production — title, segments, transitions, SRT, outro |
