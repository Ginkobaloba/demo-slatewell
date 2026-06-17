/**
 * SQL KPI queries for the admin dashboard. Kept separate from the
 * customer-flow repo.ts. Each query has a pure helper that accepts a
 * Database instance (so scripts/test-admin-queries.ts can exercise it
 * against an in-memory db) and a thin public wrapper that calls getDb().
 */
import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import type { BookingStatus, DepositStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface AdminBookingRow {
  id: string;
  start_at: string;
  end_at: string;
  status: BookingStatus;
  price_cents: number;
  deposit_cents: number;
  deposit_status: DepositStatus | null;
  service_name: string;
  staff_name: string;
  staff_color: string;
  customer_name: string;
}

export interface RevenueSnapshot {
  completed_revenue_cents: number;
  held_deposits_cents: number;
}

export interface CancellationStats {
  total: number;
  cancelled: number;
  no_shows: number;
  cancel_rate: number;
  no_show_rate: number;
}

export interface TopService {
  service_name: string;
  revenue_cents: number;
  booking_count: number;
}

// ---------------------------------------------------------------------------
// Pure query helpers (accept a db instance -- testable without getDb())
// ---------------------------------------------------------------------------

export function queryTodayBookings(
  db: Database,
  businessId: number,
  today: string
): AdminBookingRow[] {
  return db
    .prepare(
      `SELECT bk.id, bk.start_at, bk.end_at, bk.status,
              bk.price_cents, bk.deposit_cents, bk.deposit_status,
              sv.name AS service_name,
              st.name AS staff_name, st.color AS staff_color,
              c.first_name || ' ' || c.last_name AS customer_name
       FROM bookings bk
       JOIN services sv ON sv.id = bk.service_id
       JOIN staff st ON st.id = bk.staff_id
       JOIN customers c ON c.id = bk.customer_id
       WHERE bk.business_id = ?
         AND bk.start_at >= ?
         AND bk.start_at < ?
         AND bk.status != 'Cancelled'
       ORDER BY bk.start_at`
    )
    .all(businessId, `${today}T00:00`, `${today}T24:00`) as AdminBookingRow[];
}

export function queryWeekBookings(
  db: Database,
  businessId: number,
  startDate: string,
  endDate: string
): AdminBookingRow[] {
  return db
    .prepare(
      `SELECT bk.id, bk.start_at, bk.end_at, bk.status,
              bk.price_cents, bk.deposit_cents, bk.deposit_status,
              sv.name AS service_name,
              st.name AS staff_name, st.color AS staff_color,
              c.first_name || ' ' || c.last_name AS customer_name
       FROM bookings bk
       JOIN services sv ON sv.id = bk.service_id
       JOIN staff st ON st.id = bk.staff_id
       JOIN customers c ON c.id = bk.customer_id
       WHERE bk.business_id = ?
         AND bk.start_at >= ?
         AND bk.start_at < ?
         AND bk.status != 'Cancelled'
       ORDER BY bk.start_at`
    )
    .all(businessId, `${startDate}T00:00`, `${endDate}T00:00`) as AdminBookingRow[];
}

export function queryRevenueSnapshot(
  db: Database,
  businessId: number
): RevenueSnapshot {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'Completed' THEN price_cents ELSE 0 END), 0)
           AS completed_revenue_cents,
         COALESCE(SUM(CASE WHEN status = 'Confirmed' AND deposit_status = 'Held' THEN deposit_cents ELSE 0 END), 0)
           AS held_deposits_cents
       FROM bookings
       WHERE business_id = ?`
    )
    .get(businessId) as RevenueSnapshot;
  return row;
}

export function queryCancellationStats(
  db: Database,
  businessId: number,
  windowStart: string,
  windowEnd: string
): CancellationStats {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) AS cancelled,
         COUNT(CASE WHEN status = 'No-Show' THEN 1 END) AS no_shows
       FROM bookings
       WHERE business_id = ?
         AND start_at >= ?
         AND start_at < ?`
    )
    .get(businessId, `${windowStart}T00:00`, `${windowEnd}T00:00`) as {
    total: number;
    cancelled: number;
    no_shows: number;
  };

  const total = row.total ?? 0;
  return {
    total,
    cancelled: row.cancelled,
    no_shows: row.no_shows,
    cancel_rate: total === 0 ? 0 : row.cancelled / total,
    no_show_rate: total === 0 ? 0 : row.no_shows / total,
  };
}

export function queryTopServices(
  db: Database,
  businessId: number,
  limit: number
): TopService[] {
  return db
    .prepare(
      `SELECT sv.name AS service_name,
              COALESCE(SUM(bk.price_cents), 0) AS revenue_cents,
              COUNT(*) AS booking_count
       FROM bookings bk
       JOIN services sv ON sv.id = bk.service_id
       WHERE bk.business_id = ? AND bk.status = 'Completed'
       GROUP BY bk.service_id, sv.name
       ORDER BY revenue_cents DESC
       LIMIT ?`
    )
    .all(businessId, limit) as TopService[];
}

// ---------------------------------------------------------------------------
// Public API (use getDb() -- call these from pages/routes)
// ---------------------------------------------------------------------------

export function getTodayBookings(
  businessId: number,
  today: string
): AdminBookingRow[] {
  return queryTodayBookings(getDb(), businessId, today);
}

export function getWeekBookings(
  businessId: number,
  startDate: string,
  endDate: string
): AdminBookingRow[] {
  return queryWeekBookings(getDb(), businessId, startDate, endDate);
}

export function getRevenueSnapshot(businessId: number): RevenueSnapshot {
  return queryRevenueSnapshot(getDb(), businessId);
}

export function getCancellationStats(
  businessId: number,
  windowStart: string,
  windowEnd: string
): CancellationStats {
  return queryCancellationStats(getDb(), businessId, windowStart, windowEnd);
}

export function getTopServices(businessId: number, limit = 5): TopService[] {
  return queryTopServices(getDb(), businessId, limit);
}
