import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { SectionPreview } from "@/components/admin/section-preview";
import { requireAdminPage } from "@/lib/admin-auth";

// Every admin page authorizes itself (D-014, D-015); the layout check is
// not enough on its own, because Next renders layout and page in parallel.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdminPage();
  return (
    <SectionPreview
      icon={Settings}
      title="Settings"
      intro="Hours, policies, staff access, and the rules behind your booking page."
      capabilities={[
        {
          name: "Business hours and holidays",
          detail:
            "Set the days and times you take bookings, with one-off closures.",
        },
        {
          name: "Cancellation and deposit policy",
          detail:
            "Define the cutoff window and how deposits are held and released.",
        },
        {
          name: "Staff accounts and roles",
          detail:
            "Add practitioners and control who can see and change what.",
        },
        {
          name: "Booking page and branding",
          detail:
            "Adjust your public booking link, colors, and confirmation copy.",
        },
      ]}
    />
  );
}
