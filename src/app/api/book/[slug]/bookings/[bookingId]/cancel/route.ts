import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  cancelBooking,
  getBusinessBySlug,
  InvalidCancelTokenError,
  NotCancellableError,
} from "@/lib/repo";

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
