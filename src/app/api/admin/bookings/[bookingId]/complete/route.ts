import { NextRequest, NextResponse } from "next/server";
import { markCompleted } from "@/lib/admin-repo";
import { captureDeposit, isRealPaymentIntent } from "@/lib/deposits";
import { isStripeConfigured } from "@/lib/stripe";
import { requireAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bookings/[bookingId]/complete
 *
 * Admin-only. Marks a confirmed booking Completed and captures its held
 * deposit (applied to the visit total, D-009). Requires a signed admin
 * session, and only acts on seed bookings or the session's own browser's
 * bookings; anything else is a 404 (D-014). A Stripe error is logged, not
 * surfaced -- the local state is authoritative.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ bookingId: string }> }) {
  const params = await props.params;
  const auth = await requireAdminApi(req);
  if (!auth.ok) return auth.response;

  const result = markCompleted(params.bookingId, auth.visitorId);
  if (result.kind === "not_found") {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (result.kind === "not_confirmed") {
    return NextResponse.json(
      { error: "Only a confirmed booking can be completed" },
      { status: 409 },
    );
  }
  const { booking } = result;

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
