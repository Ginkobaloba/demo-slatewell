-- Slatewell schema. SQLite, applied by scripts/seed.ts.
-- Times of day are stored as minutes from midnight (integers).
-- Timestamps are ISO-8601 strings interpreted in the business's local
-- timezone (see docs/decisions.md, D-003).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  hours_note TEXT,
  cancellation_window_hours INTEGER NOT NULL DEFAULT 24,
  cancellation_policy TEXT,
  deposit_policy TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  description TEXT,
  duration_min INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  buffer_before_min INTEGER NOT NULL DEFAULT 0,
  buffer_after_min INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  color TEXT NOT NULL,            -- hex, calendar color-coding
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Which staff can perform which services.
CREATE TABLE IF NOT EXISTS staff_services (
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  PRIMARY KEY (staff_id, service_id)
);

-- Recurring weekly availability. weekday: 0=Sunday .. 6=Saturday.
CREATE TABLE IF NOT EXISTS availability_blocks (
  id INTEGER PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min INTEGER NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  CHECK (end_min > start_min)
);

-- Date-range exceptions to availability (vacation, sick days).
CREATE TABLE IF NOT EXISTS time_off (
  id INTEGER PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  start_date TEXT NOT NULL,       -- inclusive, YYYY-MM-DD
  end_date TEXT NOT NULL,         -- inclusive, YYYY-MM-DD
  reason TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array of strings
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,            -- opaque public id, e.g. bk_x7k2m9
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  service_id INTEGER NOT NULL REFERENCES services(id),
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  start_at TEXT NOT NULL,         -- ISO local, e.g. 2026-06-12T14:30
  end_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Confirmed','Cancelled','Completed','No-Show')),
  price_cents INTEGER NOT NULL,   -- snapshot at booking time
  deposit_cents INTEGER NOT NULL DEFAULT 0,
  deposit_status TEXT CHECK (deposit_status IN ('Held','Captured','Released','Refunded')),
  stripe_payment_intent_id TEXT,
  cancel_token TEXT NOT NULL,     -- token-protecting the public cancel URL
  notes TEXT,
  created_at TEXT NOT NULL,
  cancelled_at TEXT,
  cancellation_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_bookings_start ON bookings(business_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_staff ON bookings(staff_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id, start_at);

-- Mock outbound messages. Nothing is actually sent; rows accumulate in
-- the /admin/communications log.
CREATE TABLE IF NOT EXISTS communications (
  id INTEGER PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  booking_id TEXT REFERENCES bookings(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  channel TEXT NOT NULL CHECK (channel IN ('sms','email')),
  kind TEXT NOT NULL CHECK (kind IN ('confirmation','reminder_24h','followup','cancellation')),
  to_address TEXT NOT NULL,
  subject TEXT,                   -- email only
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_comms_sent ON communications(business_id, sent_at);
