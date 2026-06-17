import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SlatewellLogo } from "@/components/slatewell-logo";

/**
 * Placeholder landing page. The full Slatewell SaaS marketing landing is
 * chunk 4.14; this exists so the scaffold deploys with the brand visible.
 *
 * The admin entry is a POST to /api/admin/session (not a plain link): the
 * admin routes are cookie-gated by middleware, so a bare <Link href="/admin">
 * would just bounce back here. The form drops the demo-admin cookie, then
 * the session route redirects to /admin.
 */
export default function Home({
  searchParams,
}: {
  searchParams: { admin?: string };
}) {
  const requiresSignIn = searchParams.admin === "required";

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

      {requiresSignIn && (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Sign in as demo admin to access the dashboard.
        </p>
      )}

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

        <form
          method="POST"
          action="/api/admin/session"
          className="flex flex-col"
        >
          <button
            type="submit"
            className="h-full rounded-xl border border-border bg-card p-6 text-left shadow-sm transition-colors hover:border-slatewell focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <div className="text-sm font-medium text-terracotta">
              Business flow
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-semibold text-foreground">
              Admin dashboard
              <ArrowRight className="h-4 w-4 shrink-0" />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Calendars, services, staff availability, customers, and reports.
            </p>
            <p className="mt-3 text-xs font-medium text-slatewell">
              Sign in as demo admin
            </p>
          </button>
        </form>
      </div>
    </main>
  );
}
