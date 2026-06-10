/**
 * Data access for the booking domain. All SQL lives here; route handlers
 * and pages call these typed functions. Scheduling math lives in
 * scheduling.ts (pure); this module assembles its inputs from SQLite.
 */
import { randomBytes } from "crypto";
import { getDb } from "@/lib/db";
import {
  computeSlots,
  hhmmToMinutes,
  minutesToHHmm,
  type Slot,
  type StaffDaySchedule,
} from "@/lib/scheduling";
import type {
  Booking,
  Business,
  Customer,
  Service,
  Staff,
} from "@/lib/types";

// --- businesses / services / staff -----------------------------------------

export function getBusinessBySlug(slug: string): Business | undefined {
  return getDb()
    .prepare("SELECT * FROM businesses WHERE slug = ?")
    .get(slug) as Business | undefined;
}

export function getActiveServices(businessId: number): Service[] {
  return getDb()
    .prepare(
      "SELECT * FROM services WHERE business_id = ? AND active = 1 ORDER BY sort_order"
    )
    .all(businessId) as Service[];
}

export function getService(
  businessId: number,
  serviceId: number
): Service | undefined {
  return getDb()
    .prepare(
      "SELECT * FROM services WHERE business_id = ? AND id = ? AND active = 1"
    )
    .get(businessId, serviceId) as Service | undefined;
}

/** Active staff who can perform the service, in display order. */
export function getCapableStaff(serviceId: number): Staff[] {
  return getDb()
    .prepare(
      `SELECT s.* FROM staff s
       JOIN staff_services ss ON ss.staff_id = s.id
       WHERE ss.service_id = ? AND s.active = 1
       ORDER BY s.sort_order`
    )
    .all(serviceId) as Staff[];
}

// --- availability ------------------------------------------------------------

/**
 * Assemble per-staff schedules for a date (YYYY-MM-DD) and compute open
 * slots for the service. `staffId` narrows to one practitioner;
 * otherwise slots are auto-assigned to the least-busy capable staff.
 * `notBefore` (minutes from midnight) applies lead time for same-day
 * booking.
 */
export function getOpenSlots(opts: {
  service: Service;
  date: string;
  staffId?: number;
  notBeforeMin?: number;
}): Array<{ time: string; staffId: number }> {
  const db = getDb();
  const weekday = new Date(`${opts.date}T12:00`).getDay();

  let staff = getCapableStaff(opts.service.id);
  if (opts.staffId) staff = staff.filter((s) => s.id === opts.staffId);
  if (staff.length === 0) return [];

  const schedules: StaffDaySchedule[] = staff.map((member) => {
    const blocks = (
      db
        .prepare(
          `SELECT start_min, end_min FROM availability_blocks
           WHERE staff_id = ? AND weekday = ?`
        )
        .all(member.id, weekday) as Array<{ start_min: number; end_min: number }>
    ).map((b) => ({ startMin: b.start_min, endMin: b.end_min }));

    const off = db
      .prepare(
        `SELECT 1 FROM time_off
         WHERE staff_id = ? AND start_date <= ? AND end_date >= ?`
      )
      .get(member.id, opts.date, opts.date);

    // Existing bookings that day, expanded by THEIR OWN service buffers.
    const busy = (
      db
        .prepare(
          `SELECT bk.start_at, bk.end_at,
                  sv.buffer_before_min, sv.buffer_after_min
           FROM bookings bk JOIN services sv ON sv.id = bk.service_id
           WHERE bk.staff_id = ? AND bk.status != 'Cancelled'
             AND bk.start_at >= ? AND bk.start_at < ?`
        )
        .all(member.id, `${opts.date}T00:00`, `${opts.date}T24:00`) as Array<{
        start_at: string;
        end_at: string;
        buffer_before_min: number;
        buffer_after_min: number;
      }>
    ).map((row) => ({
      startMin: hhmmToMinutes(row.start_at.slice(11)) - row.buffer_before_min,
      endMin: hhmmToMinutes(row.end_at.slice(11)) + row.buffer_after_min,
    }));

    return { staffId: member.id, blocks, busy, isOff: Boolean(off) };
  });

  const slots: Slot[] = computeSlots(
    {
      durationMin: opts.service.duration_min,
      bufferBeforeMin: opts.service.buffer_before_min,
      bufferAfterMin: opts.service.buffer_after_min,
      notBeforeMin: opts.notBeforeMin,
    },
    schedules
  );
  return slots.map((s) => ({ time: minutesToHHmm(s.startMin), staffId: s.staffId }));
}

// --- customers ----------------------------------------------------------------

/** Match an existing customer by email (preferred) or phone; else create. */
export function findOrCreateCustomer(
  businessId: number,
  input: { firstName: string; lastName: string; email: string; phone: string }
): Customer {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT * FROM customers
       WHERE business_id = ? AND (lower(email) = lower(?) OR phone = ?)
       ORDER BY (lower(email) = lower(?)) DESC LIMIT 1`
    )
    .get(businessId, input.email, input.phone, input.email) as
    | Customer
    | undefined;
  if (existing) return existing;

  const result = db
    .prepare(
      `INSERT INTO customers (business_id, first_name, last_name, email, phone, tags, created_at)
       VALUES (?, ?, ?, ?, ?, '["new"]', ?)`
    )
    .run(
      businessId,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      localNowIso()
    );
  return db
    .prepare("SELECT * FROM customers WHERE id = ?")
    .get(result.lastInsertRowid) as Customer;
}

// --- bookings -------------------------------------------------------------------

export class SlotTakenError extends Error {
  constructor() {
    super("The requested time is no longer available.");
  }
}

/**
 * Create a Confirmed booking after re-validating the slot inside a
 * transaction (better-sqlite3 is synchronous, so this is race-safe
 * within the single Node process).
 *
 * Deposit: until chunk 4.4 wires Stripe Test Mode, services with a
 * deposit record a mock Held intent so downstream UI is exercised.
 */
export function createBooking(opts: {
  business: Business;
  service: Service;
  staffId: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  customer: { firstName: string; lastName: string; email: string; phone: string };
  notes?: string;
}): Booking {
  const db = getDb();
  const tx = db.transaction((): Booking => {
    const open = getOpenSlots({
      service: opts.service,
      date: opts.date,
      staffId: opts.staffId,
      notBeforeMin: sameDayNotBefore(opts.date),
    });
    if (!open.some((s) => s.time === opts.time && s.staffId === opts.staffId)) {
      throw new SlotTakenError();
    }

    const customer = findOrCreateCustomer(opts.business.id, opts.customer);
    const id = `bk_${randomBytes(8).toString("hex").slice(0, 10)}`;
    const startAt = `${opts.date}T${opts.time}`;
    const startMin = hhmmToMinutes(opts.time);
    const endAt = `${opts.date}T${minutesToHHmm(startMin + opts.service.duration_min)}`;
    const hasDeposit = opts.service.deposit_cents > 0;
    const createdAt = localNowIso();

    db.prepare(
      `INSERT INTO bookings (id, business_id, customer_id, service_id, staff_id,
         start_at, end_at, status, price_cents, deposit_cents, deposit_status,
         stripe_payment_intent_id, cancel_token, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Confirmed', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      opts.business.id,
      customer.id,
      opts.service.id,
      opts.staffId,
      startAt,
      endAt,
      opts.service.price_cents,
      opts.service.deposit_cents,
      hasDeposit ? "Held" : null,
      hasDeposit ? `pi_mock_${randomBytes(8).toString("hex")}` : null,
      randomBytes(16).toString("hex"),
      opts.notes ?? null,
      createdAt
    );

    logBookingConfirmation(id, customer, opts, createdAt);
    return db.prepare("SELECT * FROM bookings WHERE id = ?").get(id) as Booking;
  });
  return tx();
}

function logBookingConfirmation(
  bookingId: string,
  customer: Customer,
  opts: { business: Business; service: Service; date: string; time: string },
  sentAt: string
) {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO communications (business_id, booking_id, customer_id, channel, kind, to_address, subject, body, status, sent_at)
     VALUES (?, ?, ?, ?, 'confirmation', ?, ?, ?, 'sent', ?)`
  );
  const friendly = new Date(`${opts.date}T${opts.time}`).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (customer.phone) {
    insert.run(
      opts.business.id,
      bookingId,
      customer.id,
      "sms",
      customer.phone,
      null,
      `${opts.business.name}: you're booked! ${opts.service.name}, ${friendly}. Reply HELP for help.`,
      sentAt
    );
  }
  if (customer.email) {
    insert.run(
      opts.business.id,
      bookingId,
      customer.id,
      "email",
      customer.email,
      `Your ${opts.business.name} appointment is confirmed`,
      `Hi ${customer.first_name},\n\nYou're confirmed for ${opts.service.name} on ${friendly}.\n\nSee you soon,\n${opts.business.name}`,
      sentAt
    );
  }
}

export interface BookingDetails extends Booking {
  service_name: string;
  service_duration_min: number;
  staff_name: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string | null;
  business_name: string;
  business_slug: string;
  business_address: string | null;
}

export function getBookingDetails(
  bookingId: string
): BookingDetails | undefined {
  return getDb()
    .prepare(
      `SELECT bk.*,
              sv.name AS service_name, sv.duration_min AS service_duration_min,
              st.name AS staff_name,
              c.first_name AS customer_first_name, c.last_name AS customer_last_name,
              c.email AS customer_email,
              b.name AS business_name, b.slug AS business_slug, b.address AS business_address
       FROM bookings bk
       JOIN services sv ON sv.id = bk.service_id
       JOIN staff st ON st.id = bk.staff_id
       JOIN customers c ON c.id = bk.customer_id
       JOIN businesses b ON b.id = bk.business_id
       WHERE bk.id = ?`
    )
    .get(bookingId) as BookingDetails | undefined;
}

// --- local-time helpers (D-003: business-local naive timestamps) -------------

export function localNowIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export function localTodayIso(): string {
  return localNowIso().slice(0, 10);
}

/** Same-day bookings need 60 minutes of lead time. */
export function sameDayNotBefore(date: string): number | undefined {
  if (date !== localTodayIso()) return undefined;
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + 60;
}
