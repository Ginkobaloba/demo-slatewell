/**
 * Admin UI smoke + screenshots: confirms the three operator screens render
 * and that the client editors wire to the API in a real browser. The API
 * contract itself is covered by e2e-admin.mjs. Screenshots land in .shots/.
 *
 * Prereqs: dev/prod server on BASE_URL, seeded DB. Mutates one booking.
 * Usage: node scripts/e2e-admin-ui.mjs
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

// A date that has a Confirmed booking, for the schedule screen.
const d = new Database(path.join(ROOT, "data", "slatewell.db"), { readonly: true });
const row = d
  .prepare(
    `SELECT substr(start_at,1,10) AS date FROM bookings
     WHERE business_id = 1 AND status = 'Confirmed' AND start_at > datetime('now')
     ORDER BY start_at LIMIT 1`,
  )
  .get();
d.close();
const scheduleDate = row?.date;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

// Authenticate (sets the httpOnly demo-admin cookie in the browser context).
await page.goto(`${BASE_URL}/`);
await page.evaluate(() => fetch("/api/admin/session", { method: "POST" }));

// --- Dashboard --------------------------------------------------------------
await page.goto(`${BASE_URL}/admin`);
check("dashboard renders", await page.getByText("Deposits held").first().isVisible());
await page.screenshot({ path: path.join(SHOTS, "admin-1-dashboard.png") });

// --- Schedule ---------------------------------------------------------------
await page.goto(`${BASE_URL}/admin/schedule?date=${scheduleDate}`);
check("schedule renders", await page.getByText("one calendar of record").isVisible());
const completeButtons = page.getByRole("button", { name: "Complete" });
const before = await completeButtons.count();
check("schedule shows confirmed bookings with actions", before > 0, `count=${before}`);
await page.screenshot({ path: path.join(SHOTS, "admin-2-schedule.png"), fullPage: true });

// Exercise a real client->API action.
if (before > 0) {
  await completeButtons.first().click();
  await page.waitForTimeout(1500);
  const after = await page.getByRole("button", { name: "Complete" }).count();
  check("completing a booking updates the list via UI", after === before - 1, `before=${before} after=${after}`);
}

// --- Services ---------------------------------------------------------------
await page.goto(`${BASE_URL}/admin/services`);
check("services list renders", await page.getByRole("heading", { name: "Services" }).isVisible());
await page.getByRole("button", { name: /Edit Signature Facial/ }).click();
check("service editor opens", await page.getByText(/Edit Signature Facial/).isVisible());
await page.screenshot({ path: path.join(SHOTS, "admin-3-services.png"), fullPage: true });

// --- Staff ------------------------------------------------------------------
await page.goto(`${BASE_URL}/admin/staff`);
check("staff list renders", await page.getByRole("heading", { name: /Staff/ }).isVisible());
await page.getByRole("button", { name: /Edit Maya Chen/ }).click();
check("staff editor opens with availability", await page.getByText("Weekly availability").isVisible());
check("capability toggles present", await page.getByRole("button", { name: "Microneedling" }).isVisible());
await page.screenshot({ path: path.join(SHOTS, "admin-4-staff.png"), fullPage: true });

await browser.close();
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
