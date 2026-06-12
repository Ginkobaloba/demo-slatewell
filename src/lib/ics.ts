/**
 * ICS (RFC 5545) generation for booking confirmations. Emits
 * TZID-qualified local times per D-003, with a VTIMEZONE block so the
 * file is self-contained for any calendar client.
 */
import type { BookingDetails } from "@/lib/repo";

/**
 * VTIMEZONE definitions for the timezones a business can use. The demo
 * business is America/New_York (D-003); add blocks here if that grows.
 */
const VTIMEZONES: Record<string, string[]> = {
  "America/New_York": [
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ],
};

/** "2026-06-17T14:30" -> "20260617T143000" */
function icsLocal(isoLocal: string): string {
  return `${isoLocal.replace(/[-:]/g, "")}00`;
}

/** Current UTC instant as an ICS DTSTAMP value. */
function icsUtcNow(): string {
  return `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** Escape per RFC 5545: backslash, semicolon, comma, newline. */
function esc(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (continuation lines start with a space). */
function fold(line: string): string[] {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  out.push(rest);
  return out;
}

export function buildBookingIcs(opts: {
  booking: BookingDetails;
  timezone: string;
  instructions: string[];
  cancelUrl: string;
}): string {
  const { booking } = opts;
  const tz = VTIMEZONES[opts.timezone];
  if (!tz) throw new Error(`No VTIMEZONE defined for ${opts.timezone}`);

  const description = [
    `${booking.service_name} with ${booking.staff_name}.`,
    "",
    ...opts.instructions.map((line) => `- ${line}`),
    "",
    `Booking ID: ${booking.id}`,
    `Cancel or reschedule: ${opts.cancelUrl}`,
  ].join("\n");

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Slatewell//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...tz,
    "BEGIN:VEVENT",
    `UID:${booking.id}@slatewell.projectnexuscode.org`,
    `DTSTAMP:${icsUtcNow()}`,
    `DTSTART;TZID=${opts.timezone}:${icsLocal(booking.start_at)}`,
    `DTEND;TZID=${opts.timezone}:${icsLocal(booking.end_at)}`,
    `SUMMARY:${esc(`${booking.service_name} at ${booking.business_name}`)}`,
    ...(booking.business_address
      ? [`LOCATION:${esc(booking.business_address)}`]
      : []),
    `DESCRIPTION:${esc(description)}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.flatMap(fold).join("\r\n") + "\r\n";
}
