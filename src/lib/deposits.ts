import { getStripe } from "./stripe";

/**
 * Stripe deposit holds via manual capture.
 *
 * A booking that requires a deposit authorizes (holds) the amount at booking
 * time with capture_method: "manual", so the card is authorized but not
 * charged. The cancellation policy then either releases the hold (cancel the
 * PaymentIntent) inside the free window, or captures it (charge the deposit)
 * outside the window or on a no-show.
 *
 * The demo has no PCI card-entry UI, so the hold is placed with a Stripe test
 * payment method. The lifecycle (authorize -> hold -> release/capture) is the
 * real Stripe flow; only the card source is a test token. Override the token
 * with STRIPE_DEMO_PAYMENT_METHOD.
 */
export const DEMO_DEPOSIT_PAYMENT_METHOD =
  process.env.STRIPE_DEMO_PAYMENT_METHOD ?? "pm_card_visa";

export type DepositAuthorization =
  | { ok: true; paymentIntentId: string }
  | { ok: false; reason: string };

/**
 * Create an UNCONFIRMED manual-capture deposit intent for the Stripe
 * Elements card-entry flow. The customer confirms it in the browser with
 * the card they enter, which authorizes (holds) the amount without
 * charging it (status -> requires_capture). The returned client_secret is
 * handed to <PaymentElement>; the PaymentIntent id is verified server-side
 * before a booking is written against it.
 */
export async function createDepositIntent(opts: {
  amountCents: number;
  metadata?: Record<string, string>;
}): Promise<
  | { ok: true; clientSecret: string; paymentIntentId: string }
  | { ok: false; reason: string }
> {
  try {
    const intent = await getStripe().paymentIntents.create({
      amount: opts.amountCents,
      currency: "usd",
      capture_method: "manual",
      // A deposit hold is a card authorization (auth now, capture/release
      // later), so the customer enters a card -- not a bank/redirect method.
      payment_method_types: ["card"],
      metadata: opts.metadata ?? {},
    });
    if (!intent.client_secret) {
      return { ok: false, reason: "no client secret" };
    }
    return {
      ok: true,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { ok: false, reason: e.code ?? e.message ?? "intent_error" };
  }
}

/**
 * Verify a customer-confirmed deposit intent before a booking is written
 * against it: it must be authorized-but-not-captured (requires_capture),
 * priced exactly at the deposit, in USD, and tagged for this business. Any
 * mismatch is treated as a tampering/replay attempt and rejected.
 */
export async function verifyDepositIntent(opts: {
  paymentIntentId: string;
  expectedAmountCents: number;
  expectedBusinessSlug: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  let intent;
  try {
    intent = await getStripe().paymentIntents.retrieve(opts.paymentIntentId);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { ok: false, reason: e.code ?? e.message ?? "retrieve_error" };
  }
  if (intent.status !== "requires_capture") {
    return { ok: false, reason: `status ${intent.status}` };
  }
  if (intent.amount !== opts.expectedAmountCents) {
    return { ok: false, reason: "amount mismatch" };
  }
  if (intent.currency !== "usd") {
    return { ok: false, reason: "currency mismatch" };
  }
  if (intent.metadata?.business !== opts.expectedBusinessSlug) {
    return { ok: false, reason: "business mismatch" };
  }
  return { ok: true };
}

/** Authorize (hold) a deposit. Returns the PaymentIntent id on success. */
export async function authorizeDeposit(opts: {
  amountCents: number;
  paymentMethod?: string;
  metadata?: Record<string, string>;
}): Promise<DepositAuthorization> {
  try {
    const intent = await getStripe().paymentIntents.create({
      amount: opts.amountCents,
      currency: "usd",
      capture_method: "manual",
      confirm: true,
      payment_method: opts.paymentMethod ?? DEMO_DEPOSIT_PAYMENT_METHOD,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata: opts.metadata ?? {},
    });
    if (intent.status === "requires_capture") {
      return { ok: true, paymentIntentId: intent.id };
    }
    return { ok: false, reason: `unexpected status: ${intent.status}` };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return { ok: false, reason: e.code ?? e.message ?? "card_error" };
  }
}

/** Release a held deposit (inside the free-cancellation window). Idempotent. */
export async function releaseDeposit(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status === "canceled") return;
  if (intent.status === "requires_capture") {
    await stripe.paymentIntents.cancel(paymentIntentId);
  }
}

/** Capture a held deposit (late cancellation or no-show). Idempotent. */
export async function captureDeposit(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status === "succeeded") return;
  if (intent.status === "requires_capture") {
    await stripe.paymentIntents.capture(paymentIntentId);
  }
}

/** A real Stripe PaymentIntent id, not the policy-only placeholder. */
export function isRealPaymentIntent(id: string | null): id is string {
  return Boolean(id) && !id!.startsWith("pi_mock");
}
