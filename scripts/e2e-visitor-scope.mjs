/**
 * Two-browser e2e for the per-visitor demo scope and signed admin sessions
 * (D-014). Drives real Chromium contexts against a running server.
 *
 * Browser A books through the wizard. Browser B, a separate context with its
 * own cookies, must not see A's booking anywhere: not on the confirmation
 * page or .ics, not in the admin schedule, and admin actions on it are 404.
 * A third context proves a forged cookie (right name, no signature) and a
 * copied session cookie are both rejected.
 *
 * Prereqs: `next start` (or dev) on BASE_URL (default http://localhost:3000)
 * with SESSION_SECRET set, and a freshly seeded SCRATCH database
 * (SLATEWELL_DB_PATH). Mutates that database. Never point this at a live
 * deployment. Usage: node scripts/e2e-visitor-scope.mjs
 */
import { chromium } from "playwright";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH =
  process.env.SLATEWELL_DB_PATH ?? path.join(ROOT, "data", "slatewell.db");
const SLUG = "wave-wellness";
const A_FIRST = "Aurora";
const A_LAST = "Quillfeather";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
};

const browser = await chromium.launch();

// --- Browser A books through the real wizard -------------------------------
const ctxA = await browser.newContext();
const pageA = await ctxA.newPage();
await pageA.goto(`${BASE_URL}/book/${SLUG}`);
await pageA.getByRole("button", { name: /Skin Consultation/ }).click();
await pageA.getByRole("button", { name: /First available/ }).click();
// Walk the open date chips until one offers times (late in the day, today's
// chip is enabled but can be past the same-day lead time).
const dateChips = pageA.locator('[role="listbox"][aria-label="Date"] [role="option"]:not([disabled])');
await dateChips.first().waitFor({ timeout: 15000 });
const slotButtons = pageA.locator('[aria-live="polite"] button');
const chipCount = await dateChips.count();
for (let i = 0; i < chipCount; i++) {
  await dateChips.nth(i).click();
  await slotButtons.first().waitFor({ timeout: 5000 }).catch(() => {});
  if ((await slotButtons.count()) > 0) break;
}
await slotButtons.first().click();
await pageA.getByText("Your details").waitFor({ timeout: 10000 }).catch(() => {});
check("A: details step renders", await pageA.getByText("Your details").isVisible());
check(
  "A: booking form shows the demo notice",
  await pageA
    .getByText("This is a demo. Please don't enter real personal details.")
    .isVisible(),
);
await pageA.fill("#firstName", A_FIRST);
await pageA.fill("#lastName", A_LAST);
await pageA.fill("#email", "aurora.quillfeather@example.com");
await pageA.fill("#phone", "(555) 010-4242");
await pageA.getByRole("button", { name: "Review booking" }).click();
await pageA.getByRole("button", { name: "Confirm booking" }).click();
await pageA.waitForURL(/\/confirmation\/bk_/, { timeout: 15000 });
const confirmationUrl = pageA.url();
const bookingId = confirmationUrl.split("/").pop();
check("A: confirmation reached", /^bk_[0-9a-f]+$/.test(bookingId ?? ""), confirmationUrl);
check("A: confirmation greets A", await pageA.getByText(`You're booked, ${A_FIRST}.`).isVisible());
const icsA = await ctxA.request.get(`${confirmationUrl}/ics`);
check("A: own .ics downloads", icsA.status() === 200, String(icsA.status()));
const cookiesA = await ctxA.cookies();
const visitorA = cookiesA.find((c) => c.name === "slatewell_visitor");
check("A: visitor cookie is HttpOnly + Lax", Boolean(visitorA?.httpOnly) && visitorA?.sameSite === "Lax", JSON.stringify(visitorA));

const db = new Database(DB_PATH, { readonly: true });
const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
db.close();
check("DB: booking tagged with A's visitor id", row?.visitor_id === visitorA?.value && row?.seeded === 0, JSON.stringify(row));
const bookingDate = row?.start_at?.slice(0, 10);

// --- Browser B: a different visitor ---------------------------------------
const ctxB = await browser.newContext();
const pageB = await ctxB.newPage();
const confB = await pageB.goto(confirmationUrl);
check("B: A's confirmation page is 404", confB?.status() === 404, String(confB?.status()));
check("B: A's name not on that page", !(await pageB.content()).includes(A_LAST));
const icsB = await ctxB.request.get(`${confirmationUrl}/ics`);
check("B: A's .ics is 404", icsB.status() === 404, String(icsB.status()));

// B signs in with the one-click demo button.
await pageB.goto(`${BASE_URL}/`);
await pageB.getByRole("button", { name: /Sign in as demo admin/ }).first().click();
await pageB.waitForURL(/\/admin$/, { timeout: 15000 });
check("B: demo sign-in lands on the dashboard", await pageB.getByText("Deposits held").first().isVisible());
await pageB.goto(`${BASE_URL}/admin/schedule?date=${bookingDate}`);
const scheduleB = await pageB.content();
check("B: admin schedule renders seed data", scheduleB.includes("one calendar of record"));
check("B: A's booking absent from B's admin schedule", !scheduleB.includes(A_LAST) && !scheduleB.includes(bookingId));
const crossComplete = await pageB.evaluate(async (id) => {
  const r = await fetch(`/api/admin/bookings/${id}/complete`, { method: "POST" });
  return r.status;
}, bookingId);
check("B: complete on A's booking is 404", crossComplete === 404, String(crossComplete));
const crossNoShow = await pageB.evaluate(async (id) => {
  const r = await fetch(`/api/admin/bookings/${id}/no-show`, { method: "POST" });
  return r.status;
}, bookingId);
check("B: no-show on A's booking is 404", crossNoShow === 404, String(crossNoShow));

// --- A signs in and does see its own booking ------------------------------
await pageA.goto(`${BASE_URL}/`);
await pageA.getByRole("button", { name: /Sign in as demo admin/ }).first().click();
await pageA.waitForURL(/\/admin$/, { timeout: 15000 });
await pageA.goto(`${BASE_URL}/admin/schedule?date=${bookingDate}`);
check("A: own booking visible in A's admin schedule", (await pageA.content()).includes(A_LAST));
const sessionA = (await ctxA.cookies()).find((c) => c.name === "slatewell_admin_session");

// --- Browser C: forged and copied cookies ---------------------------------
const ctxC = await browser.newContext();
await ctxC.addCookies([{ name: "slatewell_admin_session", value: "demo-admin", url: BASE_URL }]);
const pageC = await ctxC.newPage();
await pageC.goto(`${BASE_URL}/admin`);
check("C: forged cookie is sent home", pageC.url().endsWith("/?admin=required"), pageC.url());
const forgedApi = await ctxC.request.post(`${BASE_URL}/api/admin/bookings/${bookingId}/complete`);
check("C: forged cookie -> admin API 401", forgedApi.status() === 401, String(forgedApi.status()));

const ctxD = await browser.newContext();
await ctxD.addCookies([{ name: "slatewell_admin_session", value: sessionA?.value ?? "", url: BASE_URL }]);
const pageD = await ctxD.newPage();
await pageD.goto(`${BASE_URL}/admin/schedule?date=${bookingDate}`);
check("D: A's session copied without A's visitor cookie is sent home", pageD.url().endsWith("/?admin=required"), pageD.url());

await browser.close();
process.exit(failures === 0 ? 0 : 1);
