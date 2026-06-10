import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBookingDetails } from "@/lib/repo";
import {
  formatDateLong,
  formatDuration,
  formatMoney,
  formatTime,
} from "@/lib/format";
import { SlatewellLogo } from "@/components/slatewell-logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Booking confirmed" };

/**
 * Confirmation page, v0. Chunk 4.5 adds the ICS download,
 * pre-appointment instructions, and the cancel/reschedule link.
 */
export default function ConfirmationPage({
  params,
}: {
  params: { slug: string; bookingId: string };
}) {
  const booking = getBookingDetails(params.bookingId);
  if (!booking || booking.business_slug !== params.slug) notFound();

  const [date, time] = booking.start_at.split("T");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <div className="mb-6 text-sm">
        <SlatewellLogo className="text-base text-muted-foreground" />
      </div>

      <div
        aria-hidden="true"
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slatewell"
      >
        <svg
          viewBox="0 0 20 20"
          className="h-6 w-6"
          fill="none"
          stroke="#fafafa"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 10.5l4 4 8-9" />
        </svg>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">
        You&apos;re booked, {booking.customer_first_name}.
      </h1>
      <p className="mt-1 text-muted-foreground">
        A confirmation text and email are on their way.
      </p>

      <dl className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
        <Row label="Service" value={booking.service_name} />
        <Row label="With" value={booking.staff_name} />
        <Row
          label="When"
          value={`${formatDateLong(date)} at ${formatTime(time)}`}
        />
        <Row
          label="Duration"
          value={formatDuration(booking.service_duration_min)}
        />
        <Row label="Where" value={booking.business_address ?? booking.business_name} />
        <Row label="Price" value={formatMoney(booking.price_cents)} />
        {booking.deposit_cents > 0 && (
          <Row
            label="Deposit"
            value={`${formatMoney(booking.deposit_cents)} ${booking.deposit_status === "Held" ? "held" : booking.deposit_status?.toLowerCase() ?? ""}`}
          />
        )}
        <Row label="Booking ID" value={booking.id} />
      </dl>

      <p className="mt-4 text-sm text-muted-foreground">
        Calendar download and pre-appointment instructions arrive in a
        later build chunk. Need anything else?{" "}
        <Link
          href={`/book/${params.slug}`}
          className="font-medium text-slatewell underline underline-offset-2"
        >
          Book another appointment
        </Link>
        .
      </p>
    </div>
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
