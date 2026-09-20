import { NextResponse, type NextRequest } from "next/server";

import { verifyPortalToken } from "@/lib/portal-token";
import {
  adminSessionCookieAttributes,
  isAdminConfigured,
  mintAdminSession,
} from "@/lib/admin-session";
import { resolveVisitorId, setVisitorCookie } from "@/lib/visitor";

/**
 * UNREACHED in production as of 2026-09-19: the portal renders this demo
 * as an iframe tile, and iframe tiles receive no token today (the portal
 * never navigates the frame with a #portal_token fragment). The portal
 * side owns this decision and records it in `docs/PORTAL_GATE_CONTRACT.md`
 * (portal-shell); check there before assuming this route is live.
 *
 * Portal handoff endpoint (chunk 4b).
 *
 * The Portal mints a 60-minute RS256 JWT and redirects the browser to
 *   https://slatewell.example/#portal_token=<JWT>
 * Slatewell's landing page reads the fragment client-side, scrubs it from
 * history, and POSTs the token here. We verify the signature locally via
 * the Portal JWKS, then mint our own session cookie. The token itself is
 * never persisted; we only trust it as proof of a fresh portal launch.
 *
 * Returns JSON { ok, redirect } rather than a 30x because the caller is
 * fetch() from the client; the client follows the redirect explicitly so
 * the cookie is in place before navigation.
 *
 * The pre-existing /api/admin/session POST path stays in place as a
 * separate shortcut for the demo "Sign in" button; this route is additive.
 *
 * No wider access than the demo button (D-014): the session minted here is
 * the same signed, visitor-bound session, so a portal staff user sees the
 * same scope as any visitor (seed data plus this browser's own bookings).
 * The only thing this route adds is that it requires a verified Portal token
 * first. If the admin area is not configured (no SESSION_SECRET) it 404s.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PORTAL_LANDING = "/admin";

type Body = { token?: unknown };

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid_body" },
      { status: 400 },
    );
  }

  const portalToken = typeof body.token === "string" ? body.token.trim() : "";
  if (!portalToken) {
    return NextResponse.json(
      { ok: false, reason: "missing_token" },
      { status: 400 },
    );
  }

  let verified;
  try {
    verified = await verifyPortalToken(portalToken);
  } catch (err) {
    // Log the detail server-side; surface a generic reason to the client.
    console.error("[portal-handoff] verify failed:", err);
    return NextResponse.json(
      { ok: false, reason: "invalid_token" },
      { status: 401 },
    );
  }

  // Only staff / internal users get the admin surface today. Customers
  // bounce back to the booking flow on the landing page; this matches the
  // contract's role taxonomy without inventing a customer portal yet.
  if (verified.role === "customer") {
    return NextResponse.json(
      { ok: true, redirect: "/?from=portal" },
      { status: 200 },
    );
  }

  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const visitor = await resolveVisitorId(request.cookies);
  if (!visitor.ok) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }
  const { token, expiresAt } = await mintAdminSession({
    visitorId: visitor.visitorId,
    src: "portal",
    subject: verified.email,
    customerId: verified.customerId ?? null,
    role: verified.role,
  });

  const res = NextResponse.json(
    {
      ok: true,
      redirect: PORTAL_LANDING,
      email: verified.email,
      role: verified.role,
    },
    { status: 200 },
  );
  res.cookies.set({
    ...adminSessionCookieAttributes(expiresAt),
    value: token,
  });
  if (visitor.isNew) await setVisitorCookie(res, visitor.visitorId);
  return res;
}
