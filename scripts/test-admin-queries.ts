/**
 * Unit tests for admin-queries.ts. Uses an in-memory SQLite database with
 * minimal fixtures -- does NOT depend on the seeded data/slatewell.db.
 * Usage: npx tsx scripts/test-admin-queries.ts
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  queryTodayBookings,
  queryWeekBookings,
  queryRevenueSnapshot,
  queryCancellationStats,
  queryTopServices,
} from "../src/lib/admin-queries";

// ------------------------------------------------------------------
// Bootstrap an in-memory DB from the schema
// ------------------------------------------------------------------
const SCHEMA = fs.readFileSync(
  path.join(__dirname, "../src/db/schema.sql"),
  "utf8"
);

function makeDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  // 1 business
  db.prepare(
    `INSERT INTO businesses (id, slug, name, timezone, cancellation_window_hours, created_at)
     VALUES (1, 'test-biz', 'Test Spa', 'America/New_York', 24, '2026-01-01T00:00')`
  ).run();

  // 2 services
  db.prepare(
    `INSERT INTO services (id, business_id, name, duration_min, price_cents, deposit_cents, sort_order)
     VALUES (1, 1, 'Facial', 60, 10000, 2000, 0),
            (2, 1, 'Massage', 60, 15000, 3000, 1)`
  ).run();

  // 1 staff
  db.prepare(
    `INSERT INTO staff (id, business_id, name, color, sort_order)
     VALUES (1, 1, 'Maya', '#2e4057', 0)`
  ).run();

  // 2 customers
  db.prepare(
    `INSERT INTO customers (id, business_id, first_name, last_name, email, tags, created_at)
     VALUES (1, 1, 'Alice', 'Smith', 'alice@example.com', '[]', '2026-01-01T00:00'),
            (2, 1, 'Bob', 'Jones', 'bob@example.com', '[]', '2026-01-01T00:00')`
  ).run();

  return db;
}

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${JSON.stringify(detail)}`}`
  );
  if (!ok) failures++;
}

// ------------------------------------------------------------------
// Fixture helpers
// ------------------------------------------------------------------
function insertBooking(
  db: Database.Database,
  opts: {
    id: string;
    serviceId: number;
    startAt: string;
    endAt: string;
    status: string;
    priceCents: number;
    depositCents: number;
    depositStatus: string | null;
    cancelledAt?: string | null;
  }
) {
  db.prepare(
    `INSERT INTO bookings
       (id, business_id, customer_id, service_id, staff_id,
        start_at, end_at, status, price_cents, deposit_cents,
        deposit_status, cancel_token, created_at, cancelled_at)
     VALUES (?, 1, 1, ?, 1, ?, ?, ?, ?, ?, ?, 'tok', '2026-01-01T00:00', ?)`
  ).run(
    opts.id,
    opts.serviceId,
    opts.startAt,
    opts.endAt,
    opts.status,
    opts.priceCents,
    opts.depositCents,
    opts.depositStatus,
    opts.cancelledAt ?? null
  );
}

// ------------------------------------------------------------------
// Test: queryTodayBookings
// ------------------------------------------------------------------
{
  const db = makeDb();
  const today = "2026-06-16";
  insertBooking(db, {
    id: "bk_t1",
    serviceId: 1,
    startAt: "2026-06-16T09:00",
    endAt: "2026-06-16T10:00",
    status: "Confirmed",
    priceCents: 10000,
    depositCents: 2000,
    depositStatus: "Held",
  });
  insertBooking(db, {
    id: "bk_t2",
    serviceId: 2,
    startAt: "2026-06-16T11:00",
    endAt: "2026-06-16T12:00",
    status: "Cancelled",
    priceCents: 15000,
    depositCents: 3000,
    depositStatus: "Released",
  });
  insertBooking(db, {
    id: "bk_t3",
    serviceId: 1,
    startAt: "2026-06-17T09:00",
    endAt: "2026-06-17T10:00",
    status: "Confirmed",
    priceCents: 10000,
    depositCents: 2000,
    depositStatus: "Held",
  });

  const rows = queryTodayBookings(db, 1, today);
  check(
    "today: returns only non-cancelled today bookings",
    rows.length === 1,
    rows
  );
  check("today: correct booking id", rows[0]?.id === "bk_t1", rows[0]);
  check(
    "today: includes service_name",
    rows[0]?.service_name === "Facial",
    rows[0]
  );
  check("today: includes staff_name", rows[0]?.staff_name === "Maya", rows[0]);
  check(
    "today: includes customer_name",
    rows[0]?.customer_name === "Alice Smith",
    rows[0]
  );
}

// ------------------------------------------------------------------
// Test: queryWeekBookings
// ------------------------------------------------------------------
{
  const db = makeDb();
  const today = "2026-06-16";
  const weekEnd = "2026-06-23";
  // Monday
  insertBooking(db, {
    id: "bk_w1",
    serviceId: 1,
    startAt: "2026-06-16T09:00",
    endAt: "2026-06-16T10:00",
    status: "Confirmed",
    priceCents: 10000,
    depositCents: 2000,
    depositStatus: "Held",
  });
  // Wednesday
  insertBooking(db, {
    id: "bk_w2",
    serviceId: 2,
    startAt: "2026-06-18T11:00",
    endAt: "2026-06-18T12:00",
    status: "Confirmed",
    priceCents: 15000,
    depositCents: 3000,
    depositStatus: "Held",
  });
  // Outside window
  insertBooking(db, {
    id: "bk_w3",
    serviceId: 1,
    startAt: "2026-06-24T09:00",
    endAt: "2026-06-24T10:00",
    status: "Confirmed",
    priceCents: 10000,
    depositCents: 2000,
    depositStatus: "Held",
  });
  // Cancelled (excluded)
  insertBooking(db, {
    id: "bk_w4",
    serviceId: 1,
    startAt: "2026-06-17T10:00",
    endAt: "2026-06-17T11:00",
    status: "Cancelled",
    priceCents: 10000,
    depositCents: 2000,
    depositStatus: "Released",
  });

  const rows = queryWeekBookings(db, 1, today, weekEnd);
  check(
    "week: returns only non-cancelled in-window bookings",
    rows.length === 2,
    rows
  );
  check("week: ordered by start_at", rows[0].id === "bk_w1", rows);
}

// ------------------------------------------------------------------
// Test: queryRevenueSnapshot
// ------------------------------------------------------------------
{
  const db = makeDb();
  // Completed bookings -- counted
  insertBooking(db, {
    id: "bk_r1",
    serviceId: 1,
    startAt: "2026-05-01T09:00",
    endAt: "2026-05-01T10:00",
    status: "Completed",
    priceCents: 10000,
    depositCents: 2000,
    depositStatus: "Captured",
  });
  insertBooking(db, {
    id: "bk_r2",
    serviceId: 2,
    startAt: "2026-05-02T09:00",
    endAt: "2026-05-02T10:00",
    status: "Completed",
    priceCents: 15000,
    depositCents: 3000,
    depositStatus: "Captured",
  });
  // Confirmed with Held deposit -- deposits counted
  insertBooking(db, {
    id: "bk_r3",
    serviceId: 1,
    startAt: "2026-06-20T09:00",
    endAt: "2026-06-20T10:00",
    status: "Confirmed",
    priceCents: 10000,
    depositCents: 2000,
    depositStatus: "Held",
  });
  // Cancelled -- not counted
  insertBooking(db, {
    id: "bk_r4",
    serviceId: 1,
    startAt: "2026-05-10T09:00",
    endAt: "2026-05-10T10:00",
    status: "Cancelled",
    priceCents: 10000,
    depositCents: 2000,
    depositStatus: "Released",
  });

  const snap = queryRevenueSnapshot(db, 1);
  check(
    "revenue: completed_revenue_cents sums Completed rows",
    snap.completed_revenue_cents === 25000,
    snap
  );
  check(
    "revenue: held_deposits_cents sums Held on Confirmed rows",
    snap.held_deposits_cents === 2000,
    snap
  );
}

// ------------------------------------------------------------------
// Test: queryCancellationStats
// ------------------------------------------------------------------
{
  const db = makeDb();
  // Within window (90 days)
  insertBooking(db, {
    id: "bk_cs1",
    serviceId: 1,
    startAt: "2026-06-10T09:00",
    endAt: "2026-06-10T10:00",
    status: "Completed",
    priceCents: 10000,
    depositCents: 0,
    depositStatus: null,
  });
  insertBooking(db, {
    id: "bk_cs2",
    serviceId: 1,
    startAt: "2026-06-09T09:00",
    endAt: "2026-06-09T10:00",
    status: "Cancelled",
    priceCents: 10000,
    depositCents: 0,
    depositStatus: "Released",
  });
  insertBooking(db, {
    id: "bk_cs3",
    serviceId: 1,
    startAt: "2026-06-08T09:00",
    endAt: "2026-06-08T10:00",
    status: "No-Show",
    priceCents: 10000,
    depositCents: 0,
    depositStatus: null,
  });
  insertBooking(db, {
    id: "bk_cs4",
    serviceId: 1,
    startAt: "2026-06-07T09:00",
    endAt: "2026-06-07T10:00",
    status: "Confirmed",
    priceCents: 10000,
    depositCents: 0,
    depositStatus: null,
  });
  // Outside window (>90 days ago)
  insertBooking(db, {
    id: "bk_cs5",
    serviceId: 1,
    startAt: "2025-01-01T09:00",
    endAt: "2025-01-01T10:00",
    status: "Cancelled",
    priceCents: 10000,
    depositCents: 0,
    depositStatus: "Released",
  });

  const windowStart = "2026-03-18"; // 90 days before 2026-06-16
  const windowEnd = "2026-06-17";
  const stats = queryCancellationStats(db, 1, windowStart, windowEnd);
  check(
    "cancel-stats: total = 4 (in-window, all statuses)",
    stats.total === 4,
    stats
  );
  check("cancel-stats: cancelled = 1", stats.cancelled === 1, stats);
  check("cancel-stats: no_shows = 1", stats.no_shows === 1, stats);
  check(
    "cancel-stats: cancel_rate = 0.25",
    Math.abs(stats.cancel_rate - 0.25) < 0.001,
    stats
  );
  check(
    "cancel-stats: no_show_rate = 0.25",
    Math.abs(stats.no_show_rate - 0.25) < 0.001,
    stats
  );
}

// ------------------------------------------------------------------
// Test: queryTopServices
// ------------------------------------------------------------------
{
  const db = makeDb();
  insertBooking(db, {
    id: "bk_ts1",
    serviceId: 1,
    startAt: "2026-05-01T09:00",
    endAt: "2026-05-01T10:00",
    status: "Completed",
    priceCents: 10000,
    depositCents: 0,
    depositStatus: null,
  });
  insertBooking(db, {
    id: "bk_ts2",
    serviceId: 1,
    startAt: "2026-05-02T09:00",
    endAt: "2026-05-02T10:00",
    status: "Completed",
    priceCents: 10000,
    depositCents: 0,
    depositStatus: null,
  });
  insertBooking(db, {
    id: "bk_ts3",
    serviceId: 2,
    startAt: "2026-05-03T09:00",
    endAt: "2026-05-03T10:00",
    status: "Completed",
    priceCents: 15000,
    depositCents: 0,
    depositStatus: null,
  });
  // Cancelled -- not counted in revenue
  insertBooking(db, {
    id: "bk_ts4",
    serviceId: 2,
    startAt: "2026-05-04T09:00",
    endAt: "2026-05-04T10:00",
    status: "Cancelled",
    priceCents: 15000,
    depositCents: 0,
    depositStatus: null,
  });

  const top = queryTopServices(db, 1, 5);
  check("top-services: 2 services", top.length === 2, top);
  check(
    "top-services: service 1 has 2 bookings",
    top[0].booking_count === 2,
    top[0]
  );
  check(
    "top-services: service 1 revenue = 20000",
    top[0].revenue_cents === 20000,
    top[0]
  );
  check(
    "top-services: Massage is second (15000)",
    top[1].service_name === "Massage",
    top[1]
  );
}

// ------------------------------------------------------------------
// Summary
// ------------------------------------------------------------------
if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log(`\nAll tests passed`);
}
