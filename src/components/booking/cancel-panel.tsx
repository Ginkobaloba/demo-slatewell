"use client";

/**
 * Client side of the token-protected cancel page. The server component
 * verified the token and computed the policy decision; this panel
 * confirms intent, POSTs the cancellation, and shows the outcome.
 */
import { useState } from "react";
import Link from "next/link";
import type { CancellationDecision, DepositOutcome } from "@/lib/cancellation";
import { formatDateLong, formatMoney, formatTime } from "@/lib/format";
import type { BookingStatus, DepositStatus } from "@/lib/types";

interface CancelBooking {
  id: string;
  serviceName: string;
  staffName: string;
  startAt: string;
  status: BookingStatus;
  depositCents: number;
  depositStatus: DepositStatus | null;
}

export function CancelPanel({
  slug,
  token,
  booking,
  decision,
  windowHours,
}: {
  slug: string;
  token: string;
  booking: CancelBooking;
  decision: CancellationDecision;
  windowHours: number;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DepositOutcome | "no-deposit" | null>(null);

  const [date, time] = booking.startAt.split("T");

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${slug}/bookings/${booking.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reason: reason || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setDone(data.depositOutcome ?? "no-deposit");
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          Your appointment is cancelled
        </h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          {booking.serviceName} on {formatDateLong(date)} at {formatTime(time)}{" "}
          has been cancelled.
          {done === "Released" &&
            ` Your ${formatMoney(booking.depositCents)} deposit has been released.`}
          {done === "Captured" &&
            ` Per the ${windowHours}-hour policy, the ${formatMoney(booking.depositCents)} deposit was kept.`}
        </p>
        <Link
          href={`/book/${slug}`}
          className="mt-6 inline-block rounded-lg bg-slatewell px-6 py-3 font-medium text-warmwhite transition-colors hover:bg-slatewell/90"
        >
          Book a new time
        </Link>
      </section>
    );
  }

  if (!decision.allowed) {
    const message =
      decision.reason === "already-cancelled"
        ? "This booking has already been cancelled."
        : decision.reason === "in-past"
          ? "This appointment has already happened, so there is nothing to cancel."
          : "This booking can no longer be cancelled online. Please contact us directly.";
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nothing to cancel
        </h1>
        <p className="mt-2 max-w-prose text-muted-foreground">{message}</p>
        <Link
          href={`/book/${slug}`}
          className="mt-6 inline-block rounded-lg bg-slatewell px-6 py-3 font-medium text-warmwhite transition-colors hover:bg-slatewell/90"
        >
          Book a new appointment
        </Link>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">
        Cancel this appointment?
      </h1>

      <dl className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
        <Row label="Service" value={booking.serviceName} />
        <Row label="With" value={booking.staffName} />
        <Row
          label="When"
          value={`${formatDateLong(date)} at ${formatTime(time)}`}
        />
        {booking.depositCents > 0 && (
          <Row label="Deposit" value={formatMoney(booking.depositCents)} />
        )}
      </dl>

      {booking.depositCents > 0 && booking.depositStatus === "Held" && (
        <p
          className={`mt-4 rounded-md border px-3 py-2 text-sm ${
            decision.insideFreeWindow
              ? "border-border bg-secondary text-secondary-foreground"
              : "border-terracotta/40 bg-accent text-accent-foreground"
          }`}
        >
          {decision.insideFreeWindow
            ? `You are cancelling more than ${windowHours} hours ahead, so your deposit will be released.`
            : `This is less than ${windowHours} hours before your appointment, so the deposit will be kept per the cancellation policy.`}
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-terracotta/40 bg-accent px-3 py-2 text-sm text-accent-foreground"
        >
          {error}
        </p>
      )}

      <div className="mt-4">
        <label htmlFor="reason" className="mb-1 block text-sm font-medium">
          Reason{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="reason"
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={submitting}
          onClick={submit}
          className="rounded-lg bg-slatewell px-6 py-3 font-medium text-warmwhite transition-colors hover:bg-slatewell/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
        >
          {submitting ? "Cancelling..." : "Yes, cancel appointment"}
        </button>
        <Link
          href={`/book/${slug}`}
          className="rounded-lg border border-border bg-card px-6 py-3 text-center font-medium transition-colors hover:bg-muted"
        >
          Keep my booking
        </Link>
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
