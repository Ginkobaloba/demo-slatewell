/**
 * End-to-end deposit-hold test against the running app + live Stripe TEST
 * keys. Proves the manual-capture lifecycle the customer Elements flow
 * drives: create intent -> authorize (hold) -> verify -> write booking ->
 * settle. Simulates the browser's stripe.confirmPayment by confirming the
 * intent server-side with a Stripe test PaymentMethod.
 *
 * Prereqs: dev/prod server on BASE_URL (default http://localhost:3000),
 * seeded database, STRIPE_SECRET_KEY in env or .env.local.
 * Usage: node scripts/e2e-deposit.mjs
 */
import Stripe from "stripe";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = "wave-wellness";
const DEPOSIT_SERVICE_ID = 1; // Signature Facial, $25 deposit
const DEPOSIT_CENTS = 2500;

// Load STRIPE_SECRET_KEY from .env.local if not already in the environment.
function loadKey() {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^STRIPE_SECRET_KEY=(.+)$/);
      if (m) return m[1].trim();
    }
  }
  return null;
}

const KEY = loadKey();
if (!KEY) {
  console.error("STRIPE_SECRET_KEY not set; cannot run deposit e2e.");
  process.exit(1);
}
const stripe = new Stripe(KEY);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failures++;
};

async function api(method, pathname, body) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Find an open slot for the deposit service. minOffset skips ahead so the
// settlement booking lands well outside the 24h free-cancellation window.
async function findOpenSlot(minOffset = 0) {
  const start = new Date();
  for (let i = minOffset; i < 30; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const { data } = await api(
      "GET",
      `/api/book/${SLUG}/availability?serviceId=${DEPOSIT_SERVICE_ID}&date=${date}`,
    );
    if (data.slots && data.slots.length > 0) {
      return { date, ...data.slots[0] };
    }
  }
  return null;
}

const customer = {
  firstName: "Deposit",
  lastName: "Tester",
  email: "deposit.tester@example.com",
  phone: "(555) 010-7777",
};

async function bookWithRealHold() {
  // At least 2 days out so the cleanup cancel is inside the free window.
  const slot = await findOpenSlot(2);
  check("found an open deposit slot", Boolean(slot), JSON.stringify(slot));
  if (!slot) return null;

  // 1. Create the deposit intent (what the payment step does on mount).
  const intentRes = await api("POST", `/api/book/${SLUG}/deposit-intent`, {
    serviceId: DEPOSIT_SERVICE_ID,
    staffId: slot.staffId,
    date: slot.date,
    time: slot.time,
  });
  check("deposit-intent 200", intentRes.status === 200, JSON.stringify(intentRes));
  check(
    "intent amount is the deposit",
    intentRes.data.amountCents === DEPOSIT_CENTS,
    String(intentRes.data.amountCents),
  );
  const piId = intentRes.data.paymentIntentId;
  if (!piId) return null;

  // 2. Authorize the hold the way the browser would (card 4242 -> visa).
  const confirmed = await stripe.paymentIntents.confirm(piId, {
    payment_method: "pm_card_visa",
  });
  check(
    "card authorized, hold placed (requires_capture)",
    confirmed.status === "requires_capture",
    confirmed.status,
  );

  // 3. Write the booking against the verified hold.
  const bookRes = await api("POST", `/api/book/${SLUG}/bookings`, {
    serviceId: DEPOSIT_SERVICE_ID,
    staffId: slot.staffId,
    date: slot.date,
    time: slot.time,
    customer,
    paymentIntentId: piId,
  });
  check("booking created (201)", bookRes.status === 201, JSON.stringify(bookRes));
  const bookingId = bookRes.data.id;

  // 4. Stripe dashboard proof: the hold is live and uncaptured.
  const onFile = await stripe.paymentIntents.retrieve(piId);
  check(
    "hold visible in Stripe as uncaptured",
    onFile.status === "requires_capture" &&
      onFile.amount === DEPOSIT_CENTS &&
      onFile.amount_received === 0,
    `${onFile.status}/${onFile.amount}/${onFile.amount_received}`,
  );
  check(
    "hold tagged for this business",
    onFile.metadata?.business === SLUG,
    JSON.stringify(onFile.metadata),
  );

  // 5. DB proof: booking carries the real PaymentIntent, Held.
  const db = new Database(path.join(ROOT, "data", "slatewell.db"), {
    readonly: true,
  });
  const row = db.prepare("SELECT * FROM bookings WHERE id = ?").get(bookingId);
  db.close();
  check("booking has the real PaymentIntent", row?.stripe_payment_intent_id === piId);
  check("deposit Held", row?.deposit_status === "Held", row?.deposit_status);
  check("not a mock intent", !String(row?.stripe_payment_intent_id).startsWith("pi_mock"));

  return { bookingId, piId, slot, cancelToken: row?.cancel_token };
}

async function negativeChecks(usedPiId) {
  // a. Replaying a used PaymentIntent is rejected.
  const slot = await findOpenSlot();
  if (slot) {
    const reuse = await api("POST", `/api/book/${SLUG}/bookings`, {
      serviceId: DEPOSIT_SERVICE_ID,
      staffId: slot.staffId,
      date: slot.date,
      time: slot.time,
      customer,
      paymentIntentId: usedPiId,
    });
    check("reused PaymentIntent rejected (409)", reuse.status === 409, JSON.stringify(reuse));
  }

  // b. A deposit service without a hold is rejected (402).
  const slot2 = await findOpenSlot();
  if (slot2) {
    const noPi = await api("POST", `/api/book/${SLUG}/bookings`, {
      serviceId: DEPOSIT_SERVICE_ID,
      staffId: slot2.staffId,
      date: slot2.date,
      time: slot2.time,
      customer,
    });
    check("deposit booking without hold rejected (402)", noPi.status === 402, JSON.stringify(noPi));
  }

  // c. A hold with the wrong amount / no business tag is rejected (402).
  const rogue = await stripe.paymentIntents.create({
    amount: 100,
    currency: "usd",
    capture_method: "manual",
    confirm: true,
    payment_method: "pm_card_visa",
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  });
  const slot3 = await findOpenSlot();
  if (slot3) {
    const tampered = await api("POST", `/api/book/${SLUG}/bookings`, {
      serviceId: DEPOSIT_SERVICE_ID,
      staffId: slot3.staffId,
      date: slot3.date,
      time: slot3.time,
      customer,
      paymentIntentId: rogue.id,
    });
    check("mismatched hold rejected (402)", tampered.status === 402, JSON.stringify(tampered));
  }
  await stripe.paymentIntents.cancel(rogue.id).catch(() => {});
}

async function settlementCheck(booking) {
  // Cancelling inside the free window releases the hold (cancels the PI).
  const res = await api(
    "POST",
    `/api/book/${SLUG}/bookings/${booking.bookingId}/cancel`,
    { token: booking.cancelToken, reason: "e2e cleanup" },
  );
  check(
    "cancel released deposit",
    res.status === 200 && res.data.depositOutcome === "Released",
    JSON.stringify(res),
  );
  const after = await stripe.paymentIntents.retrieve(booking.piId);
  check("hold canceled in Stripe after release", after.status === "canceled", after.status);
}

const booking = await bookWithRealHold();
if (booking) {
  await negativeChecks(booking.piId);
  await settlementCheck(booking);
}

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
