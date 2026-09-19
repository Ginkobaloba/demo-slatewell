import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  checkAdminCookies,
  type AdminCheck,
  type CookieReader,
} from "@/lib/admin-session";
import { getDb } from "@/lib/db";
import { isAdminSessionRevoked } from "@/lib/session-revocation";

/**
 * Admin authorization for Node route handlers and server pages (D-014,
 * D-015). This is the AUTHORITATIVE gate.
 *
 * Middleware runs in the Edge runtime and can only check what the cookies
 * prove on their own (signature, expiry, visitor binding). It cannot reach
 * SQLite, so it cannot see a sign-out. Every admin page and admin API
 * handler therefore authorizes here, through authorizeAdmin(), which adds
 * the revocation check. scripts/test-admin-security.ts fails if an admin
 * page or API route stops calling requireAdminPage/requireAdminApi.
 * The returned visitorId is the scope for every admin query.
 */

/**
 * The one Node-side admin check: the stateless cookie check, then "has this
 * session been signed out". A revoked session is reported exactly like a
 * missing one. A database error propagates (the request fails; it is never
 * treated as "not revoked").
 */
export async function authorizeAdmin(cookieJar: CookieReader): Promise<AdminCheck> {
  const check = await checkAdminCookies(cookieJar);
  if (check.status !== "ok") return check;
  if (isAdminSessionRevoked(getDb(), check.session.jti)) {
    return { status: "unauthenticated" };
  }
  return check;
}

export type AdminApiAuth =
  | { ok: true; visitorId: string }
  | { ok: false; response: NextResponse };

export async function requireAdminApi(req: NextRequest): Promise<AdminApiAuth> {
  const check = await authorizeAdmin(req.cookies);
  if (check.status === "unconfigured") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found" }, { status: 404 }),
    };
  }
  if (check.status === "unauthenticated") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, visitorId: check.visitorId };
}

/**
 * For admin server pages: returns the visitor scope, 404s when the admin
 * area is not configured, and sends an unauthenticated (or signed-out)
 * browser home.
 */
export async function requireAdminPage(): Promise<string> {
  const check = await authorizeAdmin(await cookies());
  if (check.status === "unconfigured") notFound();
  if (check.status === "unauthenticated") redirect("/?admin=required");
  return check.visitorId;
}
