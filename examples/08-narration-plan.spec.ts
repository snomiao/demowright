/**
 * Example 8: Narration-driven demo — continuous TTS, actions fill the voice
 *
 * The narration text drives the entire timeline. TTS audio is pre-generated
 * for all segments, then actions execute within each narration window.
 * pace() auto-distributes delays so actions feel natural (~2 clicks/sec).
 *
 * Result: a video where the voice never stops and actions are perfectly synced.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";
import { moveToEl, clickEl, typeKeys } from "../src/helpers.js";
import { createVideoScript } from "../src/video-script.js";

const HTML = `<!DOCTYPE html>
<html><head><title>08 Narration Plan</title><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0b0b1a; color: #e0e0e0; scroll-behavior: smooth; }
  .navbar { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 16px 40px; background: rgba(11,11,26,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.06); z-index: 200; }
  .navbar .brand { font-weight: 800; font-size: 22px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .hero { padding: 140px 40px 80px; text-align: center; background: radial-gradient(ellipse at 50% 0%, rgba(124,92,252,0.15) 0%, transparent 60%); }
  .hero h1 { font-size: 56px; font-weight: 800; line-height: 1.1; margin-bottom: 20px; background: linear-gradient(135deg, #fff 30%, #7c5cfc 70%, #00d4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .hero p { font-size: 20px; color: #888; max-width: 560px; margin: 0 auto 36px; line-height: 1.6; }
  .hero .cta-hero { padding: 14px 36px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; border: none; border-radius: 10px; font-size: 17px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 24px rgba(124,92,252,0.35); }
  .features { padding: 80px 40px; }
  .features .section-title { text-align: center; font-size: 36px; font-weight: 700; margin-bottom: 12px; color: #fff; }
  .features .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 960px; margin: 0 auto; }
  .feature-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px; transition: transform 0.25s; }
  .feature-card:hover { transform: translateY(-6px); border-color: rgba(124,92,252,0.4); }
  .feature-card .icon { font-size: 36px; margin-bottom: 16px; }
  .feature-card h3 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .feature-card p { font-size: 14px; color: #888; line-height: 1.6; }
  .pricing { padding: 80px 40px; }
  .pricing .section-title { text-align: center; font-size: 36px; font-weight: 700; margin-bottom: 48px; color: #fff; }
  .pricing .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 28px; max-width: 640px; margin: 0 auto; }
  .price-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 36px; text-align: center; transition: transform 0.25s; }
  .price-card:hover { transform: translateY(-4px); border-color: rgba(124,92,252,0.4); }
  .price-card.popular { border-color: #7c5cfc; background: rgba(124,92,252,0.08); }
  .price-card h3 { font-size: 20px; font-weight: 700; color: #fff; }
  .price-card .amount { font-size: 48px; font-weight: 800; color: #fff; margin: 16px 0; }
  .price-card .amount span { font-size: 16px; font-weight: 400; color: #777; }
  .price-card button { width: 100%; padding: 12px; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
  .price-card button.filled { background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; }
  .price-card button.outline { background: transparent; border: 2px solid rgba(255,255,255,0.15); color: #ccc; }
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 300; align-items: center; justify-content: center; }
  .modal-overlay.show { display: flex; }
  .modal { background: #141428; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; width: 420px; padding: 36px; }
  .modal h3 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 6px; }
  .modal .modal-sub { color: #777; font-size: 14px; margin-bottom: 24px; }
  .modal .field { margin-bottom: 16px; }
  .modal .field label { display: block; font-size: 13px; color: #999; margin-bottom: 6px; font-weight: 600; }
  .modal .field input { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1); border-radius: 10px; color: #e0e0e0; font-size: 14px; }
  .modal .field input:focus { outline: none; border-color: #7c5cfc; }
  .modal .submit-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; }
  .modal .success { display: none; text-align: center; padding: 20px 0; }
  .modal .success .check { font-size: 52px; margin-bottom: 12px; }
  .modal .success h4 { font-size: 22px; color: #fff; margin-bottom: 6px; }
  .modal .success p { color: #777; font-size: 14px; }
</style></head><body>
  <div class="navbar"><span class="brand">AcmeApp</span></div>
  <section class="hero" id="hero">
    <h1>Ship faster with<br/>AcmeApp</h1>
    <p>The all-in-one platform that helps your team build, test, and deploy with confidence.</p>
    <button class="cta-hero" id="hero-cta">Get Started Free</button>
  </section>
  <section class="features" id="features">
    <div class="section-title">Powerful Features</div>
    <div class="grid">
      <div class="feature-card" id="feat-1"><div class="icon">⚡</div><h3>Instant Deploys</h3><p>Push to git and see your changes live in seconds.</p></div>
      <div class="feature-card" id="feat-2"><div class="icon">🔒</div><h3>Built-in Security</h3><p>Automatic SSL, DDoS protection out of the box.</p></div>
      <div class="feature-card" id="feat-3"><div class="icon">📊</div><h3>Real-time Analytics</h3><p>Monitor performance with a beautiful dashboard.</p></div>
    </div>
  </section>
  <section class="pricing" id="pricing">
    <div class="section-title">Simple Pricing</div>
    <div class="grid">
      <div class="price-card" id="tier-starter"><h3>Starter</h3><div class="amount">$0<span>/mo</span></div><button class="outline get-started-btn">Get Started</button></div>
      <div class="price-card popular" id="tier-pro"><h3>Pro</h3><div class="amount">$29<span>/mo</span></div><button class="filled get-started-btn">Get Started</button></div>
    </div>
  </section>
  <div class="modal-overlay" id="signup-modal">
    <div class="modal">
      <div id="signup-form">
        <h3>Create your account</h3>
        <p class="modal-sub">Start building in under 2 minutes</p>
        <div class="field"><label>Full Name</label><input id="f-name" placeholder="Jane Doe" /></div>
        <div class="field"><label>Email</label><input id="f-email" type="email" placeholder="jane@example.com" /></div>
        <button class="submit-btn" id="create-btn">Create Account</button>
      </div>
      <div class="success" id="signup-success">
        <div class="check">✅</div>
        <h4>Account Created!</h4>
        <p>Welcome aboard — check your inbox to get started.</p>
      </div>
    </div>
  </div>
  <script>
    function openSignup() { document.getElementById('signup-modal').classList.add('show'); }
    document.getElementById('hero-cta').onclick = openSignup;
    document.querySelectorAll('.get-started-btn').forEach(btn => btn.addEventListener('click', openSignup));
    document.getElementById('create-btn').onclick = () => {
      document.getElementById('signup-form').style.display = 'none';
      document.getElementById('signup-success').style.display = 'block';
    };
  </script>
</body></html>`;

// Build plan at module level — texts are known upfront, callbacks added in test
const narrationTexts = [
  "Welcome to AcmeApp. This is a modern SaaS platform designed to help teams ship faster. Let's take a quick tour of everything it offers.",
  "Scrolling down to the features section. AcmeApp provides instant deploys, built-in security, and real-time analytics — all out of the box.",
  "Now let's look at pricing. There's a free Starter tier for small projects, and a Pro plan at twenty-nine dollars a month for growing teams with advanced features.",
  "Let's sign up for an account. We'll click Get Started, fill in a name and email address, then submit the form to create our account.",
  "And there we go — the account has been created successfully. That wraps up our tour of AcmeApp. Thanks for watching!",
];

let server: http.Server;
let baseUrl: string;

// Pre-generate plan with TTS in beforeAll — BEFORE any page/context exists
const pregenPlan = createVideoScript();
for (const text of narrationTexts) pregenPlan.segment(text);

test.beforeAll(async () => {
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;

  // Pre-generate all TTS audio — no page needed, uses global provider
  await pregenPlan.prepare();
});
test.afterAll(() => server?.close());

test("narration-driven product tour — continuous voice, paced actions", async ({ page }) => {
  await page.goto(baseUrl);

  // Build the executable plan reusing pre-generated audio
  const plan = createVideoScript()
    .segment(narrationTexts[0], async (pace) => {
      await moveToEl(page, ".hero h1");
      await pace();
      await moveToEl(page, ".hero p");
      await pace();
      await moveToEl(page, ".cta-hero");
      await pace();
    })
    .segment(narrationTexts[1], async (pace) => {
      await page.evaluate(() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }));
      await pace();
      await moveToEl(page, "#feat-1");
      await pace();
      await moveToEl(page, "#feat-2");
      await pace();
      await moveToEl(page, "#feat-3");
      await pace();
    })
    .segment(narrationTexts[2], async (pace) => {
      await page.evaluate(() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }));
      await pace();
      await moveToEl(page, "#tier-starter");
      await pace();
      await moveToEl(page, "#tier-pro");
      await pace();
    })
    .segment(narrationTexts[3], async (pace) => {
      await clickEl(page, "#hero-cta");
      await pace();
      await clickEl(page, "#f-name");
      await page.evaluate(() => (document.querySelector("#f-name") as HTMLInputElement).focus());
      await typeKeys(page, "Jane Doe", 65, "#f-name");
      await pace();
      await page.evaluate(() => (document.querySelector("#f-email") as HTMLInputElement).focus());
      await typeKeys(page, "jane@acmeapp.com", 55, "#f-email");
      await pace();
      await clickEl(page, "#create-btn");
      await pace();
    })
    .segment(narrationTexts[4]);

  // Audio already pre-generated by pregenPlan.prepare() in beforeAll
  // plan.run() will find cached audio via the shared TTS cache
  const result = await plan.run(page);

  for (const entry of result.timeline) {
    console.log(
      `  [${entry.startMs.toFixed(0).padStart(6)}ms] "${entry.text.slice(0, 50)}…" — ${entry.durationMs.toFixed(0)}ms`,
    );
  }
  console.log(`  Total: ${result.totalMs.toFixed(0)}ms`);

  const success = await page.evaluate(() => document.getElementById("signup-success")?.style.display);
  expect(success).toBe("block");
});
