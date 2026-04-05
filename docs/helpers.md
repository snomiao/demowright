# Helpers API

Import: `import { clickEl, typeKeys, moveTo, hudWait } from "qa-hud/helpers"` or from `"qa-hud"` directly.

## Overview

All helpers detect whether qa-hud is active on the page. When inactive (normal test runs), they either skip entirely or take a fast path — so tests remain fast in CI.

## Reference

### `hudWait(page, ms)`

Recording-only delay. Waits `ms` milliseconds only when HUD is active. Use instead of `page.waitForTimeout()` for pauses that exist solely for video readability.

```ts
await hudWait(page, 500); // waits 500ms in recording, instant in CI
```

### `moveTo(page, x, y, steps?)`

Smoothly animate the HUD cursor to (x, y) coordinates over `steps` frames (default 10). No-op when inactive.

```ts
await moveTo(page, 400, 300);
```

### `moveToEl(page, selector)`

Animate the HUD cursor to the center of the element matching `selector`. Returns `{ x, y }` coordinates (always, even when HUD inactive — useful for subsequent clicks).

```ts
const center = await moveToEl(page, "#submit-btn");
```

### `clickEl(page, selector)`

Animated click: moves cursor to element → shows ripple → performs DOM `.click()`. When HUD is inactive, just performs the DOM click without animation/delays.

```ts
await clickEl(page, "#submit-btn");
```

### `typeKeys(page, text, delay?, inputSelector?)`

Type text character-by-character with visible key badges. When HUD is inactive, sets the input value directly for speed.

- `delay` — ms between keystrokes (default 65)
- `inputSelector` — optional selector for the target input (default: `document.activeElement`)

```ts
await typeKeys(page, "hello@example.com", 55, "#email");
```

## Dual Behavior

| Helper | HUD Active | HUD Inactive |
|--------|-----------|-------------|
| hudWait | Waits ms | Instant (no-op) |
| moveTo | Animates cursor | No-op |
| moveToEl | Animates cursor, returns coords | Returns coords only |
| clickEl | Animate → ripple → click → wait | DOM click only |
| typeKeys | Char-by-char with key badges | Sets value directly |

## Tips

- Use `hudWait()` instead of `page.waitForTimeout()` for recording-only pauses
- `clickEl` dispatches a real DOM `.click()` — it works even when HUD is inactive
- `typeKeys` dispatches KeyboardEvent on `document` — any keydown listener in the page will receive them
- For Monaco Editor or contentEditable, prefer `page.keyboard.type()` which the HUD patches automatically
