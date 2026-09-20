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
 * The visitor cookie itself is signed too (D-016): `<id>.<tag>`, where the
 * tag is HMAC-SHA-256 under a key derived from SESSION_SECRET with its own
 * label, so it can never be confused with an admin session signature. A
 * visitor cookie that does not verify is treated as absent.
 *
 * This module is Edge-safe on purpose (jose + Web Crypto only, no node
 * `crypto`, no database): the middleware and the Node route handlers share
 * it, so the check is identical in both places. Because the Edge runtime
 * cannot reach SQLite, sign-out revocation (D-015) is enforced one layer
 * down, in src/lib/admin-auth.ts; the middleware check here is necessary but
 * not sufficient.
 *
 * Fail closed: without a usable SESSION_SECRET nothing can be minted or
 * verified, and callers answer 404 for the whole admin area. No visitor
 * cookie can be minted or verified either (see D-016 for what that means for
 * the public booking flow).
 */

export const ADMIN_SESSION_COOKIE = "slatewell_admin_session";
export const VISITOR_COOKIE = "slatewell_visitor";

/** Admin session lifetime. */
export const SESSION_TTL_SECONDS = 60 * 60 * 8;
/** Visitor cookie lifetime; matches the 24-hour data retention window. */
export const VISITOR_TTL_SECONDS = 60 * 60 * 24;

const MIN_SECRET_LENGTH = 32;
/**
 * The RETIRED `.env.example` placeholder ("replace-with-a-real-32-plus-char-
 * random-secret", 46 chars), denylisted by exact string as defense in depth
 * only, for anyone who deployed an older checkout. This was never the
 * primary guard and must not become one: an exact-string denylist is
 * defeated by editing a single character of the placeholder, which is
 * exactly what a person does when told a value is invalid -- e.g. this
 * value plus one trailing character is 47 chars, clears MIN_SECRET_LENGTH,
 * and is NOT in this set, so it would have signed real sessions. The
 * current `.env.example` placeholder is instead kept well under
 * MIN_SECRET_LENGTH so it fails the length rule structurally. Do not add
 * the current placeholder here; keep future placeholders short instead.
 */
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
 * Why a SESSION_SECRET value is unusable, or null when it is fine. Checked on
 * the value with surrounding whitespace trimmed (env files often end lines
 * with CR/LF). The shape rules catch a mangled env line, such as a note or a
 * file path pasted in front of the real value, which would otherwise still
 * pass the length check and sign sessions with a guessable string.
 */
export type SecretProblem =
  | "missing"
  | "too_short"
  | "placeholder"
  | "contains_whitespace"
  | "contains_path"
  | "generated_prefix";

const SECRET_PROBLEM_MESSAGES: Record<SecretProblem, string> = {
  missing: "SESSION_SECRET is not set",
  too_short: `SESSION_SECRET is shorter than ${MIN_SECRET_LENGTH} characters`,
  placeholder: "SESSION_SECRET is still the published .env.example placeholder",
  contains_whitespace:
    "SESSION_SECRET contains whitespace (the env line looks mangled; expect one bare random value)",
  contains_path:
    "SESSION_SECRET contains a file path fragment (drive letter, _secrets, or .local.txt); the env line looks mangled",
  generated_prefix:
    'SESSION_SECRET starts with "generated "; the env line holds a note, not just the value',
};

/** A Windows drive path fragment such as `C:\`. */
const DRIVE_PATH_RE = /[A-Za-z]:\\/;

export function sessionSecretProblem(
  value: string | undefined,
): SecretProblem | null {
  const raw = value?.trim();
  if (!raw) return "missing";
  // Shape rules first: a mangled line is the more useful diagnosis even when
  // it also happens to be short.
  if (raw.toLowerCase().startsWith("generated ")) return "generated_prefix";
  if (
    DRIVE_PATH_RE.test(raw) ||
    raw.includes("_secrets") ||
    raw.toLowerCase().includes(".local.txt")
  ) {
    return "contains_path";
  }
  if (/\s/.test(raw)) return "contains_whitespace";
  if (raw.length < MIN_SECRET_LENGTH) return "too_short";
  if (PLACEHOLDER_SECRETS.has(raw)) return "placeholder";
  return null;
}

const warnedProblems = new Set<SecretProblem>();

/**
 * The signing key, or null when the secret fails any rule above. Null means
 * "admin area disabled" (404 everywhere). Each failing rule is logged once
 * per process, naming the rule and never the value.
 */
export function getSessionSecret(): Uint8Array | null {
  const value = process.env.SESSION_SECRET;
  const problem = sessionSecretProblem(value);
  if (problem) {
    if (!warnedProblems.has(problem)) {
      warnedProblems.add(problem);
      console.warn(
        `[admin-session] Admin area disabled (404): ${SECRET_PROBLEM_MESSAGES[problem]}.`,
      );
    }
    return null;
  }
  return new TextEncoder().encode((value as string).trim());
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

// --- signed visitor cookie (D-016) ------------------------------------------

/**
 * Label for the visitor-cookie key. The admin JWT is keyed by the raw secret;
 * the visitor key is HMAC(secret, this label), so a visitor tag and an admin
 * session signature are computed under different keys. The version lets a
 * future format change retire every old cookie at once.
 */
export const VISITOR_KEY_LABEL = "slatewell:visitor-cookie:v1";

/** `<32 hex id>.<43 char base64url HMAC-SHA-256 tag>`. */
const SIGNED_VISITOR_RE = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/;

const textEncoder = new TextEncoder();

let visitorKeyCache: { secret: string; key: Promise<CryptoKey> } | null = null;

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The HMAC key for visitor cookies, or null when SESSION_SECRET is unusable.
 * Derived once per secret value and cached (the secret only changes in
 * tests, or on a restart with a rotated env file).
 */
async function getVisitorKey(): Promise<CryptoKey | null> {
  const secret = getSessionSecret();
  if (!secret) return null;
  const secretText = new TextDecoder().decode(secret);
  if (visitorKeyCache?.secret !== secretText) {
    const subtle = globalThis.crypto.subtle;
    const key = (async () => {
      const root = await subtle.importKey(
        "raw",
        secret as Uint8Array<ArrayBuffer>,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const derived = new Uint8Array(
        await subtle.sign("HMAC", root, textEncoder.encode(VISITOR_KEY_LABEL)),
      );
      return subtle.importKey(
        "raw",
        derived,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
      );
    })();
    visitorKeyCache = { secret: secretText, key };
  }
  return visitorKeyCache.key;
}

/**
 * The signed cookie value for a visitor id, or null when the admin/visitor
 * secret is not configured (callers then refuse to mint a visitor at all).
 */
export async function signVisitorId(visitorId: string): Promise<string | null> {
  if (!isValidVisitorId(visitorId)) throw new Error("Invalid visitor id");
  const key = await getVisitorKey();
  if (!key) return null;
  const tag = new Uint8Array(
    await globalThis.crypto.subtle.sign("HMAC", key, textEncoder.encode(visitorId)),
  );
  return `${visitorId}.${toBase64Url(tag)}`;
}

/**
 * The visitor id carried by a signed cookie value, or null for anything
 * else: absent, unsigned (the pre-D-016 bare hex format), tampered, signed
 * under another secret, malformed, or no usable secret. The tag is checked
 * with crypto.subtle.verify, which compares in constant time.
 */
export async function verifyVisitorCookie(
  value: string | undefined | null,
): Promise<string | null> {
  if (!value) return null;
  const match = SIGNED_VISITOR_RE.exec(value);
  if (!match) return null;
  const key = await getVisitorKey();
  if (!key) return null;
  const [, visitorId, tag] = match;
  let tagBytes: Uint8Array<ArrayBuffer>;
  try {
    tagBytes = fromBase64Url(tag);
  } catch {
    return null;
  }
  // Canonical encoding only: the last base64url char carries 2 unused bits,
  // so without this a tag with those bits flipped would also verify.
  if (tagBytes.length !== 32 || toBase64Url(tagBytes) !== tag) return null;
  const ok = await globalThis.crypto.subtle.verify(
    "HMAC",
    key,
    tagBytes,
    textEncoder.encode(visitorId),
  );
  return ok ? visitorId : null;
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
 * catch. `requiredClaims` rejects a token missing `exp`, `iat`, or `jti`
 * outright (W2, #35 deep verify): the app never mints one without all
 * three, but a holder of SESSION_SECRET could sign one by hand, and a
 * non-expiring or revocation-proof (no `jti`) session must never verify.
 *
 * `requiredClaims` alone only checks PRESENCE, not value (W1, #38 deep
 * verify): `jose` validates `iat`'s value against the clock only when
 * `maxTokenAge` is set, and it never relates `exp` to `iat` at all. Without
 * more, a holder of SESSION_SECRET could still hand-sign an "accepted"
 * token with `exp` decades out, `iat` in the future, `iat` after `exp`,
 * `iat` at or before the epoch, or a fractional `exp`/`iat`. Two layers
 * close that:
 *   - `maxTokenAge: SESSION_TTL_SECONDS` makes `jose` itself reject an
 *     `iat` more than the session TTL in the past (catches `iat` at/near
 *     the epoch or otherwise stale) or an `iat` in the future at all (zero
 *     clock tolerance; see below for why none is added).
 *   - An explicit check below requires `exp - iat` to be a positive
 *     integer no greater than SESSION_TTL_SECONDS. `maxTokenAge` bounds
 *     `iat` against "now" but never against `exp`, so it does not by
 *     itself stop a token minted this second with `exp` set 100 years
 *     out; this check does. It also rejects a fractional `exp` or `iat`,
 *     which `jose` accepts as long as it is a finite number, and it
 *     independently refuses `iat` after `exp` (in practice already
 *     unreachable given the two checks above: an unexpired token with
 *     `iat` after `exp` requires `iat` in the future, which `maxTokenAge`
 *     already refused).
 *   - No clock tolerance is added anywhere in this check. Mint and verify
 *     both read `Date.now()` in the same process (no cross-host clock
 *     skew to absorb), and nothing else in this codebase uses
 *     `clockTolerance`; adding one here would only open back up the exact
 *     slack (a few seconds of "future" `iat`, or `exp` a few seconds past
 *     `iat + TTL`) this fix exists to close, for no compensating benefit.
 *
 * Does NOT check the visitor binding; use checkAdminCookies for that.
 */
export async function verifyAdminSession(
  token: string | undefined | null,
): Promise<AdminSessionPayload | null> {
  const secret = getSessionSecret();
  if (!secret || !token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      requiredClaims: ["exp", "iat", "jti"],
      maxTokenAge: SESSION_TTL_SECONDS,
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
    const { exp, iat } = payload;
    if (
      typeof exp !== "number" ||
      typeof iat !== "number" ||
      !Number.isInteger(exp) ||
      !Number.isInteger(iat) ||
      exp - iat <= 0 ||
      exp - iat > SESSION_TTL_SECONDS
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
 * The stateless part of the admin gate, shared by middleware, admin pages,
 * and admin APIs: a valid session signature AND a validly signed visitor
 * cookie whose id equals the session's `vid`.
 *
 * It cannot see sign-out revocation (D-015), which lives in SQLite. Node
 * code must authorize through authorizeAdmin() in src/lib/admin-auth.ts,
 * which calls this and then checks the revocation table.
 */
export async function checkAdminCookies(
  cookies: CookieReader,
): Promise<AdminCheck> {
  if (!isAdminConfigured()) return { status: "unconfigured" };
  const session = await verifyAdminSession(
    cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );
  if (!session) return { status: "unauthenticated" };
  const visitorId = await verifyVisitorCookie(cookies.get(VISITOR_COOKIE)?.value);
  if (!visitorId || session.vid !== visitorId) {
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
