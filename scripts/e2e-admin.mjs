/**
 * Admin operator API e2e: proves the Schedule/Services/Staff actions work
 * and write to the SAME source of truth the customer flow reads. Auth is the
 * demo-admin cookie (presence is sufficient, D-010).
 *
 * Prereqs: dev/prod server on BASE_URL (default http://localhost:3000),
 * freshly seeded database. Usage: node scripts/e2e-admin.mjs
 *
 * Mutates the DB. Re-seed afterwards (npm run db:seed) for a clean demo.
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_PATH = path.join(ROOT, "data", "slatewell.db");
const COOKIE = "slatewell_admin_session=demo-admin";

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
};

function db() {
  return new Database(DB_PATH, { readonly: true });
}
async function api(method, pathname, body, withCookie = true) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(withCookie ? { Cookie: COOKIE } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// --- auth gate --------------------------------------------------------------
const unauth = await api("POST", "/api/admin/services", {}, false);
check("admin route rejects no cookie (401)", unauth.status === 401, String(unauth.status));

// --- Schedule: complete + no-show settle the deposit ------------------------
{
  const d = db();
  const confirmed = d
    .prepare(
      `SELECT id FROM bookings WHERE business_id = 1 AND status = 'Confirmed'
         AND deposit_status = 'Held' ORDER BY start_at LIMIT 2`,
    )
    .all();
  d.close();
  check("found confirmed+held bookings to act on", confirmed.length === 2);

  if (confirmed.length === 2) {
    const completeRes = await api(
      "POST",
      `/api/admin/bookings/${confirmed[0].id}/complete`,
    );
    check("complete returns 200", completeRes.status === 200, JSON.stringify(completeRes));

    const noShowRes = await api(
      "POST",
      `/api/admin/bookings/${confirmed[1].id}/no-show`,
    );
    check("no-show returns 200", noShowRes.status === 200, JSON.stringify(noShowRes));

    const d2 = db();
    const a = d2.prepare("SELECT * FROM bookings WHERE id = ?").get(confirmed[0].id);
    const b = d2.prepare("SELECT * FROM bookings WHERE id = ?").get(confirmed[1].id);
    d2.close();
    check("completed -> Completed + deposit Captured",
      a.status === "Completed" && a.deposit_status === "Captured",
      `${a.status}/${a.deposit_status}`);
    check("no-show -> No-Show + deposit Captured",
      b.status === "No-Show" && b.deposit_status === "Captured",
      `${b.status}/${b.deposit_status}`);

    // Completing an already-completed booking is rejected.
    const again = await api("POST", `/api/admin/bookings/${confirmed[0].id}/complete`);
    check("re-complete rejected (409)", again.status === 409, String(again.status));
  }
}

// --- Services: create, update, validation, customer-visible -----------------
{
  const created = await api("POST", "/api/admin/services", {
    name: "E2E Express Glow",
    description: "Quick test service",
    duration_min: 30,
    price_cents: 6000,
    deposit_cents: 1500,
    buffer_before_min: 0,
    buffer_after_min: 5,
    active: 1,
  });
  check("service created (201)", created.status === 201, JSON.stringify(created));
  const newId = created.data.service?.id;

  const d = db();
  const visible = d
    .prepare("SELECT * FROM services WHERE id = ? AND active = 1")
    .get(newId);
  d.close();
  check("new service is customer-visible (active)", Boolean(visible));

  const updated = await api("PUT", `/api/admin/services/${newId}`, {
    name: "E2E Express Glow",
    description: "Quick test service",
    duration_min: 30,
    price_cents: 9900,
    deposit_cents: 2000,
    buffer_before_min: 0,
    buffer_after_min: 5,
    active: 1,
  });
  check("service updated (200)", updated.status === 200, JSON.stringify(updated));
  const d2 = db();
  const after = d2.prepare("SELECT price_cents FROM services WHERE id = ?").get(newId);
  d2.close();
  check("price change persisted", after.price_cents === 9900, String(after.price_cents));

  // deposit > price is rejected.
  const bad = await api("POST", "/api/admin/services", {
    name: "Bad", description: null, duration_min: 30, price_cents: 1000,
    deposit_cents: 5000, buffer_before_min: 0, buffer_after_min: 0, active: 1,
  });
  check("deposit-over-price rejected (400)", bad.status === 400, JSON.stringify(bad));
}

// --- Staff: availability + capability changes hit the slot engine -----------
{
  const d = db();
  // A staff member who works Saturday (weekday 6) and performs >=2 services.
  const staff = d
    .prepare(
      `SELECT s.id, s.name, s.color, s.title FROM staff s
       WHERE s.business_id = 1 AND EXISTS (
         SELECT 1 FROM availability_blocks ab WHERE ab.staff_id = s.id AND ab.weekday = 6)
       LIMIT 1`,
    )
    .get();
  const caps = d
    .prepare("SELECT service_id FROM staff_services WHERE staff_id = ? ORDER BY service_id")
    .all(staff.id)
    .map((r) => r.service_id);
  const avail = d
    .prepare("SELECT weekday, start_min, end_min FROM availability_blocks WHERE staff_id = ?")
    .all(staff.id);
  d.close();
  check("picked a Saturday-working staff member", Boolean(staff), JSON.stringify(staff));

  // Drop Saturday availability and remove one capability.
  const newAvail = avail
    .filter((b) => b.weekday !== 6)
    .map((b) => ({ weekday: b.weekday, start_min: b.start_min, end_min: b.end_min }));
  const droppedService = caps[0];
  const newCaps = caps.filter((c) => c !== droppedService);

  const put = await api("PUT", `/api/admin/staff/${staff.id}`, {
    name: staff.name,
    title: staff.title,
    color: staff.color,
    active: 1,
    serviceIds: newCaps,
    availability: newAvail,
  });
  check("staff update (200)", put.status === 200, JSON.stringify(put));

  const d2 = db();
  const satBlocks = d2
    .prepare("SELECT COUNT(*) AS n FROM availability_blocks WHERE staff_id = ? AND weekday = 6")
    .get(staff.id);
  const stillCap = d2
    .prepare("SELECT 1 FROM staff_services WHERE staff_id = ? AND service_id = ?")
    .get(staff.id, droppedService);
  d2.close();
  check("Saturday availability removed", satBlocks.n === 0, String(satBlocks.n));
  check("capability removed", !stillCap);

  // Invalid block (end <= start) is rejected.
  const badBlock = await api("PUT", `/api/admin/staff/${staff.id}`, {
    name: staff.name, title: staff.title, color: staff.color, active: 1,
    serviceIds: newCaps,
    availability: [{ weekday: 3, start_min: 600, end_min: 600 }],
  });
  check("invalid availability block rejected (400)", badBlock.status === 400, JSON.stringify(badBlock));

  // Same source of truth: the customer slot engine no longer offers the
  // dropped service for this staff on an upcoming Saturday.
  const start = new Date();
  let nextSat = null;
  for (let i = 0; i < 14; i++) {
    const x = new Date(start); x.setDate(x.getDate() + i);
    if (x.getDay() === 6) {
      nextSat = `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
      break;
    }
  }
  if (nextSat) {
    const r = await fetch(
      `${BASE_URL}/api/book/wave-wellness/availability?serviceId=${droppedService}&date=${nextSat}&staffId=${staff.id}`,
    );
    const j = await r.json();
    check("slot engine reflects removed Saturday availability",
      (j.slots ?? []).length === 0, `slots=${(j.slots ?? []).length}`);
  }
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
