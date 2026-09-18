/**
 * Stripe config tests (D-013). No network, no Stripe API calls.
 *
 *   npx tsx scripts/test-stripe-config.ts
 *
 * Covers:
 *   - getStripePublishableKey: runtime read, STRIPE_PUBLISHABLE_KEY wins over
 *     the NEXT_PUBLIC_ fallback, whitespace trimmed, non-pk_test_ rejected
 *   - isDepositCardFlowEnabled: requires BOTH the secret and publishable key
 *   - getStripeClient: null key -> null, per-key memoization
 *
 * Exits nonzero on any failure. Uses fake placeholder keys only.
 */
import {
  getStripePublishableKey,
  isDepositCardFlowEnabled,
  isStripeConfigured,
} from "../src/lib/stripe";
import { getStripeClient } from "../src/lib/stripe-client";

const failures: string[] = [];
let passed = 0;

function check(label: string, ok: boolean) {
  if (ok) passed += 1;
  else failures.push(label);
}

const VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
] as const;
type Env = Partial<Record<(typeof VARS)[number], string>>;

function withEnv<T>(env: Env, fn: () => T): T {
  const saved: Env = {};
  for (const name of VARS) {
    saved[name] = process.env[name];
    if (env[name] === undefined) delete process.env[name];
    else process.env[name] = env[name];
  }
  try {
    return fn();
  } finally {
    for (const name of VARS) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
}

const SK = "sk_test_fake_secret";
const PK = "pk_test_fake_primary";
const PK_FALLBACK = "pk_test_fake_fallback";

async function main() {
  // --- publishable key resolution ---------------------------------------
  check(
    "no publishable key -> null",
    withEnv({}, () => getStripePublishableKey()) === null,
  );
  check(
    "STRIPE_PUBLISHABLE_KEY is read at runtime",
    withEnv({ STRIPE_PUBLISHABLE_KEY: PK }, () => getStripePublishableKey()) === PK,
  );
  check(
    "NEXT_PUBLIC_ fallback is used when STRIPE_PUBLISHABLE_KEY is unset",
    withEnv({ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK_FALLBACK }, () =>
      getStripePublishableKey(),
    ) === PK_FALLBACK,
  );
  check(
    "STRIPE_PUBLISHABLE_KEY wins over the NEXT_PUBLIC_ fallback",
    withEnv(
      { STRIPE_PUBLISHABLE_KEY: PK, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK_FALLBACK },
      () => getStripePublishableKey(),
    ) === PK,
  );
  check(
    "empty STRIPE_PUBLISHABLE_KEY falls through to the fallback",
    withEnv(
      { STRIPE_PUBLISHABLE_KEY: "", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK_FALLBACK },
      () => getStripePublishableKey(),
    ) === PK_FALLBACK,
  );
  check(
    "surrounding whitespace is trimmed",
    withEnv({ STRIPE_PUBLISHABLE_KEY: `  ${PK}\n` }, () =>
      getStripePublishableKey(),
    ) === PK,
  );
  check(
    "a live publishable key is rejected (test mode only)",
    withEnv({ STRIPE_PUBLISHABLE_KEY: "pk_live_fake" }, () =>
      getStripePublishableKey(),
    ) === null,
  );
  check(
    "a secret key in the publishable slot is rejected",
    withEnv({ STRIPE_PUBLISHABLE_KEY: SK }, () => getStripePublishableKey()) ===
      null,
  );

  // --- card-entry flow predicate -----------------------------------------
  const matrix: Array<[string, Env, boolean]> = [
    ["neither key -> disabled", {}, false],
    ["secret only -> disabled", { STRIPE_SECRET_KEY: SK }, false],
    ["publishable only -> disabled", { STRIPE_PUBLISHABLE_KEY: PK }, false],
    [
      "secret + publishable -> enabled",
      { STRIPE_SECRET_KEY: SK, STRIPE_PUBLISHABLE_KEY: PK },
      true,
    ],
    [
      "secret + NEXT_PUBLIC_ fallback -> enabled",
      { STRIPE_SECRET_KEY: SK, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: PK_FALLBACK },
      true,
    ],
    [
      "secret + live publishable -> disabled",
      { STRIPE_SECRET_KEY: SK, STRIPE_PUBLISHABLE_KEY: "pk_live_fake" },
      false,
    ],
  ];
  for (const [label, env, expected] of matrix) {
    check(label, withEnv(env, () => isDepositCardFlowEnabled()) === expected);
  }
  check(
    "settlement predicate still needs only the secret",
    withEnv({ STRIPE_SECRET_KEY: SK }, () => isStripeConfigured()) === true,
  );

  // --- browser loader memoization ------------------------------------------
  // loadStripe resolves null outside a browser, so nothing hits the network.
  check("null key -> resolves null", (await getStripeClient(null)) === null);
  check(
    "undefined key -> resolves null",
    (await getStripeClient(undefined)) === null,
  );
  check(
    "same key returns the same promise (Elements never re-initializes)",
    getStripeClient(PK) === getStripeClient(PK),
  );
  check(
    "different keys return different promises",
    getStripeClient(PK) !== getStripeClient(PK_FALLBACK),
  );

  console.log(`stripe-config: ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    for (const f of failures) console.error(`  FAIL: ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
