/**
 * Drives the FULL customer deposit flow in a real browser, including typing
 * a test card into Stripe Elements, and verifies the hold lands. This is
 * the "real card entry" proof: nothing is mocked on the client; Stripe.js
 * posts the card to Stripe and authorizes a manual-capture hold.
 *
 * Prereqs: dev/prod server on BASE_URL (default http://localhost:3000) with
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY + STRIPE_SECRET_KEY configured, seeded
 * database. Usage: node scripts/e2e-deposit-ui.mjs
 */
import { chromium } from "playwright";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = path.join(ROOT, ".shots");

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(`${BASE_URL}/book/wave-wellness`);

// Signature Facial holds a $25 deposit -> triggers the card-entry step.
await page.getByRole("button", { name: /Signature Facial/ }).click();
await page.getByRole("button", { name: /First available/ }).click();
await page.locator('[role="option"]:not([disabled])').first().click();
await page.waitForSelector("text=Morning", { timeout: 10000 }).catch(() => {});
const slotButtons = page.locator("section .grid button");
await slotButtons.first().click();

await page.fill("#firstName", "Cara");
await page.fill("#lastName", "Whitlock");
await page.fill("#email", "cara.whitlock@example.com");
await page.fill("#phone", "(555) 010-9931");
await page.getByRole("button", { name: "Review booking" }).click();

check(
  "review shows continue-to-deposit",
  await page.getByRole("button", { name: /Continue to deposit/ }).isVisible(),
);
await page.getByRole("button", { name: /Continue to deposit/ }).click();

check(
  "deposit step heading renders",
  await page.getByText("Secure your booking with a deposit").isVisible(),
);

// CardElement renders one combined iframe (number, expiry, cvc, zip).
const cardFrame = page.frameLocator(
  'iframe[title="Secure card payment input frame"]',
);
await cardFrame
  .locator('[name="cardnumber"]')
  .fill("4242 4242 4242 4242", { timeout: 20000 });
await cardFrame.locator('[name="exp-date"]').fill("12 / 34");
await cardFrame.locator('[name="cvc"]').fill("123");
await cardFrame.locator('[name="postal"]').fill("10001");
await page.screenshot({ path: path.join(SHOTS, "deposit-1-card-entry.png") });

await page.getByRole("button", { name: /Hold .* & confirm booking/ }).click();

await page.waitForURL(/\/confirmation\/bk_/, { timeout: 30000 });
const bookingId = page.url().split("/").pop();
check("confirmation reached after card entry", /^bk_/.test(bookingId), page.url());
check(
  "deposit shown as held on confirmation",
  await page.getByText(/\$25 held/).isVisible(),
);
await page.screenshot({ path: path.join(SHOTS, "deposit-2-confirmation.png") });

await browser.close();

// DB proof: a real (non-mock) PaymentIntent is attached and Held.
const db = new Database(path.join(ROOT, "data", "slatewell.db"), {
  readonly: true,
});
const booking = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
db.close();
check("booking Confirmed", booking?.status === "Confirmed", booking?.status);
check("deposit Held", booking?.deposit_status === "Held", booking?.deposit_status);
check(
  "real Stripe PaymentIntent attached",
  typeof booking?.stripe_payment_intent_id === "string" &&
    booking.stripe_payment_intent_id.startsWith("pi_") &&
    !booking.stripe_payment_intent_id.startsWith("pi_mock"),
  booking?.stripe_payment_intent_id,
);

process.exit(failures === 0 ? 0 : 1);
