"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Browser-side Stripe.js singleton. loadStripe is memoized in a module
 * promise so Elements never re-initializes across wizard re-renders.
 * Reads the TEST publishable key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
 * inlined at build time. Returns null when no key is configured so the
 * wizard can fall back to a keyless (policy-only) booking.
 */
let cached: Promise<Stripe | null> | null = null;

export function getStripeClient(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return Promise.resolve(null);
  if (!cached) cached = loadStripe(key);
  return cached;
}

export function isStripeClientConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
