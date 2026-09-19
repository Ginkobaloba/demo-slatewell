import type { NextResponse } from "next/server";
import {
  VISITOR_COOKIE,
  isValidVisitorId,
  randomId128,
  visitorCookieAttributes,
  type CookieReader,
} from "@/lib/admin-session";

/**
 * Per-browser demo scope (D-014). Every booking a visitor creates is tagged
 * with the random 128-bit id in the HttpOnly `slatewell_visitor` cookie, and
 * the admin views, admin APIs, and public booking detail pages only show a
 * browser its own records (plus the fictional seed data).
 */

/** The browser's visitor id, or null if the cookie is absent or malformed. */
export function readVisitorId(cookies: CookieReader): string | null {
  const value = cookies.get(VISITOR_COOKIE)?.value;
  return isValidVisitorId(value) ? value : null;
}

/** Reuse the browser's visitor id, or mint a new one. */
export function resolveVisitorId(cookies: CookieReader): {
  visitorId: string;
  isNew: boolean;
} {
  const existing = readVisitorId(cookies);
  if (existing) return { visitorId: existing, isNew: false };
  return { visitorId: randomId128(), isNew: true };
}

export function setVisitorCookie(res: NextResponse, visitorId: string): void {
  res.cookies.set({ ...visitorCookieAttributes(), value: visitorId });
}
