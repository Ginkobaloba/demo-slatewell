import { NextRequest, NextResponse } from "next/server";
import { getBookingDetails, getBusinessBySlug } from "@/lib/repo";
import { buildBookingIcs } from "@/lib/ics";
import { getInstructions } from "@/lib/instructions";
import { publicOrigin } from "@/lib/origin";
import { isOwnBooking } from "@/lib/scope";
import { readVisitorId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ slug: string; bookingId: string }> }
) {
  const params = await props.params;
  const business = getBusinessBySlug(params.slug);
  const booking = getBookingDetails(params.bookingId);
  // D-014/D-016: same rule as the confirmation page (signed visitor cookie). The .ics carries the cancel
  // link (with its token), so only the booking's own browser may fetch it.
  if (
    !business ||
    !booking ||
    booking.business_id !== business.id ||
    !isOwnBooking(booking, await readVisitorId(req.cookies))
  ) {
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
