/**
 * Portal JWT verification (chunk 4b).
 *
 * Slatewell verifies Portal-issued access tokens locally using the public
 * JWKS published at PORTAL_JWKS_URL. The contract is documented in
 * portal-shell/docs/PORTAL_GATE_CONTRACT.md. Quick summary:
 *
 *   - Algorithm: RS256, 2048-bit RSA.
 *   - Header carries `kid`; verifier matches against the JWKS entry.
 *   - Required claims: iss === PORTAL_EXPECTED_ISSUER, aud === slatewell,
 *     sub (lowercased email), iat, exp (issued 60 min ago at most).
 *   - JWKS may carry an "active" and a "previous" key during rotation, so
 *     tokens minted just before rotation continue to verify until expiry.
 *
 * Caching contract: JWKS responses are cached for 1 hour fresh + 10 minutes
 * stale-while-revalidate. We mirror the portal's Cache-Control header values
 * locally so a rotation propagates without hammering the JWKS endpoint or
 * stalling verification when the portal is briefly unreachable.
 */
import { importJWK, jwtVerify, type JWK, type JWTPayload } from "jose";

const FRESH_MS = 60 * 60 * 1000; // 1h
const SWR_MS = 10 * 60 * 1000; // 10m stale-while-revalidate

export type PortalRole = "customer" | "staff" | "internal";

export interface PortalTokenClaims extends JWTPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  customer_id: string | null;
  role: PortalRole;
}

export interface VerifiedPortalToken {
  email: string;
  customerId: string | null;
  role: PortalRole;
  issuedAt: number;
  expiresAt: number;
  kid: string;
}

interface JwksEntry {
  fetchedAt: number;
  keys: Array<JWK & { kid: string }>;
  refreshing: boolean;
}

interface VerifierConfig {
  jwksUrl: string;
  issuer: string;
  audience: string;
}

/**
 * Process-wide JWKS cache. Stored on globalThis so Next.js dev HMR reloads
 * do not blow it away between requests. Keyed by JWKS URL to keep a
 * per-environment cache (test fixtures use a separate URL).
 */
declare global {
  // eslint-disable-next-line no-var
  var __slatewellJwksCache: Map<string, JwksEntry> | undefined;
}

function cache(): Map<string, JwksEntry> {
  if (!globalThis.__slatewellJwksCache) {
    globalThis.__slatewellJwksCache = new Map();
  }
  return globalThis.__slatewellJwksCache;
}

/**
 * Hook for tests. Clears the JWKS cache so a stubbed fetch is exercised.
 */
export function __resetPortalTokenCache(): void {
  cache().clear();
}

function readConfig(): VerifierConfig {
  const jwksUrl = process.env.PORTAL_JWKS_URL;
  const issuer = process.env.PORTAL_EXPECTED_ISSUER;
  const audience = process.env.PORTAL_EXPECTED_AUD ?? "slatewell";
  if (!jwksUrl) throw new Error("PORTAL_JWKS_URL is not configured");
  if (!issuer) throw new Error("PORTAL_EXPECTED_ISSUER is not configured");
  return { jwksUrl, issuer, audience };
}

async function fetchJwks(url: string): Promise<JwksEntry> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`JWKS fetch failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { keys?: JWK[] };
  if (!body || !Array.isArray(body.keys)) {
    throw new Error("JWKS response missing keys array");
  }
  const keys = body.keys.filter(
    (k): k is JWK & { kid: string } => typeof k.kid === "string",
  );
  if (keys.length === 0) {
    throw new Error("JWKS response had no usable keys");
  }
  return { fetchedAt: Date.now(), keys, refreshing: false };
}

async function getJwks(url: string): Promise<JwksEntry> {
  const store = cache();
  const existing = store.get(url);
  const now = Date.now();

  if (existing) {
    const age = now - existing.fetchedAt;
    if (age < FRESH_MS) {
      return existing;
    }
    if (age < FRESH_MS + SWR_MS) {
      // Stale-while-revalidate: serve the cached copy, refresh in the
      // background. Single-flight via the `refreshing` flag.
      if (!existing.refreshing) {
        existing.refreshing = true;
        fetchJwks(url)
          .then((fresh) => store.set(url, fresh))
          .catch(() => {
            // Swallow; we'll retry on next request. Keep serving cached.
            existing.refreshing = false;
          });
      }
      return existing;
    }
  }

  // Cold cache or past the SWR window: synchronous refresh.
  const fresh = await fetchJwks(url);
  store.set(url, fresh);
  return fresh;
}

function findKey(
  entry: JwksEntry,
  kid: string | undefined,
): (JWK & { kid: string }) | undefined {
  if (!kid) {
    // If only one key is published, allow kid-less tokens. Otherwise the
    // contract requires kid for unambiguous selection.
    if (entry.keys.length === 1) return entry.keys[0];
    return undefined;
  }
  return entry.keys.find((k) => k.kid === kid);
}

/**
 * Decode the header without verifying. Used purely to pick the JWK; signature
 * validation runs after we resolve the key, via jose's jwtVerify.
 */
function decodeHeader(token: string): { kid?: string; alg?: string } {
  const dot = token.indexOf(".");
  if (dot <= 0) throw new Error("Malformed token: missing header");
  const raw = token.slice(0, dot);
  // base64url -> base64 -> JSON
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  let json: string;
  try {
    json = Buffer.from(padded, "base64").toString("utf8");
  } catch {
    throw new Error("Malformed token: header is not base64url");
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new Error("Malformed token: header is not JSON");
  }
}

/**
 * Verify a Portal-issued JWT and return the trusted claims.
 *
 * Throws if signature, issuer, audience, or expiry checks fail. The thrown
 * Error.message is suitable for logging but not for surfacing to end users
 * verbatim; callers should map to a generic "invalid token" message.
 *
 * @param token   raw JWT string lifted from the URL fragment
 * @param config  optional override (tests inject a fake JWKS URL)
 */
export async function verifyPortalToken(
  token: string,
  config?: Partial<VerifierConfig>,
): Promise<VerifiedPortalToken> {
  const cfg: VerifierConfig = { ...readConfig(), ...config };
  const header = decodeHeader(token);
  if (header.alg && header.alg !== "RS256") {
    throw new Error(`Unsupported alg: ${header.alg}`);
  }

  let entry = await getJwks(cfg.jwksUrl);
  let jwk = findKey(entry, header.kid);

  // Cache may be stale relative to a just-rotated key. Force a refresh once
  // before giving up so a rotation that happened within the cache TTL still
  // verifies promptly.
  if (!jwk) {
    entry = await fetchJwks(cfg.jwksUrl);
    cache().set(cfg.jwksUrl, entry);
    jwk = findKey(entry, header.kid);
  }
  if (!jwk) {
    throw new Error(
      `No matching JWK for kid=${header.kid ?? "(none)"}`,
    );
  }

  const key = await importJWK(jwk, "RS256");
  const { payload } = await jwtVerify(token, key, {
    issuer: cfg.issuer,
    audience: cfg.audience,
    algorithms: ["RS256"],
  });

  const claims = payload as PortalTokenClaims;
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
    kid: jwk.kid,
  };
}

function isPortalRole(value: unknown): value is PortalRole {
  return value === "customer" || value === "staff" || value === "internal";
}
