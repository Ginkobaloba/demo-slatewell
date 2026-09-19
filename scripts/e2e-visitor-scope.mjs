/**
 * Two-browser e2e for the per-visitor demo scope, signed admin sessions,
 * signed visitor cookies, and server-side sign-out (D-014, D-015, D-016).
 * Drives real Chromium contexts against a running server.
 *
 * Browser A books through the wizard. Browser B, a separate context with its
 * own cookies, must not see A's booking anywhere: not on the confirmation
 * page or .ics, not in the admin schedule, and admin actions on it are 404.
 * Browser C proves a forged admin cookie (right name, no signature) and a
 * copied session cookie are both rejected. Browsers T and U carry A's
 * visitor id with a tampered tag and unsigned (the pre-D-016 format): they
 * are not A, and booking from them issues a fresh signed visitor. Browser E
 * holds a copy of A's full cookie pair: it works until A clicks Sign out,
 * then every admin page and admin API refuses it.
 *
 * Works against `next dev`, `next start`, AND the production image. The
 * production image sets Secure cookies, and Playwright's APIRequestContext
 * (context.request) does not send Secure cookies to http://127.0.0.1, while
 * the browser itself does (127.0.0.1 is a potentially trustworthy origin).
 * So every HTTP call here goes through the page (navigation or in-page
 * fetch), exactly like a real browser; cookie security is never weakened.
 *
 * Prereqs: a server on BASE_URL (default http://localhost:3000) with
 * SESSION_SECRET set, backed by a freshly seeded SCRATCH database. Mutates
 * that database. Never point this at a live deployment.
 *   - Local server: the DB is read at SLATEWELL_DB_PATH (default
 *     data/slatewell.db).
 *   - Container: set E2E_DB_CONTAINER=<container name>; the DB is read with
 *     `docker exec <name> node ...` at E2E_CONTAINER_DB_PATH (default
 *     /app/data/slatewell.db).
 * Usage: node scripts/e2e-visitor-scope.mjs
 */
import { chromium } from "playwright";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH =
  process.env.SLATEWELL_DB_PATH ?? path.join(ROOT, "data", "slatewell.db");
const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "";
const CONTAINER_DB_PATH =
  process.env.E2E_CONTAINER_DB_PATH ?? "/app/data/slatewell.db";
const SLUG = "wave-wellness";
const A_FIRST = "Aurora";
const A_LAST = "Quillfeather";
const SIGNED_VISITOR_RE = /^[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/;

const ADMIN_PAGES = [
  "/admin",
  "/admin/schedule",
  "/admin/services",
  "/admin/staff",
  "/admin/customers",
  "/admin/communications",
  "/admin/reports",
  "/admin/settings",
];

let failures = 0;
let passes = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (ok) passes++;
  else failures++;
};

/** One booking row, read from the scratch DB (local file or container). */
async function readBooking(bookingId) {
  if (DB_CONTAINER) {
    const script =
      "const D=require('better-sqlite3');" +
      "const db=new D(process.argv[1],{readonly:true});" +
      "console.log(JSON.stringify(db.prepare('SELECT id, visitor_id, seeded, start_at FROM bookings WHERE id = ?').get(process.argv[2]) ?? null));";
    const out = execFileSync(
      "docker",
      ["exec", DB_CONTAINER, "node", "-e", script, CONTAINER_DB_PATH, bookingId],
      { encoding: "utf8" },
    );
    return JSON.parse(out.trim());
  }
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(DB_PATH, { readonly: true });
  const row = db.prepare("SELECT id, visitor_id, seeded, start_at FROM bookings WHERE id = ?").get(bookingId);
  db.close();
  return row ?? null;
}

/**
 * HTTP from inside the page: the browser attaches its own cookies (Secure
 * ones included on a trustworthy origin), same as the real app's fetches.
 */
async function pageFetch(page, url, init = {}) {
  return page.evaluate(
    async ({ url, init }) => {
      const r = await fetch(url, { redirect: "manual", ...init });
      return { status: r.status, body: await r.text() };
    },
    { url, init },
  );
}

// ctx.cookies() with no URL filter: filtering by an http:// URL would drop
// the Secure cookies the production build sets.
const visitorOf = async (ctx) =>
  (await ctx.cookies()).find((c) => c.name === "slatewell_visitor");

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
const confirmationPath = new URL(confirmationUrl).pathname;
check("A: confirmation reached", /^bk_[0-9a-f]+$/.test(bookingId ?? ""), confirmationUrl);
check("A: confirmation greets A", await pageA.getByText(`You're booked, ${A_FIRST}.`).isVisible());
const icsA = await pageFetch(pageA, `${confirmationPath}/ics`);
check("A: own .ics downloads", icsA.status === 200 && icsA.body.includes("BEGIN:VCALENDAR"), String(icsA.status));
const visitorA = await visitorOf(ctxA);
check("A: visitor cookie is HttpOnly + Lax", Boolean(visitorA?.httpOnly) && visitorA?.sameSite === "Lax", JSON.stringify({ ...visitorA, value: "<redacted>" }));
check("A: visitor cookie is signed (<id>.<tag>)", SIGNED_VISITOR_RE.test(visitorA?.value ?? ""));
const visitorIdA = (visitorA?.value ?? "").split(".")[0];
const tagA = (visitorA?.value ?? "").split(".")[1] ?? "";

const row = await readBooking(bookingId);
check("DB: booking tagged with A's visitor id", row?.visitor_id === visitorIdA && row?.seeded === 0, JSON.stringify(row));
const bookingDate = row?.start_at?.slice(0, 10);

// --- Browser B: a different visitor ---------------------------------------
const ctxB = await browser.newContext();
const pageB = await ctxB.newPage();
const confB = await pageB.goto(confirmationUrl);
check("B: A's confirmation page is 404", confB?.status() === 404, String(confB?.status()));
check("B: A's name not on that page", !(await pageB.content()).includes(A_LAST));
const icsB = await pageFetch(pageB, `${confirmationPath}/ics`);
check("B: A's .ics is 404", icsB.status === 404, String(icsB.status));

// B signs in with the one-click demo button.
await pageB.goto(`${BASE_URL}/`);
await pageB.getByRole("button", { name: /Sign in as demo admin/ }).first().click();
await pageB.waitForURL(/\/admin$/, { timeout: 15000 });
check("B: demo sign-in lands on the dashboard", await pageB.getByText("Deposits held").first().isVisible());
await pageB.goto(`${BASE_URL}/admin/schedule?date=${bookingDate}`);
const scheduleB = await pageB.content();
check("B: admin schedule renders seed data", scheduleB.includes("one calendar of record"));
check("B: A's booking absent from B's admin schedule", !scheduleB.includes(A_LAST) && !scheduleB.includes(bookingId));
const crossComplete = await pageFetch(pageB, `/api/admin/bookings/${bookingId}/complete`, { method: "POST" });
check("B: complete on A's booking is 404", crossComplete.status === 404, String(crossComplete.status));
const crossNoShow = await pageFetch(pageB, `/api/admin/bookings/${bookingId}/no-show`, { method: "POST" });
check("B: no-show on A's booking is 404", crossNoShow.status === 404, String(crossNoShow.status));

// --- A signs in and does see its own booking ------------------------------
await pageA.goto(`${BASE_URL}/`);
await pageA.getByRole("button", { name: /Sign in as demo admin/ }).first().click();
await pageA.waitForURL(/\/admin$/, { timeout: 15000 });
await pageA.goto(`${BASE_URL}/admin/schedule?date=${bookingDate}`);
check("A: own booking visible in A's admin schedule", (await pageA.content()).includes(A_LAST));
const cookiesAfterSignIn = await ctxA.cookies();
const sessionA = cookiesAfterSignIn.find((c) => c.name === "slatewell_admin_session");
// Guard: every replay check below is meaningless without A's real session.
check("A: captured A's signed admin session cookie", (sessionA?.value ?? "").split(".").length === 3);
check("A: sign-in kept A's signed visitor cookie", (await visitorOf(ctxA))?.value === visitorA?.value);

// --- Browser C: forged and copied cookies ---------------------------------
const ctxC = await browser.newContext();
await ctxC.addCookies([{ name: "slatewell_admin_session", value: "demo-admin", url: BASE_URL }]);
const pageC = await ctxC.newPage();
await pageC.goto(`${BASE_URL}/admin`);
check("C: forged cookie is sent home", pageC.url().endsWith("/?admin=required"), pageC.url());
const forgedApi = await pageFetch(pageC, `/api/admin/bookings/${bookingId}/complete`, { method: "POST" });
check("C: forged cookie -> admin API 401", forgedApi.status === 401, String(forgedApi.status));

const ctxD = await browser.newContext();
await ctxD.addCookies([{ name: "slatewell_admin_session", value: sessionA?.value ?? "", url: BASE_URL }]);
const pageD = await ctxD.newPage();
await pageD.goto(`${BASE_URL}/admin/schedule?date=${bookingDate}`);
check("D: A's session copied without A's visitor cookie is sent home", pageD.url().endsWith("/?admin=required"), pageD.url());

// --- Browsers T and U: untrusted visitor cookies claiming A's id (D-016) --
const flippedTag = tagA.slice(0, 7) + (tagA[7] === "A" ? "B" : "A") + tagA.slice(8);
for (const [label, value] of [
  ["T (A's id, tampered tag)", `${visitorIdA}.${flippedTag}`],
  ["U (A's id, unsigned pre-D-016 cookie)", visitorIdA],
]) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "slatewell_visitor", value, url: BASE_URL }]);
  const page = await ctx.newPage();
  const conf = await page.goto(confirmationUrl);
  check(`${label}: A's confirmation page is 404`, conf?.status() === 404, String(conf?.status()));
  const ics = await pageFetch(page, `${confirmationPath}/ics`);
  check(`${label}: A's .ics is 404`, ics.status === 404, String(ics.status));
  // With A's session too, the admin gate still refuses: the visitor half of
  // the pair does not verify.
  await ctx.addCookies([{ name: "slatewell_admin_session", value: sessionA?.value ?? "", url: BASE_URL }]);
  await page.goto(`${BASE_URL}/admin`);
  check(`${label}: A's session + this visitor cookie is sent home`, page.url().endsWith("/?admin=required"), page.url());
  await ctx.clearCookies({ name: "slatewell_admin_session" });
  // Booking from here works, but as a NEW visitor with a fresh signed cookie.
  const avail = await pageFetch(page, `/api/book/${SLUG}/availability?serviceId=3&date=${bookingDate}`);
  let booked = null;
  if (avail.status === 200) {
    const slots = JSON.parse(avail.body).slots ?? [];
    for (const s of slots.slice(-4)) {
      const r = await pageFetch(page, `/api/book/${SLUG}/bookings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceId: 3,
          staffId: s.staffId,
          date: bookingDate,
          time: s.time,
          customer: { firstName: "Mallory", lastName: "Probe", email: "mallory@example.com", phone: "5550100000" },
        }),
      });
      if (r.status === 201) {
        booked = JSON.parse(r.body).id;
        break;
      }
    }
  }
  check(`${label}: booking still succeeds`, Boolean(booked), avail.status);
  const fresh = await visitorOf(ctx);
  const freshId = (fresh?.value ?? "").split(".")[0];
  check(`${label}: a fresh signed visitor cookie replaced the untrusted one`,
    SIGNED_VISITOR_RE.test(fresh?.value ?? "") && freshId !== visitorIdA);
  const freshRow = booked ? await readBooking(booked) : null;
  check(`${label}: the booking belongs to the fresh visitor, not A`,
    freshRow?.visitor_id === freshId && freshRow?.visitor_id !== visitorIdA, JSON.stringify(freshRow));
  await ctx.close();
}

// --- Browser E: a captured copy of A's full cookie pair (D-015) -----------
const ctxE = await browser.newContext();
await ctxE.addCookies(cookiesAfterSignIn);
const pageE = await ctxE.newPage();
await pageE.goto(`${BASE_URL}/admin`);
check("E: before sign-out, A's captured cookie pair opens the dashboard (the replay risk)",
  pageE.url().endsWith("/admin") && (await pageE.getByText("Deposits held").first().isVisible()), pageE.url());

// A signs out with the real button.
await pageA.goto(`${BASE_URL}/admin`);
await pageA.locator("button:visible", { hasText: "Sign out" }).first().click();
await pageA.waitForURL((u) => u.pathname === "/", { timeout: 15000 });
check("A: sign-out lands on the landing page", new URL(pageA.url()).pathname === "/", pageA.url());
check("A: sign-out cleared A's session cookie",
  !(await ctxA.cookies()).some((c) => c.name === "slatewell_admin_session"));

// The captured pair is now refused on every admin page...
for (const p of ADMIN_PAGES) {
  await pageE.goto(`${BASE_URL}${p}`);
  await pageE.waitForURL(/\/\?admin=required$/, { timeout: 10000 }).catch(() => {});
  const html = await pageE.content();
  check(`E: after sign-out, ${p} sends the captured pair home`,
    pageE.url().endsWith("/?admin=required") && !html.includes("Deposits held"), pageE.url());
}
// ...and every admin API.
const serviceBody = JSON.stringify({
  name: "Replay", description: null, duration_min: 30, price_cents: 100,
  deposit_cents: 0, buffer_before_min: 0, buffer_after_min: 0, active: 1,
});
const staffBody = JSON.stringify({ name: "Replay", title: null, color: "#000000", active: 1, serviceIds: [1], availability: [] });
const json = { "content-type": "application/json" };
for (const [label, url, init] of [
  ["complete", `/api/admin/bookings/${bookingId}/complete`, { method: "POST" }],
  ["no-show", `/api/admin/bookings/${bookingId}/no-show`, { method: "POST" }],
  ["create service", "/api/admin/services", { method: "POST", headers: json, body: serviceBody }],
  ["update service", "/api/admin/services/1", { method: "PUT", headers: json, body: serviceBody }],
  ["update staff", "/api/admin/staff/1", { method: "PUT", headers: json, body: staffBody }],
]) {
  const r = await pageFetch(pageE, url, init);
  check(`E: after sign-out, ${label} API -> 401`, r.status === 401, String(r.status));
}
// A new sign-in is a new session and works; revocation is per session.
await pageA.goto(`${BASE_URL}/`);
await pageA.getByRole("button", { name: /Sign in as demo admin/ }).first().click();
await pageA.waitForURL(/\/admin$/, { timeout: 15000 });
check("A: signing in again works after sign-out", await pageA.getByText("Deposits held").first().isVisible());
await pageB.goto(`${BASE_URL}/admin`);
check("B: B's session is unaffected by A's sign-out", pageB.url().endsWith("/admin"), pageB.url());

await browser.close();
console.log(`e2e-visitor-scope: ${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
