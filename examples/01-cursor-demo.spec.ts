/**
 * Example 1: Dashboard interaction
 * Full HUD demo — cursor movement, click ripples, keyboard navigation,
 * modifier keys, and typing, all in a realistic dashboard UI.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";
import { moveToEl, clickEl, typeKeys } from "../src/helpers.js";
import { createVideoScript } from "../src/video-script.js";

const HTML = `<!DOCTYPE html>
<html><head><title>01 Cursor Demo</title><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #0f0f23; color: #ccc; }
  .topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 30px; background: #1a1a3e; border-bottom: 1px solid #333366; }
  .topbar .logo { color: #ffcc00; font-weight: 700; font-size: 18px; }
  .topbar nav a { color: #8888aa; text-decoration: none; margin-left: 24px; font-size: 14px; padding: 6px 12px; border-radius: 6px; transition: all 0.2s; }
  .topbar nav a:hover, .topbar nav a.active { color: #fff; background: #333366; }
  .topbar .search { padding: 6px 14px; background: #0f0f23; border: 1px solid #333366; border-radius: 6px; color: #ccc; width: 220px; font-size: 13px; }
  .main { display: flex; min-height: calc(100vh - 48px); }
  .sidebar { width: 220px; background: #161638; padding: 20px 0; border-right: 1px solid #333366; }
  .sidebar a { display: block; padding: 10px 24px; color: #8888aa; text-decoration: none; font-size: 14px; transition: all 0.2s; }
  .sidebar a:hover, .sidebar a.active { color: #fff; background: #1a1a3e; border-left: 3px solid #ffcc00; }
  .content { flex: 1; padding: 30px; }
  .content h2 { color: #fff; margin-bottom: 20px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat { background: #1a1a3e; border-radius: 10px; padding: 20px; border: 1px solid #333366; }
  .stat .label { color: #8888aa; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
  .stat .value { color: #fff; font-size: 28px; font-weight: 700; margin-top: 4px; }
  .stat .change { font-size: 12px; margin-top: 4px; }
  .stat .change.up { color: #55efc4; }
  .stat .change.down { color: #ff6b6b; }
  .table-card { background: #1a1a3e; border-radius: 10px; border: 1px solid #333366; overflow: hidden; }
  .table-card .header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #333366; }
  .table-card .header h3 { color: #fff; font-size: 16px; }
  .table-card .header button { padding: 6px 14px; background: #ffcc00; color: #000; border: none; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 20px; color: #8888aa; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #333366; }
  td { padding: 12px 20px; color: #ccc; font-size: 14px; border-bottom: 1px solid #222244; }
  tr:hover td { background: #222244; }
  .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .badge.green { background: #1a3a2a; color: #55efc4; }
  .badge.yellow { background: #3a3a1a; color: #feca57; }
  .badge.red { background: #3a1a1a; color: #ff6b6b; }
  .modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000; align-items: center; justify-content: center; }
  .modal-overlay.show { display: flex; }
  .modal { background: #1a1a3e; border-radius: 12px; padding: 30px; width: 420px; border: 1px solid #333366; }
  .modal h3 { color: #fff; margin-bottom: 16px; }
  .modal input { width: 100%; padding: 10px; background: #0f0f23; border: 1px solid #333366; border-radius: 6px; color: #ccc; font-size: 14px; margin-bottom: 12px; }
  .modal input:focus { outline: none; border-color: #ffcc00; }
  .modal .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
  .modal .btn { padding: 8px 18px; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  .modal .btn.primary { background: #ffcc00; color: #000; font-weight: 600; }
  .modal .btn.secondary { background: #333366; color: #ccc; }
</style></head><body>
  <div class="topbar">
    <span class="logo">⚡ QA Dashboard</span>
    <nav>
      <a href="#" class="active" id="nav-overview">Overview</a>
      <a href="#" id="nav-analytics">Analytics</a>
      <a href="#" id="nav-reports">Reports</a>
      <a href="#" id="nav-settings">Settings</a>
    </nav>
    <input class="search" id="search" placeholder="Search... (Ctrl+K)" />
  </div>
  <div class="main">
    <div class="sidebar">
      <a href="#" class="active">📊 Dashboard</a>
      <a href="#">👥 Users</a>
      <a href="#">📦 Products</a>
      <a href="#">💳 Billing</a>
      <a href="#">⚙️ Settings</a>
    </div>
    <div class="content">
      <h2>Dashboard Overview</h2>
      <div class="stats">
        <div class="stat" id="s1"><div class="label">Revenue</div><div class="value">$48,290</div><div class="change up">↑ 12.5%</div></div>
        <div class="stat" id="s2"><div class="label">Users</div><div class="value">2,847</div><div class="change up">↑ 8.2%</div></div>
        <div class="stat" id="s3"><div class="label">Orders</div><div class="value">1,432</div><div class="change down">↓ 3.1%</div></div>
        <div class="stat" id="s4"><div class="label">Conversion</div><div class="value">3.24%</div><div class="change up">↑ 1.8%</div></div>
      </div>
      <div class="table-card">
        <div class="header"><h3>Recent Orders</h3><button id="add-btn">+ New Order</button></div>
        <table>
          <thead><tr><th>Order ID</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td>#1042</td><td>Alice Johnson</td><td>$129.00</td><td><span class="badge green">Completed</span></td></tr>
            <tr><td>#1041</td><td>Bob Smith</td><td>$89.50</td><td><span class="badge yellow">Pending</span></td></tr>
            <tr><td>#1040</td><td>Carol Davis</td><td>$245.00</td><td><span class="badge green">Completed</span></td></tr>
            <tr><td>#1039</td><td>David Lee</td><td>$67.25</td><td><span class="badge red">Cancelled</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="modal">
    <div class="modal">
      <h3>New Order</h3>
      <input id="m-customer" placeholder="Customer name" />
      <input id="m-amount" placeholder="Amount ($)" />
      <div class="actions">
        <button class="btn secondary" id="m-cancel">Cancel</button>
        <button class="btn primary" id="m-save">Save Order</button>
      </div>
    </div>
  </div>
  <script>
    document.getElementById('add-btn').onclick = () => document.getElementById('modal').classList.add('show');
    document.getElementById('m-cancel').onclick = () => document.getElementById('modal').classList.remove('show');
    document.getElementById('m-save').onclick = () => document.getElementById('modal').classList.remove('show');
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

test("dashboard — full interaction demo", async ({ page }) => {
  const plan = createVideoScript()
    .segment(
      "Welcome to the QA Dashboard. Let's start by navigating between the top-level tabs to explore analytics, reports, and the main overview.",
      async (pace) => {
        await clickEl(page, "#nav-analytics");
        await pace();
        await clickEl(page, "#nav-reports");
        await pace();
        await clickEl(page, "#nav-overview");
        await pace();
      },
    )
    .segment(
      "Now let's review the dashboard metrics. We have revenue, active users, total orders, and conversion rate — each card shows the current value and trend.",
      async (pace) => {
        await moveToEl(page, "#s1");
        await pace();
        await moveToEl(page, "#s2");
        await pace();
        await moveToEl(page, "#s3");
        await pace();
        await moveToEl(page, "#s4");
        await pace();
      },
    )
    .segment(
      "Let's use the keyboard shortcut Control-K to focus the search bar, then type orders to filter the results quickly.",
      async (pace) => {
        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", bubbles: true })),
        );
        await pace();
        await page.evaluate(() =>
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
          ),
        );
        await pace();
        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", bubbles: true })),
        );
        await clickEl(page, "#search");
        await pace();
        await typeKeys(page, "orders", 80, "#search");
        await pace();
      },
    )
    .segment(
      "Now we'll press Escape to clear the search field and return to the full dashboard view.",
      async (pace) => {
        await page.evaluate(() => {
          (document.querySelector("#search") as HTMLInputElement).value = "";
        });
        await pace();
        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
        );
        await pace();
      },
    )
    .segment(
      "Let's scan through the recent orders table. Each row shows the order ID, customer name, amount, and current status.",
      async (pace) => {
        for (let i = 1; i <= 4; i++) {
          await moveToEl(page, `table tbody tr:nth-child(${i}) td:nth-child(2)`);
          await pace();
        }
      },
    )
    .segment(
      "Time to create a new order. We'll click the New Order button to open the modal form, then fill in the customer name and amount before saving.",
      async (pace) => {
        await clickEl(page, "#add-btn");
        await pace();
        await clickEl(page, "#m-customer");
        await page.evaluate(() => (document.querySelector("#m-customer") as HTMLInputElement).focus());
        await typeKeys(page, "Eve Wilson", 70, "#m-customer");
        await pace();
        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })),
        );
        await page.evaluate(() => (document.querySelector("#m-amount") as HTMLInputElement).focus());
        await typeKeys(page, "199.99", 70, "#m-amount");
        await pace();
        await clickEl(page, "#m-save");
        await pace();
      },
    );

  await page.goto(baseUrl);

  const result = await plan.run(page);

  for (const entry of result.timeline) {
    console.log(
      `  [${entry.startMs.toFixed(0).padStart(6)}ms] "${entry.text.slice(0, 50)}…" — ${entry.durationMs.toFixed(0)}ms`,
    );
  }
  console.log(`  Total: ${result.totalMs.toFixed(0)}ms`);

  expect(await page.evaluate(() => !!document.querySelector("[data-qa-hud]"))).toBe(true);
});
