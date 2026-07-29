import type { Metadata } from "next";
import { format } from "date-fns";
import { getBusinessBySlug } from "@/lib/repo";
import { getScheduleForDate } from "@/lib/admin-repo";
import { ScheduleClient } from "@/components/admin/schedule-client";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

const BUSINESS_SLUG = "wave-wellness";

export default async function SchedulePage(
  props: {
    searchParams: Promise<{ date?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const business = getBusinessBySlug(BUSINESS_SLUG);
  if (!business) {
    return <p className="text-muted-foreground">Business not found.</p>;
  }
  const date =
    searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : format(new Date(), "yyyy-MM-dd");

  const rows = getScheduleForDate(business.id, date);
  return <ScheduleClient date={date} rows={rows} />;
}
