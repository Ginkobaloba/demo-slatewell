import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import {
  getActiveServices,
  getBusinessBySlug,
  getCapableStaff,
} from "@/lib/repo";
import type { Staff } from "@/lib/types";
import { BookingWizard } from "@/components/booking/booking-wizard";
import { SlatewellLogo } from "@/components/slatewell-logo";

export const dynamic = "force-dynamic";

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const business = getBusinessBySlug(params.slug);
  return { title: business ? `Book at ${business.name}` : "Book" };
}

export default function BookPage({ params }: { params: { slug: string } }) {
  const business = getBusinessBySlug(params.slug);
  if (!business) notFound();

  const services = getActiveServices(business.id);
  const staffByService: Record<number, Staff[]> = {};
  for (const service of services) {
    staffByService[service.id] = getCapableStaff(service.id);
  }

  // Which weekdays each staff member works at all (for the date strip).
  const weekdayRows = getDb()
    .prepare("SELECT DISTINCT staff_id, weekday FROM availability_blocks")
    .all() as Array<{ staff_id: number; weekday: number }>;
  const weekdaysByStaff: Record<number, number[]> = {};
  for (const row of weekdayRows) {
    (weekdaysByStaff[row.staff_id] ??= []).push(row.weekday);
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-8">
        <div className="mb-6 text-sm">
          <SlatewellLogo className="text-base text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {business.name}
        </h1>
        {business.tagline && (
          <p className="mt-1 text-muted-foreground">{business.tagline}</p>
        )}
        {business.hours_note && (
          <p className="mt-1 text-sm text-muted-foreground">
            {business.hours_note}
          </p>
        )}
      </header>
      <Suspense>
        <BookingWizard
          slug={business.slug}
          services={services}
          staffByService={staffByService}
          weekdaysByStaff={weekdaysByStaff}
          stripeEnabled={Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)}
        />
      </Suspense>
    </div>
  );
}
