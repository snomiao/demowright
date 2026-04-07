/**
 * Example 3: E-commerce checkout flow
 * Full HUD demo — browsing products, adding to cart, filling checkout form,
 * with cursor + keyboard + modifiers all visible.
 */
import http from "node:http";
import { test, expect } from "@playwright/test";
import { moveToEl, clickEl, typeKeys } from "../src/helpers.js";
import { createVideoScript } from "../src/video-script.js";

const HTML = `<!DOCTYPE html>
<html><head><title>03 Form Interaction</title><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #f8f9fa; color: #333; }
  .navbar { background: #fff; padding: 14px 30px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .navbar .brand { font-weight: 700; font-size: 20px; color: #6c5ce7; }
  .navbar .cart-btn { padding: 8px 16px; background: #6c5ce7; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
  .navbar .cart-btn .count { background: #fd79a8; border-radius: 50%; padding: 1px 6px; font-size: 11px; margin-left: 6px; }
  h2 { padding: 20px 30px 10px; color: #2d3436; }
  .products { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding: 10px 30px 30px; }
  .product { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); transition: transform 0.2s; }
  .product:hover { transform: translateY(-4px); box-shadow: 0 6px 20px rgba(0,0,0,0.12); }
  .product .img { height: 160px; display: flex; align-items: center; justify-content: center; font-size: 64px; }
  .product .img.purple { background: linear-gradient(135deg, #a29bfe, #6c5ce7); }
  .product .img.pink { background: linear-gradient(135deg, #fd79a8, #e84393); }
  .product .img.blue { background: linear-gradient(135deg, #74b9ff, #0984e3); }
  .product .info { padding: 16px; }
  .product .info h3 { font-size: 16px; margin-bottom: 4px; }
  .product .info .price { color: #6c5ce7; font-weight: 700; font-size: 18px; }
  .product .info .desc { color: #636e72; font-size: 13px; margin: 6px 0 12px; }
  .product .info button { width: 100%; padding: 10px; background: #6c5ce7; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; transition: background 0.2s; }
  .product .info button:hover { background: #5a4bd1; }
  .product .info button.added { background: #00b894; }
  .checkout-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; align-items: center; justify-content: center; }
  .checkout-overlay.show { display: flex; }
  .checkout { background: #fff; border-radius: 16px; width: 480px; max-height: 90vh; overflow-y: auto; }
  .checkout .ch-header { padding: 24px; border-bottom: 1px solid #eee; }
  .checkout .ch-header h3 { font-size: 20px; }
  .checkout .ch-body { padding: 24px; }
  .checkout .field { margin-bottom: 14px; }
  .checkout .field label { display: block; font-size: 13px; color: #636e72; margin-bottom: 4px; font-weight: 600; }
  .checkout .field input, .checkout .field select { width: 100%; padding: 10px 12px; border: 2px solid #dfe6e9; border-radius: 8px; font-size: 14px; transition: border-color 0.2s; }
  .checkout .field input:focus, .checkout .field select:focus { outline: none; border-color: #6c5ce7; }
  .checkout .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .checkout .ch-footer { padding: 20px 24px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
  .checkout .total { font-size: 18px; font-weight: 700; color: #6c5ce7; }
  .checkout .pay-btn { padding: 12px 28px; background: #6c5ce7; color: #fff; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; }
  .checkout .pay-btn:hover { background: #5a4bd1; }
  .success-msg { display: none; text-align: center; padding: 40px; }
  .success-msg .icon { font-size: 60px; margin-bottom: 16px; }
  .success-msg h3 { font-size: 22px; margin-bottom: 8px; }
  .success-msg p { color: #636e72; }
</style></head><body>
  <div class="navbar">
    <span class="brand">🛍️ ShopHUD</span>
    <button class="cart-btn" id="cart-btn">🛒 Cart <span class="count" id="cart-count">0</span></button>
  </div>
  <h2>Featured Products</h2>
  <div class="products">
    <div class="product"><div class="img purple">🎧</div><div class="info"><h3>Wireless Headphones</h3><div class="price">$79.99</div><p class="desc">Premium sound, 30hr battery</p><button class="add-btn" data-price="79.99">Add to Cart</button></div></div>
    <div class="product"><div class="img pink">⌚</div><div class="info"><h3>Smart Watch</h3><div class="price">$199.99</div><p class="desc">Health tracking, GPS, waterproof</p><button class="add-btn" data-price="199.99">Add to Cart</button></div></div>
    <div class="product"><div class="img blue">📱</div><div class="info"><h3>Phone Case</h3><div class="price">$29.99</div><p class="desc">MagSafe compatible, slim fit</p><button class="add-btn" data-price="29.99">Add to Cart</button></div></div>
  </div>
  <div class="checkout-overlay" id="checkout-overlay">
    <div class="checkout">
      <div class="ch-header"><h3>Checkout</h3></div>
      <div class="ch-body" id="ch-form">
        <div class="field"><label>Full Name</label><input id="f-name" placeholder="John Doe" /></div>
        <div class="field"><label>Email</label><input id="f-email" type="email" placeholder="john@example.com" /></div>
        <div class="field"><label>Card Number</label><input id="f-card" placeholder="4242 4242 4242 4242" /></div>
        <div class="row">
          <div class="field"><label>Expiry</label><input id="f-exp" placeholder="MM/YY" /></div>
          <div class="field"><label>CVC</label><input id="f-cvc" placeholder="123" /></div>
        </div>
      </div>
      <div class="ch-footer">
        <div class="total" id="total">Total: $0.00</div>
        <button class="pay-btn" id="pay-btn">Pay Now</button>
      </div>
      <div class="success-msg" id="success-msg">
        <div class="icon">🎉</div>
        <h3>Payment Successful!</h3>
        <p>Your order has been confirmed.</p>
      </div>
    </div>
  </div>
  <script>
    let count = 0, total = 0;
    document.querySelectorAll('.add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        count++; total += parseFloat(btn.dataset.price);
        document.getElementById('cart-count').textContent = count;
        document.getElementById('total').textContent = 'Total: $' + total.toFixed(2);
        btn.textContent = '✓ Added'; btn.classList.add('added');
      });
    });
    document.getElementById('cart-btn').onclick = () => document.getElementById('checkout-overlay').classList.add('show');
    document.getElementById('pay-btn').onclick = () => {
      document.getElementById('ch-form').style.display = 'none';
      document.querySelector('.ch-footer').style.display = 'none';
      document.getElementById('success-msg').style.display = 'block';
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

test("e-commerce checkout — browse, add to cart, pay", async ({ page }) => {
  const plan = createVideoScript()
    .segment(
      "Welcome to ShopHUD, an online store demo. Let's browse the product catalog and hover over each item to see the details.",
      async (pace) => {
        await moveToEl(page, ".product:nth-child(1)");
        await pace();
        await moveToEl(page, ".product:nth-child(2)");
        await pace();
        await moveToEl(page, ".product:nth-child(3)");
        await pace();
      },
    )
    .segment(
      "Now we'll add the wireless headphones and the smart watch to our shopping cart by clicking the Add to Cart buttons.",
      async (pace) => {
        await clickEl(page, ".product:nth-child(1) .add-btn");
        await pace();
        await clickEl(page, ".product:nth-child(2) .add-btn");
        await pace();
      },
    )
    .segment(
      "Great, two items added. Let's open the cart and proceed to the checkout form.",
      async (pace) => {
        await clickEl(page, "#cart-btn");
        await pace();
      },
    )
    .segment(
      "Time to fill in the checkout form. We'll type the customer name, then tab through each field entering the email address, credit card number, expiry date, and security code.",
      async (pace) => {
        await clickEl(page, "#f-name");
        await pace();
        await typeKeys(page, "Jane Doe", 65, "#f-name");
        await pace();

        // Tab to email
        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })),
        );
        await page.evaluate(() => (document.querySelector("#f-email") as HTMLInputElement).focus());
        await moveToEl(page, "#f-email");
        await pace();
        await typeKeys(page, "jane@example.com", 55, "#f-email");
        await pace();

        // Tab to card number
        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })),
        );
        await page.evaluate(() => (document.querySelector("#f-card") as HTMLInputElement).focus());
        await moveToEl(page, "#f-card");
        await pace();
        await typeKeys(page, "4242 4242 4242 4242", 50, "#f-card");
        await pace();

        // Tab to expiry
        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })),
        );
        await page.evaluate(() => (document.querySelector("#f-exp") as HTMLInputElement).focus());
        await typeKeys(page, "12/28", 70, "#f-exp");
        await pace();

        // Tab to CVC
        await page.evaluate(() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })),
        );
        await page.evaluate(() => (document.querySelector("#f-cvc") as HTMLInputElement).focus());
        await typeKeys(page, "456", 80, "#f-cvc");
        await pace();
      },
    )
    .segment(
      "Everything looks good. Let's click Pay Now to complete the purchase and confirm the order.",
      async (pace) => {
        await clickEl(page, "#pay-btn");
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

  // Verify success
  const success = await page.evaluate(() => document.getElementById("success-msg")?.style.display);
  expect(success).toBe("block");
});
