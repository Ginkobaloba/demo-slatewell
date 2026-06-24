/**
 * Smoke tests for src/lib/portal-session.ts (Harbor-pattern standardization).
 *
 *   npx tsx scripts/test-portal-session.ts
 *
 * Covers: mint/verify round-trip, email lowercasing, src claim, and
 * hard-throw on a missing or too-short SESSION_SECRET. Exits nonzero on
 * any failure.
 */

import {
  mintSlatewellSession,
  verifySlatewellSession,
  slatewellSessionCookieName,
  slatewellSessionCookieAttributes,
  SLATEWELL_SESSION_COOKIE,
} from "../src/lib/portal-session";

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

async function main() {
  // --- happy path: mint + verify round-trip ---------------------------------
  process.env.SESSION_SECRET = "a".repeat(48);
  process.env.NODE_ENV = "test";

  const { token, expiresAt } = await mintSlatewellSession({
    email: "Drew@Example.com", // intentionally mixed case
    customerId: "cust_xyz",
    role: "staff",
  });

  check("mint: token is a JWT string", typeof token === "string" && token.startsWith("ey"));

  const payload = await verifySlatewellSession(token);
  check("verify: payload not null", payload !== null);
  check(
    "verify: sub is lowercased email",
    payload?.sub === "drew@example.com",
    `got: ${payload?.sub}`,
  );
  check(
    "verify: src is portal",
    payload?.src === "portal",
    `got: ${payload?.src}`,
  );
  check(
    "verify: role propagated",
    payload?.role === "staff",
    `got: ${payload?.role}`,
  );
  check(
    "verify: customer_id propagated",
    payload?.customer_id === "cust_xyz",
    `got: ${payload?.customer_id}`,
  );
  check(
    "verify: expiresAt is a Date in the future",
    expiresAt instanceof Date && expiresAt.getTime() > Date.now(),
  );

  // --- wrong secret: token rejected ----------------------------------------
  const savedSecret = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "b".repeat(48);
  const result = await verifySlatewellSession(token);
  check("wrong secret: verify returns null", result === null);
  process.env.SESSION_SECRET = savedSecret;

  // --- junk input: verify returns null, not throws -------------------------
  const junk = await verifySlatewellSession("not.a.jwt");
  check("junk token: verify returns null", junk === null);
  const empty = await verifySlatewellSession("");
  check("empty token: verify returns null", empty === null);

  // --- cookie helpers -------------------------------------------------------
  check(
    "cookieName: returns constant",
    slatewellSessionCookieName() === SLATEWELL_SESSION_COOKIE,
  );
  check(
    "SLATEWELL_SESSION_COOKIE: value is slatewell_admin_session",
    SLATEWELL_SESSION_COOKIE === "slatewell_admin_session",
  );
  const attrs = slatewellSessionCookieAttributes(expiresAt);
  check("cookieAttrs: name", attrs.name === "slatewell_admin_session");
  check("cookieAttrs: httpOnly", attrs.httpOnly === true);
  check("cookieAttrs: sameSite=lax", attrs.sameSite === "lax");
  check("cookieAttrs: path=/", attrs.path === "/");
  check("cookieAttrs: expires matches expiresAt", attrs.expires === expiresAt);

  // --- throw on missing secret ----------------------------------------------
  delete process.env.SESSION_SECRET;
  await expectThrows(
    "missing secret: mint throws",
    () =>
      mintSlatewellSession({
        email: "drew@example.com",
        customerId: null,
        role: "staff",
      }),
    /SESSION_SECRET/,
  );

  // --- throw on too-short secret -------------------------------------------
  process.env.SESSION_SECRET = "tooshort";
  await expectThrows(
    "short secret: mint throws",
    () =>
      mintSlatewellSession({
        email: "drew@example.com",
        customerId: null,
        role: "staff",
      }),
    /SESSION_SECRET/,
  );

  console.log(`\n${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
