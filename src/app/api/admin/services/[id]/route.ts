import { NextRequest, NextResponse } from "next/server";
import { updateService } from "@/lib/admin-repo";
import { getBusinessBySlug } from "@/lib/repo";
import { isAdmin } from "@/lib/admin-auth";
import { serviceSchema } from "@/lib/service-schema";

export const dynamic = "force-dynamic";

const BUSINESS_SLUG = "wave-wellness";

/** PUT /api/admin/services/[id] -- update a service. Admin-only. */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const parsed = serviceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid service" },
      { status: 400 },
    );
  }
  const business = getBusinessBySlug(BUSINESS_SLUG);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const service = updateService(business.id, id, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    duration_min: parsed.data.duration_min,
    price_cents: parsed.data.price_cents,
    deposit_cents: parsed.data.deposit_cents,
    buffer_before_min: parsed.data.buffer_before_min,
    buffer_after_min: parsed.data.buffer_after_min,
    active: parsed.data.active,
  });
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  return NextResponse.json({ service });
}
