/**
 * Unit tests for the visitor data expiry (D-014). In-memory SQLite only;
 * never touches data/slatewell.db or any live database.
 *
 *   npx tsx scripts/test-retention.ts
 *
 * Proves the purge deletes only visitor-created rows older than 24 hours
 * (with their mock messages and orphaned customers), and leaves seed rows,
 * recent visitor rows, and pre-D-014 legacy rows alone. Also checks the
 * hourly throttle and the schema upgrade for an older database.
 * D-015: sign-out revocation rows are kept until the token's own expiry and
 * purged after it (by the same hourly purge), and the revocation table is
 * created on a database seeded before D-015.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import {
  PURGE_INTERVAL_MS,
  ensureVisitorScopeColumns,
  localIsoMinute,
  maybePurgeExpiredVisitorData,
  purgeExpiredVisitorData,
} from "../src/lib/retention";
import {
  ensureRevocationTable,
  isAdminSessionRevoked,
  purgeExpiredRevocations,
  revokeAdminSession,
} from "../src/lib/session-revocation";

const failures: string[] = [];
let passed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed += 1;
  else failures.push(`${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
}

const SCHEMA = fs.readFileSync(path.join(__dirname, "../src/db/schema.sql"), "utf8");
const NOW = new Date(2026, 8, 18, 12, 0); // local 2026-09-18T12:00
const hoursAgo = (h: number) => localIsoMinute(new Date(NOW.getTime() - h * 3600_000));
const V1 = "1".repeat(32);
const V2 = "2".repeat(32);

function makeDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  db.prepare(
    `INSERT INTO businesses (id, slug, name, timezone, cancellation_window_hours, created_at)
     VALUES (1, 'b', 'B', 'America/New_York', 24, '2026-01-01T00:00')`,
  ).run();
  db.prepare(
    `INSERT INTO services (id, business_id, name, duration_min, price_cents) VALUES (1, 1, 'S', 60, 100)`,
  ).run();
  db.prepare(`INSERT INTO staff (id, business_id, name, color) VALUES (1, 1, 'St', '#000000')`).run();
  return db;
}

function customer(db: Database.Database, id: number, createdAt: string, visitorId: string | null) {
  db.prepare(
    `INSERT INTO customers (id, business_id, first_name, last_name, email, phone, created_at, visitor_id)
     VALUES (?, 1, 'F', 'L', 'x@example.com', '555', ?, ?)`,
  ).run(id, createdAt, visitorId);
}
function booking(
  db: Database.Database,
  id: string,
  customerId: number,
  createdAt: string,
  seeded: number,
  visitorId: string | null,
) {
  db.prepare(
    `INSERT INTO bookings (id, business_id, customer_id, service_id, staff_id, start_at, end_at,
       status, price_cents, cancel_token, created_at, seeded, visitor_id)
     VALUES (?, 1, ?, 1, 1, '2026-09-20T10:00', '2026-09-20T11:00', 'Confirmed', 100, 't', ?, ?, ?)`,
  ).run(id, customerId, createdAt, seeded, visitorId);
  db.prepare(
    `INSERT INTO communications (business_id, booking_id, customer_id, channel, kind, to_address, body, sent_at)
     VALUES (1, ?, ?, 'email', 'confirmation', 'x@example.com', 'hi', ?)`,
  ).run(id, customerId, createdAt);
}
const exists = (db: Database.Database, table: string, id: string | number) =>
  Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));

{
  const db = makeDb();
  customer(db, 1, hoursAgo(24 * 90), null); // seed customer
  booking(db, "bk_seed_old", 1, hoursAgo(24 * 30), 1, null); // seed, old
  customer(db, 2, hoursAgo(30), V1); // visitor, expired
  booking(db, "bk_v1_old", 2, hoursAgo(30), 0, V1);
  customer(db, 3, hoursAgo(2), V2); // visitor, recent
  booking(db, "bk_v2_new", 3, hoursAgo(2), 0, V2);
  customer(db, 4, hoursAgo(48), null); // pre-D-014 legacy row
  booking(db, "bk_legacy", 4, hoursAgo(48), 0, null);
  customer(db, 5, hoursAgo(30), V1); // old visitor customer with a recent booking
  booking(db, "bk_v1_recent", 5, hoursAgo(1), 0, V1);
  customer(db, 6, hoursAgo(25), V2); // orphaned visitor customer (no bookings)
  booking(db, "bk_edge", 3, hoursAgo(23.9), 0, V2); // just inside the window

  const result = purgeExpiredVisitorData(db, NOW);
  check("purge: deletes the expired visitor booking", !exists(db, "bookings", "bk_v1_old"));
  check("purge: deletes its mock messages",
    (db.prepare("SELECT COUNT(*) AS n FROM communications WHERE booking_id = 'bk_v1_old'").get() as { n: number }).n === 0);
  check("purge: deletes the expired visitor customer", !exists(db, "customers", 2));
  check("purge: deletes an orphaned expired visitor customer", !exists(db, "customers", 6));
  check("purge: keeps seed booking", exists(db, "bookings", "bk_seed_old"));
  check("purge: keeps seed customer", exists(db, "customers", 1));
  check("purge: keeps recent visitor booking", exists(db, "bookings", "bk_v2_new"));
  check("purge: keeps booking just inside 24h", exists(db, "bookings", "bk_edge"));
  check("purge: keeps legacy (pre-D-014) booking for an approved purge", exists(db, "bookings", "bk_legacy"));
  check("purge: keeps legacy customer", exists(db, "customers", 4));
  check("purge: keeps old visitor customer that still has a recent booking", exists(db, "customers", 5));
  check("purge: counts", result.bookings === 1 && result.customers === 2 && result.communications === 1, result);

  const second = purgeExpiredVisitorData(db, NOW);
  check("purge: idempotent", second.bookings === 0 && second.customers === 0, second);
}

// Throttle: at most once per interval.
{
  const db = makeDb();
  globalThis.__slatewellLastPurgeMs = undefined;
  const t0 = NOW.getTime();
  check("throttle: first call runs", maybePurgeExpiredVisitorData(db, t0) !== null);
  check("throttle: call inside the hour is skipped", maybePurgeExpiredVisitorData(db, t0 + PURGE_INTERVAL_MS - 1) === null);
  check("throttle: call after the hour runs", maybePurgeExpiredVisitorData(db, t0 + PURGE_INTERVAL_MS) !== null);
}

// Schema upgrade for a database created before D-014.
{
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE customers (id INTEGER PRIMARY KEY, created_at TEXT);
           CREATE TABLE bookings (id TEXT PRIMARY KEY, created_at TEXT);
           INSERT INTO bookings (id, created_at) VALUES ('bk_before', '2026-01-01T00:00');`);
  ensureVisitorScopeColumns(db);
  ensureVisitorScopeColumns(db); // idempotent
  const cols = (t: string) =>
    (db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>).map((c) => c.name);
  check("upgrade: bookings gains visitor_id + seeded", cols("bookings").includes("visitor_id") && cols("bookings").includes("seeded"));
  check("upgrade: customers gains visitor_id", cols("customers").includes("visitor_id"));
  const row = db.prepare("SELECT seeded, visitor_id FROM bookings WHERE id = 'bk_before'").get() as {
    seeded: number; visitor_id: string | null;
  };
  check("upgrade: existing rows become hidden legacy rows (seeded 0, no visitor)", row.seeded === 0 && row.visitor_id === null, row);
}

// D-015: revoked admin sessions expire along with the token.
{
  const db = makeDb();
  check("revocation: table ships in schema.sql",
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='revoked_admin_sessions'").get() !== undefined);
  const nowSec = Math.floor(NOW.getTime() / 1000);
  const J_LIVE = "a".repeat(32);
  const J_DEAD = "d".repeat(32);
  const J_EDGE = "e".repeat(32);
  revokeAdminSession(db, J_LIVE, nowSec + 3600, nowSec - 60);
  revokeAdminSession(db, J_DEAD, nowSec - 1, nowSec - 7200);
  revokeAdminSession(db, J_EDGE, nowSec, nowSec - 7200);
  revokeAdminSession(db, J_LIVE, nowSec + 3600, nowSec - 30); // idempotent
  check("revocation: idempotent insert",
    (db.prepare("SELECT COUNT(*) AS n FROM revoked_admin_sessions WHERE jti = ?").get(J_LIVE) as { n: number }).n === 1);
  check("revocation: live session reads as revoked", isAdminSessionRevoked(db, J_LIVE));
  check("revocation: unknown jti is not revoked", !isAdminSessionRevoked(db, "b".repeat(32)));

  const result = purgeExpiredVisitorData(db, NOW);
  check("revocation purge: counted in the visitor purge", result.revocations === 1, result);
  check("revocation purge: row past its token expiry removed", !isAdminSessionRevoked(db, J_DEAD));
  check("revocation purge: row whose token expires this second kept", isAdminSessionRevoked(db, J_EDGE));
  check("revocation purge: row for a still-valid token kept", isAdminSessionRevoked(db, J_LIVE));
  check("revocation purge: later purge removes the rest once expired",
    purgeExpiredRevocations(db, nowSec + 3601) === 2 && !isAdminSessionRevoked(db, J_LIVE));

  // revokeAdminSession also sweeps expired rows opportunistically.
  revokeAdminSession(db, J_DEAD, nowSec - 1, nowSec - 7200);
  revokeAdminSession(db, J_LIVE, nowSec + 3600, nowSec);
  check("revocation: insert sweeps already-expired rows", !isAdminSessionRevoked(db, J_DEAD) && isAdminSessionRevoked(db, J_LIVE));
}

// D-015: the revocation table is created on a pre-D-015 database, and the
// purge tolerates a handle that has no such table.
{
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE customers (id INTEGER PRIMARY KEY, created_at TEXT, visitor_id TEXT);
           CREATE TABLE bookings (id TEXT PRIMARY KEY, created_at TEXT, customer_id INTEGER, visitor_id TEXT, seeded INTEGER NOT NULL DEFAULT 0);
           CREATE TABLE communications (id INTEGER PRIMARY KEY, booking_id TEXT, customer_id INTEGER);`);
  const bare = purgeExpiredVisitorData(db, NOW);
  check("upgrade: purge works before the revocation table exists", bare.revocations === 0, bare);
  ensureRevocationTable(db);
  ensureRevocationTable(db); // idempotent
  revokeAdminSession(db, "f".repeat(32), Math.floor(NOW.getTime() / 1000) + 60, Math.floor(NOW.getTime() / 1000));
  check("upgrade: revocation table created and usable", isAdminSessionRevoked(db, "f".repeat(32)));
}

console.log(`retention: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL: ${f}`);
  process.exit(1);
}
