/**
 * Pure cancellation policy logic. The 24-hour window rule (D-003 local
 * times, business.cancellation_window_hours) decides what happens to a
 * held deposit; the database write happens in repo.ts.
 */
import type { BookingStatus, DepositStatus } from "@/lib/types";

export type DepositOutcome = "Released" | "Captured" | null;

export interface CancellationDecision {
  allowed: boolean;
  reason: "ok" | "already-cancelled" | "not-cancellable" | "in-past";
  /** What happens to the deposit if the cancellation proceeds. */
  depositOutcome: DepositOutcome;
  /** True when the cancellation is inside the free-cancellation window. */
  insideFreeWindow: boolean;
}

/**
 * Decide whether a booking can be cancelled and what happens to its
 * deposit. `startAt` and `now` are local-naive ISO strings (D-003);
 * string comparison is valid for ordering, Date math for the window.
 */
export function decideCancellation(opts: {
  startAt: string;
  now: string;
  status: BookingStatus;
  windowHours: number;
  depositStatus: DepositStatus | null;
}): CancellationDecision {
  const startMs = new Date(opts.startAt).getTime();
  const nowMs = new Date(opts.now).getTime();
  const cutoffMs = startMs - opts.windowHours * 60 * 60 * 1000;
  const insideFreeWindow = nowMs <= cutoffMs;

  if (opts.status === "Cancelled") {
    return {
      allowed: false,
      reason: "already-cancelled",
      depositOutcome: null,
      insideFreeWindow,
    };
  }
  if (opts.status !== "Confirmed") {
    return {
      allowed: false,
      reason: "not-cancellable",
      depositOutcome: null,
      insideFreeWindow,
    };
  }
  if (nowMs >= startMs) {
    return {
      allowed: false,
      reason: "in-past",
      depositOutcome: null,
      insideFreeWindow: false,
    };
  }

  const hasHeldDeposit = opts.depositStatus === "Held";
  return {
    allowed: true,
    reason: "ok",
    depositOutcome: hasHeldDeposit
      ? insideFreeWindow
        ? "Released"
        : "Captured"
      : null,
    insideFreeWindow,
  };
}
