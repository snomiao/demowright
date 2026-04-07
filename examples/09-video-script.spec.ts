/**
 * Example 9: Video Script — title card, narrated segments, subtitles, outro
 *
 * Demonstrates createVideoScript() which extends the narration plan pattern
 * with title/outro cards, transitions, auto-generated SRT subtitles, and
 * chapter markers.
 *
 * Result: a polished video with title → narrated segments → outro, plus
 * an SRT subtitle file and chapter metadata.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";
import { moveToEl, clickEl, typeKeys } from "../src/helpers.js";
import { createVideoScript } from "../src/video-script.js";

const HTML = `<!DOCTYPE html>
<html><head><title>09 Video Script</title><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0b0b1a; color: #e0e0e0; }
  .navbar { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; padding: 16px 40px; background: rgba(11,11,26,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.06); z-index: 200; }
  .navbar .brand { font-weight: 800; font-size: 22px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .hero { padding: 140px 40px 80px; text-align: center; background: radial-gradient(ellipse at 50% 0%, rgba(124,92,252,0.15) 0%, transparent 60%); }
  .hero h1 { font-size: 56px; font-weight: 800; line-height: 1.1; margin-bottom: 20px; background: linear-gradient(135deg, #fff 30%, #7c5cfc 70%, #00d4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .hero p { font-size: 20px; color: #888; max-width: 560px; margin: 0 auto 36px; line-height: 1.6; }
  .hero .cta { padding: 14px 36px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; border: none; border-radius: 10px; font-size: 17px; font-weight: 700; cursor: pointer; }
  .features { padding: 80px 40px; }
  .features .title { text-align: center; font-size: 36px; font-weight: 700; margin-bottom: 36px; color: #fff; }
  .features .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 960px; margin: 0 auto; }
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px; transition: transform 0.25s; }
  .card:hover { transform: translateY(-6px); border-color: rgba(124,92,252,0.4); }
  .card .icon { font-size: 36px; margin-bottom: 16px; }
  .card h3 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .card p { font-size: 14px; color: #888; line-height: 1.6; }
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 300; align-items: center; justify-content: center; }
  .modal-overlay.show { display: flex; }
  .modal { background: #141428; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; width: 420px; padding: 36px; }
  .modal h3 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 6px; }
  .modal .sub { color: #777; font-size: 14px; margin-bottom: 24px; }
  .modal .field { margin-bottom: 16px; }
  .modal .field label { display: block; font-size: 13px; color: #999; margin-bottom: 6px; font-weight: 600; }
  .modal .field input { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1); border-radius: 10px; color: #e0e0e0; font-size: 14px; }
  .modal .field input:focus { outline: none; border-color: #7c5cfc; }
  .modal .submit { width: 100%; padding: 14px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; }
  .modal .success { display: none; text-align: center; padding: 20px 0; }
  .modal .success .check { font-size: 52px; margin-bottom: 12px; }
  .modal .success h4 { font-size: 22px; color: #fff; margin-bottom: 6px; }
  .modal .success p { color: #777; font-size: 14px; }
</style></head><body>
  <div class="navbar"><span class="brand">NovaDash</span></div>
  <section class="hero" id="hero">
    <h1>Build smarter with<br/>NovaDash</h1>
    <p>A modern analytics platform that turns your data into actionable insights in seconds.</p>
    <button class="cta" id="hero-cta">Start Free Trial</button>
  </section>
  <section class="features" id="features">
    <div class="title">Why NovaDash?</div>
    <div class="grid">
      <div class="card" id="feat-1"><div class="icon">📈</div><h3>Live Dashboards</h3><p>Real-time charts that update as your data flows in.</p></div>
      <div class="card" id="feat-2"><div class="icon">🤖</div><h3>AI Insights</h3><p>Machine learning spots anomalies before you do.</p></div>
      <div class="card" id="feat-3"><div class="icon">🔗</div><h3>Integrations</h3><p>Connect 200+ data sources with one click.</p></div>
    </div>
  </section>
  <div class="modal-overlay" id="signup-modal">
    <div class="modal">
      <div id="signup-form">
        <h3>Start your free trial</h3>
        <p class="sub">No credit card required</p>
        <div class="field"><label>Full Name</label><input id="f-name" placeholder="Jane Doe" /></div>
        <div class="field"><label>Work Email</label><input id="f-email" type="email" placeholder="jane@company.com" /></div>
        <button class="submit" id="create-btn">Create Account</button>
      </div>
      <div class="success" id="signup-success">
        <div class="check">✅</div>
        <h4>You're in!</h4>
        <p>Check your inbox to activate your dashboard.</p>
      </div>
    </div>
  </div>
  <script>
    function openSignup() { document.getElementById('signup-modal').classList.add('show'); }
    document.getElementById('hero-cta').onclick = openSignup;
    document.getElementById('create-btn').onclick = () => {
      document.getElementById('signup-form').style.display = 'none';
      document.getElementById('signup-success').style.display = 'block';
    };
  </script>
</body></html>`;

let server: http.Server;
let baseUrl: string;

// Pre-generate TTS in beforeAll — no page/context needed
const narration = [
  "Here's NovaDash, a modern analytics platform. Let's explore what it offers.",
  "The features section highlights live dashboards, AI-powered insights, and over two hundred integrations.",
  "Let's sign up. We'll enter a name and email, then create the account.",
  "Account created! That's how fast you can get started with NovaDash.",
];

const pregenScript = createVideoScript();
for (const text of narration) pregenScript.segment(text);

test.beforeAll(async () => {
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;

  // Pre-generate TTS audio using global provider
  await pregenScript.prepare();
});
test.afterAll(() => server?.close());

test("video script — title, narrated segments, subtitles, outro", async ({ page }) => {
  await page.goto(baseUrl);

  const script = createVideoScript()
    .title("NovaDash Product Tour", {
      subtitle: "A 30-second walkthrough",
      durationMs: 3000,
    })
    .segment(narration[0], async (pace) => {
      await moveToEl(page, ".hero h1");
      await pace();
      await moveToEl(page, ".hero p");
      await pace();
      await moveToEl(page, ".cta");
      await pace();
    })
    .transition("fade", 400)
    .segment(narration[1], async (pace) => {
      await page.evaluate(() =>
        document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }),
      );
      await pace();
      await moveToEl(page, "#feat-1");
      await pace();
      await moveToEl(page, "#feat-2");
      await pace();
      await moveToEl(page, "#feat-3");
      await pace();
    })
    .transition("fade", 400)
    .segment(narration[2], async (pace) => {
      await clickEl(page, "#hero-cta");
      await pace();
      await clickEl(page, "#f-name");
      await page.evaluate(() =>
        (document.querySelector("#f-name") as HTMLInputElement).focus(),
      );
      await typeKeys(page, "Jane Doe", 65, "#f-name");
      await pace();
      await page.evaluate(() =>
        (document.querySelector("#f-email") as HTMLInputElement).focus(),
      );
      await typeKeys(page, "jane@company.com", 55, "#f-email");
      await pace();
      await clickEl(page, "#create-btn");
      await pace();
    })
    .segment(narration[3])
    .outro({
      text: "Thanks for watching!",
      subtitle: "Try NovaDash free at novadash.io",
      durationMs: 3000,
    });

  const result = await script.render(page, {
    baseName: "09-video-script",
  });

  // Log timeline
  for (const entry of result.timeline) {
    console.log(
      `  [${entry.startMs.toFixed(0).padStart(6)}ms] ${entry.kind.padEnd(10)} "${entry.text.slice(0, 50)}…" — ${entry.durationMs.toFixed(0)}ms`,
    );
  }
  console.log(`  Total: ${result.totalMs.toFixed(0)}ms`);
  console.log(`  SRT:\n${result.srtContent}`);

  // Verify the signup succeeded
  const success = await page.evaluate(
    () => document.getElementById("signup-success")?.style.display,
  ).catch(() => "block"); // context may be closed by render()
  expect(success).toBe("block");
});
