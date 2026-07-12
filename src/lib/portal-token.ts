/**
 * Portal JWT verification -- dispatch layer (CA5 cutover).
 *
 * The default engine is the shared @paradigm-codes/auth client library (K4),
 * the same verifier every Paradigm consumer standardizes on. The pre-CA5
 * bespoke engine is preserved verbatim in ./portal-token-bespoke.ts as a
 * rollback path for one release:
 *
 *   PORTAL_VERIFIER=bespoke    # flips back without a code change or deploy
 *
 * The public API (verifyPortalToken, __resetPortalTokenCache, and the
 * claim/result types) is unchanged from the bespoke module; callers and the
 * smoke scripts are agnostic to which engine ran. Remove the flag and the
 * bespoke module together once the shared engine has survived a release in
 * production.
 */

import {
  verifyPortalToken as verifyWithBespoke,
  __resetPortalTokenCache as resetBespokeCache,
  type VerifiedPortalToken,
  type VerifierConfig,
} from "./portal-token-bespoke";
import {
  verifySharedPortalToken,
  __resetSharedPortalTokenCache,
} from "./portal-token-shared";

export type {
  PortalRole,
  PortalTokenClaims,
  VerifiedPortalToken,
} from "./portal-token-bespoke";

/**
 * Verify a Portal-issued JWT and return the trusted claims. Throws if
 * signature, issuer, audience, expiry, or Slatewell's strict claim checks
 * fail; callers should map to a generic "invalid token" message.
 *
 * Engine selection is per-call so the rollback flag needs no process restart.
 */
export async function verifyPortalToken(
  token: string,
  config?: Partial<VerifierConfig>,
): Promise<VerifiedPortalToken> {
  if (process.env.PORTAL_VERIFIER === "bespoke") {
    return verifyWithBespoke(token, config);
  }
  return verifySharedPortalToken(token, config);
}

/** Test hook: resets both engines' JWKS caches between cases. */
export function __resetPortalTokenCache(): void {
  resetBespokeCache();
  __resetSharedPortalTokenCache();
}
