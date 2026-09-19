import Stripe from "stripe";

/**
 * Stripe is TEST mode only in this demo (sk_test_ / pk_test_), never a live
 * key. The secret key is checked here, on the server, the same way
 * getStripePublishableKey below checks the publishable key (D-013): anything
 * that is not an sk_test_ key is refused.
 *
 * Refused means: isStripeConfigured() is false, so the booking flow falls
 * back to policy-only deposit holds and settlement skips Stripe, and
 * getStripe() throws a clear error if anything calls it anyway. No request
 * ever reaches Stripe with a live key.
 */
const TEST_SECRET_PREFIX = "sk_test_";

let warnedNonTestKey = false;

/**
 * The Stripe TEST secret key, read at request time, or null when it is unset
 * or not an sk_test_ key. A non-test key is logged once (without the key).
 */
export function getStripeSecretKey(): string | null {
  const key = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!key) return null;
  if (!key.startsWith(TEST_SECRET_PREFIX)) {
    if (!warnedNonTestKey) {
      warnedNonTestKey = true;
      console.error(
        "[stripe] STRIPE_SECRET_KEY is not a Stripe TEST secret key (sk_test_). Stripe is disabled; this demo accepts only sk_test_ keys.",
      );
    }
    return null;
  }
  return key;
}

/**
 * Lazily-constructed Stripe client. Construction is deferred so `next build`
 * and any non-payment code path do not need the secret key. Memoized per key
 * so a changed key is never served by a stale client.
 */
let cached: { key: string; client: Stripe } | null = null;

export function getStripe(): Stripe {
  const raw = (process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!raw) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  const key = getStripeSecretKey();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY must be a Stripe TEST secret key (sk_test_). Any other key (live, restricted or publishable) is refused.",
    );
  }
  if (!cached || cached.key !== key) {
    cached = { key, client: new Stripe(key) };
  }
  return cached.client;
}

/**
 * Whether real Stripe deposit holds are active: a TEST secret key is set.
 * When false, the booking flow still works but deposits are tracked as
 * policy-only holds (deposit_status without a real PaymentIntent), so the
 * demo runs without keys, and a live key is never used.
 */
export function isStripeConfigured(): boolean {
  return getStripeSecretKey() !== null;
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
