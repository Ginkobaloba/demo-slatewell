import type { Metadata } from "next";
import { getBusinessBySlug } from "@/lib/repo";
import { getAllServices } from "@/lib/admin-repo";
import { ServicesClient } from "@/components/admin/services-client";

export const metadata: Metadata = { title: "Services" };
export const dynamic = "force-dynamic";

const BUSINESS_SLUG = "wave-wellness";

export default function ServicesPage() {
  const business = getBusinessBySlug(BUSINESS_SLUG);
  if (!business) {
    return <p className="text-muted-foreground">Business not found.</p>;
  }
  const services = getAllServices(business.id);
  return <ServicesClient services={services} />;
}
