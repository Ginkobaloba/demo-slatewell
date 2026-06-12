/**
 * Unit checks for the pure cancellation policy. Exits non-zero on
 * failure. Usage: npx tsx scripts/test-cancellation.ts
 */
import { decideCancellation } from "../src/lib/cancellation";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${JSON.stringify(detail)}`}`
  );
  if (!ok) failures++;
}

// More than 24h ahead: allowed, deposit released.
const early = decideCancellation({
  startAt: "2026-06-20T14:00",
  now: "2026-06-12T10:00",
  status: "Confirmed",
  windowHours: 24,
  depositStatus: "Held",
});
check("early cancel allowed", early.allowed && early.reason === "ok", early);
check("early cancel releases deposit", early.depositOutcome === "Released", early);
check("early cancel inside free window", early.insideFreeWindow, early);

// Less than 24h ahead: allowed, deposit kept.
const late = decideCancellation({
  startAt: "2026-06-12T18:00",
  now: "2026-06-12T10:00",
  status: "Confirmed",
  windowHours: 24,
  depositStatus: "Held",
});
check("late cancel allowed", late.allowed, late);
check("late cancel captures deposit", late.depositOutcome === "Captured", late);
check("late cancel outside free window", !late.insideFreeWindow, late);

// Exactly at the cutoff counts as inside the free window.
const cutoff = decideCancellation({
  startAt: "2026-06-13T10:00",
  now: "2026-06-12T10:00",
  status: "Confirmed",
  windowHours: 24,
  depositStatus: "Held",
});
check("cutoff boundary releases deposit", cutoff.depositOutcome === "Released", cutoff);

// No deposit: allowed, no outcome.
const noDeposit = decideCancellation({
  startAt: "2026-06-12T18:00",
  now: "2026-06-12T10:00",
  status: "Confirmed",
  windowHours: 24,
  depositStatus: null,
});
check("no-deposit cancel has null outcome", noDeposit.allowed && noDeposit.depositOutcome === null, noDeposit);

// Already cancelled: blocked.
const again = decideCancellation({
  startAt: "2026-06-20T14:00",
  now: "2026-06-12T10:00",
  status: "Cancelled",
  windowHours: 24,
  depositStatus: "Released",
});
check("double cancel blocked", !again.allowed && again.reason === "already-cancelled", again);

// Completed: blocked.
const completed = decideCancellation({
  startAt: "2026-06-01T14:00",
  now: "2026-06-12T10:00",
  status: "Completed",
  windowHours: 24,
  depositStatus: "Captured",
});
check("completed booking blocked", !completed.allowed && completed.reason === "not-cancellable", completed);

// Start time in the past: blocked.
const past = decideCancellation({
  startAt: "2026-06-12T09:00",
  now: "2026-06-12T10:00",
  status: "Confirmed",
  windowHours: 24,
  depositStatus: "Held",
});
check("past booking blocked", !past.allowed && past.reason === "in-past", past);

process.exit(failures === 0 ? 0 : 1);
