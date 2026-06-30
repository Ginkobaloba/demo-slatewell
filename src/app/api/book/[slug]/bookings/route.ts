import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createBooking,
  getBusinessBySlug,
  getService,
  paymentIntentAlreadyUsed,
  SlotTakenError,
} from "@/lib/repo";
import { releaseDeposit, verifyDepositIntent } from "@/lib/deposits";
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
  // Present for deposit-bearing services: the customer-confirmed Stripe
  // PaymentIntent (manual capture, already authorized via Elements).
  paymentIntentId: z.string().trim().min(1).max(255).optional(),
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

  // For a deposit-bearing service with Stripe live, the card hold must
  // already be authorized (Elements) and verified before we write a row.
  // The slot is then re-validated race-safely inside createBooking; if it
  // was taken in the interim, we release the hold so the card is freed.
  const stripeLive = service.deposit_cents > 0 && isStripeConfigured();
  let verifiedPaymentIntentId: string | null = null;

  if (stripeLive) {
    const piId = parsed.data.paymentIntentId;
    if (!piId) {
      return NextResponse.json(
        { error: "A deposit is required for this service." },
        { status: 402 },
      );
    }
    if (paymentIntentAlreadyUsed(piId)) {
      return NextResponse.json(
        { error: "This deposit has already been used." },
        { status: 409 },
      );
    }
    const verdict = await verifyDepositIntent({
      paymentIntentId: piId,
      expectedAmountCents: service.deposit_cents,
      expectedBusinessSlug: business.slug,
    });
    if (!verdict.ok) {
      return NextResponse.json(
        {
          error:
            "We could not verify your deposit hold. Please try booking again.",
        },
        { status: 402 },
      );
    }
    verifiedPaymentIntentId = piId;
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
      paymentIntentId: verifiedPaymentIntentId,
    });
    return NextResponse.json({ id: booking.id }, { status: 201 });
  } catch (err) {
    if (err instanceof SlotTakenError) {
      // Free the authorized hold so the customer's card is not left blocked.
      if (verifiedPaymentIntentId) {
        try {
          await releaseDeposit(verifiedPaymentIntentId);
        } catch (releaseErr) {
          console.error("Failed to release hold after slot race", releaseErr);
        }
      }
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
