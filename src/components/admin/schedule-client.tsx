"use client";

/**
 * Operator day view. Server-rendered appointments for a date; this client
 * adds day navigation and the per-booking actions (complete / no-show) that
 * settle the held deposit. After an action it refreshes the route so the
 * list and the dashboard KPIs reflect the new state.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatMoney, formatTime } from "@/lib/format";
import type { ScheduleRow } from "@/lib/admin-repo";

const STATUS_CHIP: Record<
  string,
  { className: string; icon: typeof Clock }
> = {
  Confirmed: { className: "bg-secondary text-secondary-foreground", icon: Clock },
  Completed: { className: "bg-[#7a9e7e]/20 text-[#4d7a52]", icon: CheckCircle2 },
  "No-Show": { className: "bg-destructive/10 text-destructive", icon: AlertCircle },
};

const DEPOSIT_CHIP: Record<string, string> = {
  Held: "bg-[#d9a441]/20 text-[#8a6a16]",
  Captured: "bg-[#7a9e7e]/20 text-[#4d7a52]",
  Released: "bg-muted text-muted-foreground",
  Refunded: "bg-muted text-muted-foreground",
};

export function ScheduleClient({
  date,
  rows,
}: {
  date: string;
  rows: ScheduleRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [y, m, d] = date.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  function go(toDate: string) {
    router.push(`/admin/schedule?date=${toDate}`);
  }

  async function act(id: string, kind: "complete" | "no-show") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bookings/${id}/${kind}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Action failed. Please try again.");
        setBusyId(null);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Schedule
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The one calendar of record -- every booking, however it was made.
        </p>
      </div>

      {/* Day navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go(format(addDays(dateObj, -1), "yyyy-MM-dd"))}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </button>
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">
            {format(dateObj, "EEEE, MMMM d")}
          </p>
          {date !== todayStr && (
            <button
              type="button"
              onClick={() => go(todayStr)}
              className="text-xs font-medium text-slatewell underline underline-offset-2"
            >
              Jump to today
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => go(format(addDays(dateObj, 1), "yyyy-MM-dd"))}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Next <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-terracotta/40 bg-accent px-3 py-2 text-sm text-accent-foreground"
        >
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No appointments scheduled for this day.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((bk) => {
            const chip = STATUS_CHIP[bk.status] ?? STATUS_CHIP.Confirmed;
            const Icon = chip.icon;
            const busy = busyId === bk.id;
            return (
              <div
                key={bk.id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="mt-1 h-10 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: bk.staff_color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-foreground">
                        {formatTime(bk.start_at.slice(11))}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {bk.service_name}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {bk.customer_name} -- {bk.staff_name}
                      {bk.customer_phone ? ` -- ${bk.customer_phone}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}
                      >
                        <Icon className="h-3 w-3" />
                        {bk.status}
                      </span>
                      {bk.deposit_cents > 0 && bk.deposit_status && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            DEPOSIT_CHIP[bk.deposit_status] ??
                            "bg-muted text-muted-foreground"
                          }`}
                          title={
                            bk.stripe_payment_intent_id &&
                            !bk.stripe_payment_intent_id.startsWith("pi_mock")
                              ? `Stripe ${bk.stripe_payment_intent_id}`
                              : "Policy-only hold"
                          }
                        >
                          {formatMoney(bk.deposit_cents)} {bk.deposit_status.toLowerCase()}
                        </span>
                      )}
                      <span className="text-xs font-medium text-foreground">
                        {formatMoney(bk.price_cents)}
                      </span>
                    </div>
                  </div>
                  {bk.status === "Confirmed" && (
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(bk.id, "complete")}
                        className="rounded-lg bg-slatewell px-3 py-1.5 text-xs font-medium text-warmwhite transition-colors hover:bg-slatewell/90 disabled:opacity-60"
                      >
                        {busy ? "..." : "Complete"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(bk.id, "no-show")}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
                      >
                        No-show
                      </button>
                    </div>
                  )}
                </div>
                {bk.notes && (
                  <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                    Note: {bk.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
