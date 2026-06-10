import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getBusinessBySlug,
  getOpenSlots,
  getService,
  sameDayNotBefore,
} from "@/lib/repo";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  serviceId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  staffId: z.coerce.number().int().positive().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const business = getBusinessBySlug(params.slug);
  if (!business) {
    return NextResponse.json({ error: "Unknown business" }, { status: 404 });
  }
  const service = getService(business.id, parsed.data.serviceId);
  if (!service) {
    return NextResponse.json({ error: "Unknown service" }, { status: 404 });
  }

  const slots = getOpenSlots({
    service,
    date: parsed.data.date,
    staffId: parsed.data.staffId,
    notBeforeMin: sameDayNotBefore(parsed.data.date),
  });
  return NextResponse.json({ date: parsed.data.date, slots });
}
