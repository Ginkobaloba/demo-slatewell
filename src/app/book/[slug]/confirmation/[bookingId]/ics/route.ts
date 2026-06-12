import { NextRequest, NextResponse } from "next/server";
import { getBookingDetails, getBusinessBySlug } from "@/lib/repo";
import { buildBookingIcs } from "@/lib/ics";
import { getInstructions } from "@/lib/instructions";
import { publicOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string; bookingId: string } }
) {
  const business = getBusinessBySlug(params.slug);
  const booking = getBookingDetails(params.bookingId);
  if (!business || !booking || booking.business_id !== business.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ics = buildBookingIcs({
    booking,
    timezone: business.timezone,
    instructions: getInstructions(booking.service_name),
    cancelUrl: `${publicOrigin(req)}/book/${params.slug}/cancel/${booking.id}?token=${booking.cancel_token}`,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="slatewell-${booking.id}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
