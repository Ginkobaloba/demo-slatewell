import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBookingDetails } from "@/lib/repo";
import { getInstructions } from "@/lib/instructions";
import {
  formatDateLong,
  formatDuration,
  formatMoney,
  formatTime,
} from "@/lib/format";
import { SlatewellLogo } from "@/components/slatewell-logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Booking confirmed" };

export default function ConfirmationPage({
  params,
}: {
  params: { slug: string; bookingId: string };
}) {
  const booking = getBookingDetails(params.bookingId);
  if (!booking || booking.business_slug !== params.slug) notFound();

  const [date, time] = booking.start_at.split("T");
  const instructions = getInstructions(booking.service_name);
  const cancelHref = `/book/${params.slug}/cancel/${booking.id}?token=${booking.cancel_token}`;

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
        <Row
          label="Where"
          value={booking.business_address ?? booking.business_name}
        />
        <Row label="Price" value={formatMoney(booking.price_cents)} />
        {booking.deposit_cents > 0 && (
          <Row
            label="Deposit"
            value={`${formatMoney(booking.deposit_cents)} ${booking.deposit_status === "Held" ? "held" : booking.deposit_status?.toLowerCase() ?? ""}`}
          />
        )}
        <Row label="Booking ID" value={booking.id} />
      </dl>

      <a
        href={`/book/${params.slug}/confirmation/${booking.id}/ics`}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slatewell px-5 py-2.5 text-sm font-medium text-warmwhite transition-colors hover:bg-slatewell/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        download
      >
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M8 2v8m0 0L5 7m3 3l3-3M3 13h10" />
        </svg>
        Add to calendar (.ics)
      </a>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Before your visit</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {instructions.map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden="true" className="text-terracotta">
                &bull;
              </span>
              {line}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 border-t border-border pt-4 text-sm text-muted-foreground">
        Plans changed?{" "}
        <Link
          href={cancelHref}
          className="font-medium text-slatewell underline underline-offset-2"
        >
          Cancel or reschedule
        </Link>{" "}
        at least {booking.business_cancellation_window_hours} hours ahead to
        release your deposit. Or{" "}
        <Link
          href={`/book/${params.slug}`}
          className="font-medium text-slatewell underline underline-offset-2"
        >
          book another appointment
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
