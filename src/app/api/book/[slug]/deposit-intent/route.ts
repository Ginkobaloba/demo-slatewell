import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getBusinessBySlug,
  getOpenSlots,
  getService,
  sameDayNotBefore,
} from "@/lib/repo";
import { createDepositIntent } from "@/lib/deposits";
import { isStripeConfigured } from "@/lib/stripe";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  serviceId: z.number().int().positive(),
  staffId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
});

/**
 * POST /api/book/[slug]/deposit-intent
 *
 * Creates an unconfirmed manual-capture PaymentIntent for a service's
 * deposit and returns its client_secret for <PaymentElement>. The customer
 * confirms it in the browser with the card they enter; the booking route
 * then verifies the authorized hold before writing the booking. No card
 * data ever touches this server.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Card deposits are not available right now." },
      { status: 503 },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const business = getBusinessBySlug(params.slug);
  if (!business) {
    return NextResponse.json({ error: "Unknown business" }, { status: 404 });
  }
  const service = getService(business.id, parsed.data.serviceId);
  if (!service) {
    return NextResponse.json({ error: "Unknown service" }, { status: 404 });
  }
  if (service.deposit_cents <= 0) {
    return NextResponse.json(
      { error: "This service does not require a deposit." },
      { status: 400 },
    );
  }

  // Best-effort slot check so a customer never enters a card for a time
  // that is already gone. The booking-time transaction is authoritative
  // and will release the hold if the slot is taken in the interim.
  const open = getOpenSlots({
    service,
    date: parsed.data.date,
    staffId: parsed.data.staffId,
    notBeforeMin: sameDayNotBefore(parsed.data.date),
  });
  if (
    !open.some(
      (s) => s.time === parsed.data.time && s.staffId === parsed.data.staffId,
    )
  ) {
    return NextResponse.json(
      { error: "That time is no longer available." },
      { status: 409 },
    );
  }

  const intent = await createDepositIntent({
    amountCents: service.deposit_cents,
    metadata: {
      business: business.slug,
      service_id: String(service.id),
      staff_id: String(parsed.data.staffId),
      date: parsed.data.date,
      time: parsed.data.time,
    },
  });
  if (!intent.ok) {
    return NextResponse.json(
      { error: "Could not start the deposit. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    clientSecret: intent.clientSecret,
    paymentIntentId: intent.paymentIntentId,
    amountCents: service.deposit_cents,
  });
}
