import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { SectionPreview } from "@/components/admin/section-preview";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
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
