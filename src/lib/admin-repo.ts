/**
 * Admin data access: the operator-facing reads and writes for the Schedule,
 * Services, and Staff screens. These mutate the SAME tables the customer
 * booking wizard reads, so a service edited here, a staff availability block
 * removed here, etc., immediately changes what customers can book. SQL lives
 * here; routes/pages call these typed functions.
 */
import { getDb } from "@/lib/db";
import type { Booking, Service, Staff } from "@/lib/types";

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export interface ScheduleRow {
  id: string;
  start_at: string;
  end_at: string;
  status: Booking["status"];
  price_cents: number;
  deposit_cents: number;
  deposit_status: Booking["deposit_status"];
  stripe_payment_intent_id: string | null;
  service_name: string;
  staff_id: number;
  staff_name: string;
  staff_color: string;
  customer_name: string;
  customer_phone: string | null;
  notes: string | null;
}

/** All non-cancelled appointments for a day, ordered by start time. */
export function getScheduleForDate(
  businessId: number,
  date: string,
): ScheduleRow[] {
  return getDb()
    .prepare(
      `SELECT bk.id, bk.start_at, bk.end_at, bk.status,
              bk.price_cents, bk.deposit_cents, bk.deposit_status,
              bk.stripe_payment_intent_id, bk.notes,
              sv.name AS service_name,
              st.id AS staff_id, st.name AS staff_name, st.color AS staff_color,
              c.first_name || ' ' || c.last_name AS customer_name,
              c.phone AS customer_phone
       FROM bookings bk
       JOIN services sv ON sv.id = bk.service_id
       JOIN staff st ON st.id = bk.staff_id
       JOIN customers c ON c.id = bk.customer_id
       WHERE bk.business_id = ?
         AND bk.start_at >= ? AND bk.start_at < ?
         AND bk.status != 'Cancelled'
       ORDER BY bk.start_at, st.sort_order`,
    )
    .all(businessId, `${date}T00:00`, `${date}T24:00`) as ScheduleRow[];
}

/**
 * Mark a Confirmed booking Completed. A held deposit is captured (it is
 * applied to the visit total, D-009). Returns the updated booking, or
 * undefined if it was not Confirmed. The route performs the Stripe capture.
 */
export function markCompleted(bookingId: string): Booking | undefined {
  const db = getDb();
  const booking = db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .get(bookingId) as Booking | undefined;
  if (!booking || booking.status !== "Confirmed") return undefined;
  db.prepare(
    `UPDATE bookings
       SET status = 'Completed',
           deposit_status = CASE WHEN deposit_status = 'Held'
             THEN 'Captured' ELSE deposit_status END
     WHERE id = ?`,
  ).run(bookingId);
  return db
    .prepare("SELECT * FROM bookings WHERE id = ?")
    .get(bookingId) as Booking;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export function getAllServices(businessId: number): Service[] {
  return getDb()
    .prepare(
      "SELECT * FROM services WHERE business_id = ? ORDER BY sort_order, id",
    )
    .all(businessId) as Service[];
}

export function getServiceById(
  businessId: number,
  id: number,
): Service | undefined {
  return getDb()
    .prepare("SELECT * FROM services WHERE business_id = ? AND id = ?")
    .get(businessId, id) as Service | undefined;
}

export interface ServiceInput {
  name: string;
  description: string | null;
  duration_min: number;
  price_cents: number;
  deposit_cents: number;
  buffer_before_min: number;
  buffer_after_min: number;
  active: number;
}

export function createService(
  businessId: number,
  input: ServiceInput,
): Service {
  const db = getDb();
  const max = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) AS m FROM services WHERE business_id = ?",
    )
    .get(businessId) as { m: number };
  const res = db
    .prepare(
      `INSERT INTO services
         (business_id, name, description, duration_min, price_cents,
          deposit_cents, buffer_before_min, buffer_after_min, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      businessId,
      input.name,
      input.description,
      input.duration_min,
      input.price_cents,
      input.deposit_cents,
      input.buffer_before_min,
      input.buffer_after_min,
      input.active,
      max.m + 1,
    );
  return db
    .prepare("SELECT * FROM services WHERE id = ?")
    .get(res.lastInsertRowid) as Service;
}

export function updateService(
  businessId: number,
  id: number,
  input: ServiceInput,
): Service | undefined {
  const db = getDb();
  const existing = getServiceById(businessId, id);
  if (!existing) return undefined;
  db.prepare(
    `UPDATE services
       SET name = ?, description = ?, duration_min = ?, price_cents = ?,
           deposit_cents = ?, buffer_before_min = ?, buffer_after_min = ?,
           active = ?
     WHERE business_id = ? AND id = ?`,
  ).run(
    input.name,
    input.description,
    input.duration_min,
    input.price_cents,
    input.deposit_cents,
    input.buffer_before_min,
    input.buffer_after_min,
    input.active,
    businessId,
    id,
  );
  return getServiceById(businessId, id);
}

// ---------------------------------------------------------------------------
// Staff (+ capabilities + weekly availability)
// ---------------------------------------------------------------------------

export interface AvailabilityBlock {
  weekday: number; // 0=Sun..6=Sat
  start_min: number;
  end_min: number;
}

export interface StaffDetail extends Staff {
  service_ids: number[];
  availability: AvailabilityBlock[];
}

export function getAllStaff(businessId: number): StaffDetail[] {
  const db = getDb();
  const staff = db
    .prepare(
      "SELECT * FROM staff WHERE business_id = ? ORDER BY sort_order, id",
    )
    .all(businessId) as Staff[];
  const caps = db
    .prepare(
      `SELECT ss.staff_id, ss.service_id FROM staff_services ss
       JOIN staff s ON s.id = ss.staff_id WHERE s.business_id = ?`,
    )
    .all(businessId) as Array<{ staff_id: number; service_id: number }>;
  const blocks = db
    .prepare(
      `SELECT ab.staff_id, ab.weekday, ab.start_min, ab.end_min
       FROM availability_blocks ab
       JOIN staff s ON s.id = ab.staff_id WHERE s.business_id = ?
       ORDER BY ab.weekday, ab.start_min`,
    )
    .all(businessId) as Array<{
    staff_id: number;
    weekday: number;
    start_min: number;
    end_min: number;
  }>;

  return staff.map((s) => ({
    ...s,
    service_ids: caps.filter((c) => c.staff_id === s.id).map((c) => c.service_id),
    availability: blocks
      .filter((b) => b.staff_id === s.id)
      .map(({ weekday, start_min, end_min }) => ({ weekday, start_min, end_min })),
  }));
}

function staffBelongs(businessId: number, staffId: number): boolean {
  return Boolean(
    getDb()
      .prepare("SELECT 1 FROM staff WHERE id = ? AND business_id = ?")
      .get(staffId, businessId),
  );
}

export interface StaffInput {
  name: string;
  title: string | null;
  color: string;
  active: number;
}

export function updateStaff(
  businessId: number,
  staffId: number,
  input: StaffInput,
): boolean {
  if (!staffBelongs(businessId, staffId)) return false;
  getDb()
    .prepare(
      "UPDATE staff SET name = ?, title = ?, color = ?, active = ? WHERE id = ?",
    )
    .run(input.name, input.title, input.color, input.active, staffId);
  return true;
}

/** Replace a staff member's service capabilities with the given set. */
export function setStaffServices(
  businessId: number,
  staffId: number,
  serviceIds: number[],
): boolean {
  const db = getDb();
  if (!staffBelongs(businessId, staffId)) return false;
  const validIds = new Set(
    (
      db
        .prepare("SELECT id FROM services WHERE business_id = ?")
        .all(businessId) as Array<{ id: number }>
    ).map((r) => r.id),
  );
  const clean = Array.from(new Set(serviceIds)).filter((id) =>
    validIds.has(id),
  );
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM staff_services WHERE staff_id = ?").run(staffId);
    const ins = db.prepare(
      "INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)",
    );
    for (const id of clean) ins.run(staffId, id);
  });
  tx();
  return true;
}

/** Replace a staff member's weekly availability with the given blocks. */
export function setAvailability(
  businessId: number,
  staffId: number,
  blocks: AvailabilityBlock[],
): boolean {
  const db = getDb();
  if (!staffBelongs(businessId, staffId)) return false;
  // Validate against the schema CHECK constraints up front.
  for (const b of blocks) {
    if (
      !Number.isInteger(b.weekday) ||
      b.weekday < 0 ||
      b.weekday > 6 ||
      b.start_min < 0 ||
      b.start_min > 1439 ||
      b.end_min < 1 ||
      b.end_min > 1440 ||
      b.end_min <= b.start_min
    ) {
      return false;
    }
  }
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM availability_blocks WHERE staff_id = ?").run(staffId);
    const ins = db.prepare(
      "INSERT INTO availability_blocks (staff_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)",
    );
    for (const b of blocks) ins.run(staffId, b.weekday, b.start_min, b.end_min);
  });
  tx();
  return true;
}
