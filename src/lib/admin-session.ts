import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Signed admin sessions and the per-browser visitor id (D-014).
 *
 * The admin cookie used to be authorized by its NAME alone, so anyone could
 * set it by hand. It now carries an HS256 JWT (HMAC-SHA-256 keyed by
 * SESSION_SECRET) over a random 128-bit session id (`jti`) and the visitor id
 * (`vid`) of the browser it was issued to. A session is only accepted when
 * the signature verifies AND `vid` matches that browser's visitor cookie, so
 * a copied session cookie is useless without the matching visitor cookie.
 *
 * This module is Edge-safe on purpose (jose + Web Crypto only, no node
 * `crypto`, no database): the middleware and the Node route handlers share
 * it, so the check is identical in both places.
 *
 * Fail closed: without a usable SESSION_SECRET nothing can be minted or
 * verified, and callers answer 404 for the whole admin area.
 */

export const ADMIN_SESSION_COOKIE = "slatewell_admin_session";
export const VISITOR_COOKIE = "slatewell_visitor";

/** Admin session lifetime. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
/** Visitor cookie lifetime; matches the 24-hour data retention window. */
export const VISITOR_TTL_SECONDS = 60 * 60 * 24;

const MIN_SECRET_LENGTH = 32;
/** The .env.example placeholder is public, so it must never sign anything. */
const PLACEHOLDER_SECRETS = new Set([
  "replace-with-a-real-32-plus-char-random-secret",
]);

const VISITOR_ID_RE = /^[0-9a-f]{32}$/;
const SESSION_ID_RE = /^[0-9a-f]{32}$/;

export type SessionSource = "demo" | "portal";

export interface AdminSessionPayload extends JWTPayload {
  jti: string;
  vid: string;
  src: SessionSource;
  role: string;
  sub: string;
}

/**
 * The signing key, or null when the secret is missing, too short, or the
 * published placeholder. Null means "admin area disabled".
 */
export function getSessionSecret(): Uint8Array | null {
  const raw = process.env.SESSION_SECRET?.trim();
  if (!raw || raw.length < MIN_SECRET_LENGTH || PLACEHOLDER_SECRETS.has(raw)) {
    return null;
  }
  return new TextEncoder().encode(raw);
}

export function isAdminConfigured(): boolean {
  return getSessionSecret() !== null;
}

/** 128 random bits as 32 lowercase hex chars (Web Crypto, Edge-safe). */
export function randomId128(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isValidVisitorId(value: unknown): value is string {
  return typeof value === "string" && VISITOR_ID_RE.test(value);
}

/**
 * Mint a session bound to `visitorId`. Throws if the admin area is not
 * configured; callers check isAdminConfigured() first and answer 404.
 */
export async function mintAdminSession(args: {
  visitorId: string;
  src: SessionSource;
  subject?: string;
  role?: string;
  customerId?: string | null;
}): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  const secret = getSessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  if (!isValidVisitorId(args.visitorId)) throw new Error("Invalid visitor id");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const sessionId = randomId128();
  const token = await new SignJWT({
    vid: args.visitorId,
    src: args.src,
    role: args.role ?? "staff",
    customer_id: args.customerId ?? null,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setJti(sessionId)
    .setSubject((args.subject ?? "demo-admin").toLowerCase())
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(secret);

  return { token, expiresAt: new Date(exp * 1000), sessionId };
}

/**
 * Verify a session token's signature, expiry, and claim shape. Returns null
 * on any failure (including an unconfigured secret) so callers need not
 * catch. Does NOT check the visitor binding; use checkAdminCookies for that.
 */
export async function verifyAdminSession(
  token: string | undefined | null,
): Promise<AdminSessionPayload | null> {
  const secret = getSessionSecret();
  if (!secret || !token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });
    if (
      typeof payload.jti !== "string" ||
      !SESSION_ID_RE.test(payload.jti) ||
      !isValidVisitorId(payload.vid) ||
      (payload.src !== "demo" && payload.src !== "portal") ||
      typeof payload.sub !== "string"
    ) {
      return null;
    }
    return payload as AdminSessionPayload;
  } catch {
    return null;
  }
}

/** Minimal cookie reader shared by NextRequest.cookies and next/headers. */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export type AdminCheck =
  | { status: "ok"; visitorId: string; session: AdminSessionPayload }
  | { status: "unconfigured" }
  | { status: "unauthenticated" };

/**
 * The single admin gate used by middleware, admin pages, and admin APIs:
 * a valid signature AND a session whose visitor id equals this browser's
 * visitor cookie.
 */
export async function checkAdminCookies(
  cookies: CookieReader,
): Promise<AdminCheck> {
  if (!isAdminConfigured()) return { status: "unconfigured" };
  const session = await verifyAdminSession(
    cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );
  const visitorId = cookies.get(VISITOR_COOKIE)?.value;
  if (!session || !isValidVisitorId(visitorId) || session.vid !== visitorId) {
    return { status: "unauthenticated" };
  }
  return { status: "ok", visitorId, session };
}

function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

export function adminSessionCookieAttributes(expiresAt: Date) {
  return {
    name: ADMIN_SESSION_COOKIE,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: secureCookies(),
    path: "/",
    expires: expiresAt,
  };
}

export function visitorCookieAttributes() {
  return {
    name: VISITOR_COOKIE,
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: secureCookies(),
    path: "/",
    maxAge: VISITOR_TTL_SECONDS,
  };
}
