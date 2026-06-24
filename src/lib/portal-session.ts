import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * App-side session cookie (Harbor-pattern standardization, chunk 4b).
 *
 * Once verifyPortalToken accepts a Portal handoff, we mint our own
 * short-lived HS256 session JWT and stash it in an HttpOnly cookie. The
 * Portal token itself is single-use handoff material; we do not persist it.
 *
 * External cookie shape (name "slatewell_admin_session", path "/") is
 * preserved intentionally so the admin middleware and the demo sign-in
 * shortcut at /api/admin/session keep working without changes.
 *
 * HS256 is appropriate here because only Slatewell signs and reads its own
 * session. Asymmetric keys would be wasted complexity for a single-tenant
 * cookie.
 */

export const SLATEWELL_SESSION_COOKIE = "slatewell_admin_session";

// 8 hours -- matches the existing Portal-derived window noted in the handoff route.
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export interface SlatewellSessionPayload extends JWTPayload {
  sub: string;
  customer_id: string | null;
  role: string;
  src: "portal";
}

function getSecret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a value of at least 32 characters",
    );
  }
  return new TextEncoder().encode(raw);
}

/**
 * Mint a session JWT for the verified Portal subject. Returns the raw
 * compact token and the expiry Date; the caller decides how to set the
 * cookie.
 */
export async function mintSlatewellSession(args: {
  email: string;
  customerId: string | null;
  role: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const token = await new SignJWT({
    customer_id: args.customerId,
    role: args.role,
    src: "portal",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(args.email.toLowerCase())
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(getSecret());

  return { token, expiresAt: new Date(exp * 1000) };
}

/**
 * Verify a session token. Returns null on any failure so callers do not
 * need to catch.
 */
export async function verifySlatewellSession(
  token: string,
): Promise<SlatewellSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    return payload as SlatewellSessionPayload;
  } catch {
    return null;
  }
}

/**
 * Cookie name helper. Returns the canonical cookie name so callers do not
 * hard-code the string.
 */
export function slatewellSessionCookieName(): string {
  return SLATEWELL_SESSION_COOKIE;
}

/**
 * Cookie attribute set for Set-Cookie. Includes the name so callers can
 * spread this directly into res.cookies.set().
 */
export function slatewellSessionCookieAttributes(expiresAt: Date) {
  return {
    name: SLATEWELL_SESSION_COOKIE,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
