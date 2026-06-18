import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  ClockArrowDown,
  CreditCard,
  MailCheck,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { SlatewellLogo, SlatewellMark } from "@/components/slatewell-logo";

/**
 * Slatewell marketing landing. Server-rendered, no client libraries.
 * Structure follows the AxlePoint and Lumen demo pattern (hero + stats +
 * features + secondary capabilities + closing CTA + footer) so the four
 * portfolio demos land as one tier of work. Slatewell's brand identity
 * (slate blue, terracotta accent, warm white background) is preserved;
 * Paradigm attribution stays in the shared banner mounted by the layout.
 *
 * The admin entry is a POST to /api/admin/session (cookie-gated middleware
 * would bounce a bare <Link href="/admin">); customer flow links straight
 * into the Wave Wellness booking experience.
 */

const PREVIEW_SLOTS: {
  time: string;
  staff: string;
  service: string;
  status: "open" | "held" | "booked";
}[] = [
  { time: "9:00", staff: "Riley", service: "Intake consult", status: "booked" },
  { time: "9:30", staff: "Maya", service: "Lash refresh", status: "booked" },
  { time: "10:00", staff: "Riley", service: "Available", status: "open" },
  { time: "10:00", staff: "Maya", service: "Held for Joan P.", status: "held" },
  { time: "10:30", staff: "Riley", service: "Brow shaping", status: "booked" },
  { time: "11:00", staff: "Maya", service: "Available", status: "open" },
];

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Multi-staff calendars that actually agree",
    body: "One source of truth for every chair, room, and provider. Real-time availability respects staff working hours, room conflicts, buffer time, and the services each provider is qualified to deliver, so you stop double-booking by accident.",
  },
  {
    icon: CreditCard,
    title: "Deposits that hold without holding people up",
    body: "Take a refundable deposit at booking through Stripe with manual capture. The hold sits on the card until the appointment is honored or canceled inside policy. Customers pay zero unless they no-show, and staff stop chasing.",
  },
  {
    icon: ClipboardList,
    title: "Cancellation rules you can defend",
    body: "Set a per-service cancellation window once, and the booking flow enforces it automatically. Customers see what they owe before they confirm; admins see a clean audit trail and a single tap to refund or waive.",
  },
];

const STATS = [
  { value: "4 mins", label: "average time to book online" },
  { value: "62%", label: "fewer no-shows with deposits on file" },
  { value: "0", label: "double-booked slots since launch" },
  { value: "100%", label: "of cancellations within policy auto-refund" },
];

const SECONDARY = [
  {
    icon: Users,
    title: "Per-provider services",
    body: "Map services to the staff qualified to deliver them, with separate prep, treat, and clean times that the calendar respects.",
  },
  {
    icon: MailCheck,
    title: "Confirmations and ICS",
    body: "Customers get a confirmation email with the appointment, the deposit policy, and a calendar invite that lands in Apple, Google, and Outlook.",
  },
  {
    icon: ClockArrowDown,
    title: "Token-protected cancel links",
    body: "Cancellation lives at a signed URL in the confirmation email. No accounts, no password resets, no back-and-forth phone tag.",
  },
  {
    icon: ShieldCheck,
    title: "Admin sessions, not staff logins",
    body: "Demo admin is one click. Production sessions are cookie-gated by middleware so a stray bookmark cannot leak the dashboard.",
  },
];

function StatusDot({ status }: { status: "open" | "held" | "booked" }) {
  const classes =
    status === "booked"
      ? "bg-slatewell"
      : status === "held"
      ? "bg-terracotta"
      : "border border-border bg-background";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${classes}`} />;
}

export default function Home({
  searchParams,
}: {
  searchParams: { admin?: string };
}) {
  const requiresSignIn = searchParams.admin === "required";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <SlatewellLogo className="text-lg" />
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <a href="#platform" className="hover:text-slatewell">
              Platform
            </a>
            <a href="#capabilities" className="hover:text-slatewell">
              Capabilities
            </a>
            <a href="#results" className="hover:text-slatewell">
              Results
            </a>
          </nav>
          <form method="POST" action="/api/admin/session">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-slatewell px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-slatewell/90"
            >
              Sign in as demo admin
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-slatewell/20 bg-secondary px-3 py-1 text-xs font-semibold text-slatewell">
              <Sparkles className="h-3.5 w-3.5" />
              Built for service businesses that book by the hour
            </p>
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Booking that respects your customers{" "}
              <span className="text-slatewell">and</span> your staff calendar.
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Slatewell is multi-staff scheduling for clinics, med spas, salons,
              and professional services that need real availability, real
              deposits, and real cancellation policy without enterprise
              overhead. Customers book in four minutes. Staff stop fighting the
              calendar.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/book/wave-wellness"
                className="inline-flex items-center gap-2 rounded-lg bg-slatewell px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-slatewell/90"
              >
                Open the customer flow
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#platform"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-slatewell"
              >
                See the platform
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              The demo opens instantly. No account, no email, no real charges.
            </p>

            {requiresSignIn && (
              <p className="mt-6 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                Sign in as demo admin to access the dashboard.
              </p>
            )}
          </div>

          {/* Stylized product preview */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-secondary px-4 py-3">
              <span className="text-sm font-semibold text-slatewell">
                Wave Wellness, Tuesday
              </span>
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
                Live availability
              </span>
            </div>
            <div className="space-y-2 p-4">
              <div className="mb-2 grid grid-cols-[60px_1fr_1fr] gap-3 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Time</span>
                <span>Riley</span>
                <span>Maya</span>
              </div>
              {[
                ["9:00", PREVIEW_SLOTS[0], PREVIEW_SLOTS[1]],
                ["9:30", PREVIEW_SLOTS[1], null],
                ["10:00", PREVIEW_SLOTS[2], PREVIEW_SLOTS[3]],
                ["10:30", PREVIEW_SLOTS[4], null],
                ["11:00", null, PREVIEW_SLOTS[5]],
              ].map(([time, riley, maya], i) => (
                <div
                  key={i}
                  className="grid grid-cols-[60px_1fr_1fr] gap-3 rounded-md border border-border/70 px-2 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {time as string}
                  </span>
                  <SlotCell slot={riley as (typeof PREVIEW_SLOTS)[number] | null} />
                  <SlotCell slot={maya as (typeof PREVIEW_SLOTS)[number] | null} />
                </div>
              ))}
              <p className="pt-2 text-center text-xs text-muted-foreground">
                Held slots clear automatically when a deposit fails or times out.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section id="results" className="border-y border-border bg-slatewell">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="font-mono text-3xl font-semibold text-primary-foreground">
                {s.value}
              </p>
              <p className="mt-1 text-sm text-primary-foreground/70">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature blocks */}
      <section id="platform" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          One booking surface, one calendar of record
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Slatewell joins the customer-facing booking flow and the admin
          calendar to the same source of truth, so a booked slot is booked
          everywhere and a held card is honored or refunded on policy.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-card p-6"
            >
              <div className="mb-4 inline-flex rounded-lg bg-secondary p-2.5 text-slatewell">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Secondary capabilities */}
      <section
        id="capabilities"
        className="border-t border-border bg-secondary py-20"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {SECONDARY.map((f) => (
              <div key={f.title}>
                <div className="mb-3 inline-flex rounded-lg border border-border bg-card p-2 text-slatewell">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-semibold tracking-tight">
          See it with a real schedule already loaded
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          The demo carries two providers, a week of mixed availability, and a
          live Stripe sandbox deposit flow. Open the customer side or sign in
          as the demo admin.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="/book/wave-wellness"
            className="inline-flex items-center gap-2 rounded-lg bg-slatewell px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-slatewell/90"
          >
            Open the customer flow
            <ArrowRight className="h-4 w-4" />
          </Link>
          <form method="POST" action="/api/admin/session">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-slatewell"
            >
              Sign in as demo admin
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span className="inline-flex items-center gap-2">
            <SlatewellMark className="h-5 w-5" />
            <span className="font-semibold tracking-tight text-foreground">
              slatewell
            </span>
          </span>
          <p>
            Slatewell is a fictional product demo.{" "}
            <a
              href="https://projectnexuscode.org"
              className="font-medium text-slatewell hover:underline"
            >
              Built by Paradigm Coding Solutions
            </a>
            . All data is synthetic.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SlotCell({
  slot,
}: {
  slot: (typeof PREVIEW_SLOTS)[number] | null;
}) {
  if (!slot) {
    return (
      <span className="text-xs text-muted-foreground/60">{"-"}</span>
    );
  }
  const tone =
    slot.status === "booked"
      ? "text-foreground"
      : slot.status === "held"
      ? "text-terracotta"
      : "text-muted-foreground";
  return (
    <span className={`flex items-center gap-2 text-xs ${tone}`}>
      <StatusDot status={slot.status} />
      <span className="truncate">{slot.service}</span>
    </span>
  );
}
