import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  cancelBooking,
  getBusinessBySlug,
  InvalidCancelTokenError,
  NotCancellableError,
} from "@/lib/repo";
import {
  captureDeposit,
  isRealPaymentIntent,
  releaseDeposit,
} from "@/lib/deposits";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().trim().min(1),
  reason: z.string().trim().max(300).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string; bookingId: string } }
) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const business = getBusinessBySlug(params.slug);
  if (!business) {
    return NextResponse.json({ error: "Unknown business" }, { status: 404 });
  }

  try {
    const { booking, decision } = cancelBooking({
      bookingId: params.bookingId,
      token: parsed.data.token,
      reason: parsed.data.reason,
    });

    // Settle the real Stripe hold per the policy decision. The DB already
    // reflects the outcome; a Stripe error here is logged, not surfaced, so a
    // cancellation is never blocked by the payment processor.
    if (isStripeConfigured() && isRealPaymentIntent(booking.stripe_payment_intent_id)) {
      try {
        if (decision.depositOutcome === "Released") {
          await releaseDeposit(booking.stripe_payment_intent_id);
        } else if (decision.depositOutcome === "Captured") {
          await captureDeposit(booking.stripe_payment_intent_id);
        }
      } catch (err) {
        console.error("Stripe deposit settlement failed", err);
      }
    }

    return NextResponse.json({
      status: booking.status,
      depositOutcome: decision.depositOutcome,
    });
  } catch (err) {
    if (err instanceof InvalidCancelTokenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    if (err instanceof NotCancellableError) {
      return NextResponse.json(
        { error: err.message, reason: err.decision.reason },
        { status: 409 }
      );
    }
    throw err;
  }
}
