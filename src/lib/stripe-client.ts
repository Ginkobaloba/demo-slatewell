"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Browser-side Stripe.js loader. The TEST publishable key arrives as a prop
 * from the server (read at request time, see getStripePublishableKey in
 * ./stripe and D-013), not from a build-time NEXT_PUBLIC_ inline.
 *
 * loadStripe is memoized per key so Elements never re-initializes across
 * wizard re-renders (the same key always returns the same promise). Returns
 * a promise of null when no key is given.
 */
const cache = new Map<string, Promise<Stripe | null>>();
const NO_STRIPE: Promise<Stripe | null> = Promise.resolve(null);

export function getStripeClient(
  publishableKey: string | null | undefined,
): Promise<Stripe | null> {
  if (!publishableKey) return NO_STRIPE;
  let promise = cache.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    cache.set(publishableKey, promise);
  }
  return promise;
}
