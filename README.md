# qa-hud

Playwright HUD plugin — renders a visible **mouse cursor**, **keystroke display**, and **auto-slowdown** directly into test video recordings, making them readable by humans and AI (e.g. Gemini video analysis).

## Demos

### Dashboard — nav clicks, Ctrl+K search, modal form typing

<video src="https://raw.githubusercontent.com/snomiao/qa-hud/main/docs/assets/01-dashboard.webm" controls muted width="100%"></video>

### Code Editor — typing code, Ctrl+S/Z/A, Shift+Arrow selection, tab switching

<video src="https://raw.githubusercontent.com/snomiao/qa-hud/main/docs/assets/02-code-editor.webm" controls muted width="100%"></video>

### E-commerce Checkout — browse products, add to cart, fill payment form, pay

<video src="https://raw.githubusercontent.com/snomiao/qa-hud/main/docs/assets/03-checkout.webm" controls muted width="100%"></video>

## Problem

Playwright's video recording doesn't capture the browser cursor or keyboard input. Tests run too fast for meaningful video review.

## Solution

`qa-hud` injects a lightweight overlay into every page during test execution:

- 🖱️ **Visible cursor** — SVG pointer follows mouse with click ripple effects
- ⌨️ **Keystroke display** — keys shown as HUD badges; modifier keys (Shift/Ctrl/Alt) as persistent blue badges
- 🐢 **Auto-slowdown** — configurable delays after actions for human-readable recordings
- 🔌 **Non-invasive** — multiple integration approaches, from zero-change to one-line

## Quick Start

```bash
npm install qa-hud
```

### Zero-change setup (recommended) ⭐

Add one line to your `playwright.config.ts` — no test files need to change:

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';
import { withQaHud } from 'qa-hud/config';

export default withQaHud(defineConfig({
  use: { video: 'on' },
}));
```

Your existing tests keep using `import { test } from '@playwright/test'` — the HUD is injected automatically.

### Alternative: CLI flag (zero code changes at all)

```bash
NODE_OPTIONS="--require qa-hud/register" npx playwright test
```

### Alternative: Import replacement

```ts
// Change this:
import { test, expect } from '@playwright/test';
// To this:
import { test, expect } from 'qa-hud';
```

### Alternative: Programmatic (full control)

```ts
import { test as base } from '@playwright/test';
import { applyHud } from 'qa-hud';

const test = base.extend({
  context: async ({ context }, use) => {
    await applyHud(context, { cursor: true, keyboard: true, actionDelay: 150 });
    await use(context);
  },
});
```

## Configuration

```ts
// Via withQaHud (recommended)
export default withQaHud(defineConfig({ ... }), {
  actionDelay: 200,
  cursorStyle: 'dot',
});

// Via test.use (import replacement approach)
test.use({
  qaHud: {
    cursor: true,            // show cursor overlay (default: true)
    keyboard: true,          // show keystroke display (default: true)
    cursorStyle: 'default',  // 'default' | 'dot' | 'crosshair'
    keyFadeMs: 1500,         // key label fade time in ms
    actionDelay: 120,        // delay after each action for readability (ms)
  },
});

// Via env vars (CLI approach)
QA_HUD_CURSOR=0 QA_HUD_DELAY=200 NODE_OPTIONS="--require qa-hud/register" npx playwright test
```

| Env Var | Description | Default |
|---|---|---|
| `QA_HUD=0` | Disable HUD entirely | enabled |
| `QA_HUD_CURSOR=0` | Disable cursor overlay | enabled |
| `QA_HUD_KEYBOARD=0` | Disable keyboard display | enabled |
| `QA_HUD_DELAY=200` | Action delay in ms | `120` |
| `QA_HUD_CURSOR_STYLE=dot` | Cursor style | `default` |
| `QA_HUD_KEY_FADE=2000` | Key label fade time in ms | `1500` |

## How It Works

1. **Event listeners** are injected via `context.addInitScript()` — captures mouse/keyboard events before DOM exists, survives navigations
2. **DOM overlay** is injected via `page.evaluate()` after each navigation (`goto`, `reload`, `setContent`, etc.)
3. The overlay uses `pointer-events: none` and max z-index — never interferes with test interactions
4. Page actions (`click`, `fill`, `type`, etc.) are wrapped with configurable delays for video readability

## License

MIT
