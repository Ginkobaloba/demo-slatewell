import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { SectionPreview } from "@/components/admin/section-preview";
import { requireAdminPage } from "@/lib/admin-auth";

// Every admin page authorizes itself (D-014, D-015); the layout check is
// not enough on its own, because Next renders layout and page in parallel.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireAdminPage();
  return (
    <SectionPreview
      icon={BarChart3}
      title="Reports"
      intro="Revenue, utilization, retention, and cancellation trends for the business."
      capabilities={[
        {
          name: "Revenue by service and staff",
          detail:
            "See what earns and who drives it across any date range.",
        },
        {
          name: "Utilization and capacity",
          detail:
            "Spot the open hours and the practitioners running at capacity.",
        },
        {
          name: "Retention and rebooking",
          detail:
            "Track repeat visits and how often clients book their next appointment.",
        },
        {
          name: "Exportable summaries",
          detail:
            "Download a period summary for your records or your accountant.",
        },
      ]}
    />
  );
}
