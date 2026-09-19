import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieAttributes,
  isAdminConfigured,
  mintAdminSession,
  verifyAdminSession,
} from "@/lib/admin-session";
import { getDb } from "@/lib/db";
import { revokeAdminSession } from "@/lib/session-revocation";
import { resolveVisitorId, setVisitorCookie } from "@/lib/visitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Behind the demo reverse proxy, request.url's origin is the container's
 * internal bind address (0.0.0.0:3000), so NextResponse.redirect(new
 * URL(path, request.url)) would ship an absolute Location pointing at an
 * unreachable host. A path-relative Location lets the browser resolve
 * against the real public origin. (Same fix merged into lumen/axlepoint.)
 */
function relativeRedirect(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/**
 * POST ?signout=1: revoke the session server-side (D-015), then clear the
 * cookie. Any token whose signature and expiry verify is revoked, whether or
 * not the visitor cookie still matches, so a browser whose visitor cookie
 * was lost can still kill its session. A forged or expired token is not
 * written anywhere (it is already useless), so this cannot be used to fill
 * the table with junk.
 */
async function signOut(request: NextRequest) {
  const session = await verifyAdminSession(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );
  if (session && typeof session.exp === "number") {
    try {
      revokeAdminSession(getDb(), session.jti, session.exp);
    } catch (err) {
      // Do not pretend the session is dead. Clear the cookie anyway so this
      // browser is signed out locally, but report the failure.
      console.error("[admin-session] sign-out revocation failed", err);
      const res = NextResponse.json(
        { error: "Sign-out could not be recorded. Please try again." },
        { status: 500 },
      );
      res.cookies.delete(ADMIN_SESSION_COOKIE);
      return res;
    }
  }
  const res = relativeRedirect("/");
  res.cookies.delete(ADMIN_SESSION_COOKIE);
  return res;
}

/**
 * POST /api/admin/session -- the one-click "Sign in as demo admin" button.
 *
 * Prospects can still try the staff view without credentials, but the
 * session this issues is signed and bound to the caller's signed visitor
 * cookie (minted here if the browser has none, or has one that does not
 * verify), so the admin views it unlocks only ever show fictional seed data
 * plus that same browser's own bookings (D-014, D-016). POST ?signout=1
 * revokes the session (D-015).
 */
export async function POST(request: NextRequest) {
  const signout = request.nextUrl.searchParams.get("signout");
  if (signout) return signOut(request);

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const visitor = await resolveVisitorId(request.cookies);
  if (!visitor.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { token, expiresAt } = await mintAdminSession({
    visitorId: visitor.visitorId,
    src: "demo",
  });

  const res = relativeRedirect("/admin");
  res.cookies.set({ ...adminSessionCookieAttributes(expiresAt), value: token });
  if (visitor.isNew) await setVisitorCookie(res, visitor.visitorId);
  return res;
}
