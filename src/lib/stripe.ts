import Stripe from "stripe";

/**
 * Lazily-constructed Stripe client. Construction is deferred so `next build`
 * and any non-payment code path do not need the secret key. Read at request
 * time from STRIPE_SECRET_KEY. Test mode only for this demo (sk_test_ key).
 */
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!cached) {
    cached = new Stripe(key);
  }
  return cached;
}

/**
 * Whether real Stripe deposit holds are active. When false, the booking flow
 * still works but deposits are tracked as policy-only holds (deposit_status
 * without a real PaymentIntent), so the demo runs without keys.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
