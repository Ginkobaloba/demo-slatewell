import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieAttributes,
  isAdminConfigured,
  mintAdminSession,
} from "@/lib/admin-session";
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
 * POST /api/admin/session -- the one-click "Sign in as demo admin" button.
 *
 * Prospects can still try the staff view without credentials, but the
 * session this issues is signed and bound to the caller's visitor cookie
 * (minted here if the browser has none), so the admin views it unlocks only
 * ever show fictional seed data plus that same browser's own bookings
 * (D-014). POST ?signout=1 clears the session.
 */
export async function POST(request: NextRequest) {
  const signout = request.nextUrl.searchParams.get("signout");
  if (signout) {
    const res = relativeRedirect("/");
    res.cookies.delete(ADMIN_SESSION_COOKIE);
    return res;
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { visitorId, isNew } = resolveVisitorId(request.cookies);
  const { token, expiresAt } = await mintAdminSession({
    visitorId,
    src: "demo",
  });

  const res = relativeRedirect("/admin");
  res.cookies.set({ ...adminSessionCookieAttributes(expiresAt), value: token });
  if (isNew) setVisitorCookie(res, visitorId);
  return res;
}
