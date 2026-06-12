import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getBookingDetails,
  getBusinessBySlug,
  localNowIso,
  verifyCancelToken,
} from "@/lib/repo";
import { decideCancellation } from "@/lib/cancellation";
import { SlatewellLogo } from "@/components/slatewell-logo";
import { CancelPanel } from "@/components/booking/cancel-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cancel appointment" };

export default function CancelPage({
  params,
  searchParams,
}: {
  params: { slug: string; bookingId: string };
  searchParams: { token?: string };
}) {
  const business = getBusinessBySlug(params.slug);
  if (!business) notFound();

  const booking = getBookingDetails(params.bookingId);
  const tokenOk =
    booking !== undefined &&
    booking.business_id === business.id &&
    verifyCancelToken(booking, searchParams.token);

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <div className="mb-6 text-sm">
        <SlatewellLogo className="text-base text-muted-foreground" />
      </div>
      {!tokenOk || !booking ? (
        <section>
          <h1 className="text-2xl font-semibold tracking-tight">
            This link is not valid
          </h1>
          <p className="mt-2 max-w-prose text-muted-foreground">
            The cancellation link is incomplete or no longer matches this
            booking. Please use the exact link from your confirmation
            email or text, or contact {business.name} directly.
          </p>
        </section>
      ) : (
        <CancelPanel
          slug={params.slug}
          token={searchParams.token as string}
          booking={{
            id: booking.id,
            serviceName: booking.service_name,
            staffName: booking.staff_name,
            startAt: booking.start_at,
            status: booking.status,
            depositCents: booking.deposit_cents,
            depositStatus: booking.deposit_status,
          }}
          decision={decideCancellation({
            startAt: booking.start_at,
            now: localNowIso(),
            status: booking.status,
            windowHours: business.cancellation_window_hours,
            depositStatus: booking.deposit_status,
          })}
          windowHours={business.cancellation_window_hours}
        />
      )}
    </div>
  );
}
