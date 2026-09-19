"use client";

import type { Stripe } from "@stripe/stripe-js";

/**
 * Browser-side Stripe.js loader. The TEST publishable key arrives as a prop
 * from the server (read at request time, see getStripePublishableKey in
 * ./stripe and D-013), not from a build-time NEXT_PUBLIC_ inline.
 *
 * loadStripe is memoized per key so Elements never re-initializes across
 * wizard re-renders (the same key always returns the same promise). Returns
 * a promise of null when no key is given.
 *
 * Both the @stripe/stripe-js import and the js.stripe.com script tag it
 * injects are deferred until this function is actually called with a key.
 * DepositPaymentStep only mounts at the wizard's Payment step (booking-wizard
 * imports it statically, so its module graph is otherwise always present in
 * the /book bundle), so a request to js.stripe.com must not happen just from
 * loading /book. Two things make that true here:
 *   - `@stripe/stripe-js/pure` (unlike the default `@stripe/stripe-js` entry)
 *     has no import-time side effect; the default entry schedules its own
 *     script injection on a microtask right after the module evaluates,
 *     independent of whether loadStripe() is ever invoked (see D-017).
 *   - The import itself is dynamic, so the module (and Stripe's script tag)
 *     is fetched only when a real publishable key reaches this function --
 *     i.e., only when the card step actually mounts.
 */
const cache = new Map<string, Promise<Stripe | null>>();
const NO_STRIPE: Promise<Stripe | null> = Promise.resolve(null);

export function getStripeClient(
  publishableKey: string | null | undefined,
): Promise<Stripe | null> {
  if (!publishableKey) return NO_STRIPE;
  let promise = cache.get(publishableKey);
  if (!promise) {
    promise = import("@stripe/stripe-js/pure").then(({ loadStripe }) =>
      loadStripe(publishableKey),
    );
    cache.set(publishableKey, promise);
  }
  return promise;
}
