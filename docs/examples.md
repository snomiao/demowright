# Examples

qa-hud ships with 6 runnable demo scenarios in the `examples/` directory. Each serves as both a test and a tutorial.

## Running the Examples
```bash
npm run build
npx playwright test --config examples/playwright.config.ts
```

Videos are saved to `tmp/`. The examples config uses `withQaHud` with video recording enabled.

## Example List

### 01 — Dashboard Interaction
**File:** `examples/01-cursor-demo.spec.ts`
**Shows:** Cursor movement, click ripples, modifier keys (Ctrl+K), typing in search and modal forms.
**Features used:** `moveTo`, `moveToEl`, `clickEl`, `typeKeys`, `hudWait`, `subtitle`

A dark-themed analytics dashboard with nav tabs, stat cards, data table, and a "New Order" modal form.

### 02 — Monaco Code Editor
**File:** `examples/02-keyboard-demo.spec.ts`
**Shows:** Real Monaco Editor (VS Code) with syntax highlighting, typing code, Ctrl+S/Z/A shortcuts, Shift+Arrow selection, tab switching.
**Features used:** Native `page.keyboard.type()` and `page.keyboard.press()` (auto-patched by HUD), `clickEl`, `moveToEl`, `hudWait`, `subtitle`

Loads Monaco Editor from CDN. Demonstrates that native Playwright keyboard methods work seamlessly — the HUD auto-patches them for delays and key badge capture.

### 03 — E-commerce Checkout
**File:** `examples/03-form-interaction.spec.ts`
**Shows:** Product browsing, add-to-cart, checkout form with tabbing between fields, payment.
**Features used:** `moveToEl`, `clickEl`, `typeKeys`, `hudWait`, `annotate` (TTS + subtitles)

Showcases `annotate()` for narrated walkthroughs at each step of the checkout flow.

### 04 — Narrated Product Tour
**File:** `examples/04-narrated-tour.spec.ts`
**Shows:** SaaS landing page walkthrough with hero section, feature cards, pricing tiers, signup modal.
**Features used:** `moveToEl`, `clickEl`, `typeKeys`, `hudWait`, `subtitle`, `annotate`

Heavy use of `annotate()` — designed as a stakeholder-ready product demo video.

### 05 — Kanban Board
**File:** `examples/05-kanban-board.spec.ts`
**Shows:** Click-to-select cards, move between columns, add new tasks via inline input.
**Features used:** `moveToEl`, `clickEl`, `typeKeys`, `hudWait`, `subtitle`, `annotate`

Dark-themed Kanban with 3 columns, priority badges, and animated card transitions.

### 06 — Native Playwright API (Zero Helpers)
**File:** `examples/06-native-api.spec.ts`
**Shows:** Contact form using ONLY native Playwright methods — `page.click()`, `page.fill()`, `page.selectOption()`, `page.check()`.
**Features used:** None from helpers — the HUD overlay and auto-delay are injected automatically by `withQaHud`.

Proves that qa-hud works out-of-the-box with existing tests. No imports from `qa-hud/helpers` needed.

## Creating Your Own

Minimal template:
```ts
import { test, expect } from "@playwright/test";
import { clickEl, typeKeys, hudWait, annotate } from "qa-hud/helpers";

test("my recording", async ({ page }) => {
  await page.goto("https://my-app.com");
  await annotate(page, "Starting the demo");
  await clickEl(page, "#login");
  await typeKeys(page, "user@example.com", 60, "#email");
  await hudWait(page, 500);
  await clickEl(page, "#submit");
});
```
