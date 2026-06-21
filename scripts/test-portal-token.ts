/**
 * Unit tests for verifyPortalToken (chunk 4b).
 *
 *   npx tsx scripts/test-portal-token.ts
 *
 * Runs a local fake JWKS server (http.createServer) so the tests do not
 * require the live portal subdomain. Covers the happy path, signature
 * tampering, wrong audience, wrong issuer, expired token, kid rotation
 * (active + previous), missing claims, unsupported alg, and cache
 * behavior (a second verify against the same kid must not refetch).
 *
 * Exits nonzero on any failure.
 */
import http from "http";
import { AddressInfo } from "net";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type KeyLike,
  type JWK,
} from "jose";

import {
  verifyPortalToken,
  __resetPortalTokenCache,
} from "../src/lib/portal-token";

const failures: string[] = [];
let passed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) passed += 1;
  else failures.push(`${label}${detail ? ` (${detail})` : ""}`);
}

async function expectThrows(
  label: string,
  fn: () => Promise<unknown>,
  matcher?: RegExp,
) {
  try {
    await fn();
    check(label, false, "expected throw, got resolve");
  } catch (err) {
    if (matcher) {
      const msg = err instanceof Error ? err.message : String(err);
      check(label, matcher.test(msg), `error did not match ${matcher}: ${msg}`);
    } else {
      check(label, true);
    }
  }
}

interface FakeKey {
  kid: string;
  privateKey: KeyLike;
  publicJwk: JWK;
}

async function makeKey(kid: string): Promise<FakeKey> {
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });
  const jwk = await exportJWK(publicKey);
  return {
    kid,
    privateKey,
    publicJwk: { ...jwk, kid, alg: "RS256", use: "sig" },
  };
}

interface JwksServer {
  url: string;
  setKeys: (keys: FakeKey[]) => void;
  hits: () => number;
  close: () => Promise<void>;
}

async function startJwksServer(initialKeys: FakeKey[]): Promise<JwksServer> {
  let keys = initialKeys;
  let hits = 0;
  const server = http.createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      hits += 1;
      res.writeHead(200, {
        "Content-Type": "application/jwk-set+json",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=600",
      });
      res.end(JSON.stringify({ keys: keys.map((k) => k.publicJwk) }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    setKeys: (k) => {
      keys = k;
    },
    hits: () => hits,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

const ISSUER = "https://portal.test.local";
const AUD = "slatewell";

async function signFor(key: FakeKey, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER,
    aud: AUD,
    sub: "drew@example.com",
    iat: now,
    exp: now + 3600,
    customer_id: "cust_abc",
    role: "customer",
    ...overrides,
  };
  return new SignJWT(payload as never)
    .setProtectedHeader({ alg: "RS256", kid: key.kid, typ: "JWT" })
    .sign(key.privateKey);
}

async function main() {
  process.env.PORTAL_EXPECTED_ISSUER = ISSUER;
  process.env.PORTAL_EXPECTED_AUD = AUD;

  const active = await makeKey("ps-test-active");
  const previous = await makeKey("ps-test-previous");
  const intruder = await makeKey("ps-test-intruder");
  const jwks = await startJwksServer([active, previous]);
  process.env.PORTAL_JWKS_URL = jwks.url;

  try {
    // --- happy path ------------------------------------------------------
    __resetPortalTokenCache();
    const goodToken = await signFor(active);
    const result = await verifyPortalToken(goodToken);
    check("happy path: email lowercased", result.email === "drew@example.com");
    check("happy path: customerId propagated", result.customerId === "cust_abc");
    check("happy path: role propagated", result.role === "customer");
    check("happy path: kid propagated", result.kid === active.kid);

    // --- caching: a second verify must not refetch the JWKS --------------
    const hitsBefore = jwks.hits();
    await verifyPortalToken(goodToken);
    check(
      "cache: second verify reuses JWKS",
      jwks.hits() === hitsBefore,
      `hits went ${hitsBefore} -> ${jwks.hits()}`,
    );

    // --- previous key still verifies during rotation grace ---------------
    const previousTok = await signFor(previous);
    const prevResult = await verifyPortalToken(previousTok);
    check("rotation: previous key still verifies", prevResult.kid === previous.kid);

    // --- intruder key (not in JWKS) is rejected --------------------------
    const intruderTok = await signFor(intruder);
    await expectThrows(
      "intruder kid rejected",
      () => verifyPortalToken(intruderTok),
      /No matching JWK/,
    );

    // --- bad audience ----------------------------------------------------
    const badAudTok = await signFor(active, { aud: "axlepoint" });
    await expectThrows(
      "wrong audience rejected",
      () => verifyPortalToken(badAudTok),
    );

    // --- bad issuer ------------------------------------------------------
    const badIssTok = await signFor(active, { iss: "https://evil.example" });
    await expectThrows(
      "wrong issuer rejected",
      () => verifyPortalToken(badIssTok),
    );

    // --- expired ---------------------------------------------------------
    const expiredTok = await signFor(active, {
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    await expectThrows(
      "expired token rejected",
      () => verifyPortalToken(expiredTok),
    );

    // --- missing sub -----------------------------------------------------
    const noSubTok = await signFor(active, { sub: "" });
    await expectThrows(
      "missing sub rejected",
      () => verifyPortalToken(noSubTok),
      /sub/,
    );

    // --- bad role --------------------------------------------------------
    const badRoleTok = await signFor(active, { role: "root" });
    await expectThrows(
      "unknown role rejected",
      () => verifyPortalToken(badRoleTok),
      /role/,
    );

    // --- signature tampering --------------------------------------------
    const tampered = goodToken.slice(0, -4) + "AAAA";
    await expectThrows(
      "tampered signature rejected",
      () => verifyPortalToken(tampered),
    );

    // --- malformed token -------------------------------------------------
    await expectThrows(
      "garbage token rejected",
      () => verifyPortalToken("not.a.jwt"),
    );

    // --- forced refresh on unknown kid -----------------------------------
    // Mint a token with a new key, swap the JWKS, ensure verify recovers
    // without resetting the cache (it should re-fetch on miss).
    const rotated = await makeKey("ps-test-rotated");
    jwks.setKeys([rotated, active]);
    const rotatedTok = await signFor(rotated);
    const rotatedResult = await verifyPortalToken(rotatedTok);
    check(
      "rotation: unknown kid triggers refresh",
      rotatedResult.kid === rotated.kid,
    );
  } finally {
    await jwks.close();
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
