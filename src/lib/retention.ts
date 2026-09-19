import type { Database } from "better-sqlite3";

/**
 * Visitor data expiry and the schema upgrade it depends on (D-014).
 *
 * Visitor-created bookings (seeded = 0, visitor_id set) and the customers
 * and mock communications behind them are deleted 24 hours after creation.
 * The purge runs when the database handle opens (process start) and then at
 * most once an hour, piggybacking on requests, so it needs no scheduler.
 *
 * It never touches seed rows, and never touches rows created before D-014
 * (seeded = 0 with no visitor id): those are hidden from every session and
 * left for a one-time purge that needs explicit approval.
 */

export const RETENTION_HOURS = 24;
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Add the D-014 columns to a database created before they existed. The
 * container image seeds a fresh database at build time, so this mainly
 * matters for a long-lived or volume-mounted database. Pre-existing rows get
 * seeded = 0 and no visitor id, which hides them from everyone (fail closed).
 */
export function ensureVisitorScopeColumns(db: Database): void {
  const columns = (table: string) =>
    new Set(
      (
        db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
          name: string;
        }>
      ).map((c) => c.name),
    );

  const bookingCols = columns("bookings");
  if (!bookingCols.has("visitor_id")) {
    db.exec("ALTER TABLE bookings ADD COLUMN visitor_id TEXT");
  }
  if (!bookingCols.has("seeded")) {
    db.exec("ALTER TABLE bookings ADD COLUMN seeded INTEGER NOT NULL DEFAULT 0");
  }
  if (!columns("customers").has("visitor_id")) {
    db.exec("ALTER TABLE customers ADD COLUMN visitor_id TEXT");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_bookings_visitor ON bookings(visitor_id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_customers_visitor ON customers(visitor_id)",
  );
}

/** Business-local naive ISO minute timestamp (D-003), as the app writes. */
export function localIsoMinute(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours(),
  )}:${p(d.getMinutes())}`;
}

export interface PurgeResult {
  bookings: number;
  customers: number;
  communications: number;
}

/**
 * Delete visitor-created data older than RETENTION_HOURS. Order matters
 * (foreign keys are on and nothing cascades): communications, then
 * bookings, then visitor customers that no longer have any booking.
 */
export function purgeExpiredVisitorData(
  db: Database,
  now: Date = new Date(),
): PurgeResult {
  const cutoff = localIsoMinute(
    new Date(now.getTime() - RETENTION_HOURS * 60 * 60 * 1000),
  );

  const run = db.transaction((): PurgeResult => {
    const expiredBookings = `SELECT id FROM bookings
       WHERE seeded = 0 AND visitor_id IS NOT NULL AND created_at < @cutoff`;
    let communications = db
      .prepare(
        `DELETE FROM communications WHERE booking_id IN (${expiredBookings})`,
      )
      .run({ cutoff }).changes;
    const bookings = db
      .prepare(`DELETE FROM bookings WHERE id IN (${expiredBookings})`)
      .run({ cutoff }).changes;

    const expiredCustomers = `SELECT c.id FROM customers c
       WHERE c.visitor_id IS NOT NULL AND c.created_at < @cutoff
         AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = c.id)`;
    communications += db
      .prepare(
        `DELETE FROM communications WHERE customer_id IN (${expiredCustomers})`,
      )
      .run({ cutoff }).changes;
    const customers = db
      .prepare(`DELETE FROM customers WHERE id IN (${expiredCustomers})`)
      .run({ cutoff }).changes;

    return { bookings, customers, communications };
  });
  return run();
}

declare global {
  // eslint-disable-next-line no-var
  var __slatewellLastPurgeMs: number | undefined;
}

/**
 * Run the purge if it has not run in the last PURGE_INTERVAL_MS. A failure
 * is logged and swallowed: expiry must never break a booking or admin page.
 */
export function maybePurgeExpiredVisitorData(
  db: Database,
  nowMs: number = Date.now(),
): PurgeResult | null {
  const last = globalThis.__slatewellLastPurgeMs;
  if (last !== undefined && nowMs - last < PURGE_INTERVAL_MS) return null;
  globalThis.__slatewellLastPurgeMs = nowMs;
  try {
    const result = purgeExpiredVisitorData(db, new Date(nowMs));
    if (result.bookings || result.customers || result.communications) {
      console.log(
        `[retention] purged ${result.bookings} bookings, ${result.customers} customers, ${result.communications} messages`,
      );
    }
    return result;
  } catch (err) {
    console.error("[retention] purge failed", err);
    return null;
  }
}
