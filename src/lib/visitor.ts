import type { NextResponse } from "next/server";
import {
  VISITOR_COOKIE,
  isAdminConfigured,
  randomId128,
  signVisitorId,
  verifyVisitorCookie,
  visitorCookieAttributes,
  type CookieReader,
} from "@/lib/admin-session";

/**
 * Per-browser demo scope (D-014, D-016). Every booking a visitor creates is
 * tagged with a random 128-bit visitor id, and the admin views, admin APIs,
 * and public booking detail pages only show a browser its own records (plus
 * the fictional seed data).
 *
 * The id reaches the browser in the HttpOnly `slatewell_visitor` cookie as
 * `<id>.<HMAC tag>` (D-016). A cookie that does not verify (tampered,
 * unsigned pre-D-016 value, signed under another secret) is never trusted:
 * readers treat it as absent and writers mint a fresh visitor.
 */

/** The browser's verified visitor id, or null. */
export async function readVisitorId(cookies: CookieReader): Promise<string | null> {
  return verifyVisitorCookie(cookies.get(VISITOR_COOKIE)?.value);
}

export type ResolvedVisitor =
  | { ok: true; visitorId: string; isNew: boolean }
  | { ok: false; reason: "unconfigured" };

/**
 * Reuse the browser's verified visitor id, or mint a new one. Fails when no
 * usable SESSION_SECRET exists, because an unsigned visitor id would be a
 * bearer token again (D-016); callers refuse the request instead.
 */
export async function resolveVisitorId(
  cookies: CookieReader,
): Promise<ResolvedVisitor> {
  if (!isAdminConfigured()) return { ok: false, reason: "unconfigured" };
  const existing = await readVisitorId(cookies);
  if (existing) return { ok: true, visitorId: existing, isNew: false };
  return { ok: true, visitorId: randomId128(), isNew: true };
}

/** Set the signed visitor cookie. Throws if the secret became unusable. */
export async function setVisitorCookie(
  res: NextResponse,
  visitorId: string,
): Promise<void> {
  const value = await signVisitorId(visitorId);
  if (!value) throw new Error("SESSION_SECRET is not configured");
  res.cookies.set({ ...visitorCookieAttributes(), value });
}
