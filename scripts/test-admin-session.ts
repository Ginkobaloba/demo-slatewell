/**
 * Unit tests for src/lib/admin-session.ts (D-014): signed, visitor-bound
 * admin sessions. No network, no database.
 *
 *   npx tsx scripts/test-admin-session.ts
 *
 * Covers mint/verify round trip, tamper and wrong-secret rejection, expiry,
 * the visitor binding, the forged "right name, no signature" cookie, a
 * validly signed token missing exp/iat/jti (W2, #35 deep verify), and the
 * fail-closed secret rules (missing, short, published placeholder, and the
 * mangled-env-line rules: whitespace, path fragments, "generated " prefix,
 * logged by rule name without the value).
 * D-016: the signed visitor cookie (round trip, tamper, unsigned legacy
 * value, foreign secret, non-canonical encoding, key separation from the
 * admin session key, fail closed without a secret), and that the admin gate
 * only accepts a session bound to a SIGNED visitor cookie.
 * Exits nonzero on any failure.
 */
import { SignJWT } from "jose";
import {
  ADMIN_SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  VISITOR_COOKIE,
  checkAdminCookies,
  isAdminConfigured,
  isValidVisitorId,
  mintAdminSession,
  randomId128,
  sessionSecretProblem,
  signVisitorId,
  verifyAdminSession,
  verifyVisitorCookie,
  VISITOR_KEY_LABEL,
  type CookieReader,
  type SecretProblem,
} from "../src/lib/admin-session";

const failures: string[] = [];
let passed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed += 1;
  else failures.push(`${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`);
}

function jar(values: Record<string, string>): CookieReader {
  return {
    get: (name) => (name in values ? { value: values[name] } : undefined),
  };
}

const SECRET = "s".repeat(48);
const VISITOR_A = randomId128();
const VISITOR_B = randomId128();

async function main() {
  process.env.SESSION_SECRET = SECRET;

  // --- ids ------------------------------------------------------------
  check("randomId128 is 32 hex chars", /^[0-9a-f]{32}$/.test(VISITOR_A), VISITOR_A);
  check("randomId128 values differ", VISITOR_A !== VISITOR_B);
  check("visitor id validator rejects junk", !isValidVisitorId("demo-admin"));
  check("visitor id validator rejects uppercase", !isValidVisitorId("A".repeat(32)));

  // --- round trip -----------------------------------------------------
  const { token, expiresAt } = await mintAdminSession({ visitorId: VISITOR_A, src: "demo" });
  check("token is a compact JWT", token.split(".").length === 3);
  check("expiry is about 8h out", Math.abs(expiresAt.getTime() - Date.now() - 8 * 3600_000) < 60_000);
  const payload = await verifyAdminSession(token);
  check("verify: accepts own token", payload !== null);
  check("verify: vid round-trips", payload?.vid === VISITOR_A, payload?.vid);
  check("verify: jti is a 128-bit hex id", /^[0-9a-f]{32}$/.test(String(payload?.jti)));
  check("verify: src=demo", payload?.src === "demo");

  const second = await mintAdminSession({ visitorId: VISITOR_A, src: "demo" });
  const secondPayload = await verifyAdminSession(second.token);
  check("each session gets a fresh random session id", secondPayload?.jti !== payload?.jti);

  // --- forged and tampered ------------------------------------------------
  check("forged plain value rejected", (await verifyAdminSession("demo-admin")) === null);
  check("empty rejected", (await verifyAdminSession("")) === null);
  const [h, p, sig] = token.split(".");
  const flipped = sig.slice(0, -2) + (sig.slice(-2) === "AA" ? "AB" : "AA");
  check("tampered signature rejected", (await verifyAdminSession(`${h}.${p}.${flipped}`)) === null);
  const otherPayload = Buffer.from(
    JSON.stringify({ ...payload, vid: VISITOR_B }),
  ).toString("base64url");
  check("tampered payload rejected", (await verifyAdminSession(`${h}.${otherPayload}.${sig}`)) === null);
  const unsigned = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")}.${p}.`;
  check("alg=none rejected", (await verifyAdminSession(unsigned)) === null);

  process.env.SESSION_SECRET = "t".repeat(48);
  check("token from another secret rejected", (await verifyAdminSession(token)) === null);
  process.env.SESSION_SECRET = SECRET;

  // Signed with the right secret but missing the session id / visitor claims.
  const now = Math.floor(Date.now() / 1000);
  const bare = await new SignJWT({ role: "staff", src: "demo" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("demo-admin")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(SECRET));
  check("signed token without jti/vid rejected", (await verifyAdminSession(bare)) === null);

  const expired = await new SignJWT({ vid: VISITOR_A, src: "demo", role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomId128())
    .setSubject("demo-admin")
    .setIssuedAt(now - 7200)
    .setExpirationTime(now - 60)
    .sign(new TextEncoder().encode(SECRET));
  check("expired token rejected", (await verifyAdminSession(expired)) === null);

  // --- W2 (#35 deep verify): exp/iat/jti are each required -----------------
  // The app never mints a session without all three, but a holder of
  // SESSION_SECRET could sign one by hand. requiredClaims must refuse it.
  const claimJti = randomId128();
  const missingExp = await new SignJWT({ vid: VISITOR_A, src: "demo", role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(claimJti)
    .setSubject("demo-admin")
    .setIssuedAt(now)
    .sign(new TextEncoder().encode(SECRET));
  check("signed token without exp rejected", (await verifyAdminSession(missingExp)) === null);

  const missingIat = await new SignJWT({ vid: VISITOR_A, src: "demo", role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(claimJti)
    .setSubject("demo-admin")
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(SECRET));
  check("signed token without iat rejected", (await verifyAdminSession(missingIat)) === null);

  const missingJti = await new SignJWT({ vid: VISITOR_A, src: "demo", role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("demo-admin")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(SECRET));
  check("signed token without jti rejected", (await verifyAdminSession(missingJti)) === null);

  // Positive control: all three present, still accepted.
  const allThree = await new SignJWT({ vid: VISITOR_A, src: "demo", role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(claimJti)
    .setSubject("demo-admin")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(SECRET));
  check("signed token with exp/iat/jti present accepted", (await verifyAdminSession(allThree)) !== null);

  // --- W1 (#38 deep verify): requiredClaims checks presence, not value ---
  // jose only validates iat's value when maxTokenAge is set (which the app
  // now does), and never relates exp to iat at all. A holder of
  // SESSION_SECRET could otherwise hand-sign an "accepted" token with any
  // of the hostile shapes below.
  // SignJWT's own setExpirationTime/setIssuedAt reject non-finite numbers,
  // so a hostile (fractional, negative, far-future) exp/iat has to be
  // assembled by hand, HS256-signed with the real secret: exactly what a
  // holder of SESSION_SECRET could do.
  async function signHostile(exp: unknown, iat: unknown): Promise<string> {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ vid: VISITOR_A, src: "demo", role: "staff", sub: "demo-admin", jti: claimJti, exp, iat }),
    ).toString("base64url");
    const data = `${header}.${payload}`;
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = Buffer.from(
      await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)),
    ).toString("base64url");
    return `${data}.${sig}`;
  }
  const YEAR = 365 * 24 * 3600;

  const expFarOut = await signHostile(now + 100 * YEAR, now);
  check("W1: exp 100 years out (fresh iat) rejected", (await verifyAdminSession(expFarOut)) === null);

  const iatInFuture = await signHostile(now + 3660, now + 3600);
  check("W1: iat in the future rejected", (await verifyAdminSession(iatInFuture)) === null);

  const iatAfterExpFuture = await signHostile(now + 60, now + 120);
  check("W1: iat after exp, both in the future, rejected", (await verifyAdminSession(iatAfterExpFuture)) === null);

  const iatAfterExpExpired = await signHostile(now - 30, now);
  check("W1: iat after exp, already expired, rejected", (await verifyAdminSession(iatAfterExpExpired)) === null);

  const iatEpoch = await signHostile(now + 60, 0);
  check("W1: iat at the epoch (far in the past) rejected", (await verifyAdminSession(iatEpoch)) === null);

  const iatNegative = await signHostile(now + 60, -1000);
  check("W1: negative iat rejected", (await verifyAdminSession(iatNegative)) === null);

  const fractionalExp = await signHostile(now + 60.5, now);
  check("W1: fractional exp rejected", (await verifyAdminSession(fractionalExp)) === null);

  const fractionalIat = await signHostile(now + 60, now - 0.5);
  check("W1: fractional iat rejected", (await verifyAdminSession(fractionalIat)) === null);

  const zeroLifetime = await signHostile(now, now);
  check("W1: exp equal to iat (zero lifetime) rejected", (await verifyAdminSession(zeroLifetime)) === null);

  const overTtl = await signHostile(now + SESSION_TTL_SECONDS + 1, now);
  check("W1: exp - iat one second over the TTL rejected", (await verifyAdminSession(overTtl)) === null);

  const atTtlBoundary = await signHostile(now + SESSION_TTL_SECONDS, now);
  check("W1 control: exp - iat exactly the TTL accepted", (await verifyAdminSession(atTtlBoundary)) !== null);

  const normalShapeAfterFix = await new SignJWT({ vid: VISITOR_A, src: "demo", role: "staff" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomId128())
    .setSubject("demo-admin")
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .sign(new TextEncoder().encode(SECRET));
  check("W1 control: an ordinary short-lived token is unaffected", (await verifyAdminSession(normalShapeAfterFix)) !== null);

  // --- signed visitor cookie (D-016) --------------------------------------
  const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const signedA = (await signVisitorId(VISITOR_A)) as string;
  const signedB = (await signVisitorId(VISITOR_B)) as string;
  check("visitor: signed value is <id>.<43-char tag>", /^[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/.test(signedA), signedA);
  check("visitor: signed value starts with the id", signedA.startsWith(`${VISITOR_A}.`));
  check("visitor: signing is deterministic per id", (await signVisitorId(VISITOR_A)) === signedA);
  check("visitor: signed cookie verifies to its id", (await verifyVisitorCookie(signedA)) === VISITOR_A);
  check("visitor: unsigned bare hex (pre-D-016 format) rejected", (await verifyVisitorCookie(VISITOR_A)) === null);
  check(
    "visitor: empty / missing rejected",
    (await verifyVisitorCookie("")) === null && (await verifyVisitorCookie(undefined)) === null,
  );
  const tagA = signedA.split(".")[1];
  const tagB = signedB.split(".")[1];
  check("visitor: B's tag on A's id rejected", (await verifyVisitorCookie(`${VISITOR_A}.${tagB}`)) === null);
  const otherId = VISITOR_A.slice(0, 31) + (VISITOR_A[31] === "0" ? "1" : "0");
  check("visitor: one id char changed under a valid tag rejected", (await verifyVisitorCookie(`${otherId}.${tagA}`)) === null);
  const flipTag = tagA.slice(0, 10) + (tagA[10] === "A" ? "B" : "A") + tagA.slice(11);
  check("visitor: one tag char changed rejected", (await verifyVisitorCookie(`${VISITOR_A}.${flipTag}`)) === null);
  // The last base64url char holds 2 unused bits; a non-canonical spelling
  // that decodes to the same bytes must still be refused.
  const nonCanonical = tagA.slice(0, 42) + B64URL[B64URL.indexOf(tagA[42]) ^ 1];
  check("visitor: non-canonical tag encoding rejected", (await verifyVisitorCookie(`${VISITOR_A}.${nonCanonical}`)) === null);
  check("visitor: truncated tag rejected", (await verifyVisitorCookie(signedA.slice(0, -1))) === null);
  check("visitor: extra segment rejected", (await verifyVisitorCookie(`${signedA}.x`)) === null);
  check("visitor: uppercase value rejected", (await verifyVisitorCookie(signedA.toUpperCase())) === null);
  check("visitor: whitespace-padded value rejected", (await verifyVisitorCookie(` ${signedA}`)) === null);
  check("visitor: admin JWT is not a visitor cookie", (await verifyVisitorCookie(token)) === null);

  // Key separation: the tag is NOT HMAC(raw secret, id), i.e. not what the
  // admin-session key would produce over the same bytes.
  {
    const subtle = globalThis.crypto.subtle;
    const enc = new TextEncoder();
    const rawKey = await subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const rawTag = Buffer.from(await subtle.sign("HMAC", rawKey, enc.encode(VISITOR_A))).toString("base64url");
    check("visitor: key is domain-separated from the admin session key", rawTag !== tagA);
    check("visitor: tag under the raw admin key does not verify", (await verifyVisitorCookie(`${VISITOR_A}.${rawTag}`)) === null);
    // Positive control: recompute the tag from the documented derivation.
    const derived = await subtle.sign("HMAC", rawKey, enc.encode(VISITOR_KEY_LABEL));
    const visitorKey = await subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = Buffer.from(await subtle.sign("HMAC", visitorKey, enc.encode(VISITOR_A))).toString("base64url");
    check("visitor: tag = HMAC(HMAC(secret, label), id)", expected === tagA, { expected, tagA });
  }

  // Foreign secret: a cookie signed under another SESSION_SECRET is refused.
  process.env.SESSION_SECRET = "f".repeat(48);
  const foreignA = (await signVisitorId(VISITOR_A)) as string;
  check("visitor: another secret yields another tag", foreignA !== signedA);
  process.env.SESSION_SECRET = SECRET;
  check("visitor: cookie signed under another secret rejected", (await verifyVisitorCookie(foreignA)) === null);
  check("visitor: own cookie still verifies after switching back", (await verifyVisitorCookie(signedA)) === VISITOR_A);

  // --- visitor binding (checkAdminCookies) -------------------------------
  const ok = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token, [VISITOR_COOKIE]: signedA }));
  check("binding: matching signed visitor cookie -> ok", ok.status === "ok" && ok.visitorId === VISITOR_A, ok);
  const unsignedBinding = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token, [VISITOR_COOKIE]: VISITOR_A }));
  check("binding: matching but UNSIGNED visitor cookie -> unauthenticated", unsignedBinding.status === "unauthenticated");
  const foreignBinding = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token, [VISITOR_COOKIE]: foreignA }));
  check("binding: visitor cookie signed under another secret -> unauthenticated", foreignBinding.status === "unauthenticated");
  const wrongVisitor = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token, [VISITOR_COOKIE]: signedB }));
  check("binding: another browser's visitor cookie -> unauthenticated", wrongVisitor.status === "unauthenticated");
  const noVisitor = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token }));
  check("binding: no visitor cookie -> unauthenticated", noVisitor.status === "unauthenticated");
  const forged = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: "demo-admin", [VISITOR_COOKIE]: signedA }));
  check("forged cookie with the right name -> unauthenticated", forged.status === "unauthenticated");
  const none = await checkAdminCookies(jar({}));
  check("no cookies -> unauthenticated", none.status === "unauthenticated");

  // --- fail closed on the secret -------------------------------------------
  delete process.env.SESSION_SECRET;
  check("missing secret -> not configured", !isAdminConfigured());
  check(
    "missing secret -> checkAdminCookies unconfigured",
    (await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token, [VISITOR_COOKIE]: VISITOR_A }))).status === "unconfigured",
  );
  let threw = false;
  try {
    await mintAdminSession({ visitorId: VISITOR_A, src: "demo" });
  } catch {
    threw = true;
  }
  check("missing secret -> mint throws", threw);
  check("missing secret -> no visitor cookie can be signed", (await signVisitorId(VISITOR_A)) === null);
  check("missing secret -> a previously valid visitor cookie no longer verifies", (await verifyVisitorCookie(signedA)) === null);
  process.env.SESSION_SECRET = "tooshort";
  check("short secret -> not configured", !isAdminConfigured());
  process.env.SESSION_SECRET = "replace-with-a-real-32-plus-char-random-secret";
  check("published .env.example placeholder -> not configured", !isAdminConfigured());
  process.env.SESSION_SECRET = SECRET;
  check("real secret -> configured", isAdminConfigured());

  // --- mangled env lines (shape rules) -------------------------------------
  const good = "0123456789abcdef".repeat(4); // 64 hex chars
  const shapeCases: Array<[string, string, SecretProblem | null]> = [
    ["bare 64-hex value", good, null],
    ["surrounding CR/LF is trimmed, not a failure", `${good}\r\n`, null],
    ["internal space", `${good.slice(0, 32)} ${good.slice(32)}`, "contains_whitespace"],
    ["internal tab", `${good.slice(0, 32)}\t${good.slice(32)}`, "contains_whitespace"],
    ["internal newline", `${good.slice(0, 32)}\n${good.slice(32)}`, "contains_whitespace"],
    ["drive path fragment", `C:\\${good}`, "contains_path"],
    ["lowercase drive path fragment", `${good}d:\\x`, "contains_path"],
    ["_secrets fragment", `${good}_secrets`, "contains_path"],
    [".local.txt fragment", `${good}.local.txt`, "contains_path"],
    ["starts with 'generated '", `generated ${good}`, "generated_prefix"],
    [
      "the observed mangled line shape (note + path + value)",
      `generated C:\\Users\\someone\\_secrets\\session.local.txt ${good}`,
      "generated_prefix",
    ],
    ["missing", "", "missing"],
    ["too short", "abc123", "too_short"],
    ["placeholder", "replace-with-a-real-32-plus-char-random-secret", "placeholder"],
  ];
  for (const [label, value, expected] of shapeCases) {
    check(`secret rule: ${label}`, sessionSecretProblem(value) === expected, sessionSecretProblem(value));
  }

  // A mangled secret disables the admin area end to end and logs the rule
  // name, never the value.
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args.map(String).join(" "));
  try {
    const mangled = `generated C:\\Users\\someone\\_secrets\\session.local.txt ${good}`;
    process.env.SESSION_SECRET = mangled;
    check("mangled secret -> not configured", !isAdminConfigured());
    check(
      "mangled secret -> checkAdminCookies unconfigured (404 path)",
      (await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token, [VISITOR_COOKIE]: VISITOR_A }))).status === "unconfigured",
    );
    for (const [value, rule] of [
      [`${good} ${good}`, "whitespace"],
      [`${good}_secrets`, "file path"],
    ] as const) {
      process.env.SESSION_SECRET = value;
      check(`${rule} secret -> not configured`, !isAdminConfigured());
    }
    const all = warnings.join("\n");
    check("warning names the generated-prefix rule", all.includes('starts with "generated "'), warnings);
    check("warning names the whitespace rule", all.includes("contains whitespace"), warnings);
    check("warning names the path rule", all.includes("file path fragment"), warnings);
    check("warnings never contain the secret value", !all.includes(good), warnings);
    const before = warnings.length;
    process.env.SESSION_SECRET = mangled;
    isAdminConfigured();
    check("each rule warns once, not per request", warnings.length === before, warnings.length);
  } finally {
    console.warn = originalWarn;
    process.env.SESSION_SECRET = SECRET;
  }

  console.log(`admin-session: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error(`  FAIL: ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
