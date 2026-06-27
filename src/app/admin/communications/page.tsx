import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";
import { SectionPreview } from "@/components/admin/section-preview";

export const metadata: Metadata = { title: "Communications" };

export default function CommunicationsPage() {
  return (
    <SectionPreview
      icon={MessageSquare}
      title="Communications"
      intro="Every confirmation, reminder, and follow-up Slatewell sends, in one log."
      capabilities={[
        {
          name: "Confirmation and reminder timeline",
          detail:
            "See what went out for each booking and when, by text and email.",
        },
        {
          name: "Delivery status",
          detail:
            "Track which messages were sent, delivered, or need a resend.",
        },
        {
          name: "Resend in one click",
          detail:
            "Push a confirmation or reminder again without leaving the log.",
        },
        {
          name: "Editable templates",
          detail:
            "Tune the wording of each message to match your business voice.",
        },
      ]}
    />
  );
}
