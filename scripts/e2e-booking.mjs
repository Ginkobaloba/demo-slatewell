/**
 * Drives the customer booking flow end-to-end in headless Chromium and
 * verifies the database side effects. Screenshots land in .shots/.
 *
 * Prereqs: dev or prod server on BASE_URL (default http://localhost:3000),
 * seeded database. Usage: node scripts/e2e-booking.mjs
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
await page.screenshot({ path: path.join(SHOTS, "book-1-services.png") });
check("services step renders", await page.getByText("Choose a service").isVisible());

// Skin Consultation has no deposit, so this exercises the direct
// confirm path and the calendar-of-record claim without card entry.
// The deposit + card-entry path is covered by e2e-deposit-ui.mjs.
await page.getByRole("button", { name: /Skin Consultation/ }).click();
await page.screenshot({ path: path.join(SHOTS, "book-2-staff.png") });
check("staff step renders", await page.getByText("Choose your practitioner").isVisible());

await page.getByRole("button", { name: /First available/ }).click();
check("date step renders", await page.getByText("Pick a date and time").isVisible());

// Click the first enabled date chip, then wait for slots.
await page.locator('[role="option"]:not([disabled])').first().click();
await page.waitForSelector("text=Morning", { timeout: 10000 }).catch(() => {});
await page.screenshot({ path: path.join(SHOTS, "book-3-datetime.png") });

const slotButtons = page.locator("section .grid button");
const slotCount = await slotButtons.count();
check("time slots offered", slotCount > 0, `count=${slotCount}`);
await slotButtons.first().click();

check("details step renders", await page.getByText("Your details").isVisible());
await page.fill("#firstName", "Elise");
await page.fill("#lastName", "Vandermeer");
await page.fill("#email", "elise.vandermeer@example.com");
await page.fill("#phone", "(555) 010-8841");
await page.screenshot({ path: path.join(SHOTS, "book-4-details.png") });
await page.getByRole("button", { name: "Review booking" }).click();

check("review step renders", await page.getByText("Review and confirm").isVisible());
await page.screenshot({ path: path.join(SHOTS, "book-5-review.png") });
await page.getByRole("button", { name: "Confirm booking" }).click();

await page.waitForURL(/\/confirmation\/bk_/, { timeout: 15000 });
const bookingId = page.url().split("/").pop();
check("confirmation page reached", /^bk_/.test(bookingId), page.url());
await page.screenshot({ path: path.join(SHOTS, "book-6-confirmation.png") });
check(
  "confirmation greets customer",
  await page.getByText(/You're booked, Elise/).isVisible()
);

await browser.close();

// Database side effects.
const db = new Database(path.join(ROOT, "data", "slatewell.db"), {
  readonly: true,
});
const booking = db
  .prepare("SELECT * FROM bookings WHERE id = ?")
  .get(bookingId);
check("booking row exists", Boolean(booking));
check("booking Confirmed", booking?.status === "Confirmed", booking?.status);
check(
  "deposit Held for deposit service",
  booking?.deposit_cents > 0 ? booking?.deposit_status === "Held" : true,
  booking?.deposit_status
);
const comms = db
  .prepare("SELECT channel, kind FROM communications WHERE booking_id = ?")
  .all(bookingId);
check(
  "confirmation sms + email logged",
  comms.filter((c) => c.kind === "confirmation").length === 2,
  JSON.stringify(comms)
);
const customer = db
  .prepare("SELECT * FROM customers WHERE id = ?")
  .get(booking?.customer_id);
check(
  "customer created with new tag",
  customer?.first_name === "Elise" && customer?.tags.includes("new"),
  JSON.stringify(customer)
);

process.exit(failures === 0 ? 0 : 1);
