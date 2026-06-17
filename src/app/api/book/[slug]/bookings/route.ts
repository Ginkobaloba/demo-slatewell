import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  attachDepositHold,
  createBooking,
  getBusinessBySlug,
  getService,
  SlotTakenError,
  voidBookingForFailedDeposit,
} from "@/lib/repo";
import { authorizeDeposit } from "@/lib/deposits";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  serviceId: z.number().int().positive(),
  staffId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  customer: z.object({
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    email: z.string().trim().email().max(120),
    phone: z.string().trim().min(7).max(25),
  }),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid booking request" },
      { status: 400 }
    );
  }
  const business = getBusinessBySlug(params.slug);
  if (!business) {
    return NextResponse.json({ error: "Unknown business" }, { status: 404 });
  }
  const service = getService(business.id, parsed.data.serviceId);
  if (!service) {
    return NextResponse.json({ error: "Unknown service" }, { status: 404 });
  }

  try {
    const booking = createBooking({
      business,
      service,
      staffId: parsed.data.staffId,
      date: parsed.data.date,
      time: parsed.data.time,
      customer: parsed.data.customer,
      notes: parsed.data.notes,
    });

    // Place a real Stripe deposit hold (manual capture) when the service
    // requires one and Stripe is configured. A declined card voids the
    // booking and frees the slot.
    if (service.deposit_cents > 0 && isStripeConfigured()) {
      const auth = await authorizeDeposit({
        amountCents: service.deposit_cents,
        metadata: { booking_id: booking.id, business: business.slug },
      });
      if (!auth.ok) {
        voidBookingForFailedDeposit(booking.id);
        return NextResponse.json(
          {
            error:
              "We could not authorize your deposit. Please try a different card.",
          },
          { status: 402 },
        );
      }
      attachDepositHold(booking.id, auth.paymentIntentId);
    }

    return NextResponse.json({ id: booking.id }, { status: 201 });
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
