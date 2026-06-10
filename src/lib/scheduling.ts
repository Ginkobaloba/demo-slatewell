/**
 * Pure slot computation. No database access; callers assemble the inputs
 * (see repo.ts) so this stays unit-testable and is reused by both the
 * customer booking flow and the admin calendar.
 *
 * Semantics match the seed generator and docs/decisions.md D-006: a
 * service's buffers extend the staff member's busy window, but the
 * customer-visible appointment is start + duration.
 */

export interface MinuteWindow {
  startMin: number;
  endMin: number;
}

export interface StaffDaySchedule {
  staffId: number;
  /** Availability blocks for the target weekday, minutes from midnight. */
  blocks: MinuteWindow[];
  /** Busy windows that day (existing bookings INCLUDING their buffers). */
  busy: MinuteWindow[];
  /** True if a time_off range covers the date. */
  isOff: boolean;
}

export interface SlotQuery {
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /** Slot grid step. Default 15. */
  slotStepMin?: number;
  /** Earliest permissible start (e.g. lead time when date is today). */
  notBeforeMin?: number;
}

export interface Slot {
  startMin: number;
  staffId: number;
}

function overlaps(a: MinuteWindow, b: MinuteWindow): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/** Available start times for ONE staff member's day. */
export function computeStaffSlots(
  q: SlotQuery,
  schedule: StaffDaySchedule
): number[] {
  if (schedule.isOff) return [];
  const step = q.slotStepMin ?? 15;
  const out: number[] = [];
  for (const block of schedule.blocks) {
    const earliest = Math.max(
      block.startMin + q.bufferBeforeMin,
      q.notBeforeMin ?? 0
    );
    const latest = block.endMin - q.durationMin - q.bufferAfterMin;
    for (let t = Math.ceil(earliest / step) * step; t <= latest; t += step) {
      const busyWindow: MinuteWindow = {
        startMin: t - q.bufferBeforeMin,
        endMin: t + q.durationMin + q.bufferAfterMin,
      };
      if (!schedule.busy.some((b) => overlaps(busyWindow, b))) out.push(t);
    }
  }
  return out;
}

/**
 * Available slots across staff. When multiple staff can take the same
 * time, the least-busy one is assigned (simple load balancing); result
 * is one slot per distinct start time, sorted.
 */
export function computeSlots(
  q: SlotQuery,
  schedules: StaffDaySchedule[]
): Slot[] {
  const byTime = new Map<number, number>(); // startMin -> staffId
  const busyCount = new Map<number, number>();
  schedules.forEach((s) => busyCount.set(s.staffId, s.busy.length));

  for (const schedule of schedules) {
    for (const t of computeStaffSlots(q, schedule)) {
      const current = byTime.get(t);
      if (
        current === undefined ||
        (busyCount.get(schedule.staffId) ?? 0) < (busyCount.get(current) ?? 0)
      ) {
        byTime.set(t, schedule.staffId);
      }
    }
  }
  return Array.from(byTime.entries())
    .map(([startMin, staffId]) => ({ startMin, staffId }))
    .sort((a, b) => a.startMin - b.startMin);
}

export function minutesToHHmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
