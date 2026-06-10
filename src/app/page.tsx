import Link from "next/link";
import { SlatewellLogo } from "@/components/slatewell-logo";

/**
 * Placeholder landing page. The full Slatewell SaaS marketing landing is
 * chunk 4.14; this exists so the scaffold deploys with the brand visible.
 */
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-6 py-20 text-center">
      <SlatewellLogo className="text-4xl" />
      <div className="space-y-4">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Booking that respects your customers and your staff calendar.
        </h1>
        <p className="text-pretty text-muted-foreground">
          Multi-staff scheduling for service businesses, without the
          enterprise overhead. Full marketing site coming in a later build
          chunk; the demo flows are below.
        </p>
      </div>
      <div className="grid w-full gap-4 sm:grid-cols-2">
        <Link
          href="/book/wave-wellness"
          className="rounded-xl border border-border bg-card p-6 text-left shadow-sm transition-colors hover:border-slatewell focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <div className="text-sm font-medium text-terracotta">
            Customer flow
          </div>
          <div className="mt-1 font-semibold text-foreground">
            Book at Wave Wellness
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            The end-customer booking experience for a fictional med-spa.
          </p>
        </Link>
        <Link
          href="/admin"
          className="rounded-xl border border-border bg-card p-6 text-left shadow-sm transition-colors hover:border-slatewell focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <div className="text-sm font-medium text-terracotta">
            Business flow
          </div>
          <div className="mt-1 font-semibold text-foreground">
            Admin dashboard
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Calendars, services, staff availability, customers, and reports.
          </p>
        </Link>
      </div>
    </main>
  );
}
