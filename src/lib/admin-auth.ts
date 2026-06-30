import type { NextRequest } from "next/server";

/**
 * Demo-admin cookie (D-010). Its presence is sufficient authorization for
 * admin routes; there is no user identity inside it. Mutating admin API
 * routes call requireAdmin() and 401 when it is absent.
 */
export const ADMIN_COOKIE = "slatewell_admin_session";

export function isAdmin(req: NextRequest): boolean {
  return req.cookies.has(ADMIN_COOKIE);
}
