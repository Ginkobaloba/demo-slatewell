/**
 * Seeds data/slatewell.db with the Wave Wellness demo dataset:
 * 1 business, 8 services, 5 staff, weekly availability, time off,
 * 120 customers, 300 bookings across the last 90 / next 30 days, and a
 * mock SMS/email communications log.
 *
 * Deterministic except for the anchor date: the RNG is seeded, but dates
 * are placed relative to the day the script runs so the calendar always
 * has both history and upcoming bookings. Re-run any time; it rebuilds
 * the database from scratch.
 *
 * Usage: npm run db:seed
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { addDays, addMinutes, format, startOfDay } from "date-fns";

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = process.env.SLATEWELL_DB_PATH ?? path.join(DATA_DIR, "slatewell.db");
const SCHEMA_PATH = path.join(ROOT, "src", "db", "schema.sql");

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) so the dataset is stable run-to-run.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260610);
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number) => rand() < p;
const hex = (len: number) =>
  Array.from({ length: len }, () => "0123456789abcdef"[randInt(0, 15)]).join("");
const base36 = (len: number) =>
  Array.from({ length: len }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[randInt(0, 35)]).join("");

const iso = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

// ---------------------------------------------------------------------------
// Static dataset definitions
// ---------------------------------------------------------------------------
const TODAY = startOfDay(new Date());

const SERVICES = [
  { name: "Signature Facial (60 min)", duration: 60, price: 13500, deposit: 2500, before: 10, after: 10, weight: 20, desc: "Deep cleanse, exfoliation, and hydration tailored to your skin." },
  { name: "Luxe Facial (90 min)", duration: 90, price: 18500, deposit: 4000, before: 10, after: 15, weight: 14, desc: "Extended facial with massage, mask, and LED therapy." },
  { name: "Skin Consultation (30 min)", duration: 30, price: 5000, deposit: 0, before: 0, after: 5, weight: 12, desc: "One-on-one assessment and treatment planning." },
  { name: "Microneedling", duration: 75, price: 29500, deposit: 7500, before: 15, after: 15, weight: 10, desc: "Collagen induction therapy with numbing and aftercare." },
  { name: "Dermaplane", duration: 45, price: 9500, deposit: 2000, before: 5, after: 10, weight: 14, desc: "Gentle exfoliation for smooth, bright skin." },
  { name: "Brow Lamination", duration: 50, price: 8500, deposit: 2000, before: 5, after: 10, weight: 12, desc: "Set, lift, and shape brows for 6-8 weeks." },
  { name: "Lip Treatment", duration: 30, price: 7500, deposit: 1500, before: 5, after: 5, weight: 9, desc: "Hydrating lip mask and exfoliation treatment." },
  { name: "Body Contour Session", duration: 60, price: 22500, deposit: 5000, before: 10, after: 15, weight: 9, desc: "Non-invasive sculpting, one area per session." },
] as const;

// Staff. capabilities index into SERVICES. One generalist, four specialists.
const STAFF = [
  { name: "Maya Chen", title: "Owner / Master Esthetician", color: "#2e4057", caps: [0, 1, 2, 3, 4, 5, 6, 7] },
  { name: "Priya Natarajan", title: "Senior Esthetician", color: "#c97b5a", caps: [0, 1, 4, 6] },
  { name: "Sofia Reyes", title: "Treatment Nurse", color: "#7a9e7e", caps: [2, 3, 7] },
  { name: "Tessa Brooks", title: "Brow & Skin Specialist", color: "#d9a441", caps: [4, 5, 6] },
  { name: "Jordan Avery", title: "Wellness Consultant", color: "#8e6c88", caps: [2, 7] },
] as const;

// Weekly availability per staff, weekday 0=Sun..6=Sat. Wave Wellness runs
// Tue-Sat. Minutes from midnight; split blocks model lunch breaks.
const AVAILABILITY: Record<number, Array<{ weekday: number; start: number; end: number }>> = {
  0: [2, 3, 4, 5, 6].flatMap((wd) => [
    { weekday: wd, start: 540, end: 750 },   // 9:00-12:30
    { weekday: wd, start: 795, end: 1020 },  // 13:15-17:00
  ]),
  1: [
    ...[2, 3, 4, 5].map((wd) => ({ weekday: wd, start: 600, end: 1080 })), // Tue-Fri 10-18
    { weekday: 6, start: 540, end: 840 },                                  // Sat 9-14
  ],
  2: [
    ...[2, 3, 4].map((wd) => ({ weekday: wd, start: 540, end: 960 })),     // Tue-Thu 9-16
    { weekday: 6, start: 540, end: 900 },                                  // Sat 9-15
  ],
  3: [3, 4, 5, 6].map((wd) => ({ weekday: wd, start: 660, end: 1140 })),   // Wed-Sat 11-19
  4: [
    ...[2, 3, 4].map((wd) => ({ weekday: wd, start: 540, end: 780 })),     // Tue-Thu 9-13
    ...[5, 6].map((wd) => ({ weekday: wd, start: 540, end: 1020 })),       // Fri-Sat 9-17
  ],
};

const TIME_OFF = [
  { staffIdx: 1, start: addDays(TODAY, -16), end: addDays(TODAY, -12), reason: "Vacation" },
  { staffIdx: 3, start: addDays(TODAY, 10), end: addDays(TODAY, 10), reason: "Personal day" },
  { staffIdx: 2, start: addDays(TODAY, -38), end: addDays(TODAY, -37), reason: "Conference" },
] as const;

const FIRST_NAMES = ["Ava", "Liam", "Noah", "Emma", "Olivia", "Mia", "Sophia", "Isabella", "Charlotte", "Amelia", "Harper", "Evelyn", "Naomi", "Grace", "Chloe", "Zoe", "Layla", "Riley", "Nora", "Hazel", "Elena", "Aaliyah", "Camila", "Priya", "Mei", "Yuki", "Fatima", "Leila", "Ingrid", "Astrid", "Dana", "Jordan", "Casey", "Morgan", "Taylor", "Alexis", "Brianna", "Kayla", "Megan", "Rachel", "Sarah", "Hannah", "Jasmine", "Diego", "Marcus", "Andre", "Elliot", "Theo", "Felix", "Hugo"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts", "Kim"];

const CUSTOMER_NOTES = [
  "Sensitive skin, patch-test new products.",
  "Prefers afternoon appointments.",
  "Allergic to lanolin.",
  "Referred by a friend; first visit went great.",
  "Interested in a microneedling series.",
  "Prefers Priya when available.",
  "Asked about package pricing.",
  "Pregnant, avoid retinol treatments.",
];

const CANCEL_REASONS = ["Schedule conflict", "Feeling unwell", "Travel came up", "Rebooking for a later date", "No reason given"];

// ---------------------------------------------------------------------------
// Build the database
// ---------------------------------------------------------------------------
fs.mkdirSync(DATA_DIR, { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) {
  const p = DB_PATH + suffix;
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));

const now = new Date();

db.prepare(
  `INSERT INTO businesses (id, slug, name, tagline, description, phone, email, address, timezone, hours_note, cancellation_window_hours, cancellation_policy, deposit_policy, created_at)
   VALUES (1, 'wave-wellness', 'Wave Wellness', 'Modern skin and body care, without the rush.',
           'A boutique med-spa offering facials, microneedling, brows, and body contouring. Five practitioners, one calm studio.',
           '(555) 014-2208', 'hello@wavewellness.example', '418 Harbor Lane, Suite 2, Northbrook',
           'America/New_York', 'Tue-Sat, hours vary by practitioner', 24,
           'Cancel or reschedule at least 24 hours before your appointment to release your deposit. Inside 24 hours the deposit is kept.',
           'Most services hold a card deposit at booking. Deposits are applied to your total at checkout.',
           ?)`
).run(iso(addDays(TODAY, -210)));

const insertService = db.prepare(
  `INSERT INTO services (id, business_id, name, description, duration_min, price_cents, deposit_cents, buffer_before_min, buffer_after_min, active, sort_order)
   VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
);
SERVICES.forEach((s, i) =>
  insertService.run(i + 1, s.name, s.desc, s.duration, s.price, s.deposit, s.before, s.after, i)
);

const insertStaff = db.prepare(
  `INSERT INTO staff (id, business_id, name, title, email, phone, color, active, sort_order)
   VALUES (?, 1, ?, ?, ?, ?, ?, 1, ?)`
);
const insertStaffService = db.prepare(
  `INSERT INTO staff_services (staff_id, service_id) VALUES (?, ?)`
);
STAFF.forEach((st, i) => {
  const email = st.name.split(" ")[0].toLowerCase() + "@wavewellness.example";
  insertStaff.run(i + 1, st.name, st.title, email, `(555) 014-22${10 + i}`, st.color, i);
  st.caps.forEach((serviceIdx) => insertStaffService.run(i + 1, serviceIdx + 1));
});

const insertAvail = db.prepare(
  `INSERT INTO availability_blocks (staff_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)`
);
Object.entries(AVAILABILITY).forEach(([staffIdx, blocks]) =>
  blocks.forEach((b) => insertAvail.run(Number(staffIdx) + 1, b.weekday, b.start, b.end))
);

const insertTimeOff = db.prepare(
  `INSERT INTO time_off (staff_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)`
);
TIME_OFF.forEach((t) =>
  insertTimeOff.run(t.staffIdx + 1, isoDate(t.start), isoDate(t.end), t.reason)
);

// --- Customers --------------------------------------------------------------
const insertCustomer = db.prepare(
  `INSERT INTO customers (id, business_id, first_name, last_name, email, phone, notes, tags, created_at)
   VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`
);
const usedNames = new Set<string>();
const customers: Array<{ id: number; first: string; last: string; phone: string; email: string }> = [];
for (let id = 1; id <= 120; id++) {
  let first = pick(FIRST_NAMES);
  let last = pick(LAST_NAMES);
  while (usedNames.has(first + last)) {
    first = pick(FIRST_NAMES);
    last = pick(LAST_NAMES);
  }
  usedNames.add(first + last);
  const phone = `(555) ${randInt(200, 989)}-${String(randInt(0, 9999)).padStart(4, "0")}`;
  const email = `${first.toLowerCase()}.${last.toLowerCase()}@example.com`;
  const tags: string[] = [];
  if (id <= 8) tags.push("VIP");
  if (id > 8 && id <= 16) tags.push("no-show risk");
  if (id > 110) tags.push("new");
  if (id > 100 && id <= 110) tags.push("lapsed");
  const createdAt = iso(addDays(TODAY, -randInt(id > 110 ? 3 : 30, id > 110 ? 20 : 200)));
  insertCustomer.run(
    id, first, last, email, phone,
    chance(0.25) ? pick(CUSTOMER_NOTES) : null,
    JSON.stringify(tags), createdAt
  );
  customers.push({ id, first, last, phone, email });
}
const regulars = customers.slice(16, 36);          // weighted-frequent bookers
const noShowProne = customers.slice(8, 16);

// --- Bookings ---------------------------------------------------------------
// Occupancy tracking: staff id -> 'yyyy-MM-dd' -> [busyStartMin, busyEndMin][]
const occupied = new Map<number, Map<string, Array<[number, number]>>>();
const timeOffDays = new Set<string>();
TIME_OFF.forEach((t) => {
  for (let d = t.start; d <= t.end; d = addDays(d, 1)) {
    timeOffDays.add(`${t.staffIdx + 1}|${isoDate(d)}`);
  }
});

const serviceWeights: number[] = [];
SERVICES.forEach((s, i) => {
  for (let k = 0; k < s.weight; k++) serviceWeights.push(i);
});

function placeBooking(dayOffset: number): {
  serviceIdx: number; staffIdx: number; day: Date; startMin: number;
} | null {
  const day = addDays(TODAY, dayOffset);
  const weekday = day.getDay();
  if (weekday === 0 || weekday === 1) return null; // closed Sun/Mon

  const serviceIdx = pick(serviceWeights);
  const svc = SERVICES[serviceIdx];
  const performers = STAFF.map((s, i) => i).filter((i) =>
    (STAFF[i].caps as readonly number[]).includes(serviceIdx) &&
    !timeOffDays.has(`${i + 1}|${isoDate(day)}`)
  );
  if (performers.length === 0) return null;
  const staffIdx = pick(performers);

  const blocks = AVAILABILITY[staffIdx].filter((b) => b.weekday === weekday);
  if (blocks.length === 0) return null;

  const dayKey = isoDate(day);
  let staffDays = occupied.get(staffIdx + 1);
  if (!staffDays) occupied.set(staffIdx + 1, (staffDays = new Map()));
  const busy = staffDays.get(dayKey) ?? [];

  // Candidate start times on a 15-minute grid where the busy window
  // (buffers included) fits the block and overlaps nothing.
  const candidates: number[] = [];
  for (const b of blocks) {
    const earliest = b.start + svc.before;
    const latest = b.end - svc.duration - svc.after;
    for (let t = Math.ceil(earliest / 15) * 15; t <= latest; t += 15) {
      const busyStart = t - svc.before;
      const busyEnd = t + svc.duration + svc.after;
      if (!busy.some(([s, e]) => busyStart < e && busyEnd > s)) candidates.push(t);
    }
  }
  if (candidates.length === 0) return null;

  const startMin = pick(candidates);
  busy.push([startMin - svc.before, startMin + svc.duration + svc.after]);
  staffDays.set(dayKey, busy);
  return { serviceIdx, staffIdx, day, startMin };
}

const insertBooking = db.prepare(
  `INSERT INTO bookings (id, business_id, customer_id, service_id, staff_id, start_at, end_at, status, price_cents, deposit_cents, deposit_status, stripe_payment_intent_id, cancel_token, notes, created_at, cancelled_at, cancellation_reason)
   VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertComm = db.prepare(
  `INSERT INTO communications (business_id, booking_id, customer_id, channel, kind, to_address, subject, body, status, sent_at)
   VALUES (1, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)`
);

function pickCustomer(status: string) {
  if (status === "No-Show" && chance(0.6)) return pick(noShowProne);
  if (chance(0.5)) return pick(regulars);
  return pick(customers);
}

const usedIds = new Set<string>();
let bookingCount = 0;
let commCount = 0;
const statusCounts: Record<string, number> = {};

function createBooking(dayOffset: number): boolean {
  const placed = placeBooking(dayOffset);
  if (!placed) return false;

  const svc = SERVICES[placed.serviceIdx];
  const start = addMinutes(placed.day, placed.startMin);
  const end = addMinutes(start, svc.duration);
  const isPast = start < now;

  let status: "Confirmed" | "Cancelled" | "Completed" | "No-Show";
  if (isPast) {
    const r = rand();
    status = r < 0.1 ? "Cancelled" : r < 0.17 ? "No-Show" : "Completed";
  } else {
    status = chance(0.04) ? "Cancelled" : "Confirmed";
  }

  const customer = pickCustomer(status);
  let id = `bk_${base36(10)}`;
  while (usedIds.has(id)) id = `bk_${base36(10)}`;
  usedIds.add(id);

  let createdAt = addMinutes(addDays(start, -randInt(2, 28)), randInt(-300, 300));
  // Upcoming bookings must still have been created in the past.
  if (createdAt > now) createdAt = addMinutes(now, -randInt(60, 10080));
  const hasDeposit = svc.deposit > 0;
  let depositStatus: string | null = null;
  if (hasDeposit) {
    if (status === "Confirmed") depositStatus = "Held";
    else if (status === "Completed" || status === "No-Show") depositStatus = "Captured";
    else depositStatus = chance(0.7) ? "Released" : "Refunded";
  }

  let cancelledAt: string | null = null;
  let cancelReason: string | null = null;
  if (status === "Cancelled") {
    const cancelPoint = new Date(
      createdAt.getTime() + rand() * (Math.min(start.getTime(), now.getTime()) - createdAt.getTime())
    );
    cancelledAt = iso(cancelPoint);
    cancelReason = pick(CANCEL_REASONS);
  }

  insertBooking.run(
    id, customer.id, placed.serviceIdx + 1, placed.staffIdx + 1,
    iso(start), iso(end), status, svc.price, svc.deposit,
    depositStatus, hasDeposit ? `pi_mock_${hex(16)}` : null,
    hex(32), null, iso(createdAt), cancelledAt, cancelReason
  );
  bookingCount++;
  statusCounts[status] = (statusCounts[status] ?? 0) + 1;

  // --- mock communications -------------------------------------------------
  const staffName = STAFF[placed.staffIdx].name.split(" ")[0];
  const when = format(start, "EEE MMM d 'at' h:mmaaa");
  const confirmBody = `Wave Wellness: you're booked! ${svc.name} with ${staffName}, ${when}. Reply HELP for help.`;
  if (createdAt <= now) {
    insertComm.run(id, customer.id, "sms", "confirmation", customer.phone, null, confirmBody, iso(createdAt));
    insertComm.run(id, customer.id, "email", "confirmation", customer.email,
      `Your Wave Wellness appointment is confirmed`,
      `Hi ${customer.first},\n\nYou're confirmed for ${svc.name} with ${staffName} on ${when}.\n\nDeposit: ${hasDeposit ? `$${(svc.deposit / 100).toFixed(2)} held` : "none required"}.\n\nSee you soon,\nWave Wellness`,
      iso(createdAt));
    commCount += 2;
  }
  const reminderAt = addMinutes(start, -24 * 60);
  if (status !== "Cancelled" && reminderAt <= now && reminderAt > createdAt) {
    insertComm.run(id, customer.id, "sms", "reminder_24h", customer.phone, null,
      `Wave Wellness reminder: ${svc.name} with ${staffName} tomorrow, ${format(start, "h:mmaaa")}. Need to change? Use your booking link.`,
      iso(reminderAt));
    commCount++;
  }
  if (status === "Completed") {
    const followAt = addMinutes(addDays(end, 1), 60);
    if (followAt <= now) {
      insertComm.run(id, customer.id, "sms", "followup", customer.phone, null,
        `Thanks for visiting Wave Wellness, ${customer.first}! We'd love to see you again. Book anytime from your last confirmation link.`,
        iso(followAt));
      commCount++;
    }
  }
  if (status === "Cancelled" && cancelledAt) {
    insertComm.run(id, customer.id, "sms", "cancellation", customer.phone, null,
      `Wave Wellness: your ${svc.name} on ${format(start, "MMM d")} is cancelled. ${depositStatus === "Released" ? "Your deposit hold was released." : depositStatus === "Refunded" ? "Your deposit was refunded." : ""}`.trim(),
      cancelledAt);
    commCount++;
  }
  return true;
}

const seedAll = db.transaction(() => {
  let past = 0;
  let future = 0;
  let guard = 0;
  while (past + future < 300 && guard < 20000) {
    guard++;
    const wantPast = past < 230 && (future >= 70 || chance(230 / 300));
    const offset = wantPast ? randInt(-90, -1) : randInt(0, 30);
    if (createBooking(offset)) {
      if (offset < 0) past++;
      else future++;
    }
  }
  if (past + future < 300) throw new Error(`Only placed ${past + future}/300 bookings`);
  return { past, future };
});

const { past, future } = seedAll();

console.log(`Seeded ${DB_PATH}`);
console.log(`  businesses:     1 (wave-wellness)`);
console.log(`  services:       ${SERVICES.length}`);
console.log(`  staff:          ${STAFF.length}`);
console.log(`  customers:      ${customers.length}`);
console.log(`  bookings:       ${bookingCount} (${past} past, ${future} upcoming)`);
Object.entries(statusCounts).forEach(([k, v]) => console.log(`    ${k.padEnd(10)} ${v}`));
console.log(`  communications: ${commCount}`);
db.close();
