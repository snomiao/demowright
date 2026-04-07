/**
 * Example 4: Narrated product tour
 * Demonstrates TTS narration and caption features — a stakeholder-ready
 * walkthrough of a SaaS landing page with hero, features, pricing, and signup.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";
import { moveToEl, clickEl, typeKeys } from "../src/helpers.js";
import { createVideoScript } from "../src/video-script.js";

const HTML = `<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0b0b1a; color: #e0e0e0; scroll-behavior: smooth; }

  /* ---- Navbar ---- */
  .navbar { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 16px 40px; background: rgba(11,11,26,0.85); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255,255,255,0.06); z-index: 200; }
  .navbar .brand { font-weight: 800; font-size: 22px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .navbar nav a { color: #999; text-decoration: none; margin-left: 28px; font-size: 14px; font-weight: 500; transition: color 0.2s; }
  .navbar nav a:hover { color: #fff; }
  .navbar .cta-nav { padding: 8px 20px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
  .navbar .cta-nav:hover { opacity: 0.85; }

  /* ---- Hero ---- */
  .hero { padding: 140px 40px 80px; text-align: center; background: radial-gradient(ellipse at 50% 0%, rgba(124,92,252,0.15) 0%, transparent 60%); }
  .hero h1 { font-size: 56px; font-weight: 800; line-height: 1.1; margin-bottom: 20px; background: linear-gradient(135deg, #fff 30%, #7c5cfc 70%, #00d4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .hero p { font-size: 20px; color: #888; max-width: 560px; margin: 0 auto 36px; line-height: 1.6; }
  .hero .cta-hero { padding: 14px 36px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; border: none; border-radius: 10px; font-size: 17px; font-weight: 700; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 24px rgba(124,92,252,0.35); }
  .hero .cta-hero:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(124,92,252,0.5); }

  /* ---- Features ---- */
  .features { padding: 80px 40px; }
  .features .section-title { text-align: center; font-size: 36px; font-weight: 700; margin-bottom: 12px; color: #fff; }
  .features .section-sub { text-align: center; color: #777; font-size: 16px; margin-bottom: 48px; }
  .features .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 960px; margin: 0 auto; }
  .feature-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px; transition: transform 0.25s, border-color 0.25s; }
  .feature-card:hover { transform: translateY(-6px); border-color: rgba(124,92,252,0.4); }
  .feature-card .icon { font-size: 36px; margin-bottom: 16px; }
  .feature-card h3 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .feature-card p { font-size: 14px; color: #888; line-height: 1.6; }

  /* ---- Pricing ---- */
  .pricing { padding: 80px 40px; background: radial-gradient(ellipse at 50% 100%, rgba(0,212,255,0.08) 0%, transparent 60%); }
  .pricing .section-title { text-align: center; font-size: 36px; font-weight: 700; margin-bottom: 12px; color: #fff; }
  .pricing .section-sub { text-align: center; color: #777; font-size: 16px; margin-bottom: 48px; }
  .pricing .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 28px; max-width: 640px; margin: 0 auto; }
  .price-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 36px; text-align: center; transition: transform 0.25s, border-color 0.25s; }
  .price-card:hover { transform: translateY(-4px); border-color: rgba(124,92,252,0.4); }
  .price-card.popular { border-color: #7c5cfc; background: rgba(124,92,252,0.08); position: relative; }
  .price-card.popular::before { content: 'Most Popular'; position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; font-size: 11px; font-weight: 700; padding: 4px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; }
  .price-card h3 { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .price-card .amount { font-size: 48px; font-weight: 800; color: #fff; margin: 16px 0 4px; }
  .price-card .amount span { font-size: 16px; font-weight: 400; color: #777; }
  .price-card .features-list { list-style: none; margin: 20px 0 28px; }
  .price-card .features-list li { padding: 6px 0; font-size: 14px; color: #aaa; }
  .price-card .features-list li::before { content: '✓ '; color: #7c5cfc; font-weight: 700; }
  .price-card button { width: 100%; padding: 12px; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
  .price-card button.outline { background: transparent; border: 2px solid rgba(255,255,255,0.15); color: #ccc; }
  .price-card button.outline:hover { border-color: #7c5cfc; color: #fff; }
  .price-card button.filled { background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; }
  .price-card button.filled:hover { opacity: 0.85; }

  /* ---- Signup Modal ---- */
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.65); z-index: 300; align-items: center; justify-content: center; }
  .modal-overlay.show { display: flex; }
  .modal { background: #141428; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; width: 420px; padding: 36px; }
  .modal h3 { font-size: 24px; font-weight: 700; color: #fff; margin-bottom: 6px; }
  .modal .modal-sub { color: #777; font-size: 14px; margin-bottom: 24px; }
  .modal .field { margin-bottom: 16px; }
  .modal .field label { display: block; font-size: 13px; color: #999; margin-bottom: 6px; font-weight: 600; }
  .modal .field input { width: 100%; padding: 12px 14px; background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.1); border-radius: 10px; color: #e0e0e0; font-size: 14px; transition: border-color 0.2s; }
  .modal .field input:focus { outline: none; border-color: #7c5cfc; }
  .modal .submit-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #7c5cfc, #00d4ff); color: #fff; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; transition: opacity 0.2s; }
  .modal .submit-btn:hover { opacity: 0.85; }
  .modal .success { display: none; text-align: center; padding: 20px 0; }
  .modal .success .check { font-size: 52px; margin-bottom: 12px; }
  .modal .success h4 { font-size: 22px; color: #fff; margin-bottom: 6px; }
  .modal .success p { color: #777; font-size: 14px; }
</style></head><body>

  <!-- Navbar -->
  <div class="navbar">
    <span class="brand">AcmeApp</span>
    <nav>
      <a href="#features">Features</a>
      <a href="#pricing">Pricing</a>
      <a href="#">Docs</a>
    </nav>
    <button class="cta-nav" id="nav-cta">Get Started</button>
  </div>

  <!-- Hero -->
  <section class="hero" id="hero">
    <h1>Ship faster with<br/>AcmeApp</h1>
    <p>The all-in-one platform that helps your team build, test, and deploy with confidence.</p>
    <button class="cta-hero" id="hero-cta">Get Started Free</button>
  </section>

  <!-- Features -->
  <section class="features" id="features">
    <div class="section-title">Powerful Features</div>
    <p class="section-sub">Everything you need to move fast and stay reliable</p>
    <div class="grid">
      <div class="feature-card" id="feat-1">
        <div class="icon">⚡</div>
        <h3>Instant Deploys</h3>
        <p>Push to git and see your changes live in seconds with zero-config CI/CD pipelines.</p>
      </div>
      <div class="feature-card" id="feat-2">
        <div class="icon">🔒</div>
        <h3>Built-in Security</h3>
        <p>Automatic SSL, DDoS protection, and SOC 2 compliance out of the box.</p>
      </div>
      <div class="feature-card" id="feat-3">
        <div class="icon">📊</div>
        <h3>Real-time Analytics</h3>
        <p>Monitor performance, errors, and user behavior with a beautiful dashboard.</p>
      </div>
    </div>
  </section>

  <!-- Pricing -->
  <section class="pricing" id="pricing">
    <div class="section-title">Simple Pricing</div>
    <p class="section-sub">Start free, scale as you grow</p>
    <div class="grid">
      <div class="price-card" id="tier-starter">
        <h3>Starter</h3>
        <div class="amount">$0<span>/mo</span></div>
        <ul class="features-list">
          <li>3 projects</li>
          <li>1 GB storage</li>
          <li>Community support</li>
        </ul>
        <button class="outline get-started-btn">Get Started</button>
      </div>
      <div class="price-card popular" id="tier-pro">
        <h3>Pro</h3>
        <div class="amount">$29<span>/mo</span></div>
        <ul class="features-list">
          <li>Unlimited projects</li>
          <li>100 GB storage</li>
          <li>Priority support</li>
          <li>Advanced analytics</li>
        </ul>
        <button class="filled get-started-btn">Get Started</button>
      </div>
    </div>
  </section>

  <!-- Signup Modal -->
  <div class="modal-overlay" id="signup-modal">
    <div class="modal">
      <div id="signup-form">
        <h3>Create your account</h3>
        <p class="modal-sub">Start building in under 2 minutes</p>
        <div class="field">
          <label>Full Name</label>
          <input id="f-name" placeholder="Jane Doe" />
        </div>
        <div class="field">
          <label>Email</label>
          <input id="f-email" type="email" placeholder="jane@example.com" />
        </div>
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
    // Open signup modal from any CTA
    function openSignup() {
      document.getElementById('signup-modal').classList.add('show');
    }
    document.getElementById('nav-cta').onclick = openSignup;
    document.getElementById('hero-cta').onclick = openSignup;
    document.querySelectorAll('.get-started-btn').forEach(btn => btn.addEventListener('click', openSignup));

    // Submit → show success
    document.getElementById('create-btn').onclick = () => {
      document.getElementById('signup-form').style.display = 'none';
      document.getElementById('signup-success').style.display = 'block';
    };
  </script>
</body></html>`;

let server: http.Server;
let baseUrl: string;
test.beforeAll(async () => {
  server = http.createServer((_, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(HTML);
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});
test.afterAll(() => server?.close());

test("narrated product tour — hero, features, pricing, signup", async ({ page }) => {
  const plan = createVideoScript()
    .segment(
      "Welcome to AcmeApp. Let's take a guided tour of this modern SaaS landing page and explore everything it has to offer.",
      async (pace) => {
        await moveToEl(page, ".hero h1");
        await pace();
        await moveToEl(page, ".hero p");
        await pace();
        await moveToEl(page, ".cta-hero");
        await pace();
      },
    )
    .segment(
      "Scrolling down to the features section. AcmeApp provides instant deploys, built-in security, and real-time analytics — all out of the box.",
      async (pace) => {
        await page.evaluate(() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" }));
        await pace();
        await moveToEl(page, "#feat-1");
        await pace();
        await moveToEl(page, "#feat-2");
        await pace();
        await moveToEl(page, "#feat-3");
        await pace();
      },
    )
    .segment(
      "Now let's look at the pricing options. There's a free Starter tier for small projects, and a Pro plan at twenty-nine dollars a month for teams that need more.",
      async (pace) => {
        await page.evaluate(() => document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" }));
        await pace();
        await moveToEl(page, "#tier-starter");
        await pace();
        await moveToEl(page, "#tier-pro");
        await pace();
      },
    )
    .segment(
      "Let's sign up for an account. We'll click Get Started, fill in the name field with Jane Doe, tab over to email, enter the address, and then create the account.",
      async (pace) => {
        await clickEl(page, "#hero-cta");
        await pace();
        await clickEl(page, "#f-name");
        await page.evaluate(() => (document.querySelector("#f-name") as HTMLInputElement).focus());
        await typeKeys(page, "Jane Doe", 65, "#f-name");
        await pace();
        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })),
        );
        await page.evaluate(() => (document.querySelector("#f-email") as HTMLInputElement).focus());
        await moveToEl(page, "#f-email");
        await typeKeys(page, "jane@acmeapp.com", 55, "#f-email");
        await pace();
        await clickEl(page, "#create-btn");
        await pace();
      },
    )
    .segment(
      "And there we go — the account has been created successfully. That wraps up our product tour of AcmeApp. Thanks for watching!",
    );

  await page.goto(baseUrl);

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
