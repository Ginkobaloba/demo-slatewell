/**
 * Integration tests for the admin exposure fix (D-014).
 *
 *   npx tsx scripts/test-admin-security.ts
 *
 * Runs the real middleware and route handlers against a throwaway SQLite
 * file in the OS temp dir (never data/slatewell.db, never a live database).
 * Proves:
 *   - a forged cookie with the right name but no valid signature is rejected
 *     by the middleware and by every admin API handler;
 *   - a valid session copied into another browser (different visitor
 *     cookie) is rejected;
 *   - another browser's booking never appears in admin data, and admin
 *     mutations on it return 404 and change nothing;
 *   - the .ics route rejects a mismatched or missing visitor cookie;
 *   - typing another visitor's email never reuses their customer row;
 *   - with no usable SESSION_SECRET the admin area and sign-in answer 404.
 * Exits nonzero on any failure.
 */
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";

const failures: string[] = [];
let passed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed += 1;
  else failures.push(`${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
}

const SECRET = "k".repeat(48);
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "slatewell-sec-"));
const DB_PATH = path.join(TMP_DIR, "test.db");
const BASE = "http://localhost";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const TOMORROW = localDate(new Date(Date.now() + 24 * 3600_000));

function buildFixtureDb() {
  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  db.exec(fs.readFileSync(path.join(__dirname, "../src/db/schema.sql"), "utf8"));
  db.prepare(
    `INSERT INTO businesses (id, slug, name, timezone, cancellation_window_hours, created_at)
     VALUES (1, 'wave-wellness', 'Wave Wellness', 'America/New_York', 24, '2026-01-01T00:00')`,
  ).run();
  // No deposit, so the booking route never takes a Stripe path.
  db.prepare(
    `INSERT INTO services (id, business_id, name, duration_min, price_cents, deposit_cents, sort_order)
     VALUES (1, 1, 'Facial', 60, 10000, 0, 0)`,
  ).run();
  db.prepare(
    `INSERT INTO staff (id, business_id, name, color, sort_order) VALUES (1, 1, 'Maya', '#2e4057', 0)`,
  ).run();
  db.prepare(`INSERT INTO staff_services (staff_id, service_id) VALUES (1, 1)`).run();
  const avail = db.prepare(
    `INSERT INTO availability_blocks (staff_id, weekday, start_min, end_min) VALUES (1, ?, 540, 1080)`,
  );
  for (let wd = 0; wd <= 6; wd++) avail.run(wd);
  db.prepare(
    `INSERT INTO customers (id, business_id, first_name, last_name, email, phone, tags, created_at)
     VALUES (1, 1, 'Seed', 'Person', 'seed.person@example.com', '(555) 000-0000', '[]', '2026-01-01T00:00')`,
  ).run();
  db.prepare(
    `INSERT INTO bookings (id, business_id, customer_id, service_id, staff_id, start_at, end_at,
       status, price_cents, deposit_cents, cancel_token, created_at, seeded)
     VALUES ('bk_seed', 1, 1, 1, 1, ?, ?, 'Confirmed', 10000, 0, 'seedtoken', '2026-01-01T00:00', 1)`,
  ).run(`${TOMORROW}T16:00`, `${TOMORROW}T17:00`);
  db.close();
}

function req(
  url: string,
  opts: { method?: string; cookie?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.Cookie = opts.cookie;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return new NextRequest(`${BASE}${url}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

function setCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}

async function main() {
  buildFixtureDb();
  process.env.SLATEWELL_DB_PATH = DB_PATH;
  process.env.SESSION_SECRET = SECRET;
  delete process.env.STRIPE_SECRET_KEY;

  // Import after env is set: db.ts reads SLATEWELL_DB_PATH at load time.
  const { middleware } = await import("../src/middleware");
  const sessionRoute = await import("../src/app/api/admin/session/route");
  const bookingsRoute = await import("../src/app/api/book/[slug]/bookings/route");
  const completeRoute = await import("../src/app/api/admin/bookings/[bookingId]/complete/route");
  const noShowRoute = await import("../src/app/api/admin/bookings/[bookingId]/no-show/route");
  const servicesRoute = await import("../src/app/api/admin/services/route");
  const serviceRoute = await import("../src/app/api/admin/services/[id]/route");
  const staffRoute = await import("../src/app/api/admin/staff/[id]/route");
  const icsRoute = await import("../src/app/book/[slug]/confirmation/[bookingId]/ics/route");
  const { getScheduleForDate } = await import("../src/lib/admin-repo");
  const { getTodayBookings, getWeekBookings } = await import("../src/lib/admin-queries");
  const { getDb } = await import("../src/lib/db");
  const { isOwnBooking } = await import("../src/lib/scope");
  const { SignJWT } = await import("jose");
  const { ADMIN_SESSION_COOKIE, VISITOR_COOKIE } = await import("../src/lib/admin-session");

  const slugParams = { params: Promise.resolve({ slug: "wave-wellness" }) };
  const bookingParams = (bookingId: string) => ({ params: Promise.resolve({ bookingId }) });
  const icsParams = (bookingId: string) => ({
    params: Promise.resolve({ slug: "wave-wellness", bookingId }),
  });

  // --- 1. Visitor A books with no cookie: gets a visitor cookie ---------
  const bookingBody = (time: string, email: string, firstName = "Alice") => ({
    serviceId: 1,
    staffId: 1,
    date: TOMORROW,
    time,
    customer: { firstName, lastName: "Visitor", email, phone: "(555) 111-1111" },
  });
  const resA = await bookingsRoute.POST(
    req("/api/book/wave-wellness/bookings", { method: "POST", body: bookingBody("10:00", "alice@example.com") }),
    slugParams,
  );
  check("booking A: 201", resA.status === 201, resA.status);
  const bookingA = ((await resA.json()) as { id: string }).id;
  const visitorA = setCookies(resA)[VISITOR_COOKIE] ?? "";
  check("booking A: visitor cookie minted (128-bit hex)", /^[0-9a-f]{32}$/.test(visitorA), visitorA);
  const setCookieLine = resA.headers.getSetCookie().find((l) => l.startsWith(`${VISITOR_COOKIE}=`)) ?? "";
  check("visitor cookie is HttpOnly", /httponly/i.test(setCookieLine), setCookieLine);
  check("visitor cookie is SameSite=Lax", /samesite=lax/i.test(setCookieLine), setCookieLine);

  // --- 2. Visitor B (existing cookie) books, including A's email -------
  const visitorB = "b".repeat(32);
  const cookieB = `${VISITOR_COOKIE}=${visitorB}`;
  const resB = await bookingsRoute.POST(
    req("/api/book/wave-wellness/bookings", {
      method: "POST",
      cookie: cookieB,
      body: bookingBody("12:00", "alice@example.com", "Bob"),
    }),
    slugParams,
  );
  check("booking B: 201", resB.status === 201, resB.status);
  const bookingB = ((await resB.json()) as { id: string }).id;
  check("booking B: existing visitor cookie kept", !(VISITOR_COOKIE in setCookies(resB)));

  const db = getDb();
  const rowA = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingA) as {
    visitor_id: string; seeded: number; customer_id: number;
  };
  const rowB = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingB) as {
    visitor_id: string; customer_id: number;
  };
  check("booking A tagged with visitor A, not seed", rowA.visitor_id === visitorA && rowA.seeded === 0, rowA);
  check("booking B tagged with visitor B", rowB.visitor_id === visitorB, rowB);
  check("same email from another browser does NOT reuse A's customer row", rowA.customer_id !== rowB.customer_id);

  // --- 3. Sign in both browsers -----------------------------------------
  async function signIn(cookie: string) {
    const res = await sessionRoute.POST(req("/api/admin/session", { method: "POST", cookie }));
    return { res, token: setCookies(res)[ADMIN_SESSION_COOKIE] ?? "" };
  }
  const signA = await signIn(`${VISITOR_COOKIE}=${visitorA}`);
  check("sign-in A: 303 to /admin", signA.res.status === 303 && signA.res.headers.get("location") === "/admin");
  check("sign-in A: session cookie is not the old literal", signA.token !== "demo-admin" && signA.token.split(".").length === 3);
  const signB = await signIn(cookieB);
  const sessionA = `${ADMIN_SESSION_COOKIE}=${signA.token}; ${VISITOR_COOKIE}=${visitorA}`;
  const sessionB = `${ADMIN_SESSION_COOKIE}=${signB.token}; ${cookieB}`;

  const fresh = await sessionRoute.POST(req("/api/admin/session", { method: "POST" }));
  const freshJar = setCookies(fresh);
  check("sign-in with no visitor cookie mints one and binds to it", /^[0-9a-f]{32}$/.test(freshJar[VISITOR_COOKIE] ?? ""));

  // --- 4. Middleware -----------------------------------------------------
  const wrongSecretToken = await new SignJWT({ vid: visitorA, src: "demo", role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti("f".repeat(32))
    .setSubject("demo-admin")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("w".repeat(48)));
  const badCookies: Array<[string, string | undefined]> = [
    ["no cookie", undefined],
    ["forged name-only cookie", `${ADMIN_SESSION_COOKIE}=demo-admin`],
    ["forged cookie + real visitor cookie", `${ADMIN_SESSION_COOKIE}=demo-admin; ${VISITOR_COOKIE}=${visitorA}`],
    ["JWT signed with another secret", `${ADMIN_SESSION_COOKIE}=${wrongSecretToken}; ${VISITOR_COOKIE}=${visitorA}`],
    ["A's session replayed with B's visitor cookie", `${ADMIN_SESSION_COOKIE}=${signA.token}; ${cookieB}`],
    ["A's session with no visitor cookie", `${ADMIN_SESSION_COOKIE}=${signA.token}`],
  ];
  for (const [label, cookie] of badCookies) {
    for (const page of ["/admin", "/admin/schedule", "/admin/customers"]) {
      const res = await middleware(req(page, { cookie }));
      const loc = res.headers.get("location") ?? "";
      check(`middleware ${page}: ${label} -> redirect home`, res.status === 307 && loc.endsWith("/?admin=required"), { status: res.status, loc });
    }
    for (const api of ["/api/admin/services", `/api/admin/bookings/${bookingA}/complete`]) {
      const res = await middleware(req(api, { method: "POST", cookie }));
      check(`middleware ${api}: ${label} -> 401`, res.status === 401, res.status);
    }
  }
  const pass = await middleware(req("/admin/schedule", { cookie: sessionA }));
  check("middleware: valid bound session passes", pass.headers.get("x-middleware-next") === "1", Object.fromEntries(pass.headers));
  const passApi = await middleware(req("/api/admin/services", { method: "POST", cookie: sessionA }));
  check("middleware: valid bound session passes API", passApi.headers.get("x-middleware-next") === "1");
  const sessionEndpoint = await middleware(req("/api/admin/session", { method: "POST" }));
  check("middleware: sign-in endpoint itself is not gated", sessionEndpoint.headers.get("x-middleware-next") === "1");

  // --- 5. Every admin API handler rejects forged cookies itself ---------
  const forgedCookie = `${ADMIN_SESSION_COOKIE}=demo-admin; ${VISITOR_COOKIE}=${visitorA}`;
  const serviceBody = {
    name: "Hacked", description: null, duration_min: 30, price_cents: 100,
    deposit_cents: 0, buffer_before_min: 0, buffer_after_min: 0, active: 1,
  };
  const staffBody = { name: "Hacked", title: null, color: "#000000", active: 1, serviceIds: [1], availability: [] };
  for (const [label, cookie] of [
    ["forged", forgedCookie],
    ["wrong secret", `${ADMIN_SESSION_COOKIE}=${wrongSecretToken}; ${VISITOR_COOKIE}=${visitorA}`],
    ["replayed in another browser", `${ADMIN_SESSION_COOKIE}=${signA.token}; ${cookieB}`],
  ] as const) {
    const results: Record<string, number> = {
      complete: (await completeRoute.POST(req(`/api/admin/bookings/${bookingA}/complete`, { method: "POST", cookie }), bookingParams(bookingA))).status,
      noShow: (await noShowRoute.POST(req(`/api/admin/bookings/${bookingA}/no-show`, { method: "POST", cookie }), bookingParams(bookingA))).status,
      servicesPost: (await servicesRoute.POST(req("/api/admin/services", { method: "POST", cookie, body: serviceBody }))).status,
      servicePut: (await serviceRoute.PUT(req("/api/admin/services/1", { method: "PUT", cookie, body: serviceBody }), { params: Promise.resolve({ id: "1" }) })).status,
      staffPut: (await staffRoute.PUT(req("/api/admin/staff/1", { method: "PUT", cookie, body: staffBody }), { params: Promise.resolve({ id: "1" }) })).status,
    };
    check(`handlers: ${label} cookie -> 401 on all five admin APIs`, Object.values(results).every((s) => s === 401), results);
  }
  const svc = db.prepare("SELECT name FROM services WHERE id = 1").get() as { name: string };
  const staff = db.prepare("SELECT name FROM staff WHERE id = 1").get() as { name: string };
  check("handlers: forged calls changed nothing", svc.name === "Facial" && staff.name === "Maya", { svc, staff });
  check("booking A still Confirmed after forged calls",
    (db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingA) as { status: string }).status === "Confirmed");

  // --- 6. Scope: B never sees A's booking -------------------------------
  const scheduleB = getScheduleForDate(1, TOMORROW, visitorB).map((r) => r.id);
  check("schedule (B): excludes A's booking", !scheduleB.includes(bookingA), scheduleB);
  check("schedule (B): shows seed + B's own", scheduleB.includes("bk_seed") && scheduleB.includes(bookingB), scheduleB);
  const scheduleA = getScheduleForDate(1, TOMORROW, visitorA).map((r) => r.id);
  check("schedule (A): excludes B's booking", !scheduleA.includes(bookingB), scheduleA);
  const weekB = getWeekBookings(1, localDate(new Date()), localDate(new Date(Date.now() + 7 * 24 * 3600_000)), visitorB).map((r) => r.id);
  check("dashboard week (B): excludes A's booking", !weekB.includes(bookingA), weekB);
  const todayB = getTodayBookings(1, TOMORROW, visitorB).map((r) => r.customer_name);
  check("dashboard (B): A's customer name never appears", !todayB.includes("Alice Visitor") && todayB.includes("Bob Visitor"), todayB);

  // --- 7. Admin mutations on another browser's booking: 404 -------------
  const crossComplete = await completeRoute.POST(req(`/api/admin/bookings/${bookingA}/complete`, { method: "POST", cookie: sessionB }), bookingParams(bookingA));
  check("complete: B on A's booking -> 404", crossComplete.status === 404, crossComplete.status);
  const crossNoShow = await noShowRoute.POST(req(`/api/admin/bookings/${bookingA}/no-show`, { method: "POST", cookie: sessionB }), bookingParams(bookingA));
  check("no-show: B on A's booking -> 404", crossNoShow.status === 404, crossNoShow.status);
  check("A's booking unchanged by B",
    (db.prepare("SELECT status FROM bookings WHERE id = ?").get(bookingA) as { status: string }).status === "Confirmed");
  const unknown = await completeRoute.POST(req("/api/admin/bookings/bk_nope/complete", { method: "POST", cookie: sessionB }), bookingParams("bk_nope"));
  check("complete: unknown id -> same 404", unknown.status === 404);
  const ownComplete = await completeRoute.POST(req(`/api/admin/bookings/${bookingB}/complete`, { method: "POST", cookie: sessionB }), bookingParams(bookingB));
  check("complete: B on own booking -> 200", ownComplete.status === 200, ownComplete.status);
  const again = await completeRoute.POST(req(`/api/admin/bookings/${bookingB}/complete`, { method: "POST", cookie: sessionB }), bookingParams(bookingB));
  check("complete: own booking twice -> 409", again.status === 409, again.status);
  const seedNoShow = await noShowRoute.POST(req("/api/admin/bookings/bk_seed/no-show", { method: "POST", cookie: sessionA }), bookingParams("bk_seed"));
  check("no-show: seed booking still works for the demo -> 200", seedNoShow.status === 200, seedNoShow.status);
  const ownNoShow = await noShowRoute.POST(req(`/api/admin/bookings/${bookingA}/no-show`, { method: "POST", cookie: sessionA }), bookingParams(bookingA));
  check("no-show: A on own booking -> 200", ownNoShow.status === 200, ownNoShow.status);

  // --- 8. Public detail routes: .ics + confirmation rule ----------------
  const icsOwn = await icsRoute.GET(req(`/book/wave-wellness/confirmation/${bookingA}/ics`, { cookie: `${VISITOR_COOKIE}=${visitorA}` }), icsParams(bookingA));
  check(".ics: own browser -> 200", icsOwn.status === 200, icsOwn.status);
  const icsOther = await icsRoute.GET(req(`/book/wave-wellness/confirmation/${bookingA}/ics`, { cookie: cookieB }), icsParams(bookingA));
  check(".ics: another browser -> 404", icsOther.status === 404, icsOther.status);
  const icsNone = await icsRoute.GET(req(`/book/wave-wellness/confirmation/${bookingA}/ics`), icsParams(bookingA));
  check(".ics: no visitor cookie -> 404", icsNone.status === 404, icsNone.status);
  const icsSeed = await icsRoute.GET(req("/book/wave-wellness/confirmation/bk_seed/ics", { cookie: cookieB }), icsParams("bk_seed"));
  check(".ics: seed booking not exposed -> 404", icsSeed.status === 404, icsSeed.status);
  check("confirmation rule: own", isOwnBooking({ visitor_id: visitorA }, visitorA));
  check("confirmation rule: other", !isOwnBooking({ visitor_id: visitorA }, visitorB));
  check("confirmation rule: none", !isOwnBooking({ visitor_id: visitorA }, null));
  check("confirmation rule: legacy/seed row", !isOwnBooking({ visitor_id: null }, visitorA));

  // --- 9. Sign-out -------------------------------------------------------
  const out = await sessionRoute.POST(req("/api/admin/session?signout=1", { method: "POST", cookie: sessionA }));
  check("sign-out: 303 home", out.status === 303 && out.headers.get("location") === "/");
  check("sign-out: clears the session cookie", (setCookies(out)[ADMIN_SESSION_COOKIE] ?? "x") === "");

  // --- 10. Fail closed: no usable secret -> 404 everywhere --------------
  for (const [label, value] of [["missing", undefined], ["placeholder", "replace-with-a-real-32-plus-char-random-secret"]] as const) {
    if (value === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = value;
    const page = await middleware(req("/admin", { cookie: sessionA }));
    const api = await middleware(req("/api/admin/services", { method: "POST", cookie: sessionA }));
    const signin = await sessionRoute.POST(req("/api/admin/session", { method: "POST" }));
    const handler = await completeRoute.POST(req(`/api/admin/bookings/${bookingA}/complete`, { method: "POST", cookie: sessionA }), bookingParams(bookingA));
    check(`secret ${label}: middleware page -> 404`, page.status === 404, page.status);
    check(`secret ${label}: middleware API -> 404`, api.status === 404, api.status);
    check(`secret ${label}: sign-in -> 404, no cookie`, signin.status === 404 && !signin.headers.get("set-cookie"), signin.status);
    check(`secret ${label}: handler -> 404`, handler.status === 404, handler.status);
  }
  process.env.SESSION_SECRET = SECRET;

  db.close();
  globalThis.__slatewellDb = undefined;
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

  console.log(`admin-security: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error(`  FAIL: ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
