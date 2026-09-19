/**
 * Integration tests for /api/auth/portal-handoff (chunk 4b).
 *
 *   npx tsx scripts/test-portal-handoff.ts
 *
 * Boots a local fake JWKS server (so the test is hermetic and the live
 * portal subdomain is irrelevant), then invokes the route handler with
 * synthetic NextRequest objects. Verifies cookie + redirect for staff,
 * customer downshift to the public landing, and rejection of invalid
 * tokens. D-014: the minted session is the same signed, visitor-bound
 * session the demo button issues (no wider scope), and the route 404s when
 * the admin area is not configured. Exits nonzero on any failure.
 *
 * We import the handler module directly so we cover the actual code path
 * an HTTP request would hit, not a parallel transport.
 */
import http from "http";
import { AddressInfo } from "net";
import { NextRequest } from "next/server";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  type KeyLike,
  type JWK,
} from "jose";

import { POST } from "../src/app/api/auth/portal-handoff/route";
import {
  ADMIN_SESSION_COOKIE as ADMIN_COOKIE,
  VISITOR_COOKIE,
  checkAdminCookies,
} from "../src/lib/admin-session";
import { __resetPortalTokenCache } from "../src/lib/portal-token";

const failures: string[] = [];
let passed = 0;

function check(label: string, ok: boolean, detail?: string) {
  if (ok) passed += 1;
  else failures.push(`${label}${detail ? ` (${detail})` : ""}`);
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

async function startJwks(keys: FakeKey[]) {
  const server = http.createServer((req, res) => {
    if (req.url === "/.well-known/jwks.json") {
      res.writeHead(200, { "Content-Type": "application/jwk-set+json" });
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
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

const ISSUER = "https://portal.test.local";
const AUD = "slatewell";

async function sign(
  key: FakeKey,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER,
    aud: AUD,
    sub: "Drew@Example.com", // intentionally mixed case to assert lowercasing
    iat: now,
    exp: now + 3600,
    customer_id: "cust_abc",
    role: "staff",
    ...overrides,
  };
  return new SignJWT(payload as never)
    .setProtectedHeader({ alg: "RS256", kid: key.kid, typ: "JWT" })
    .sign(key.privateKey);
}

function postJson(body: unknown, cookie?: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/portal-handoff", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** name=value pairs from every Set-Cookie header on a response. */
function setCookies(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}

async function main() {
  process.env.PORTAL_EXPECTED_ISSUER = ISSUER;
  process.env.PORTAL_EXPECTED_AUD = AUD;
  // The route mints a signed HS256 admin session (D-014), so SESSION_SECRET
  // must be present. A 48-char throwaway value.
  process.env.SESSION_SECRET = "a".repeat(48);

  const active = await makeKey("ps-test-handoff");
  const jwks = await startJwks([active]);
  process.env.PORTAL_JWKS_URL = jwks.url;
  __resetPortalTokenCache();

  try {
    // --- staff happy path: cookie set + redirect to /admin ---------------
    {
      const token = await sign(active, { role: "staff" });
      const res = await POST(postJson({ token }));
      const data = (await res.json()) as {
        ok?: boolean;
        redirect?: string;
        email?: string;
        role?: string;
      };
      check("staff: 200", res.status === 200);
      check("staff: ok=true", data.ok === true);
      check("staff: redirect=/admin", data.redirect === "/admin");
      check("staff: email lowercased", data.email === "drew@example.com");
      check("staff: role=staff", data.role === "staff");

      const setCookie = res.headers.get("set-cookie") ?? "";
      // Cookie value is now a signed HS256 JWT (Harbor pattern), not plain text.
      // A JWT always starts with "ey" (base64url-encoded header).
      const cookieValueMatch = setCookie.match(
        new RegExp(`${ADMIN_COOKIE}=([^;]+)`),
      );
      const cookieValue = cookieValueMatch?.[1] ?? "";
      check(
        "staff: session cookie set (JWT)",
        cookieValue.startsWith("ey") && cookieValue.split(".").length === 3,
        `set-cookie was: ${setCookie}`,
      );
      check(
        "staff: cookie HttpOnly",
        /httponly/i.test(setCookie),
        `set-cookie was: ${setCookie}`,
      );

      // D-014: the session is bound to the visitor cookie minted alongside
      // it, and verifies through the same gate the middleware uses.
      const jar = setCookies(res);
      const visitor = jar[VISITOR_COOKIE] ?? "";
      check("staff: visitor cookie minted", /^[0-9a-f]{32}$/.test(visitor), jar);
      const gate = await checkAdminCookies({
        get: (name) => (jar[name] ? { value: jar[name] } : undefined),
      });
      check("staff: session passes the admin gate", gate.status === "ok");
      check(
        "staff: session scope is this browser only",
        gate.status === "ok" && gate.visitorId === visitor,
      );
    }

    // --- an existing visitor cookie is reused, not replaced -------------
    {
      const existing = "c".repeat(32);
      const token = await sign(active, { role: "staff" });
      const res = await POST(postJson({ token }, `${VISITOR_COOKIE}=${existing}`));
      const jar = setCookies(res);
      check("reuse: no new visitor cookie", !(VISITOR_COOKIE in jar), jar);
      const gate = await checkAdminCookies({
        get: (name) =>
          name === VISITOR_COOKIE
            ? { value: existing }
            : jar[name]
              ? { value: jar[name] }
              : undefined,
      });
      check("reuse: session bound to the existing visitor id", gate.status === "ok" && gate.visitorId === existing);
    }

    // --- admin area not configured: verified staff still get 404 --------
    {
      const saved = process.env.SESSION_SECRET;
      delete process.env.SESSION_SECRET;
      const token = await sign(active, { role: "staff" });
      const res = await POST(postJson({ token }));
      check("unconfigured: 404", res.status === 404);
      check("unconfigured: no cookie", !res.headers.get("set-cookie"));
      process.env.SESSION_SECRET = saved;
    }

    // --- internal role also gets /admin ---------------------------------
    {
      const token = await sign(active, { role: "internal" });
      const res = await POST(postJson({ token }));
      const data = (await res.json()) as {
        ok?: boolean;
        redirect?: string;
      };
      check("internal: redirect=/admin", data.redirect === "/admin");
      check("internal: cookie set", !!res.headers.get("set-cookie"));
    }

    // --- customer role downshifts to the public landing -----------------
    {
      const token = await sign(active, { role: "customer" });
      const res = await POST(postJson({ token }));
      const data = (await res.json()) as {
        ok?: boolean;
        redirect?: string;
      };
      check("customer: 200", res.status === 200);
      check("customer: redirect to landing", data.redirect === "/?from=portal");
      check(
        "customer: no admin cookie",
        !res.headers.get("set-cookie"),
        `set-cookie was: ${res.headers.get("set-cookie")}`,
      );
    }

    // --- expired token rejected -----------------------------------------
    {
      const token = await sign(active, {
        iat: Math.floor(Date.now() / 1000) - 7200,
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      const res = await POST(postJson({ token }));
      const data = (await res.json()) as { reason?: string };
      check("expired: 401", res.status === 401);
      check("expired: reason=invalid_token", data.reason === "invalid_token");
      check(
        "expired: no cookie",
        !res.headers.get("set-cookie"),
        `set-cookie was: ${res.headers.get("set-cookie")}`,
      );
    }

    // --- wrong audience -------------------------------------------------
    {
      const token = await sign(active, { aud: "axlepoint" });
      const res = await POST(postJson({ token }));
      check("wrong aud: 401", res.status === 401);
    }

    // --- missing token --------------------------------------------------
    {
      const res = await POST(postJson({}));
      const data = (await res.json()) as { reason?: string };
      check("missing token: 400", res.status === 400);
      check("missing token: reason=missing_token", data.reason === "missing_token");
    }

    // --- invalid JSON body ----------------------------------------------
    {
      const req = new NextRequest(
        "http://localhost/api/auth/portal-handoff",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{ not json",
        },
      );
      const res = await POST(req);
      const data = (await res.json()) as { reason?: string };
      check("bad json: 400", res.status === 400);
      check("bad json: reason=invalid_body", data.reason === "invalid_body");
    }
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
