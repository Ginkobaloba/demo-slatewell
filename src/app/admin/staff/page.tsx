import type { Metadata } from "next";
import { getBusinessBySlug } from "@/lib/repo";
import { getAllServices, getAllStaff } from "@/lib/admin-repo";
import { StaffClient } from "@/components/admin/staff-client";

export const metadata: Metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

const BUSINESS_SLUG = "wave-wellness";

export default function StaffPage() {
  const business = getBusinessBySlug(BUSINESS_SLUG);
  if (!business) {
    return <p className="text-muted-foreground">Business not found.</p>;
  }
  const staff = getAllStaff(business.id);
  const services = getAllServices(business.id);
  return <StaffClient staff={staff} services={services} />;
}
