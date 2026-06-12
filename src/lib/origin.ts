import type { NextRequest } from "next/server";

/**
 * Public origin for absolute URLs. Behind the demo proxy + Cloudflare,
 * X-Forwarded-Proto is canonical (Phase 0 deploy contract); locally it
 * falls back to the request URL.
 */
export function publicOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return req.nextUrl.origin;
}
