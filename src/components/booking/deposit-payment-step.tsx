"use client";

/**
 * Deposit card-entry step. Creates a manual-capture PaymentIntent for the
 * service deposit, collects a real card with Stripe <CardElement>, and on a
 * successful authorization (status requires_capture) writes the booking
 * against the verified PaymentIntent id. No card data touches our server --
 * Stripe.js posts it directly to Stripe. CardElement (not PaymentElement)
 * is used deliberately: a deposit is a card hold, so we want one clean card
 * field, not an accordion of banks/wallets.
 */
import { useEffect, useRef, useState } from "react";
import {
  CardElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripe-client";
import { formatMoney } from "@/lib/format";

interface BookingPayload {
  serviceId: number;
  staffId: number;
  date: string;
  time: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  notes?: string;
}

interface StepProps {
  slug: string;
  depositCents: number;
  payload: BookingPayload;
  onBack: () => void;
  onSlotTaken: (message: string) => void;
  onConfirmed: (bookingId: string) => void;
}

const stripePromise = getStripeClient();

const CARD_OPTIONS = {
  style: {
    base: {
      color: "#1a242f",
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
      "::placeholder": { color: "#8a97a5" },
    },
    invalid: { color: "#c97b5a" },
  },
};

export function DepositPaymentStep(props: StepProps) {
  return (
    <Elements stripe={stripePromise}>
      <DepositForm {...props} />
    </Elements>
  );
}

function DepositForm({
  slug,
  depositCents,
  payload,
  onBack,
  onSlotTaken,
  onConfirmed,
}: StepProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);
  const onSlotTakenRef = useRef(onSlotTaken);
  onSlotTakenRef.current = onSlotTaken;

  const { serviceId, staffId, date, time } = payload;

  // Create the deposit intent exactly once. Deps are stable primitives so a
  // parent re-render never re-fires this; the ref guard covers StrictMode.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch(`/api/book/${slug}/deposit-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serviceId, staffId, date, time }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          onSlotTakenRef.current(
            data.error ?? "That time was just taken. Pick another opening.",
          );
          return;
        }
        if (!res.ok || !data.clientSecret) {
          setFatal(true);
          setError(
            data.error ?? "We could not start the deposit. Please try again.",
          );
          return;
        }
        setClientSecret(data.clientSecret);
        setPaymentIntentId(data.paymentIntentId);
      } catch {
        setFatal(true);
        setError("Network error. Please try again.");
      }
    })();
  }, [slug, serviceId, staffId, date, time]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const card = elements?.getElement(CardElement);
    if (!stripe || !card || !clientSecret || !paymentIntentId || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);

    // Authorize (hold) the entered card. Manual capture means success lands
    // the PaymentIntent in requires_capture -- authorized, not charged.
    const { error: confirmError, paymentIntent } =
      await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      });

    if (confirmError) {
      setError(
        confirmError.message ??
          "Your card could not be authorized. Please try another card.",
      );
      setSubmitting(false);
      return;
    }
    if (
      !paymentIntent ||
      (paymentIntent.status !== "requires_capture" &&
        paymentIntent.status !== "succeeded")
    ) {
      setError("The deposit hold did not complete. Please try again.");
      setSubmitting(false);
      return;
    }

    // Hold is live -- write the booking against the verified PaymentIntent.
    try {
      const res = await fetch(`/api/book/${slug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, paymentIntentId }),
      });
      if (res.status === 201) {
        const { id } = await res.json();
        onConfirmed(id);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        onSlotTakenRef.current(
          data.error ?? "That time was just taken. Pick another opening.",
        );
        return;
      }
      setError(data.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
    } catch {
      setError("Network error completing your booking. Please try again.");
      setSubmitting(false);
    }
  }

  if (fatal) {
    return (
      <div className="space-y-4">
        <p
          role="alert"
          className="rounded-md border border-terracotta/40 bg-accent px-3 py-2 text-sm text-accent-foreground"
        >
          {error}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium hover:bg-muted"
        >
          Back to review
        </button>
      </div>
    );
  }

  const ready = Boolean(stripe && clientSecret);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block text-sm font-medium" htmlFor="card-element">
        Card details
      </label>
      <div
        id="card-element"
        className="rounded-lg border border-input bg-card px-3 py-3"
      >
        <CardElement
          options={CARD_OPTIONS}
          onChange={(ev) => {
            setCardComplete(ev.complete);
            if (ev.error) setError(ev.error.message);
            else setError(null);
          }}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-terracotta/40 bg-accent px-3 py-2 text-sm text-accent-foreground"
        >
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        We place a {formatMoney(depositCents)} hold now -- your card is
        authorized, not charged. Cancel at least 24 hours ahead to release it.
        Test card: 4242 4242 4242 4242, any future date, any CVC, any ZIP.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <button
          type="submit"
          disabled={!ready || !cardComplete || submitting}
          className="rounded-lg bg-slatewell px-6 py-3 font-medium text-warmwhite transition-colors hover:bg-slatewell/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
        >
          {submitting
            ? "Authorizing deposit..."
            : ready
              ? `Hold ${formatMoney(depositCents)} & confirm booking`
              : "Preparing secure payment..."}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="rounded-lg border border-border bg-card px-6 py-3 text-center font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          Back
        </button>
      </div>
    </form>
  );
}
