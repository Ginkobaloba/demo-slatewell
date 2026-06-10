/**
 * Sanity checks on the seeded database. Exits non-zero on any failure.
 * Usage: npx tsx scripts/verify-seed.ts
 */
import Database from "better-sqlite3";
import path from "path";

const db = new Database(
  process.env.SLATEWELL_DB_PATH ?? path.join(__dirname, "..", "data", "slatewell.db"),
  { readonly: true }
);

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const overlaps = db
  .prepare(
    `SELECT COUNT(*) AS n FROM bookings a
     JOIN bookings b ON a.staff_id = b.staff_id AND a.id < b.id
       AND a.start_at < b.end_at AND b.start_at < a.end_at`
  )
  .get() as { n: number };
check("no overlapping bookings per staff", overlaps.n === 0, overlaps);

const counts = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM bookings) AS bookings,
            (SELECT COUNT(*) FROM customers) AS customers,
            (SELECT COUNT(*) FROM services) AS services,
            (SELECT COUNT(*) FROM staff) AS staff,
            (SELECT COUNT(*) FROM communications) AS comms`
  )
  .get() as Record<string, number>;
check("300 bookings", counts.bookings === 300, counts);
check("120 customers", counts.customers === 120, counts);
check("8 services / 5 staff", counts.services === 8 && counts.staff === 5, counts);
check("communications logged", counts.comms > 500, counts);

const badCaps = db
  .prepare(
    `SELECT COUNT(*) AS n FROM bookings bk
     LEFT JOIN staff_services ss
       ON ss.staff_id = bk.staff_id AND ss.service_id = bk.service_id
     WHERE ss.staff_id IS NULL`
  )
  .get() as { n: number };
check("every booking's staff can perform its service", badCaps.n === 0, badCaps);

const badDow = db
  .prepare(
    `SELECT COUNT(*) AS n FROM bookings
     WHERE CAST(strftime('%w', start_at) AS INTEGER) IN (0, 1)`
  )
  .get() as { n: number };
check("no bookings on Sun/Mon (closed)", badDow.n === 0, badDow);

const futureCreated = db
  .prepare(`SELECT COUNT(*) AS n FROM bookings WHERE created_at > datetime('now', 'localtime')`)
  .get() as { n: number };
check("no bookings created in the future", futureCreated.n === 0, futureCreated);

const orphanComms = db
  .prepare(
    `SELECT COUNT(*) AS n FROM communications c
     LEFT JOIN bookings b ON b.id = c.booking_id WHERE b.id IS NULL`
  )
  .get() as { n: number };
check("no orphaned communications", orphanComms.n === 0, orphanComms);

const depositMismatch = db
  .prepare(
    `SELECT COUNT(*) AS n FROM bookings
     WHERE (deposit_cents = 0 AND deposit_status IS NOT NULL)
        OR (deposit_cents > 0 AND deposit_status IS NULL)`
  )
  .get() as { n: number };
check("deposit status consistent with deposit amount", depositMismatch.n === 0, depositMismatch);

process.exit(failures === 0 ? 0 : 1);
