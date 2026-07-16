import type { InMemoryJwksCache } from "@paradigm-codes/auth";

import type {
  PortalRole,
  PortalTokenClaims,
  VerifiedPortalToken,
  VerifierConfig,
} from "./portal-token-bespoke";

/**
 * Shared-library portal verifier (CA5).
 *
 * Delegates signature, algorithm, kid, temporal, issuer, and audience checks
 * to @paradigm-codes/auth (the K4 client library, the engine every Paradigm
 * consumer standardizes on). The library is deliberately claim-agnostic, so
 * Slatewell's strict claim contract is re-applied here post-verify with the
 * exact same checks and thrown error messages as the bespoke engine:
 *
 *   - sub must be a non-empty string        -> "Token missing sub (email)"
 *   - role must be customer|staff|internal  -> "Token has unknown role: ..."
 *   - iat and exp must be numbers           -> "Token missing iat or exp"
 *
 * Documented behavioral deltas vs the bespoke engine (all safe against the
 * portal contract, which always mints kid + iat + exp):
 *   - a token without a `kid` header is rejected (bespoke accepted kid-less
 *     tokens when the JWKS published exactly one key)
 *   - a token without `exp` is rejected by the library pre-claim-check, so
 *     the thrown message differs (was "Token missing iat or exp")
 *   - caching is a hard 60-minute TTL plus refetch-once-on-unknown-kid;
 *     there is no 10-minute stale-while-revalidate tail
 *   - on a token failing multiple checks, temporal errors win over
 *     issuer/audience errors (the library checks exp/nbf first; jose ran
 *     issuer/audience first)
 */

type AuthModule = typeof import("@paradigm-codes/auth");

/**
 * The library ships ESM-only (its exports map carries only the `import`
 * condition), while the tsx smoke scripts load this app's modules in CJS
 * mode. A lazy dynamic import is the one loading style that works in both
 * the Next.js server bundle and the tsx scripts.
 */
let authModule: Promise<AuthModule> | undefined;

function loadAuth(): Promise<AuthModule> {
  if (!authModule) {
    authModule = import("@paradigm-codes/auth");
  }
  return authModule;
}

/**
 * Matches the bespoke 1h fresh window. The library clamps TTL into its
 * [10 min, 60 min] bounds, so this lands exactly on the 60-minute maximum.
 * Rotation inside the TTL is covered by refetch-once-on-unknown-kid.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Per-JWKS-URL caches, module-scoped like the bespoke globalThis cache.
 * Keyed by URL so test fixtures (which point PORTAL_JWKS_URL at a local
 * server) never collide with a real environment.
 */
const cachesByUrl = new Map<string, InMemoryJwksCache>();

/** Test hook: clears the shared-engine caches (mirrors the bespoke reset). */
export function __resetSharedPortalTokenCache(): void {
  cachesByUrl.clear();
}

/**
 * Mirrors the bespoke readConfig exactly (same env vars, same default
 * audience, same thrown messages). Duplicated rather than imported so
 * deleting the bespoke module after the flag retires does not orphan
 * config parsing.
 */
function readConfig(): VerifierConfig {
  const jwksUrl = process.env.PORTAL_JWKS_URL;
  const issuer = process.env.PORTAL_EXPECTED_ISSUER;
  const audience = process.env.PORTAL_EXPECTED_AUD ?? "slatewell";
  if (!jwksUrl) throw new Error("PORTAL_JWKS_URL is not configured");
  if (!issuer) throw new Error("PORTAL_EXPECTED_ISSUER is not configured");
  return { jwksUrl, issuer, audience };
}

async function cacheFor(url: string): Promise<InMemoryJwksCache> {
  let cache = cachesByUrl.get(url);
  if (!cache) {
    const { InMemoryJwksCache: JwksCache } = await loadAuth();
    cache = new JwksCache({ jwksUri: url, ttlMs: CACHE_TTL_MS });
    cachesByUrl.set(url, cache);
  }
  return cache;
}

/**
 * Decode the header kid without verifying, purely for the success result and
 * the "No matching JWK" error message. Signature validation happens in the
 * library; a token that reaches the success path always carries this kid.
 */
function readHeaderKid(token: string): string | undefined {
  try {
    const [header] = token.split(".");
    const parsed = JSON.parse(
      Buffer.from(header ?? "", "base64url").toString("utf8"),
    ) as { kid?: unknown };
    return typeof parsed.kid === "string" ? parsed.kid : undefined;
  } catch {
    return undefined;
  }
}

function isPortalRole(value: unknown): value is PortalRole {
  return value === "customer" || value === "staff" || value === "internal";
}

/**
 * Verify a Portal-issued JWT through the shared library and return the
 * trusted claims in the app's VerifiedPortalToken shape. Throws on any
 * failure, like the bespoke engine.
 */
export async function verifySharedPortalToken(
  token: string,
  config?: Partial<VerifierConfig>,
): Promise<VerifiedPortalToken> {
  const cfg: VerifierConfig = { ...readConfig(), ...config };
  const { AuthError, verifyToken } = await loadAuth();
  const kid = readHeaderKid(token);

  let claims: PortalTokenClaims;
  try {
    claims = (await verifyToken(token, {
      issuer: cfg.issuer,
      audience: cfg.audience,
      cache: await cacheFor(cfg.jwksUrl),
    })) as PortalTokenClaims;
  } catch (err) {
    if (
      err instanceof AuthError &&
      (err.code === "missing_kid" || err.code === "unknown_kid")
    ) {
      // Preserve the bespoke error shape callers and smoke tests match on.
      throw new Error(`No matching JWK for kid=${kid ?? "(none)"}`);
    }
    throw err;
  }

  // Slatewell's strict claim contract, re-applied post-verify. The shared
  // library validates signature/iss/aud/exp only; these checks (and their
  // exact messages) are this app's own hard floor.
  if (!claims.sub) {
    throw new Error("Token missing sub (email)");
  }
  if (!claims.role || !isPortalRole(claims.role)) {
    throw new Error(`Token has unknown role: ${String(claims.role)}`);
  }
  if (typeof claims.iat !== "number" || typeof claims.exp !== "number") {
    throw new Error("Token missing iat or exp");
  }

  return {
    email: claims.sub.toLowerCase(),
    customerId: claims.customer_id ?? null,
    role: claims.role,
    issuedAt: claims.iat,
    expiresAt: claims.exp,
    kid: kid ?? "",
  };
}
