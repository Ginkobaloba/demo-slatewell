import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { checkAdminCookies } from "@/lib/admin-session";

/**
 * Admin authorization for Node route handlers and server pages (D-014).
 *
 * Middleware already gates /admin and /api/admin, but it is not the only
 * line: every admin handler and page re-verifies the signed session here,
 * so a matcher mistake or a future route outside the matcher still fails
 * closed. The returned visitorId is the scope for every admin query.
 */

export type AdminApiAuth =
  | { ok: true; visitorId: string }
  | { ok: false; response: NextResponse };

export async function requireAdminApi(req: NextRequest): Promise<AdminApiAuth> {
  const check = await checkAdminCookies(req.cookies);
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
 * area is not configured, and sends an unauthenticated browser home.
 */
export async function requireAdminPage(): Promise<string> {
  const check = await checkAdminCookies(await cookies());
  if (check.status === "unconfigured") notFound();
  if (check.status === "unauthenticated") redirect("/?admin=required");
  return check.visitorId;
}
