# Making `page.click()` Show the HUD Cursor — Wrapper Strategies

> How do we make native Playwright calls (`page.click()`, `page.fill()`, `locator.click()`) automatically animate the HUD cursor, show ripples, and display key badges — without the user importing special helpers?

Below is a comparison of **seven approaches**, from simplest to most invasive.

---

## Quick Matrix

| #   | Approach                                     | Zero test changes? | Locator support? | Cursor animation? | TTS/subtitle? | Risk level |
| --- | -------------------------------------------- | ------------------ | ---------------- | ----------------- | ------------- | ---------- |
| 0   | **Explicit helpers** (current)               | ❌                 | ❌               | ✅                | ✅            | None       |
| 1   | **Page method monkey-patch**                 | ✅                 | ❌               | ✅                | ❌            | Low        |
| 2   | **Locator prototype patch**                  | ✅                 | ✅               | ✅                | ❌            | Medium     |
| 3   | **JS Proxy wrapper**                         | ❌ (fixture)       | ✅               | ✅                | ❌            | Low        |
| 4   | **Fixture-based wrapped page**               | ❌ (fixture)       | ✅               | ✅                | ✅            | Low        |
| 5   | **CDP `Input.dispatchMouseEvent` listener**  | ✅                 | ✅               | ⚠️ after-the-fact | ❌            | Medium     |
| 6   | **Browser-side MutationObserver + `:hover`** | ✅                 | Partial          | ⚠️ limited        | ❌            | Low        |

---

## 0 — Explicit Helpers (status quo)

```ts
import { clickEl, typeKeys, narrate } from "demowright/helpers";

await clickEl(page, "#submit"); // animated cursor + ripple + click
await typeKeys(page, "hello", 65, "#input");
await narrate(page, "Filling the form");
```

**Pros:**

- Full control — cursor animation, ripple, TTS, subtitles
- Zero risk — no monkey-patching
- Clear intent — reader knows this is a recording-only action

**Cons:**

- User must rewrite tests to use `clickEl()` instead of `page.click()`
- Not reusable for existing test suites

**Best for:** Dedicated demo/recording scripts.

---

## 1 — Page Method Monkey-Patch (already partially done)

We already do this for `actionDelay` in `patchPageDelay()`. Extend it to animate the cursor **before** the native action:

```ts
function patchPageActions(page: Page) {
  const origClick = page.click.bind(page);
  page.click = async (selector, options?) => {
    // 1. Resolve element position
    const box = await page.locator(selector).boundingBox();
    if (box) {
      // 2. Animate cursor to center
      await animateCursorTo(page, box.x + box.width / 2, box.y + box.height / 2);
    }
    // 3. Perform the real click
    return origClick(selector, options);
  };
  // repeat for fill, type, dblclick, hover, etc.
}
```

**Pros:**

- Zero test changes for `page.click()` / `page.fill()` / etc.
- Already proven pattern (we use it for delays)
- Easy to implement incrementally

**Cons:**

- **Doesn't cover `locator.click()`** — the modern Playwright API. Most tests use `page.getByRole('button').click()`, not `page.click('#btn')`
- Must enumerate every method manually
- `page.click(selector)` resolves the element internally — getting coordinates requires a separate `boundingBox()` call (extra round-trip)

**Feasibility:** ✅ Easy, but incomplete.

---

## 2 — Locator Prototype Patch

Patch `Locator.prototype` to intercept `click()`, `fill()`, etc. on **all** locators:

```ts
import { Locator } from "@playwright/test";

const origClick = Locator.prototype.click;
Locator.prototype.click = async function (options?) {
  const box = await this.boundingBox();
  if (box) {
    await animateCursorTo(this.page(), box.x + box.width / 2, box.y + box.height / 2);
  }
  return origClick.call(this, options);
};
```

**Pros:**

- Covers the modern `locator.click()` API — the way most tests are written
- Single patch covers all locator instances
- Zero test changes

**Cons:**

- **Global mutation** — affects every test in the worker, even those that don't want HUD
- `Locator.prototype` is not a public API — Playwright could change internals between versions
- `Locator` class might not be directly importable (it's re-exported from `playwright-core`)
- `this.page()` on a locator — need to verify the API exists (it does: `locator.page()`)

**Feasibility:** ⚠️ Works today, fragile across Playwright upgrades.

---

## 3 — JS Proxy Wrapper

Wrap the `page` object in a `Proxy` that intercepts method calls:

```ts
function wrapPage(page: Page): Page {
  return new Proxy(page, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === "click" || prop === "fill" || prop === "type") {
        return async (...args: any[]) => {
          await animateCursorToSelector(target, args[0]);
          return value.apply(target, args);
        };
      }
      if (prop === "locator" || prop === "getByRole" || prop === "getByText" /* ... */) {
        const locator = value.apply(target, args);
        return wrapLocator(locator); // recursively proxy locators
      }
      return value;
    },
  });
}
```

**Pros:**

- No global prototype mutation — only the wrapped page is affected
- Can intercept both `page.*` and `locator.*` calls
- Type-safe if done carefully (the Proxy looks like a `Page`)

**Cons:**

- **Requires fixture changes** — test must receive the wrapped page, not the raw one
- Deep proxy recursion for locators is tricky (`locator.first()`, `locator.nth()`, etc. all return new locators)
- `instanceof` checks break with Proxies
- Complex to maintain — every new Playwright API that returns a Locator needs handling

**Feasibility:** ⚠️ Powerful but high maintenance.

---

## 4 — Fixture-Based Wrapped Page

Provide a custom fixture that gives the user a `hudPage` (or overrides `page`):

```ts
// demowright fixture
export const test = base.extend({
  page: async ({ page, context }, use) => {
    await applyHud(context);

    // Override page actions with cursor animation
    const origClick = page.click.bind(page);
    page.click = async (selector, opts?) => {
      await animateCursorToSelector(page, selector);
      return origClick(selector, opts);
    };
    // ... patch other methods

    await use(page);
  },
});
```

**Pros:**

- User just changes the import: `import { test } from 'demowright'` — existing `page.click()` calls get animated
- Scoped — only affects tests using this fixture
- Can combine with the Proxy approach for locator coverage
- Natural place to add TTS/subtitles via `test.step()` integration

**Cons:**

- Requires import change (but we already require this for the fixture approach)
- Same locator coverage gap as approach 1 unless combined with Proxy

**Feasibility:** ✅ Our best pragmatic option.

---

## 5 — CDP `Input.dispatchMouseEvent` Listener

Use Chrome DevTools Protocol to listen for actual mouse/keyboard events dispatched by Playwright:

```ts
const cdp = await context.newCDPSession(page);

// Playwright dispatches mouse events via CDP — we can observe them
cdp.on("Input.dispatchMouseEvent", (params) => {
  // params.x, params.y, params.type ('mousePressed', 'mouseReleased', 'mouseMoved')
  // Animate HUD cursor to (x, y)
});
```

**Pros:**

- Catches **everything** — `page.click()`, `locator.click()`, mouse.click(), etc.
- No monkey-patching of JS objects
- Works regardless of which Playwright API the user calls

**Cons:**

- **Chromium-only** (CDP is not available in Firefox/WebKit)
- The event fires **at dispatch time**, not before — cursor would animate _after_ the click, not _before_
- Actually, Playwright sends CDP commands, it doesn't emit events we can listen to. We'd need to intercept outgoing CDP messages, which requires patching the CDP session itself
- Very low-level, undocumented internal behavior

**Feasibility:** ❌ Not practical.

---

## 6 — Browser-Side `:hover` / Event Observer

Instead of intercepting Node-side Playwright calls, observe actual DOM events in the browser:

```ts
// In addInitScript:
document.addEventListener("mousedown", (e) => {
  showRipple(e.clientX, e.clientY); // already done!
  moveCursorTo(e.clientX, e.clientY);
});
document.addEventListener("focus", (e) => {
  const rect = e.target.getBoundingClientRect();
  moveCursorTo(rect.x + rect.width / 2, rect.y + rect.height / 2);
});
```

**Pros:**

- Already partially implemented! Our listener script captures mousemove/mousedown/keydown
- Works with any Playwright API — the browser sees the same DOM events regardless
- Zero Node-side patching

**Cons:**

- Playwright's `page.click()` dispatches events via CDP, **not through the DOM event system** — our `document.addEventListener('mousemove')` never fires for programmatic clicks
- Only works for helpers that dispatch `MouseEvent` manually (our current approach)
- Cannot animate the cursor _before_ the click (the event already happened)
- No way to add TTS or subtitles from browser-side alone

**Feasibility:** ⚠️ Already in use for manual event dispatch, but doesn't help with native Playwright calls.

---

## Recommendation

**Combine approaches 0 + 1 + 4** in layers:

```
Layer 1 — Fixture (approach 4)
  └─ import { test } from 'demowright'
  └─ page.click() / page.fill() automatically animate cursor
  └─ Zero changes to existing page.* calls

Layer 2 — Page monkey-patch (approach 1)
  └─ Extended patchPageDelay → patchPageActions
  └─ Pre-action cursor animation + post-action delay
  └─ Covers page.click, page.fill, page.type, etc.

Layer 3 — Explicit helpers (approach 0)
  └─ narrate(), subtitle(), annotate() — recording-only annotations
  └─ hudWait() — recording-only delays
  └─ These CAN'T be auto-injected (they're intentional narration)
```

### Why not full Locator coverage?

Patching `Locator.prototype` (approach 2) is tempting but fragile. Instead, we should:

1. **Patch `page.*` methods** (covers older-style tests)
2. **Document** that for locator-based tests, users should use `page.click(selector)` or our helpers
3. **Revisit** when/if Playwright adds official action hooks or instrumentation APIs

### What about TTS?

TTS and subtitles are **intentional annotations** — they can never be auto-injected from a `page.click()` call because the user needs to write the narration text. These will always live in **approach 0** (explicit helpers).

---

## Implementation Priority

1. ✅ **Done** — Explicit helpers (`clickEl`, `typeKeys`, `narrate`, `subtitle`, `annotate`, `hudWait`)
2. ✅ **Done** — `patchPageDelay` for post-action delays
3. 🔲 **Next** — Extend `patchPageDelay` → `patchPageActions` with pre-action cursor animation
4. 🔲 **Later** — Consider Locator.prototype patch behind an opt-in flag (`aggressive: true`)
