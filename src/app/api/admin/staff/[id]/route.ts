import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  setAvailability,
  setStaffServices,
  updateStaff,
} from "@/lib/admin-repo";
import { getBusinessBySlug } from "@/lib/repo";
import { isAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const BUSINESS_SLUG = "wave-wellness";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  title: z.string().trim().max(80).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  active: z.union([z.literal(0), z.literal(1)]),
  serviceIds: z.array(z.number().int().positive()).max(100),
  availability: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        start_min: z.number().int().min(0).max(1439),
        end_min: z.number().int().min(1).max(1440),
      }),
    )
    .max(100),
});

/**
 * PUT /api/admin/staff/[id] -- update a staff member's profile, service
 * capabilities, and weekly availability in one save. Admin-only. The
 * availability and capabilities write to the same tables the customer slot
 * engine reads, so changes take effect on the next availability query.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const staffId = Number(params.id);
  if (!Number.isInteger(staffId) || staffId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }
  const business = getBusinessBySlug(BUSINESS_SLUG);
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const ok = updateStaff(business.id, staffId, {
    name: parsed.data.name,
    title: parsed.data.title ?? null,
    color: parsed.data.color,
    active: parsed.data.active,
  });
  if (!ok) {
    return NextResponse.json({ error: "Staff not found" }, { status: 404 });
  }
  setStaffServices(business.id, staffId, parsed.data.serviceIds);
  const availOk = setAvailability(business.id, staffId, parsed.data.availability);
  if (!availOk) {
    return NextResponse.json(
      { error: "An availability block is invalid (end must be after start)." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
