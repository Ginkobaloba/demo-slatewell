import { NextRequest, NextResponse } from "next/server";
import { markNoShow } from "@/lib/repo";
import { captureDeposit, isRealPaymentIntent } from "@/lib/deposits";
import { isStripeConfigured } from "@/lib/stripe";
import { requireAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bookings/[bookingId]/no-show
 *
 * Admin-only. Marks a confirmed booking as a no-show and captures its held
 * deposit (the late-cancellation/no-show side of the policy). Requires a
 * signed admin session, and only acts on seed bookings or the session's own
 * browser's bookings; anything else is a 404 (D-014).
 */
export async function POST(req: NextRequest, props: { params: Promise<{ bookingId: string }> }) {
  const params = await props.params;
  const auth = await requireAdminApi(req);
  if (!auth.ok) return auth.response;

  const result = markNoShow(params.bookingId, auth.visitorId);
  if (result.kind === "not_found") {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }
  if (result.kind === "not_confirmed") {
    return NextResponse.json(
      { error: "Only a confirmed booking can be marked a no-show" },
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
