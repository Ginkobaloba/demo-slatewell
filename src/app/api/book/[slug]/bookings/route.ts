import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createBooking,
  getBusinessBySlug,
  getService,
  SlotTakenError,
} from "@/lib/repo";

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
    return NextResponse.json({ id: booking.id }, { status: 201 });
  } catch (err) {
    if (err instanceof SlotTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
