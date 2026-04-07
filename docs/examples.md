# Examples

demowright ships with 9 runnable demo scenarios in the `examples/` directory. Each serves as both a test and a tutorial.

## Running the Examples
```bash
bun run build
bunx playwright test --config examples/playwright.config.ts
```

Videos are saved to `tmp/`. The examples config uses `withDemowright` with video recording enabled.

## Example List

### 01 — Dashboard Interaction
**File:** `examples/01-cursor-demo.spec.ts`
**Shows:** Cursor movement, click ripples, modifier keys (Ctrl+K), typing in search and modal forms.
**Features used:** `createVideoScript`, `moveToEl`, `clickEl`, `typeKeys`

A dark-themed analytics dashboard with nav tabs, stat cards, data table, and a "New Order" modal form.

### 02 — Monaco Code Editor
**File:** `examples/02-keyboard-demo.spec.ts`
**Shows:** Real Monaco Editor (VS Code) with syntax highlighting, typing code, Ctrl+S/Z/A shortcuts, Shift+Arrow selection, tab switching.
**Features used:** `createVideoScript`, native `page.keyboard.type()` and `page.keyboard.press()` (auto-patched by HUD), `clickEl`, `moveToEl`

Loads Monaco Editor from CDN. Demonstrates that native Playwright keyboard methods work seamlessly — the HUD auto-patches them for delays and key badge capture.

### 03 — E-commerce Checkout
**File:** `examples/03-form-interaction.spec.ts`
**Shows:** Product browsing, add-to-cart, checkout form with tabbing between fields, payment.
**Features used:** `createVideoScript`, `moveToEl`, `clickEl`, `typeKeys`

Narrated video script walkthrough at each step of the checkout flow.

### 04 — Narrated Product Tour
**File:** `examples/04-narrated-tour.spec.ts`
**Shows:** SaaS landing page walkthrough with hero section, feature cards, pricing tiers, signup modal.
**Features used:** `createVideoScript`, `moveToEl`, `clickEl`, `typeKeys`

Heavy use of `.segment()` — designed as a stakeholder-ready product demo video.

### 05 — Kanban Board
**File:** `examples/05-kanban-board.spec.ts`
**Shows:** Click-to-select cards, move between columns, add new tasks via inline input.
**Features used:** `createVideoScript`, `moveToEl`, `clickEl`, `typeKeys`

Dark-themed Kanban with 3 columns, priority badges, and animated card transitions.

### 06 — Native Playwright API (Zero Helpers)
**File:** `examples/06-native-api.spec.ts`
**Shows:** Contact form using ONLY native Playwright methods — `page.click()`, `page.fill()`, `page.selectOption()`, `page.check()`.
**Features used:** None from helpers — the HUD overlay and auto-delay are injected automatically by `withDemowright`.

Proves that demowright works out-of-the-box with existing tests. No imports from `demowright/helpers` needed.

### 07 — Video Player
**File:** `examples/07-video-player.spec.ts`
**Shows:** Play/pause, progress bar seeking, media keyboard shortcuts, audio capture.
**Features used:** `applyHud`, `annotate`, `clickEl`, `moveToEl`, `moveTo`, `hudWait`

Uses the programmatic approach (`applyHud`) to enable audio capture per-test.

### 08 — Narration-Driven Tour
**File:** `examples/08-narration-plan.spec.ts`
**Shows:** Continuous TTS narration with pre-generated audio and `pace()` timing.
**Features used:** `createVideoScript`, `moveToEl`, `clickEl`, `typeKeys`, `pace()`

Demonstrates TTS pre-generation in `beforeAll` and narration-driven action timing.

### 09 — Video Script (Full Production)
**File:** `examples/09-video-script.spec.ts`
**Shows:** Title card → narrated segments → transitions → outro, with auto-generated SRT subtitles and chapter markers.
**Features used:** `createVideoScript`, `.title()`, `.segment()`, `.transition()`, `.outro()`, `.render()`

The complete video production workflow — produces WAV audio track, SRT subtitles, and chapter metadata.

## Creating Your Own

### Simple: inline helpers
```ts
import { test, expect } from "@playwright/test";
import { clickEl, typeKeys, hudWait, annotate } from "demowright/helpers";

test("my recording", async ({ page }) => {
  await page.goto("https://my-app.com");
  await annotate(page, "Starting the demo");
  await clickEl(page, "#login");
  await typeKeys(page, "user@example.com", 60, "#email");
  await hudWait(page, 500);
  await clickEl(page, "#submit");
});
```

### Advanced: video script with narration-driven timing
```ts
import { test } from "@playwright/test";
import { clickEl, typeKeys } from "demowright/helpers";
import { createVideoScript } from "demowright";

test("product demo", async ({ page }) => {
  await page.goto("https://my-app.com");

  const script = createVideoScript()
    .title("Product Demo", { subtitle: "v2.0 release" })
    .segment("Let's log in to the dashboard", async (pace) => {
      await clickEl(page, "#login");
      await pace();
      await typeKeys(page, "user@example.com", 60, "#email");
      await pace();
    })
    .segment("Here's the new analytics view")
    .outro({ text: "Thanks for watching!" });

  await script.render(page);
});
```
