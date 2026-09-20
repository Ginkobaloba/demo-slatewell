/**
 * Unit checks for the pure scheduling engine. Exits non-zero on failure.
 * Usage: npx tsx scripts/test-scheduling.ts
 */
import {
  computeSlots,
  computeStaffSlots,
  hhmmToMinutes,
  minutesToHHmm,
} from "../src/lib/scheduling";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

// 9:00-12:00 block, 60-min service, no buffers: starts 9:00..11:00.
const basic = computeStaffSlots(
  { durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 },
  { staffId: 1, blocks: [{ startMin: 540, endMin: 720 }], busy: [], isOff: false }
);
check("basic block yields 15-min grid", basic.length === 9, basic);
check("first slot at block start", basic[0] === 540, basic);
check("last slot leaves room for duration", basic[basic.length - 1] === 660, basic);

// Buffers shrink the usable range on both ends.
const buffered = computeStaffSlots(
  { durationMin: 60, bufferBeforeMin: 15, bufferAfterMin: 15 },
  { staffId: 1, blocks: [{ startMin: 540, endMin: 720 }], busy: [], isOff: false }
);
check("buffer-before pushes first slot", buffered[0] === 555, buffered);
check("buffer-after pulls last slot", buffered[buffered.length - 1] === 645, buffered);

// A busy window (with its own buffers already applied) blocks conflicts.
const withBusy = computeStaffSlots(
  { durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0 },
  {
    staffId: 1,
    blocks: [{ startMin: 540, endMin: 720 }],
    busy: [{ startMin: 600, endMin: 660 }], // 10:00-11:00
    isOff: false,
  }
);
check(
  "busy window excluded",
  withBusy.every((t) => t + 30 <= 600 || t >= 660),
  withBusy
);
check("slots resume after busy window", withBusy.includes(660), withBusy);

// Time off removes the whole day.
const off = computeStaffSlots(
  { durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0 },
  { staffId: 1, blocks: [{ startMin: 540, endMin: 720 }], busy: [], isOff: true }
);
check("time off yields no slots", off.length === 0, off);

// notBefore (same-day lead time) trims early slots.
const lead = computeStaffSlots(
  { durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0, notBeforeMin: 615 },
  { staffId: 1, blocks: [{ startMin: 540, endMin: 720 }], busy: [], isOff: false }
);
check("lead time trims early starts", lead[0] === 615, lead);

// Auto-assign prefers the less-busy staff member for shared times.
const assigned = computeSlots(
  { durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0 },
  [
    {
      staffId: 1,
      blocks: [{ startMin: 540, endMin: 720 }],
      busy: [{ startMin: 480, endMin: 530 }], // busier
      isOff: false,
    },
    { staffId: 2, blocks: [{ startMin: 540, endMin: 720 }], busy: [], isOff: false },
  ]
);
check(
  "auto-assign picks least-busy staff",
  assigned.length > 0 && assigned.every((s) => s.staffId === 2),
  assigned.slice(0, 3)
);

// Round-trip helpers.
check("minutesToHHmm", minutesToHHmm(615) === "10:15");
check("hhmmToMinutes", hhmmToMinutes("10:15") === 615);

process.exit(failures === 0 ? 0 : 1);
