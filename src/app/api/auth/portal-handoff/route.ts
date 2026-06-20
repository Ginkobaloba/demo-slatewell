import { NextResponse, type NextRequest } from "next/server";

import { verifyPortalToken } from "@/lib/portal-token";

/**
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
 * separate cookie shortcut for the demo "Sign in" button; this route is
 * additive.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const ADMIN_COOKIE = "slatewell_admin_session";
const PORTAL_LANDING = "/admin";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours; Portal token is 60 min so
// we issue our own longer-lived session keyed off a fresh launch.

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

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json(
      { ok: false, reason: "missing_token" },
      { status: 400 },
    );
  }

  let verified;
  try {
    verified = await verifyPortalToken(token);
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

  const res = NextResponse.json(
    {
      ok: true,
      redirect: PORTAL_LANDING,
      email: verified.email,
      role: verified.role,
    },
    { status: 200 },
  );
  res.cookies.set(ADMIN_COOKIE, `portal:${verified.email}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
