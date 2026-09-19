/**
 * W3 regression: a failed Stripe.js load must not strand the deposit step.
 *
 * getStripeClient()'s dynamic import (or the loadStripe() call it wraps) can
 * reject -- a network hiccup, or js.stripe.com itself unreachable. Before
 * D-017's fix, that rejection was never caught: the promise stayed cached
 * forever (so a retry replayed the same rejection), <Elements> never
 * resolved a stripe instance (so DepositForm's submit button stuck on
 * "Preparing secure payment..." with no way out), and the rejection surfaced
 * as an uncaught error in the page.
 *
 * This script reproduces the failure for real by aborting every request to
 * js.stripe.com -- exactly what every fake-key browser run in this repo
 * already does (loadStripe() cannot find window.Stripe once its script tag
 * fails to load, so @stripe/stripe-js/pure's promise rejects with "Failed to
 * load Stripe.js"; see node_modules/@stripe/stripe-js/dist/pure.js). It
 * proves: a clear error with a Retry button appears instead of the button
 * hanging, Retry re-attempts cleanly (no stuck/duplicate state), and zero
 * uncaught exceptions or unhandled rejections happen in the page.
 *
 * Prereqs: dev/prod server on BASE_URL (default http://localhost:3000),
 * seeded database. Usage: node scripts/e2e-stripe-load-failure.mjs
 */
import { chromium } from "playwright";
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

const waitVisible = async (locator, timeout = 15000) => {
  try {
    await locator.waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(String(err)));

// Same abort every browser run in this repo already applies to *.stripe.com
// with the fake keys -- this is not a synthetic condition.
await page.route("https://js.stripe.com/**", (route) => route.abort());

await page.goto(`${BASE_URL}/book/wave-wellness`);
// Signature Facial holds a deposit -> reaches the card-entry step.
await page.getByRole("button", { name: /Signature Facial/ }).click();
await page.getByRole("button", { name: /First available/ }).click();

const dateChips = page.locator(
  '[role="listbox"][aria-label="Date"] [role="option"]:not([disabled])',
);
await dateChips.first().waitFor({ timeout: 15000 });
const slotButtons = page.locator('[aria-live="polite"] button');
const chipCount = await dateChips.count();
for (let i = 0; i < chipCount; i++) {
  await dateChips.nth(i).click();
  await slotButtons
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  if ((await slotButtons.count()) > 0) break;
}
check("time slots offered", (await slotButtons.count()) > 0);
await slotButtons.first().click();

await page.fill("#firstName", "Nia");
await page.fill("#lastName", "Okafor");
await page.fill("#email", "nia.okafor@example.com");
await page.fill("#phone", "(555) 010-2277");
await page.getByRole("button", { name: "Review booking" }).click();
await page.getByRole("button", { name: /Continue to deposit/ }).click();

const stuckButton = page.getByRole("button", {
  name: "Preparing secure payment...",
});
const errorText = page.getByText(
  /We could not load the secure payment form/,
);
const retryButton = page.getByRole("button", { name: "Retry" });

check(
  "load failure surfaces a clear error",
  await waitVisible(errorText),
);
check(
  "the button is NOT stuck on 'Preparing secure payment...'",
  (await stuckButton.count()) === 0,
);
check("a Retry button is offered", await waitVisible(retryButton));
await page.screenshot({
  path: path.join(SHOTS, "stripe-load-failure-1-error.png"),
});

// Retry re-attempts the (still-blocked) load. It must re-surface the same
// clean error, not hang, duplicate state, or throw.
await retryButton.click();
check(
  "retry re-surfaces the same clear error",
  await waitVisible(errorText),
);
check(
  "retry does not leave the button stuck either",
  (await stuckButton.count()) === 0,
);
await page.screenshot({
  path: path.join(SHOTS, "stripe-load-failure-2-retry.png"),
});

check(
  "no uncaught exception or unhandled rejection in the page",
  pageErrors.length === 0,
  JSON.stringify(pageErrors),
);

await browser.close();
process.exit(failures === 0 ? 0 : 1);
