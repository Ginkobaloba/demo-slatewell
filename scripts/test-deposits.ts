/**
 * Deposit-hold tests (chunk 4.4). Run after db:seed.
 *
 *   npm run db:seed
 *   npx tsx scripts/test-deposits.ts
 *
 * Covers:
 *   - the pure cancellation policy (release inside the free window, capture
 *     outside it, nothing when there is no deposit)
 *   - the real Stripe manual-capture lifecycle when STRIPE_SECRET_KEY is set:
 *     authorize/hold with the success card (4242), decline with the declined
 *     card (4000 0000 0000 0002), then capture and release a held deposit.
 *
 * Exits nonzero on any failure. The live Stripe checks SKIP (not fail) when no
 * key is configured.
 */
import { decideCancellation } from "../src/lib/cancellation";
import {
  authorizeDeposit,
  captureDeposit,
  releaseDeposit,
} from "../src/lib/deposits";
import { getStripe, isStripeConfigured } from "../src/lib/stripe";

const failures: string[] = [];
let passed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) passed += 1;
  else failures.push(`${label}${detail ? ` (${detail})` : ""}`);
}

async function main() {
  // --- pure cancellation policy -----------------------------------------
  const start = "2026-12-01T15:00";

  const released = decideCancellation({
    startAt: start,
    now: "2026-11-30T10:00", // more than 24h before
    status: "Confirmed",
    windowHours: 24,
    depositStatus: "Held",
  });
  check("inside-window cancel releases the deposit", released.depositOutcome === "Released");
  check("inside-window cancel is allowed", released.allowed === true);

  const captured = decideCancellation({
    startAt: start,
    now: "2026-12-01T05:00", // 10h before, inside the 24h window
    status: "Confirmed",
    windowHours: 24,
    depositStatus: "Held",
  });
  check("late cancel captures the deposit", captured.depositOutcome === "Captured");

  const noDeposit = decideCancellation({
    startAt: start,
    now: "2026-11-30T10:00",
    status: "Confirmed",
    windowHours: 24,
    depositStatus: null,
  });
  check("no deposit means no settlement", noDeposit.depositOutcome === null);

  const alreadyCancelled = decideCancellation({
    startAt: start,
    now: "2026-11-30T10:00",
    status: "Cancelled",
    windowHours: 24,
    depositStatus: "Released",
  });
  check("cancelled booking is not re-cancellable", alreadyCancelled.allowed === false);

  const inPast = decideCancellation({
    startAt: "2026-01-01T10:00",
    now: "2026-12-01T10:00",
    status: "Confirmed",
    windowHours: 24,
    depositStatus: "Held",
  });
  check("past booking cannot be cancelled", inPast.allowed === false);

  // --- live Stripe manual-capture lifecycle ------------------------------
  if (isStripeConfigured()) {
    const stripe = getStripe();

    // Success card holds (authorizes but does not capture).
    const hold = await authorizeDeposit({
      amountCents: 2500,
      paymentMethod: "pm_card_visa", // 4242 4242 4242 4242
      metadata: { test: "hold" },
    });
    check("success card authorizes a deposit hold", hold.ok === true, hold.ok ? "" : hold.reason);

    if (hold.ok) {
      const pi = await stripe.paymentIntents.retrieve(hold.paymentIntentId);
      check(
        "held deposit is requires_capture, not captured",
        pi.status === "requires_capture",
        pi.status,
      );

      // Capture it (late cancel / no-show path).
      await captureDeposit(hold.paymentIntentId);
      const afterCapture = await stripe.paymentIntents.retrieve(hold.paymentIntentId);
      check(
        "capture charges the held deposit",
        afterCapture.status === "succeeded",
        afterCapture.status,
      );
    }

    // A second hold, then release it (inside-window cancel path).
    const hold2 = await authorizeDeposit({
      amountCents: 2500,
      paymentMethod: "pm_card_visa",
      metadata: { test: "release" },
    });
    if (hold2.ok) {
      await releaseDeposit(hold2.paymentIntentId);
      const afterRelease = await stripe.paymentIntents.retrieve(hold2.paymentIntentId);
      check(
        "release cancels the held deposit",
        afterRelease.status === "canceled",
        afterRelease.status,
      );
    } else {
      check("second hold for release succeeded", false, hold2.reason);
    }

    // Declined card does not authorize.
    const declined = await authorizeDeposit({
      amountCents: 2500,
      paymentMethod: "pm_card_chargeDeclined", // 4000 0000 0000 0002
      metadata: { test: "decline" },
    });
    check("declined card fails authorization", declined.ok === false, declined.ok ? "unexpected ok" : declined.reason);
  } else {
    check("Stripe hold lifecycle (SKIPPED: no STRIPE_SECRET_KEY)", true);
    console.log("  note: set STRIPE_SECRET_KEY (test mode) to exercise the live deposit checks");
  }

  // --- report ------------------------------------------------------------
  if (failures.length > 0) {
    console.error(`\n${failures.length} deposit test(s) FAILED:`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`\n${passed} passed, ${failures.length} failed`);
    process.exit(1);
  }
  console.log(`\nAll ${passed} deposit tests passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
