/**
 * Unit tests for src/lib/admin-session.ts (D-014): signed, visitor-bound
 * admin sessions. No network, no database.
 *
 *   npx tsx scripts/test-admin-session.ts
 *
 * Covers mint/verify round trip, tamper and wrong-secret rejection, expiry,
 * the visitor binding, the forged "right name, no signature" cookie, and the
 * fail-closed secret rules (missing, short, published placeholder, and the
 * mangled-env-line rules: whitespace, path fragments, "generated " prefix,
 * logged by rule name without the value).
 * Exits nonzero on any failure.
 */
import { SignJWT } from "jose";
import {
  ADMIN_SESSION_COOKIE,
  VISITOR_COOKIE,
  checkAdminCookies,
  isAdminConfigured,
  isValidVisitorId,
  mintAdminSession,
  randomId128,
  sessionSecretProblem,
  verifyAdminSession,
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

  // --- visitor binding (checkAdminCookies) -------------------------------
  const ok = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token, [VISITOR_COOKIE]: VISITOR_A }));
  check("binding: matching visitor cookie -> ok", ok.status === "ok" && ok.visitorId === VISITOR_A, ok);
  const wrongVisitor = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token, [VISITOR_COOKIE]: VISITOR_B }));
  check("binding: another browser's visitor cookie -> unauthenticated", wrongVisitor.status === "unauthenticated");
  const noVisitor = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: token }));
  check("binding: no visitor cookie -> unauthenticated", noVisitor.status === "unauthenticated");
  const forged = await checkAdminCookies(jar({ [ADMIN_SESSION_COOKIE]: "demo-admin", [VISITOR_COOKIE]: VISITOR_A }));
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
