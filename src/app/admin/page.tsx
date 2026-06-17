import type { Metadata } from "next";
import { addDays, format } from "date-fns";
import {
  DollarSign,
  TrendingDown,
  CalendarCheck,
  UserX,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { getBusinessBySlug } from "@/lib/repo";
import {
  getTodayBookings,
  getWeekBookings,
  getRevenueSnapshot,
  getCancellationStats,
  getTopServices,
} from "@/lib/admin-queries";
import { StatCard } from "@/components/admin/stat-card";

export const metadata: Metadata = { title: "Admin Dashboard" };

// The dashboard reads live data each request; do not cache.
export const dynamic = "force-dynamic";

const BUSINESS_SLUG = "wave-wellness";

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function formatTime(isoLocal: string): string {
  const [, timePart] = isoLocal.split("T");
  const [hh, mm] = timePart.split(":");
  const h = parseInt(hh, 10);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${mm} ${suffix}`;
}

const STATUS_CHIP: Record<
  string,
  { label: string; className: string; icon: typeof Clock }
> = {
  Confirmed: {
    label: "Confirmed",
    className: "bg-secondary text-secondary-foreground",
    icon: Clock,
  },
  Completed: {
    label: "Completed",
    className: "bg-[#7a9e7e]/20 text-[#4d7a52]",
    icon: CheckCircle2,
  },
  "No-Show": {
    label: "No-Show",
    className: "bg-destructive/10 text-destructive",
    icon: AlertCircle,
  },
};

export default function AdminDashboardPage() {
  const business = getBusinessBySlug(BUSINESS_SLUG);
  if (!business) {
    return <p className="text-muted-foreground">Business not found.</p>;
  }

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const weekEndStr = format(addDays(today, 7), "yyyy-MM-dd");
  const windowStartStr = format(addDays(today, -90), "yyyy-MM-dd");
  const windowEndStr = format(addDays(today, 1), "yyyy-MM-dd");

  const todayBookings = getTodayBookings(business.id, todayStr);
  const weekBookings = getWeekBookings(business.id, todayStr, weekEndStr);
  const revenue = getRevenueSnapshot(business.id);
  const cancelStats = getCancellationStats(
    business.id,
    windowStartStr,
    windowEndStr
  );
  const topServices = getTopServices(business.id, 5);

  // Group week bookings by date
  const byDay: Record<string, typeof weekBookings> = {};
  for (const bk of weekBookings) {
    const day = bk.start_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(bk);
  }
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i);
    const key = format(d, "yyyy-MM-dd");
    return {
      key,
      label: i === 0 ? "Today" : format(d, "EEE d"),
      count: byDay[key]?.length ?? 0,
    };
  });

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {business.name} -- {format(today, "EEEE, MMMM d, yyyy")}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue (completed)"
          value={formatCents(revenue.completed_revenue_cents)}
          sub="All time, completed appointments"
          icon={<DollarSign className="h-4 w-4" />}
          accent="green"
        />
        <StatCard
          label="Deposits held"
          value={formatCents(revenue.held_deposits_cents)}
          sub="Upcoming confirmed bookings"
          icon={<TrendingDown className="h-4 w-4" />}
          accent="amber"
        />
        <StatCard
          label="Cancellation rate"
          value={formatPct(cancelStats.cancel_rate)}
          sub={`${cancelStats.cancelled} of ${cancelStats.total} (last 90 days)`}
          icon={<CalendarCheck className="h-4 w-4" />}
          accent={cancelStats.cancel_rate > 0.2 ? "red" : "default"}
        />
        <StatCard
          label="No-show rate"
          value={formatPct(cancelStats.no_show_rate)}
          sub={`${cancelStats.no_shows} of ${cancelStats.total} (last 90 days)`}
          icon={<UserX className="h-4 w-4" />}
          accent={cancelStats.no_show_rate > 0.1 ? "red" : "default"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's schedule */}
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-base font-semibold text-foreground">
            Today -- {format(today, "EEE, MMM d")}
          </h2>
          {todayBookings.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No appointments scheduled today.
            </div>
          ) : (
            <div className="space-y-2">
              {todayBookings.map((bk) => {
                const chip = STATUS_CHIP[bk.status] ?? STATUS_CHIP.Confirmed;
                const Icon = chip.icon;
                return (
                  <div
                    key={bk.id}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
                  >
                    <div
                      className="h-9 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: bk.staff_color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {formatTime(bk.start_at)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {bk.service_name}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {bk.customer_name} -- {bk.staff_name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {formatCents(bk.price_cents)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}
                      >
                        <Icon className="h-3 w-3" />
                        {chip.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right column: week grid + top services */}
        <div className="space-y-6">
          {/* Week at a glance */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              Week ahead
            </h2>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {weekDays.map((day, idx) => (
                <div
                  key={day.key}
                  className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                    idx < weekDays.length - 1 ? "border-b border-border" : ""
                  } ${idx === 0 ? "bg-secondary/40" : ""}`}
                >
                  <span
                    className={
                      idx === 0
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {day.label}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      day.count > 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {day.count}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Top services */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">
              Top services
            </h2>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {topServices.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No completed bookings yet.
                </p>
              ) : (
                topServices.map((svc, idx) => (
                  <div
                    key={svc.service_name}
                    className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${
                      idx < topServices.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">
                        {idx + 1}
                      </span>
                      <span className="truncate font-medium text-foreground">
                        {svc.service_name}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-foreground">
                        {formatCents(svc.revenue_cents)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {svc.booking_count} appt
                        {svc.booking_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
