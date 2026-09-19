# Deep Verify: PR #27 Stripe publishable key at runtime (2026-09-18)

Overall: PASS

The PR's own checks and the edge sweep passed 115 of 115, and the repo's own
assertions passed 34 of 34 (3 N/A because HSTS is edge-only, 2 SKIP for axe).
Nothing in this run called the Stripe API. The coverage gaps at the end list
what this PASS does not show. CI note: Quick Verify is red on this head because
of an unrelated edge change, so the CI Deep Verify job has not run yet (see
"CI state").

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-slatewell` PR #27, branch
  `fix/stripe-pk-runtime`, code under test at `2d8e268`. This report is
  committed as a child of that commit and changes only `verify/reports/`.
- **Why deep:** the PR changes the customer deposit PAYMENT path (booking page,
  wizard, deposit step, the `deposit-intent` and `bookings` routes).
  `PARADIGM_VELOCITY_RULES.md` classes payment as Tier-3. Note that this repo's
  `verify/tier_map.yml` still lists `booking-flow` as tier 2 (see Warnings).
- **Mode:** deep (`paradigm-verify`), layers 1 to 6 plus a curated edge sweep.
  The adversarial generator was not run.
- **Run by:** a Claude Code agent (Opus 5), not a human, on DREWSPC.
- **Environment:** one image, `demo-slatewell:dv27`, built locally from the PR
  head with `docker build --secret id=npmrc,...`. Five throwaway containers ran
  from it, all on the real runtime env file
  (`C:\Users\Drama\.secrets\demo_env_slatewell.local.txt`) with per-container
  overrides:

  | Container | Port | STRIPE_SECRET_KEY | Publishable key | Card flow expected |
  |---|---|---|---|---|
  | both | 127.0.0.1:18301 | fake `sk_test_` | real `pk_test_` from the env file | ON |
  | secret | 127.0.0.1:18302 | fake `sk_test_` | empty (both vars) | off |
  | pkonly | 127.0.0.1:18303 | empty | real `pk_test_` from the env file | off |
  | live | 127.0.0.1:18304 | fake `sk_test_` | fake `pk_live_` (both vars) | off (rejected) |
  | none | 127.0.0.1:18305 | empty | empty | off |

- **No Stripe API calls, enforced three ways:**
  - Every container ran with `--add-host api.stripe.com:127.0.0.1`. A probe
    inside each container resolved `api.stripe.com -> 127.0.0.1`.
  - The real secret key was replaced by a fake one in every container. A probe
    confirmed the override by prefix only.
  - In headless Chromium, `deposit-intent` was stubbed and `api`, `r`, `m`, `q`,
    `merchant-ui-api` and `errors` under `*.stripe.com` were aborted.
    api.stripe.com saw 0 attempts. The aborted requests were 6 to r.stripe.com
    (telemetry) and 1 to merchant-ui-api.stripe.com.
  - No payment was ever submitted.
  - Server paths that try Stripe (a flow-enabled `deposit-intent`, `bookings`
    verify, settlement) fail at DNS, which is how this run proves they are
    *attempted* without any traffic leaving the host.
- No key value was printed at any point. Only counts and prefixes were
  recorded.
- The live `demo-slatewell` container, the public URL and `C:\dev\_deploy`
  were not touched.

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| smoke | PASS | smoke.yml 7/7 plus 2 N/A (HSTS) against container `both` |
| navigation | PASS | Headless and headed wizard walks, Service to Payment |
| data_crud | PASS | Bookings created via API and UI; settlement state transitions (Released, Captured) read back |
| error_handling | PASS | 400/402/404/405/409/503 paths in the edge sweep; 502 (not 500) when Stripe is unreachable |
| security (key exposure) | PASS | 0 `sk_`/`rk_` in any page payload across 5 containers (book, home, confirmation); 0 `pk_live_` even when set |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge (3 assertions) |
| performance | PASS (local) | home LCP 76 ms at the local origin, not a mobile or edge number |
| accessibility | SKIP | `axe_no_critical` (2 assertions): axe-core is not in the harness |
| mobile_responsive | PASS (partial) | Headless ran every check at 390x844 |
| edge_cases | PASS | 29 of 29 (E1 to E29) |
| auth_lifecycle | PASS | admin-session.yml 15/15 plus 1 SKIP; no-show without the admin cookie returns 401 |
| visual_regression | SKIP | No baseline exists |
| cross_browser | SKIP | Chromium only (headless Playwright plus headed Chrome) |

### Layer 1: code (at `2d8e268`)

- `npx tsx scripts/test-stripe-config.ts`: 19 passed, 0 failed. It covers:
  - the enable matrix;
  - the order of the `NEXT_PUBLIC_` fallback;
  - trimming;
  - rejection of `pk_live_` keys and of a secret key in the publishable slot;
  - per-key memoization of the loader.
- `npx tsc --noEmit`: exit 0.
- `next lint`: 0 errors. Its one warning (`react-hooks/exhaustive-deps` at
  booking-wizard.tsx:146) predates this PR.
- `npx next build`: exit 0. No file under `.next/static` references
  `NEXT_PUBLIC_STRIPE`.
- Existing script suites all pass: test-deposits (keyless path),
  test-cancellation, test-scheduling, test-admin-queries, the three portal
  tests, and verify-seed.

### Layer 2: runtime

- All 5 containers were `running` with `RestartCount=0` after the full sweep,
  and each still served `/` with 200.
- The only error lines in any log were the expected settlement and
  intent-creation attempts that failed on the DNS block. They were counted by
  S-secret-6 and are not failures.

### Layers 3 and 4: network and headless (repo's own assertions, container `both`)

These are `verify/smoke.yml`, `verify/assertions/home.yml` and
`verify/assertions/admin-session.yml`, run over HTTP plus headless Chromium at
390x844:

Tally: `{"PASS":34,"FAIL":0,"N/A":3,"SKIP":2}`

- N/A (3): `Strict-Transport-Security`, which is edge-only.
- SKIP (2): `axe_no_critical`.
- `redirects_to` was checked as a path (`/?admin=required`) because the
  expected absolute URL is the public host.

### Layer 5: headed (real Chrome through the Claude-in-Chrome extension)

This ran in one local Windows Chrome.

1. `127.0.0.1:18301/book/wave-wellness` (flow ON): the page HTML carried 1
   `pk_test_` occurrence and 0 `sk_`/`rk_`.
2. A main-world `fetch` shim was installed. It stubs `/deposit-intent` and
   refuses any `/bookings` POST, so no payment or booking could be written from
   this tab.
3. Signature Facial, First available, Wed Sep 23 09:15 and the details form
   were filled. The stepper showed a Payment step, and Review offered
   "Continue to deposit ($25)".
4. On the Payment step the Stripe CardElement mounted: 2 `js.stripe.com`
   iframes inside `#card-element`. Real keystrokes typed test card 4242 4242
   4242 4242, 12 / 34, CVC and ZIP. The field accepted them and showed Stripe
   Link's "Save with" affordance.
5. "Hold $25 & confirm booking" turned enabled (`disabled=false`). It was
   **not** clicked.
6. The stub counters read `stubbed: 1, blocked: 0`, and there were no console
   errors.
7. `127.0.0.1:18302` (secret only): after Signature Facial the stepper had no
   Payment step (Service to Review only), the page carried 0 `pk_test_` and 0
   `sk_`, and Review offered "Confirm booking" with no deposit step. It was not
   clicked.
8. **Tooling notes, not app defects:**
   - On a freshly loaded page, the first 1 to 3 extension clicks on a service
     button did not advance the wizard. The DOM was already hydrated, and a
     JS `element.click()` on the same button advanced it immediately.
   - Headless Playwright advanced on the first click every time.
   - The rest of the secret-only walk used DOM clicks and native-setter input
     events.
9. The headed layer could not block Stripe.js's own telemetry and config calls
   (r.stripe.com, merchant-ui-api, Link lookup). Network capture started
   after page load, so they were not counted. None of them creates a
   PaymentIntent or confirms a payment.

### Layer 6: edge cases and enable matrix (full sweep, verbatim)

M is the enable matrix per container. H is headless Chromium. S is settlement
gating, which needs only the secret key. E is the edge sweep on the
flow-enabled container. R is runtime.

```
﻿
== M: enable matrix (per container) ==
PASS  M-both-1  both: /book 200  [200]
PASS  M-both-2  both: pk_test_ in payload >=1  [pk_test_ x1]
PASS  M-both-3  both: no pk_live_ in payload  [pk_live_ x0]
PASS  M-both-4  both: no sk_/rk_ in payload  [x0]
PASS  M-both-5  both: deposit-intent -> 502 (tries Stripe, blocked)  [502 {"error":"Could not start the deposit. Please try again."}]
PASS  M-both-6  both: deposit booking without PI -> 402  [402]
PASS  M-both-7  both: no-deposit booking -> 201  [201]
PASS  M-both-8  both: no sk_/rk_ on / and confirmation  [conf 200 home 200 sk x0]
PASS  M-secret-1  secret: /book 200  [200]
PASS  M-secret-2  secret: pk_test_ in payload == 0  [pk_test_ x0]
PASS  M-secret-3  secret: no pk_live_ in payload  [pk_live_ x0]
PASS  M-secret-4  secret: no sk_/rk_ in payload  [x0]
PASS  M-secret-5  secret: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-secret-6  secret: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-secret-7  secret: no-deposit booking -> 201  [201]
PASS  M-secret-8  secret: no sk_/rk_ on / and confirmation  [conf 200 home 200 sk x0]
PASS  M-pkonly-1  pkonly: /book 200  [200]
PASS  M-pkonly-2  pkonly: pk_test_ in payload == 0  [pk_test_ x0]
PASS  M-pkonly-3  pkonly: no pk_live_ in payload  [pk_live_ x0]
PASS  M-pkonly-4  pkonly: no sk_/rk_ in payload  [x0]
PASS  M-pkonly-5  pkonly: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-pkonly-6  pkonly: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-pkonly-7  pkonly: no-deposit booking -> 201  [201]
PASS  M-pkonly-8  pkonly: no sk_/rk_ on / and confirmation  [conf 200 home 200 sk x0]
PASS  M-live-1  live: /book 200  [200]
PASS  M-live-2  live: pk_test_ in payload == 0  [pk_test_ x0]
PASS  M-live-3  live: no pk_live_ in payload  [pk_live_ x0]
PASS  M-live-4  live: no sk_/rk_ in payload  [x0]
PASS  M-live-5  live: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-live-6  live: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-live-7  live: no-deposit booking -> 201  [201]
PASS  M-live-8  live: no sk_/rk_ on / and confirmation  [conf 200 home 200 sk x0]
PASS  M-none-1  none: /book 200  [200]
PASS  M-none-2  none: pk_test_ in payload == 0  [pk_test_ x0]
PASS  M-none-3  none: no pk_live_ in payload  [pk_live_ x0]
PASS  M-none-4  none: no sk_/rk_ in payload  [x0]
PASS  M-none-5  none: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-none-6  none: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-none-7  none: no-deposit booking -> 201  [201]
PASS  M-none-8  none: no sk_/rk_ on / and confirmation  [conf 200 home 200 sk x0]

== H: headless Chromium (390x844) ==
PASS  H-both-1  both: wizard reaches Review for a deposit service  []
PASS  H-both-2  both: Review offers "Continue to deposit"  []
PASS  H-both-3  both: deposit step heading  []
PASS  H-both-4  both: Stripe CardElement iframe mounted  []
PASS  H-both-5  both: card fields accept input (test card 4242)  []
PASS  H-both-6  both: submit armed ("Hold $25 & confirm booking", enabled after complete card) -- NOT clicked  []
PASS  H-both-7  both: deposit-intent served by stub only  [1]
PASS  H-both-8  both: no console errors beyond the harness's own *.stripe.com aborts  [ERR_FAILED x7 vs aborted x7; other: ]
INFO  both: *.stripe.com requests aborted: 7 {"merchant-ui-api.stripe.com":1,"r.stripe.com":6}
PASS  H-secret-1  secret: wizard reaches Review for a deposit service  []
PASS  H-secret-2  secret: Review skips Payment ("Confirm booking", no deposit step)  []
PASS  H-secret-3  secret: deposit-intent never requested  [0]
PASS  H-secret-8  secret: no console errors beyond the harness's own *.stripe.com aborts  [ERR_FAILED x0 vs aborted x0; other: ]
INFO  secret: *.stripe.com requests aborted: 0 {}
PASS  H-pkonly-1  pkonly: wizard reaches Review for a deposit service  []
PASS  H-pkonly-2  pkonly: Review skips Payment ("Confirm booking", no deposit step)  []
PASS  H-pkonly-3  pkonly: deposit-intent never requested  [0]
PASS  H-pkonly-8  pkonly: no console errors beyond the harness's own *.stripe.com aborts  [ERR_FAILED x0 vs aborted x0; other: ]
INFO  pkonly: *.stripe.com requests aborted: 0 {}
PASS  H-live-1  live: wizard reaches Review for a deposit service  []
PASS  H-live-2  live: Review skips Payment ("Confirm booking", no deposit step)  []
PASS  H-live-3  live: deposit-intent never requested  [0]
PASS  H-live-8  live: no console errors beyond the harness's own *.stripe.com aborts  [ERR_FAILED x0 vs aborted x0; other: ]
INFO  live: *.stripe.com requests aborted: 0 {}
PASS  H-none-1  none: wizard reaches Review for a deposit service  []
PASS  H-none-2  none: Review skips Payment ("Confirm booking", no deposit step)  []
PASS  H-none-3  none: deposit-intent never requested  [0]
PASS  H-none-8  none: no console errors beyond the harness's own *.stripe.com aborts  [ERR_FAILED x0 vs aborted x0; other: ]
INFO  none: *.stripe.com requests aborted: 0 {}
PASS  H-nd-1  both: no-deposit service Review shows Confirm booking (no Payment step)  []
PASS  H-nd-2  both: no-deposit booking completes to confirmation page in the UI  [http://127.0.0.1:18301/book/wave-wellness/confirmation/bk_...]
PASS  H-nd-3  both: deposit-intent never requested for no-deposit booking  []

== S: settlement gating (secret-only vs publishable-only) ==
PASS  S-secret-0  secret: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-secret-1  secret: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-secret-2  secret: no-show without admin cookie -> 401  [401]
PASS  S-secret-3  secret: admin session mints cookie  []
PASS  S-secret-4  secret: admin no-show -> 200 Captured  [200 Captured]
PASS  S-secret-5  secret: admin complete -> 200  [200 Captured]
PASS  S-secret-6  secret: settlement DOES try Stripe (secret-only gate) -- blocked at DNS  [settlement attempts logged: 3]
PASS  S-pkonly-0  pkonly: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-pkonly-1  pkonly: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-pkonly-2  pkonly: no-show without admin cookie -> 401  [401]
PASS  S-pkonly-3  pkonly: admin session mints cookie  []
PASS  S-pkonly-4  pkonly: admin no-show -> 200 Captured  [200 Captured]
PASS  S-pkonly-5  pkonly: admin complete -> 200  [200 Captured]
PASS  S-pkonly-6  pkonly: settlement does NOT try Stripe (secret-only gate) -- blocked at DNS  [settlement attempts logged: 0]

== E: edge sweep (flow-enabled container 'both') ==
PASS  E1  deposit-intent: no body -> 400  [400 {"error":"Invalid request"}]
PASS  E2  deposit-intent: garbage JSON -> 400  [400 {"error":"Invalid request"}]
PASS  E3  deposit-intent: wrong types -> 400  [400 {"error":"Invalid request"}]
PASS  E4  deposit-intent: negative ids -> 400  [400 {"error":"Invalid request"}]
PASS  E5  deposit-intent: bad date/time format -> 400  [400 {"error":"Invalid request"}]
PASS  E6  deposit-intent: wrong slug -> 404  [404 {"error":"Unknown business"}]
PASS  E7  deposit-intent: SQL/unicode slug -> 404  [404 {"error":"Unknown business"}]
PASS  E8  deposit-intent: unknown service -> 404  [404 {"error":"Unknown service"}]
PASS  E9  deposit-intent: no-deposit service -> 400  [400 {"error":"This service does not require a deposit."}]
PASS  E10  deposit-intent: closed time 03:00 -> 409 (no Stripe)  [409 {"error":"That time is no longer available."}]
PASS  E11  deposit-intent: GET -> 405  [405 ]
PASS  E12  deposit-intent: 1 MB body (valid fields + pad) -> handled, no 500/crash  [502 {"error":"Could not start the deposit. Please try again."}]
PASS  E13  deposit-intent: 20 concurrent valid -> all 502 (Stripe blocked), no 500  [[502]]
PASS  E14  bookings: no body -> 400  [400 {"error":"Invalid booking request"}]
PASS  E15  bookings: garbage JSON -> 400  [400 {"error":"Invalid booking request"}]
PASS  E16  bookings: missing customer -> 400  [400 {"error":"Invalid booking request"}]
PASS  E17  bookings: invalid email -> 400  [400 {"error":"Invalid booking request"}]
PASS  E18  bookings: notes 501 chars -> 400  [400 {"error":"Invalid booking request"}]
PASS  E19  bookings: paymentIntentId 256 chars -> 400  [400 {"error":"Invalid booking request"}]
PASS  E20  bookings: wrong slug -> 404  [404 {"error":"Unknown business"}]
PASS  E21  bookings: unknown service -> 404  [404 {"error":"Unknown service"}]
PASS  E22  bookings: deposit service, no PI -> 402  [402 {"error":"A deposit is required for this service."}]
PASS  E23  bookings: garbage PI -> 402 (verify fails closed, Stripe blocked)  [402 {"error":"We could not verify your deposit hold. Please try booking ag]
PASS  E24  bookings: SQL-shaped PI -> 402  [402 {"error":"We could not verify your deposit hold. Please try booking ag]
PASS  E25  bookings: replayed PI already on a booking -> 409 (before any Stripe call)  [409 {"error":"This deposit has already been used."}]
PASS  E26  no booking rows created by any rejected request (E1-E25)  [302 -> 302]
PASS  E27  bookings: 20 concurrent same-slot no-deposit -> exactly 1 x 201, 19 x 409  [201 x1, 409 x19]
PASS  E28  bookings: unicode/HTML/apostrophes -> 201  [201]
PASS  E29  confirmation escapes HTML (no raw <script>alert)  [200]

== R: runtime ==
PASS  R-both  both: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected: ]
PASS  R-secret  secret: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected: ]
PASS  R-pkonly  pkonly: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected: ]
PASS  R-live  live: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected: ]
PASS  R-none  none: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected: ]

TOTAL 115/115 passed
```

The curated categories covered are:
- missing and expired inputs: no body, garbage JSON, missing fields;
- max_inputs: a 1 MB body, a 256-character PaymentIntent id, 501-character
  notes;
- special_chars: SQL-shaped and unicode slug and PaymentIntent id, and HTML,
  unicode and apostrophes in customer fields with an escaping check;
- race_conditions: 20 concurrent intents and 20 concurrent same-slot bookings;
- empty_states: unknown slug and unknown service;
- denied_permissions: no-show without the admin cookie.

slow_network and auth_navigation have no surface in this PR.

## 3. Theater Check

| PR #27 claimed | Verification found | Verdict |
|---|---|---|
| The publishable key reaches the browser at runtime with no build arg | Image built with no Stripe build-arg; `both` payload carries 1 `pk_test_` (M-both-2); headless and headed CardElement mount and accept input (H-both-4/5, Layer 5) | CONFIRMED |
| Deposit services can complete the card step | Card step renders, accepts the 4242 test card, and the submit arms. Actual `confirmCardPayment` and the booking write were **not** run (they need Stripe) | CONFIRMED up to submit; submit NOT VERIFIED |
| The card flow needs BOTH a secret and a publishable key | M and H matrix: only `both` shows Payment and 502s on deposit-intent (Stripe attempted, blocked); `secret`, `pkonly` and `none` skip Payment and 503 on deposit-intent | CONFIRMED |
| Test mode only: a `pk_live_` key is treated as absent | `live` container: 0 `pk_live_` in payload, no Payment step, deposit-intent 503 | CONFIRMED |
| The booking route uses the same check, so it never demands a hold the UI cannot collect | `both`: deposit booking without a PaymentIntent returns 402; the other four return 201 with a policy-only hold (`deposit_status=Held`, PaymentIntent null) | CONFIRMED |
| Settlement (cancel, no-show, complete) still keys off the secret alone | `secret`: 3 settlement attempts reached the (blocked) Stripe client; `pkonly`: 0 attempts. Both return 200 with correct DB outcomes | CONFIRMED |
| No secret material in the page | 0 `sk_`/`rk_` across book, home and confirmation in all 5 containers, headless and headed | CONFIRMED |
| No-deposit booking is unaffected | API 201 in all 5 containers; the UI walk completes to `/confirmation/bk_...` with no deposit-intent request | CONFIRMED |

## 4. Blockers

None.

## 5. Warnings

### Tier map drift (recommend a follow-up chore)

`verify/tier_map.yml` classes `booking-flow` as tier 2 ("not a hard gate") even
though it drives real Stripe test-mode holds. `PARADIGM_VELOCITY_RULES.md`
treats payment as Tier-3. That mismatch is why this PR's Deep Verify job
skipped until the `tier-3` label was added by hand. Recommend raising
`booking-flow` (and adding a `deposit-intent` surface) to `tier: 3` with
`deep_verify_before_merge: true`.

### CI state (the one open item on this PASS)

- **Quick Verify is red on this head, and the cause is not this PR.** Quick
  Verify runs `verify/smoke.yml` against the public `deploy_url`, not the PR
  head.
  - At 2026-09-18 21:32 CDT (02:32Z), the untracked, git-ignored demo-proxy
    config `C:\dev\cloudflare-config\nginx\conf.d\slatewell.conf` gained
    `location ^~ /admin { return 404; }` and
    `location ^~ /api/admin { return 404; }`. A comment there says the demo
    admin views exposed visitor-entered PII.
  - Since then the public edge returns 404 for `/admin` and
    `/api/admin/session`. The origin (`127.0.0.1:8105`) still answers 307 and
    405 correctly.
  - `smoke.yml` still expects 405 and the `?admin=required` redirect, so
    `admin-session-post` and `admin-unauthenticated` fail.
  - The earlier run on `2d8e268` (20:30Z) was green. `smoke.yml` is unchanged
    on `main`, so every PR in this repo is red on Quick Verify right now.
- **Deep Verify has not run.** The workflow has `needs: quick-verify`, so it
  shows as skipped even with the `tier-3` label applied.
- **The gate script itself passes on this tree.** A local
  `bash verify/ci/deep_gate.sh` printed "Deep-verify report shows PASS. Gate
  satisfied." and exited 0.
- **Recommended unblock, not done here:** a separate chore PR that updates the
  admin surfaces in `verify/smoke.yml` to the intentional edge 404, merged
  first, then #27 rebased onto `main` and re-run. Changing the gate's own spec
  inside the PR it gates was deliberately avoided.
- If the edge 404 is permanent, the three `tier: 3` admin surfaces in
  `tier_map.yml` are no longer reachable from the public URL, so their smoke
  coverage needs rethinking.

### Coverage gaps (stated so the PASS is not overclaimed)

- `stripe.confirmCardPayment`, the authorized hold, `verifyDepositIntent`
  against a real PaymentIntent, and the booking write for a held deposit were
  **not** run. All of them need Stripe API calls, which this run excluded. The
  existing `scripts/e2e-deposit-ui.mjs` covers that path with live test keys.
  It is the recommended post-deploy check, and it creates real test-mode
  PaymentIntents.
- Settlement was proven *gated* (attempted or not), not *successful*, because
  api.stripe.com was pinned to localhost.
- HSTS is not observable at the local origin. axe was skipped. The adversarial
  generator was not run. Cross-browser coverage is Chromium only.

### Minor, not blocking

- With the flow enabled and Stripe unreachable, a 1 MB body that carries valid
  fields gets 502 (E12). zod strips unknown keys, so the padded body counts as
  a valid request. There is no body-size cap on this route. That predates this
  PR.
