import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  checkAdminCookies,
} from "@/lib/admin-session";

/**
 * Admin gate (D-014). A cookie with the right name is no longer enough: the
 * session must carry a valid HMAC-SHA-256 signature and be bound to this
 * browser's signed visitor cookie (D-016). Route handlers and pages re-check
 * the same thing (src/lib/admin-auth.ts); this is the first line, not the
 * only one.
 *
 * Sign-out revocation (D-015) is NOT checked here: this runs in the Edge
 * runtime, which cannot reach SQLite. A signed-out cookie pair still passes
 * this layer and is refused by authorizeAdmin() in every admin page and
 * admin API handler, which is the authoritative gate.
 *
 * - Admin area not configured (no usable SESSION_SECRET): 404 everywhere.
 * - /admin pages without a valid session: back to the landing page.
 * - /api/admin/* without a valid session: 401 JSON.
 * - /api/admin/session is the sign-in endpoint itself and is not gated.
 */
const SESSION_ENDPOINT = "/api/admin/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === SESSION_ENDPOINT) return NextResponse.next();

  const check = await checkAdminCookies(request.cookies);
  const isApi = pathname.startsWith("/api/");

  if (check.status === "unconfigured") {
    return isApi
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : new NextResponse("Not found", { status: 404 });
  }

  if (check.status === "unauthenticated") {
    if (isApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "?admin=required";
    const res = NextResponse.redirect(url);
    if (request.cookies.has(ADMIN_SESSION_COOKIE)) {
      res.cookies.delete(ADMIN_SESSION_COOKIE);
    }
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
