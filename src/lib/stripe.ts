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

/**
 * The Stripe TEST publishable key, read at REQUEST time on the server.
 *
 * Next.js only inlines NEXT_PUBLIC_* into browser bundles at `next build`,
 * and the Docker image is built without Stripe env, so the browser can never
 * see a runtime-only NEXT_PUBLIC_ value. The publishable key is public by
 * design, so the server reads it here and passes it to the client as a prop
 * (see D-013). STRIPE_PUBLISHABLE_KEY wins; NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
 * is accepted as a fallback for older env files.
 *
 * Test mode only: anything that is not a pk_test_ key is treated as absent.
 */
export function getStripePublishableKey(): string | null {
  const key = (
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    ""
  ).trim();
  return key.startsWith("pk_test_") ? key : null;
}

/**
 * Whether the customer card-entry deposit flow can actually run: the server
 * needs the secret key (create/verify PaymentIntents) AND the browser needs a
 * publishable key (mount Stripe Elements). If either is missing the wizard
 * skips the Payment step and the booking route falls back to a policy-only
 * hold, so the UI never routes to a card step it cannot render.
 */
export function isDepositCardFlowEnabled(): boolean {
  return isStripeConfigured() && getStripePublishableKey() !== null;
}
