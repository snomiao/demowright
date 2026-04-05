# qa-hud — Project Guide

Playwright HUD plugin that overlays a visible cursor, keystroke badges, click ripples, auto-slowdown, TTS narration, and subtitles into test video recordings.

## Architecture

```
src/
├── setup.ts          # Core: applyHud(), patchPageDelay(), wrapNavigation()
├── hud-overlay.ts    # Browser-side: listener script (addInitScript) + DOM injector
├── hud-registry.ts   # WeakMap tracking HUD-active pages + TTS config
├── helpers.ts        # Recording helpers: clickEl, typeKeys, narrate, subtitle, etc.
├── fixture.ts        # Playwright fixture (import replacement approach)
├── config.ts         # withQaHud() config helper
├── audio-capture.ts  # Browser-side Web Audio tap (monkey-patches AudioContext)
├── audio-writer.ts   # Node-side WAV file writer
├── index.ts          # Main entry point — re-exports everything
register.cjs          # CJS preload for NODE_OPTIONS approach
```

## Key Concepts

- **Listener script** runs via `addInitScript()` — captures mouse/keyboard events, stores state on `window.__qaHud`. No DOM mutations, survives navigations.
- **DOM injector** runs via `page.evaluate()` after each navigation — creates the overlay, wires it to listener state.
- **Helpers** detect HUD activation via `isHudActive(page)` which checks a Node-side WeakMap first, then falls back to `window.__qaHud` in the browser (needed for config/register approach where module instances differ).
- **TTS provider** is stored per-page in the registry. `narrate()` checks for a provider (URL template or function), fetches audio Node-side, base64-encodes, plays in browser via AudioContext.

## Four Integration Methods

1. **Config helper**: `withQaHud(defineConfig({...}))` — zero test changes
2. **CLI**: `NODE_OPTIONS="--require qa-hud/register" npx playwright test`
3. **Import replacement**: `import { test } from "qa-hud"`
4. **Programmatic**: `await applyHud(context, options)`

## Build & Test

```bash
npm run build          # tsc → dist/
npm test               # runs tests/ with main playwright.config.ts
npx playwright test --config examples/playwright.config.ts  # run all 6 examples
```

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
| 03 | `examples/03-form-interaction.spec.ts` | E-commerce checkout with `annotate()` narration |
| 04 | `examples/04-narrated-tour.spec.ts` | SaaS landing page tour — heavy `annotate()` usage |
| 05 | `examples/05-kanban-board.spec.ts` | Kanban board — card selection, moving, adding tasks |
| 06 | `examples/06-native-api.spec.ts` | Native Playwright API — zero helpers, auto-delay only |
