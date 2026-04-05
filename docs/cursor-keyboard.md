# Cursor & Keyboard Display

## Cursor Overlay

qa-hud renders a visible SVG cursor that follows mouse movement. Three built-in styles:

### Styles
- **`default`** — White arrow pointer with black outline (classic cursor look)
- **`dot`** — Red dot with white border (great for presentations)
- **`crosshair`** — Red crosshair with circle (precise, technical demos)

```ts
export default withQaHud(defineConfig({...}), {
  cursorStyle: "dot",
});
```

The cursor updates position via `mousemove` events captured in a `document.addEventListener` (capture phase). It uses CSS `transform: translate()` for smooth, GPU-accelerated movement.

### Click Ripples
When a `mousedown` event fires, a red expanding ring animation plays at the click position — making clicks clearly visible in recordings. The ripple auto-removes after 0.5s.

### Disabling
```ts
{ cursor: false } // or QA_HUD_CURSOR=0
```

## Keyboard Display

Keystrokes appear as floating badges at the bottom-center of the viewport.

### Regular Keys
Shown as dark rounded badges (e.g. `a`, `Enter`, `Space`, `Ctrl+C`). They fade out after `keyFadeMs` milliseconds (default 1500ms).

Modifier combos are automatically formatted: pressing Ctrl, then C shows `Ctrl+C` as a single badge.

### Modifier Keys
Shift, Control, Alt, Meta are shown as persistent **blue** badges that remain visible while held down and disappear on keyup.

### Configuration
```ts
{
  keyboard: true,     // enable/disable (default: true)
  keyFadeMs: 2000,    // how long key badges stay visible (default: 1500)
}
```
Or via env: `QA_HUD_KEYBOARD=0`, `QA_HUD_KEY_FADE=2000`

### Disabling
```ts
{ keyboard: false } // or QA_HUD_KEYBOARD=0
```

## Auto-Slowdown

The `actionDelay` option automatically adds a pause after every Playwright action method:

**Patched page methods:** `click`, `dblclick`, `fill`, `press`, `type`, `check`, `uncheck`, `selectOption`, `hover`, `tap`, `dragAndDrop`

**Patched keyboard methods:** `keyboard.press`, `keyboard.type`, `keyboard.insertText`

This makes recordings watchable without manually adding `waitForTimeout()` everywhere.

```ts
{ actionDelay: 200 } // 200ms pause after each action (default: 120)
```

Set to `0` to disable:
```ts
{ actionDelay: 0 }
```

## Technical Details

### Overlay Architecture
The HUD has two parts:
1. **Listener script** — injected via `addInitScript()`, runs before DOM exists, captures events, stores state on `window.__qaHud`. Survives navigations.
2. **DOM injector** — runs via `page.evaluate()` after each navigation. Creates the overlay div with `position:fixed; z-index:2147483647; pointer-events:none`. Wires cursor/keyboard elements to the listener state.

### Navigation Wrapping
The DOM overlay is re-injected after: `page.goto()`, `page.reload()`, `page.setContent()`, `page.goBack()`, `page.goForward()`.

### Non-Interference
- `pointer-events: none` on the entire overlay — clicks pass through
- Max z-index (2147483647) — always on top
- No interaction with test logic — purely visual
