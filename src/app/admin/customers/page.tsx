import type { Metadata } from "next";
import { Users } from "lucide-react";
import { SectionPreview } from "@/components/admin/section-preview";

export const metadata: Metadata = { title: "Customers" };

export default function CustomersPage() {
  return (
    <SectionPreview
      icon={Users}
      title="Customers"
      intro="Every client, their visit history, and how to reach them."
      capabilities={[
        {
          name: "Searchable client list",
          detail:
            "Find anyone by name, email, or phone, sorted by recent activity.",
        },
        {
          name: "Visit and spend history",
          detail:
            "Past and upcoming appointments with totals for each client.",
        },
        {
          name: "Notes and preferences",
          detail:
            "Keep allergies, preferred staff, and other context with the record.",
        },
        {
          name: "No-show and cancellation flags",
          detail:
            "See reliability at a glance before you confirm a booking.",
        },
      ]}
    />
  );
}
