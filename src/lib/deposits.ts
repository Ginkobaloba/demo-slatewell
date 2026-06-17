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
