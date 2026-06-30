import { NextRequest, NextResponse } from "next/server";
import { markCompleted } from "@/lib/admin-repo";
import { captureDeposit, isRealPaymentIntent } from "@/lib/deposits";
import { isStripeConfigured } from "@/lib/stripe";
import { isAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bookings/[bookingId]/complete
 *
 * Admin-only. Marks a confirmed booking Completed and captures its held
 * deposit (applied to the visit total, D-009). Gated by the demo admin
 * cookie. A Stripe error is logged, not surfaced -- the local state is
 * authoritative.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { bookingId: string } },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booking = markCompleted(params.bookingId);
  if (!booking) {
    return NextResponse.json(
      { error: "Only a confirmed booking can be completed" },
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
