import { NextRequest, NextResponse } from "next/server";
import { markNoShow } from "@/lib/repo";
import { captureDeposit, isRealPaymentIntent } from "@/lib/deposits";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const ADMIN_COOKIE = "slatewell_admin_session";

/**
 * POST /api/admin/bookings/[bookingId]/no-show
 *
 * Admin-only. Marks a confirmed booking as a no-show and captures its held
 * deposit (the late-cancellation/no-show side of the policy). Gated by the
 * demo admin cookie.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { bookingId: string } },
) {
  if (!req.cookies.has(ADMIN_COOKIE)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booking = markNoShow(params.bookingId);
  if (!booking) {
    return NextResponse.json(
      { error: "Only a confirmed booking can be marked a no-show" },
      { status: 409 },
    );
  }

  if (
    isStripeConfigured() &&
    booking.deposit_status === "Captured" &&
    isRealPaymentIntent(booking.stripe_payment_intent_id)
  ) {
    try {
      await captureDeposit(booking.stripe_payment_intent_id);
    } catch (err) {
      console.error("Stripe deposit capture failed", err);
    }
  }

  return NextResponse.json({
    status: booking.status,
    depositStatus: booking.deposit_status,
  });
}
