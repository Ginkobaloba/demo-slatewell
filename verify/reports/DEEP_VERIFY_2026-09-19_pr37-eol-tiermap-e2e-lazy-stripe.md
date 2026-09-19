# Deep Verify: PR #37 lazy Stripe.js, deposit-intent tier map, e2e script fixes, LF rules (2026-09-19, re-verified)

Overall: PASS
Tested-SHA: a14555f45af221492a6400bfe5e7359dce74a2e3

This report now covers the rebased head `a14555f`, which sits on
`origin/main` `86e14b8`. The first run (at `79575c3`, further down, kept as
history) found two merge blockers and five warnings. The re-verify below
shows both blockers fixed, and Warnings 1, 3, 4 and 5 fixed.
Warning 2 (the leaked keys) is a process item, not code; it stays open for
Drew. Totals for the re-verify: 24 of 24 harness checks passed (5 INFO),
`e2e-booking` 13/0 three times, `e2e-cancellation` 22/0 three times (flow B
skipped each time), and every unit suite, `tsc` and lint are green.

**One deviation from the dispatch, stated up front:** the re-verify ran
against a production build of `a14555f` served by `next start`, **not** a
freshly built image. The Docker Desktop engine answered
`500 Internal Server Error` on every API call (`docker version`,
`docker ps`, and `docker build`) on both `desktop-linux` and `default`
pipes, from about 19:45Z until this report was written, and it never came
back. The engine was not restarted: a restart would take down the live demo
containers, and that is Drew's call. See section R.8.

## R. Re-verify at `a14555f` (2026-09-19, about 19:45Z to 20:10Z)

### R.1 Target, environment and secret handling

- **Target:** branch `chore/eol-tiermap-e2e`, head
  `a14555f45af221492a6400bfe5e7359dce74a2e3`. `origin/main` (`86e14b8`) is an
  ancestor (`git merge-base --is-ancestor` exit 0), so the rebase is real.
- **Build:** `npm ci --userconfig <scratchpad>\creds\npmrc` (the file was
  passed by path only; it was never opened or printed), `npm run db:seed`,
  `npm run build` in the worktree. The build log has no `Environments:`
  line, so no `.env*` file was loaded; the worktree holds only
  `.env.example`.
- **Servers:** two `next start -H 127.0.0.1` processes, started as
  `node --env-file=<creds>\test-session.env [--env-file=<creds>\fake-stripe.env] ...`,
  so env values went straight from those files into the process and were
  never read or printed by this run.

  | Server | Port | Env files | Used for |
  |---|---|---|---|
  | nokey | 18735 | test-session.env | N crawl, both e2e scripts |
  | key | 18736 | test-session.env + fake-stripe.env (all zeros) | K crawl, card-step timing, W3 failure and retry, race |

  The key server delivers a `pk_test_` publishable key (the fake one) to
  `/book`, so the card flow is on. Both processes were stopped at the end;
  neither port is listening.
- **Stripe:** every browser request to `*.stripe.com` and `*.stripe.network`
  was aborted in Playwright, or, in the stub phases, answered with a local
  stub of `window.Stripe`. A host process cannot be firewalled from
  `api.stripe.com` the way the containers were (`--add-host`), so every
  browser phase on the key server had `POST /deposit-intent` answered by the
  harness. The server's Stripe client was therefore never called, and nothing
  reached Stripe.
- **Secret rules this round:** nothing under `C:\Users\Drama\.secrets`,
  `C:\dev\demo-slatewell\.env.local` or any `.env*` file was read, hashed,
  copied or opened. No key comparison was made. No PowerShell function with a
  one- or two-letter name was defined.
- **Evidence:** `verify-runs/demo-slatewell-pr37-r2/` in the session
  scratchpad (`h37r2.mjs`, `h37r2_run1.log`, `e2e-*_N.log`, `suite_*.log`,
  `tsc.log`, `lint.log`, `next-build.log`, `build.log` with the Docker error).

### R.2 Diff review of `a14555f` against `origin/main`

`git diff --numstat origin/main...a14555f`:

| File | +/- | Expected? |
|---|---|---|
| `.gitattributes` | 2/0 | yes, claim 5 |
| `docs/decisions.md` | 58/0 | yes, D-017 only (pure addition) |
| `scripts/e2e-booking.mjs` | 52/11 | yes, heading waits and the W4 chip loop |
| `scripts/e2e-cancellation.mjs` | 102/51 | yes, `page.request` and the W5 in-page `.ics` fetch |
| `scripts/e2e-stripe-load-failure.mjs` | 129/0 | yes, new W3 regression script |
| `src/components/booking/deposit-payment-step.tsx` | 57/4 | yes, W3 error, Retry and Back |
| `src/lib/stripe-client.ts` | 29/2 | yes, lazy import and cache eviction |
| `verify/reports/DEEP_VERIFY_2026-09-19_pr37-...md` | 518/0 | the carried first-run report (blob identical to `b5353f8`'s) |
| `verify/smoke.yml` | 6/0 | yes, claim 4 |
| `verify/tier_map.yml` | 14/0 | yes, claim 4 |

Nothing else changes. No admin, middleware, session, dependency or workflow
file is touched.

Code review of the two source files:

- `getStripeClient()` now chains `.catch((err) => { cache.delete(key); throw err; })`
  onto the import-and-load promise before caching it. The first call after a
  failure therefore starts over, and the rejection still reaches the caller.
- `DepositPaymentStep` awaits `getStripeClient()` in an effect keyed on
  `[publishableKey, retryCount]`, with a `cancelled` guard, and passes the
  resolved client (initially `null`) to `<Elements stripe>`. On rejection it
  renders a `role="alert"` message, `Retry` (bumps `retryCount`) and `Back`,
  instead of `<Elements>`/`DepositForm`. `react-stripe-js` accepts the
  `null` then instance transition once (its `safeSetContext` path), which
  R-1 to R-3 exercise.

### R.3 D-017 numbering and main's decisions

- `docs/decisions.md` at `a14555f` has `## D-015: Sign-out revokes the admin session server-side`,
  `## D-016: The visitor cookie is signed` and
  `## D-017: Stripe.js loads only when the card step mounts`. The file's
  diff against `main` is 58 added lines and 0 removed, so main's D-015 and
  D-016 are byte-for-byte intact.
- `stripe-client.ts` says `(see D-017)` twice; `e2e-stripe-load-failure.mjs`
  says D-017; the PR body says D-017. The remaining D-015 and D-016
  mentions in scripts are #35's own and are correct.
- **Nit, not blocking:** D-017's first "Verification" bullet still says the
  with-key run confirmed "Elements still renders, deposit card entry still
  works". That run only counted `js.stripe.com` requests (first run, section
  4). A one-line wording fix whenever the file is next touched.

### R.4 Deep gate

`git rev-parse` of `verify/ci/deep_gate.sh` and of
`.github/workflows/verify.yml` are identical at `a14555f` and at
`origin/main`. The branch runs main's per-PR gate: the report must name
`pr37`, carry `Overall: PASS` and a `Tested-SHA` that is an ancestor of the
head with only `verify/reports/` changed since. The first run's report
(`Tested-SHA: 79575c3`) is not an ancestor of the rebased head, so it would
not have satisfied the gate. This update is what does.

### R.5 Harness log (verbatim)

```
== N: no Stripe keys (dvs37r2-nokey), every page ==
PASS  N-1  0 requests to *.stripe.com across 13 pages incl. wizard to confirmation, cancel, deposit-service Review, 8 admin pages  [stripe 0]
PASS  N-2  loader chunk never fetched  [chunk 0]
PASS  N-3  deposit service with no key: Review offers 'Confirm booking'  [Confirm booking]
PASS  N-4  admin sign-in 303  [303]
PASS  N-5  no uncaught page errors  []
INFO  N-6  per page label:status:stripe/chunk  [home:200:0/0 ; book:200:0/0 ; confirmation:200:0/0 ; cancel:200:0/0 ; review(deposit svc)='Confirm booking':0/0 ; /admin:200:0/0 ; /admin/schedule:200:0/0 ; /admin/customers:200:0/0 ; /admin/services:200:0/0 ; /admin/staff:200:0/0 ; /admin/communications:200:0/0 ; /admin/reports:200:0/0 ; /admin/settings:200:0/0]

== K: fake keys configured (dvs37r2-key), Stripe aborted ==
PASS  K-1  0 stripe requests across every page and the wizard up to Review  [stripe 0]
PASS  K-2  loader chunk not fetched before the card step  [chunk 0]
PASS  K-3  deposit service Review offers 'Continue to deposit'  [Continue to deposit ($25)]
PASS  K-4  no uncaught page errors on the crawl  []
INFO  K-5  per page label:status:stripe/chunk  [home:200:0/0 ; book:200:0/0 ; confirmation:200:0/0 ; cancel:200:0/0 ; review(deposit svc)='Continue to deposit ($25)':0/0 ; /admin:200:0/0 ; /admin/schedule:200:0/0 ; /admin/customers:200:0/0 ; /admin/services:200:0/0 ; /admin/staff:200:0/0 ; /admin/communications:200:0/0 ; /admin/reports:200:0/0 ; /admin/settings:200:0/0]
PASS  K-6  0 stripe requests and no chunk until the click into the Payment step  [stripe 0 chunk 0]
PASS  K-7  card step mount fetches the loader chunk, then attempts js.stripe.com (aborted)  [chunk +38 ms; stripe 1 first +45 ms https://js.stripe.com/basil/stripe.js]
INFO  K-8  deposit-intent answered by the harness (the host server is not firewalled from api.stripe.com), js.stripe.com aborted: what the user sees  [alerts ["We could not load the secure payment form. Check your connection and try again."]; retry 1; submit 0; intents 1; pageErrors 0]
PASS  K-9  js.stripe.com aborted on first mount: a clear message, no stuck 'Preparing secure payment...', 0 uncaught errors  [pageErrors ]
PASS  W-1a  loader chunk blocked: clear error, Retry and Back shown, no stuck 'Preparing secure payment...'  [error true; retry 1; back 2; stuck 0; chunk 1; stripe 0]
PASS  W-1b  loader chunk blocked: Retry re-attempts the load (new chunk request) and fails cleanly again  [chunk 1->2; stripe 0->0; error again true]
INFO  W-1c  loader chunk blocked: deposit-intent POSTs across the failed load and one Retry  [1 -> 2]
PASS  W-1d  loader chunk blocked: after the cause clears, Retry recovers to a ready card form ('Hold ... & confirm booking')  [ready true; chunk 3; stripe 1; intents 3]
PASS  W-1e  loader chunk blocked: 0 uncaught errors or unhandled rejections through failure, retry and recovery  []
PASS  W-2a  js.stripe.com blocked: clear error, Retry and Back shown, no stuck 'Preparing secure payment...'  [error true; retry 1; back 2; stuck 0; chunk 1; stripe 1]
PASS  W-2b  js.stripe.com blocked: Retry re-attempts the load (new js.stripe.com request) and fails cleanly again  [chunk 1->1; stripe 1->2; error again true]
INFO  W-2c  js.stripe.com blocked: deposit-intent POSTs across the failed load and one Retry  [1 -> 2]
PASS  W-2d  js.stripe.com blocked: after the cause clears, Retry recovers to a ready card form ('Hold ... & confirm booking')  [ready true; chunk 1; stripe 3; intents 3]
PASS  W-2e  js.stripe.com blocked: 0 uncaught errors or unhandled rejections through failure, retry and recovery  []
PASS  R-1  race {"chunkDelayMs":3000}: mounted before the load resolved, then Elements got the instance; no page errors  [early 'Preparing secure payment...' disabled true; ready true; chunk 1; stripe 1; pageErrors ]
PASS  R-4  Back then Continue again: ready, no second chunk or Stripe script fetch (memoized)  [ready true; chunk 1->1; stripe 1->1]
PASS  R-2  race {"stripeDelayMs":3000}: mounted before the load resolved, then Elements got the instance; no page errors  [early 'Preparing secure payment...' disabled true; ready true; chunk 1; stripe 1; pageErrors ]
PASS  R-3  race {"chunkDelayMs":2000,"stripeDelayMs":2000}: mounted before the load resolved, then Elements got the instance; no page errors  [early 'Preparing secure payment...' disabled true; ready true; chunk 1; stripe 1; pageErrors ]

TOTAL 24/24 passed (0 FAIL; 5 INFO)
```

The group labels still say `dvs37r2-*` from the harness template; the
servers were the two `next start` processes in R.1. The loader chunk is
again `703.c2aa80172bdc823a.js`, the only chunk in the build containing
`js.stripe.com`.

### R.6 Results against the six re-verify asks

1. **W3 (failed load): FIXED.**
   - Stripe script blocked (W-2) and loader chunk blocked (W-1): each shows
     "We could not load the secure payment form. Check your connection and
     try again." with `Retry` and `Back`. No `Preparing secure payment...`
     button, and 0 uncaught errors or unhandled rejections from failure
     through retry and recovery (W-1e, W-2e, K-9).
   - Retry re-attempts the import: a new chunk request (1 to 2) when the
     chunk is blocked, and a new `js.stripe.com` request (1 to 2) when
     the script is blocked (W-1b, W-2b). Under the first run's code both
     stayed at 1.
   - Once the cause clears, Retry recovers to a ready card form (W-1d, W-2d).
   - The builder's `e2e-stripe-load-failure.mjs` was **not run** here. It
     aborts `js.stripe.com` but lets `POST /deposit-intent` reach the
     server, and a `next start` process with the fake `sk_test_` key would
     then call the real `api.stripe.com`. W-2 covers the same scenario
     with the server call intercepted. Its "Retry re-attempts" check also
     only asserts the error reappears, which the old code would have passed
     too; W-1b and W-2b count requests.
2. **Lazy load: still CONFIRMED on the new head.** 13 pages with no key, 0
   Stripe requests and 0 chunk fetches (N-1, N-2). With the fake key, 0
   through wizard steps 1 to 4 (K-1, K-2, K-6); on the card step the chunk
   loads at +38 ms and `js.stripe.com/basil/stripe.js` is attempted at +45 ms
   (K-7). Races still resolve into a Stripe instance with no errors, and
   Back and Continue reuse the memoized load (R-1 to R-4).
3. **W4 and W5: FIXED.** Both scripts, unmodified from `a14555f`, run from
   the worktree against the no-key server on `http://127.0.0.1:18735` at
   about 20:00Z to 20:05Z (16:00 in New York on a Saturday, later than the first
   run's failures):

   | Script | Run 1 | Run 2 | Run 3 |
   |---|---|---|---|
   | e2e-booking | 13/0 | 13/0 | 13/0 |
   | e2e-cancellation | 22/0, flow B skipped | 22/0, flow B skipped | 22/0, flow B skipped |

   `e2e-booking` now walks the date chips past today's empty one (W4).
   `e2e-cancellation`'s 7 `.ics` checks pass on `127.0.0.1` because the
   `.ics` is fetched in the page (W5).

   **Running them with Stripe unset is legitimate.** On the fake-key server,
   a direct `POST /bookings` for the $25 Signature Facial without a
   `paymentIntentId` answers
   `402 {"error":"A deposit is required for this service."}` (checked
   here). That is the D-012 gate short-circuiting before any Stripe call,
   so with keys set these scripts cannot book directly by design. Keyless is
   the documented policy-only mode (`isDepositCardFlowEnabled()` false),
   and the scripts exist to test booking, confirmation, `.ics`, cancel
   tokens and deposit bookkeeping, not card entry. The cost is plain: no
   automated test here covers the card-hold path end to end.
   `e2e-deposit-ui.mjs` needs real Stripe, and nobody should run it until
   the keys are rotated.
4. **D-017: CONFIRMED** (R.3).
5. **Deep gate equals main's: CONFIRMED** (R.4).
6. **Diff review: CONFIRMED**, only the stated files plus the carried
   report (R.2).

Also green at `a14555f`, run in the worktree with `SESSION_SECRET` unset in
the shell:
- `test:deposits` 7/7
- `test:stripe-config` 29/0
- `test:admin-session` 78/0
- `test:admin-security` 184/0
- `test:retention` 31/0
- `test:portal-handoff` 31/0
- `ledger:check` 1 entry, 0 problems
- `tsc --noEmit` exit 0
- `next lint` exit 0, with the one pre-existing `exhaustive-deps` warning at booking-wizard.tsx:146

These are #35's counts now, since the branch includes #35. `git status`
stayed clean.

### R.7 Still open

- **Warning 2 (leaked keys reused): open, Drew's call.** Rotate, then scrub
  the copies listed in first-run section 7. Nothing in this PR changes.
- **Minor, new:** each Retry (and, as before this PR, each Back then
  Continue) remounts `DepositForm`, which POSTs `/deposit-intent` again
  (W-1c, W-2c: 1 to 2 to 3). With real keys, each POST creates a fresh
  unconfirmed PaymentIntent. No money moves and no DB row is written
  (`createDepositIntent` only calls `paymentIntents.create`), but abandoned
  intents pile up in the Stripe dashboard. Optional fix: keep the intent in
  the wizard's state across remounts, or pass an idempotency key per slot.
  Tier-3 file, Sonnet-class, not a blocker.
- **Nit:** D-017's overclaiming "Verification" sentence (R.3).
- **Coverage:** no image and no container layer this round (R.8); real
  `CardElement` and `confirmCardPayment` still untested (needs rotated keys);
  Layer 5 not run, by instruction.

### R.8 Docker engine outage (environment, not the PR)

- `docker build --secret id=npmrc,src=<path> -t demo-slatewell:dv37r2 .`
  failed at about 19:45Z with
  `request returned 500 Internal Server Error for API route and version .../v1.53/...`.
  The same 500 came back on `docker version` and `docker ps`, on both the
  `desktop-linux` and `default` pipes, and a 5-minute poll (2 s interval),
  then another, never saw it recover. The Docker Desktop and backend
  processes have been up since 2026-09-18 21:34.
- No container, image or network was created this round, so there is
  nothing of this run's to clean up in Docker.
- **Not investigated further and not restarted.** Drew should know the local
  engine API is down: the live demos run on this engine, and while this run
  did not probe the public URLs (out of bounds), a wedged engine may already
  be affecting them. See the `docker-desktop-wedged-afunix-sockets` memory
  before any restart.
- **Recommended when the engine is back:** one short container pass (N-1
  plus K-7 plus W-2 against `demo-slatewell:<tag>` built from `a14555f`). The
  client-side behavior tested here does not depend on standalone versus
  `next start`, so this is confirmation, not a gap in the verdict.

---

## First-run summary (at `79575c3`, superseded where R says so)

The code on this commit does what the PR says. Stripe.js is not requested on
any page of the app until the card step mounts, with or without a key
configured (26 of 26 harness checks passed, 9 INFO lines). A card step that
mounts before the dynamic import or the Stripe script resolves still ends up
with a Stripe instance in `<Elements>`, with no page error. `pk_live_` and
`sk_live_` keys are still refused. The tier map, smoke entry and
`.gitattributes` are correct. `e2e-cancellation` passed 3 of 3 against the
built image; `e2e-booking` passed 3 of 3 in the builder's own run at 18:34Z
but fails 3 of 3 now, because of the clock, not the app (Warning 4).

The PASS covers the tested commit only. **This PR cannot merge as it
stands:** `main` moved to `86e14b8` (PRs #33 to #36 merged after this branch
was cut from `4d19760`). GitHub reports it `CONFLICTING`, the conflict is
`docs/decisions.md`, and this PR's D-015 collides with the D-015 and D-016
that #35 already put on `main`. See Blockers. The fix changes a file outside
`verify/reports/`, so `main`'s per-PR gate will need a fresh report after it.

**Key hygiene: the leaked Stripe TEST keys were reused by the builder.**
This run also printed them once by accident. See section 7. Neither is a
defect in the diff (the diff contains no key), but both need action.

## First run, 1. Target and scope

- **Target:** `Ginkobaloba/demo-slatewell` PR #37, branch
  `chore/eol-tiermap-e2e`, head `79575c3`
  (`79575c3554fd502b11a308a47248732af347d24f`), parent `4d19760`. Current
  `origin/main` is `86e14b8`. Not merged at the time of this run.
- **Why deep:** the PR changes the browser-side Stripe loader used by the
  deposit card step (booking and payment client) and adds a tier-3 surface.
  The `tier-3` label is on the PR.
- **Mode:** deep was requested. Layers 1 to 4 and 6 ran. **Layer 5 (headed
  Chrome) was not run**, by instruction: all browser work was headless
  Chromium (Playwright). The adversarial generator was not run; the attack
  list was written by hand from the dispatch and the diff.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC, not a human. It did not
  write this PR.
- **Image:** `demo-slatewell:dv37`, built from the PR head with
  `docker build --secret id=npmrc,...`. The npmrc was written to the run dir,
  never printed, and deleted in a `finally` block (`npmrc removed: True`).
  Build exit 0.
- **Containers:** all named `dvs37-*`, all on `127.0.0.1`, all with
  `--add-host api.stripe.com:127.0.0.1`. Env came from
  `C:\Users\Drama\.secrets\demo_env_slatewell.local.txt` with **every Stripe
  variable replaced**: the real keys were never passed to any container.

  | Container | Port | STRIPE_SECRET_KEY | STRIPE_PUBLISHABLE_KEY | Used for |
  |---|---|---|---|---|
  | dvs37-nokey | 18731 | blank | blank | N crawl, both e2e scripts, smoke |
  | dvs37-key | 18732 | `sk_test_` + 99 zeros | `pk_test_` + 99 zeros | K crawl, card-step mount, race, failure |
  | dvs37-pklive | 18733 | `sk_test_` + zeros | `pk_live_` + zeros | #27 regression |
  | dvs37-sklive | 18734 | `sk_live_` + zeros | `pk_test_` + zeros | #30 regression |

  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` was blank everywhere.
- **Every browser request to `*.stripe.com` and `*.stripe.network` was
  intercepted in Playwright:** counted and aborted, or (race phases only)
  answered with a 20-line local stub of `window.Stripe`. Nothing reached
  Stripe from this run, in the browser or from the server.
- **Not touched:** the live `demo-slatewell` container, the public URL,
  `demo-proxy` and `C:\dev\cloudflare-config`. No `next start` process was
  used.
- **Cleanup:** all four `dvs37-*` containers and the `dv37` image were
  removed. `docker ps -a` shows no `dvs37` name, no `dvs37` network exists,
  and `demo-slatewell:latest` and `:previous` are untouched. The scratch
  runner directories' `playwright` junctions into the worktree were removed
  with `rmdir` (no recursion).
- **Evidence:** raw logs and the harness are under the session scratchpad,
  `verify-runs/demo-slatewell-pr37-deep/` (`h37.mjs`, `h37_run1.log`,
  `h37_key_run2.log`, `build.log`, `suite_*.log`, `tsc.log`, `lint.log`,
  `e2e-img_*.log`, `lh_e2e-img_*.log`, `mod_e2e-booking_*.log`, `old_*.log`).

## First run, 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| lazy Stripe.js (claim 1) | PASS | N-1, N-2, K-1, K-2, K-6, K-7; the chunk table in Layer 3 and 4 |
| card flow up to submit (claim 2) | PASS, with a coverage gap | K-3, K-7, K-8, R-1 to R-4; no real Stripe (section 3, claim 2) |
| error_handling | PASS (1 WARN) | K-8; F-1, F-2 do not crash but show no message and never retry (Warning 3) |
| security (#27, #30 regressions) | PASS | L-1 to L-4, LS-1 to LS-4 |
| e2e scripts (claim 3) | PARTIAL | e2e-cancellation 3/3; e2e-booking red by clock now (Warning 4) |
| smoke | PASS | every container served `/` 200; GET deposit-intent 405 on all four |
| navigation | PASS | the N and K crawls: 13 pages each, all 200 |
| edge_cases | PASS | R and F sweeps, live-key matrix |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge |
| performance | INFO only | loader chunk +35 to +53 ms and Stripe script +48 to +134 ms after the click (K-7) |
| accessibility | SKIP | axe-core is not in the harness |
| mobile_responsive | SKIP | all runs used a 390x844 viewport; no layout assertions were made |
| visual_regression | SKIP | no baseline exists |
| cross_browser | SKIP | Chromium only, headless |

### First run: Layer 1: code (at `79575c3`)

- Diff: 7 files, +186/-59: `.gitattributes`, `docs/decisions.md`,
  `scripts/e2e-booking.mjs`, `scripts/e2e-cancellation.mjs`,
  `src/lib/stripe-client.ts`, `verify/smoke.yml`, `verify/tier_map.yml`.
  None of `src/lib/admin-*`, `session-revocation.ts`, `middleware.ts`,
  `src/app/admin/**` or `src/app/api/admin/**` is touched.
- `npx tsc --noEmit`: exit 0. `npx next lint`: exit 0, one warning
  (`react-hooks/exhaustive-deps` at booking-wizard.tsx:146) that predates
  this PR.
- The suites the PR lists, run in the worktree with `SESSION_SECRET` unset
  in the shell:

  | Suite | This run |
  |---|---|
  | test:deposits | All 7 deposit tests passed |
  | test:stripe-config | 29 passed, 0 failed |
  | test:portal-token | 15 passed, 0 failed |
  | test:portal-handoff | 27 passed, 0 failed |
  | test:admin-session | 53 passed, 0 failed |
  | test:admin-security | 81 passed, 0 failed |
  | test:admin-queries | All tests passed |
  | test:retention | 19 passed, 0 failed |
  | test-cancellation, test-scheduling | all PASS, exit 0 |

  The counts match the builder's transcript exactly (29, 15, 27, 53, 81,
  19). They are lower than #35's because this branch predates #35.
  `git status` stayed clean after the suites.
- **`.gitattributes`:** `git ls-files --eol` shows all 12 tracked `.mjs` and
  `.sh` files as `i/lf attr/text eol=lf`, and `git check-attr` resolves
  `eol: lf` for them. The builder's "0 files renormalized" is consistent with
  that. (This worktree's checkout still holds `w/crlf` copies of 10 of them,
  checked out before the attribute existed. That is local only and does not
  show in `git status`.)
- **Root cause claim:** `node_modules/@stripe/stripe-js/dist/index.mjs`
  (v7.9.0) runs `Promise.resolve().then(() => getStripePromise())` at module
  scope (line 176), which injects the script whether or not `loadStripe` is
  ever called. `dist/pure.mjs` has no such line; its `loadScript` runs only
  inside `loadStripe`. Confirmed as the PR states.
- **Merge check:** `git merge-tree --write-tree` of the PR head against
  `origin/main` (`86e14b8`) and against `origin/fix/session-revoke-signed-visitor`
  both report exactly one conflict, `docs/decisions.md`. Every code file
  merges cleanly. `gh pr view 37` says `mergeable: CONFLICTING`,
  `mergeStateStatus: DIRTY`. Nothing was merged or pushed for this check.
- **CI on #37 before this report:** Quick Verify and both Socket checks
  passed. Deep Verify passed in 4 s. Its log reads
  `Found deep-verify report(s): verify/reports/DEEP_VERIFY_2026-09-18_pr27-stripe-pk-runtime.md`
  / `Deep-verify report shows PASS. Gate satisfied.` It ran this branch's old
  any-PASS `deep_gate.sh`, not `main`'s per-PR one (#33). See Warning 1.

### First run: Layer 2: runtime

- All four containers were `running` with `RestartCount=0` after their
  sweeps. None of their logs contains an error line.
- `dvs37-sklive` logged the one expected line,
  `[stripe] STRIPE_SECRET_KEY is not a TEST key (sk_test_). Stripe is disabled; ...`.
  No key value appears in any log (the only `sk_test_` hit is inside that
  message). `dvs37-pklive` and `dvs37-key` logged no `[stripe]` line.

### First run: Layer 3 and 4: network and headless

**Where the Stripe code lives in the built image** (`/app/.next/static/chunks`):

| Chunk | Contains | In `/book`'s initial scripts? |
|---|---|---|
| `703.c2aa80172bdc823a.js` | the only chunk with the string `js.stripe.com` (the `pure` loader) | no |
| `939-97ef2b4c9e7ec164.js` | `@stripe/react-stripe-js` | yes |
| `app/book/[slug]/page-b94ee66854c31f7c.js` | the wizard, `DepositPaymentStep`, `getStripeClient` | yes |

`/book/wave-wellness` loads 8 initial chunks, 703 is not among them, and the
HTML contains neither `js.stripe.com` nor any `pk_` string. So
`@stripe/react-stripe-js` is loaded and evaluated on every `/book` visit, and
the N and K crawls below still show 0 Stripe requests: it does not bring the
eager load back.

**Smoke:** `GET /api/book/wave-wellness/deposit-intent` answered
`HTTP/1.1 405 Method Not Allowed` on all four containers.
`verify/ci/quick_smoke.sh` iterates every `surfaces[]` entry of `smoke.yml`,
so the new entry is picked up.

### First run: Layer 6: edge cases and claims (verbatim)

- **N** is every page with no keys; **K** every page with a (fake) test key
  set, then the card step mounted with Stripe aborted and the server's Stripe
  call blackholed; **R** the load race (Stripe stubbed, deposit-intent
  answered by the harness); **F** a failed load; **L** and **LS** live keys.

```
== N: no Stripe keys (dvs37-nokey), every page ==
PASS  N-1  0 requests to *.stripe.com across home, /book, wizard to confirmation, cancel, review of a deposit service, 8 admin pages  [stripe 0]
PASS  N-2  Stripe loader chunk (703) never fetched  [chunk fetches 0]
PASS  N-3  deposit service with no key: Review offers 'Confirm booking', not a card step  [Confirm booking]
PASS  N-4  admin sign-in 303 and admin pages visited  [signin 303]
PASS  N-5  no uncaught page errors  []
INFO  N-6  per page label:status:stripe/chunk  [home:200:0/0 ; book:200:0/0 ; confirmation:200:0/0 ; cancel:200:0/0 ; review(deposit svc) button='Confirm booking':0/0 ; /admin:200:0/0 ; /admin/schedule:200:0/0 ; /admin/customers:200:0/0 ; /admin/services:200:0/0 ; /admin/staff:200:0/0 ; /admin/communications:200:0/0 ; /admin/reports:200:0/0 ; /admin/settings:200:0/0]

== K: fake pk_test/sk_test configured (dvs37-key), Stripe aborted ==
PASS  K-1  key configured: 0 stripe requests across every page and the wizard up to Review (card step never mounted)  [stripe 0]
PASS  K-2  key configured: loader chunk not fetched before the card step  [chunk 0]
PASS  K-3  key configured: deposit service Review offers 'Continue to deposit'  [Continue to deposit ($25)]
PASS  K-4  no uncaught page errors on the crawl  []
INFO  K-5  per page label:status:stripe/chunk  [home:200:0/0 ; book:200:0/0 ; confirmation:200:0/0 ; cancel:200:0/0 ; review(deposit svc) button='Continue to deposit ($25)':0/0 ; /admin:200:0/0 ; /admin/schedule:200:0/0 ; /admin/customers:200:0/0 ; /admin/services:200:0/0 ; /admin/staff:200:0/0 ; /admin/communications:200:0/0 ; /admin/reports:200:0/0 ; /admin/settings:200:0/0]
PASS  K-6  0 stripe requests right up to the click into the Payment step  [stripe 0, chunk 0]
PASS  K-7  card step mount fetches the loader chunk and then attempts js.stripe.com (aborted)  [chunk 1 (+53 ms), stripe 1 first +134 ms https://js.stripe.com/basil/stripe.js]
PASS  K-8  deposit-intent with api.stripe.com blackholed: server answers an error JSON, UI shows an alert and 'Back to review' (graceful)  [intent 502 {"error":"Could not start the deposit. Please try again."}; alert 'Could not start the deposit. Please try again.'; back true]
INFO  K-9  page errors / console errors on the card step (Stripe aborted)  [pageErrors ["Failed to load Stripe.js"]; console 2 ["Failed to load resource: net::ERR_FAILED","Failed to load resource: the server responded with a status of 502 (Bad Gateway)"]]
PASS  R-1  race ({"chunkDelayMs":3000,"stubStripe":true}): mounted before the loader resolved ('Preparing secure payment...', disabled true); Elements then got a stripe instance (button flips to 'Hold ... & confirm booking'); no page errors  [early 'Preparing secure payment...' disabled true; ready true; stripe reqs 1; chunk 1; pageErrors 0 ]
PASS  R-4  Back then Continue again: ready at once, no second loader chunk or Stripe script fetch (memoized)  [ready true; chunk 1->1; stripe 1->1]
PASS  R-2  race ({"stripeDelayMs":3000,"stubStripe":true}): mounted before the loader resolved ('Preparing secure payment...', disabled true); Elements then got a stripe instance (button flips to 'Hold ... & confirm booking'); no page errors  [early 'Preparing secure payment...' disabled true; ready true; stripe reqs 1; chunk 1; pageErrors 0 ]
PASS  R-3  race ({"chunkDelayMs":2000,"stripeDelayMs":2000,"stubStripe":true}): mounted before the loader resolved ('Preparing secure payment...', disabled true); Elements then got a stripe instance (button flips to 'Hold ... & confirm booking'); no page errors  [early 'Preparing secure payment...' disabled true; ready true; stripe reqs 1; chunk 1; pageErrors 0 ]
PASS  F-1  dynamic import chunk blocked: page does not crash, heading still rendered, submit stays disabled, Back usable  [button 'Preparing secure payment...' disabled true; back true; alerts 1; stripe 0; chunk 1]
INFO  F-1b  dynamic import chunk blocked: user-facing error message shown?  [alerts 1 texts [""]; next-route-announcer elements 1; button text 'Preparing secure payment...']
INFO  F-1c  dynamic import chunk blocked: uncaught page errors  [1 Loading chunk 703 failed. (error: http://127.0.0.1:18732/_next/static/chunks/703.c2aa80172bdc823a.js)]
INFO  F-1d  dynamic import chunk blocked: Back and Continue again without reload retries the load?  [chunk 1->1; stripe 0->0]
PASS  F-2  js.stripe.com blocked: page does not crash, heading still rendered, submit stays disabled, Back usable  [button 'Preparing secure payment...' disabled true; back true; alerts 1; stripe 1; chunk 1]
INFO  F-2b  js.stripe.com blocked: user-facing error message shown?  [alerts 1 texts [""]; next-route-announcer elements 1; button text 'Preparing secure payment...']
INFO  F-2c  js.stripe.com blocked: uncaught page errors  [1 Failed to load Stripe.js]
INFO  F-2d  js.stripe.com blocked: Back and Continue again without reload retries the load?  [chunk 1->1; stripe 1->1]

== L: pklive (dvs37-pklive) ==
PASS  L-1  pklive: 0 stripe requests and no loader chunk anywhere  [stripe 0 chunk 0]
PASS  L-2  pklive: deposit service Review offers 'Confirm booking' (card step refused)  [Confirm booking]
PASS  L-3  pklive: no pk_ key string in the /book HTML  [pk in html false]
PASS  L-4  pklive: deposit-intent POST refused with 503 before any Stripe call  [503 {"error":"Card deposits are not available right now."}]

== LS: sklive (dvs37-sklive) ==
PASS  LS-1  sklive: 0 stripe requests and no loader chunk anywhere  [stripe 0 chunk 0]
PASS  LS-2  sklive: deposit service Review offers 'Confirm booking' (card step refused)  [Confirm booking]
PASS  LS-3  sklive: no pk_ key string in the /book HTML  [pk in html false]
PASS  LS-4  sklive: deposit-intent POST refused with 503 before any Stripe call  [503 {"error":"Card deposits are not available right now."}]

TOTAL 26/26 passed (0 FAIL; 9 INFO)
```

The F-*b and F-*c lines above are from the second K-phase run
(`h37_key_run2.log`), which added the alert text to the output. That run
repeated K-6 to F-2d with the same verdicts (13/13, K-7 at +35 ms / +48 ms).

Harness notes (not app defects; stated so the log is honest):

- **The `alerts 1` in F-1 and F-2 is not an error message.** The only
  `role=alert` element is Next's empty `next-route-announcer`. So a failed
  load shows the user nothing. That finding is Warning 3.
- **The e2e scripts read the database through a shim.** Both scripts open
  `data/slatewell.db` from the host with `better-sqlite3`, and against a
  container the database is inside the image (a Windows bind mount of a WAL
  database into Linux is not safe). The scripts were run from a scratch
  directory, byte-identical to their blobs at the tested commit and at
  `4d19760` (`git hash-object` equal to `git rev-parse <sha>:<path>`), with
  `node_modules/better-sqlite3` replaced by a shim that answers the same
  read-only queries through `docker exec` against the container's own
  database. Nothing else in the scripts was changed.
- **`127.0.0.1` versus `localhost` for e2e-cancellation.** Against
  `http://127.0.0.1:18731` it gave 15 passed, 7 failed three times: all 7
  `.ics` checks (`ics: HTTP 200  404`), while the confirmation page checks in
  the same run passed. The image sets `Secure` on the visitor cookie
  (`NODE_ENV=production`). Chromium sends it to `http://127.0.0.1`, but
  Playwright's own `APIRequestContext` (`page.request`) withholds `Secure`
  cookies from any `http:` host that is not `localhost`
  (`playwright-core/lib/coreBundle.js`, `isLocalHostname`). Against
  `http://localhost:18731`, the same script passed 3 of 3. See Warning 5.
- **`e2e-mod` is a harness copy, not the PR's script.** To see whether
  `e2e-booking` fails anywhere but the slot step, a scratch copy was made
  with only the "click the first enabled date chip" line replaced by a loop
  over chips. It is evidence about the app and the rest of the script, never
  about the PR's script as written.

### First run: e2e scripts against the built image

| Script (at `79575c3`, unmodified) | Host | Run 1 | Run 2 | Run 3 |
|---|---|---|---|---|
| e2e-cancellation | localhost:18731 | 22/0, flow B skipped | 22/0, flow B skipped | 22/0, flow B skipped |
| e2e-cancellation | 127.0.0.1:18731 | 15/7 (the 7 `.ics`) | 15/7 | 15/7 |
| e2e-booking | either | 3/1, stops at `time slots offered count=0` | same | same |
| e2e-booking, chip loop (`e2e-mod`, harness copy) | localhost:18731 | 13/0 (chip 1) | 13/0 | 13/0 |

Contrast, the old scripts from `4d19760` on the same container, once each:
`e2e-booking` 2 passed, 2 failed (`date step renders`, the heading race the
PR fixes, and `time slots offered`); `e2e-cancellation` 12 passed, 10
failed (the 3 confirmation checks and the 7 `.ics` checks, from the bare
`fetch()` the PR replaces). So both of the PR's fixes are real: the heading
race is gone, and the cookie is now kept for the confirmation page and, on
`localhost`, the `.ics`.

Why `e2e-booking` fails now: the run was at 19:10Z, a Saturday, 15:10 in
New York. The script clicks the first enabled date chip, which is today.
Chips are enabled by weekday (`disabled={!open}`,
`enabledWeekdays.has(day.weekday)`), not by remaining slots, and the
availability API returns 0 slots for today for service 3. The builder's three
runs were at 18:34Z and all passed (`PASS  time slots offered` in its
transcript, no FAIL line); its own ad hoc Stripe check at 18:38Z already had
to skip chip 0 for chip 1. So the builder's claim was true when it was made,
and the script turns red every business day once the last slot of the day
has passed.

## First run, 3. Claim by claim

1. **Stripe.js loads lazily: CONFIRMED.**
   - `stripe-client.ts` keeps only `import type` from `@stripe/stripe-js`
     (erased at build) and dynamically imports `@stripe/stripe-js/pure`
     inside `getStripeClient()`, after the no-key early return.
   - With no key: 0 Stripe requests and 0 fetches of the loader chunk across
     all 13 pages the app has, including the wizard to Review for a deposit
     service, a confirmation page, a cancel page and all 8 admin pages (N-1,
     N-2, N-6).
   - With a key configured: still 0 on every page and through wizard steps 1
     to 4 (K-1, K-2, K-6). This is the discriminating check; it shows the
     load is gated on the card step mounting, not on the key.
   - On the click into the Payment step: the loader chunk after about
     35 to 53 ms, then `https://js.stripe.com/basil/stripe.js` after about
     48 to 134 ms (K-7).
   - `@stripe/react-stripe-js` sits in an initial `/book` chunk (939) and is
     evaluated on every visit, and the counts stay 0, so it does not
     reintroduce the side effect.
2. **The card-deposit flow still works up to the submit: CONFIRMED up to
   script injection, with a stub beyond it.**
   - With a key, Review offers `Continue to deposit ($25)` and the Payment
     step mounts (K-3, K-7).
   - The race: with the dynamic import delayed 3 s, the Stripe script
     delayed 3 s, or both 2 s, the step mounts showing
     `Preparing secure payment...` with submit disabled, then `<Elements>`
     receives the (stub) Stripe instance and the button flips to
     `Hold $25.00 & confirm booking`, with no page error (R-1 to R-3). Going
     back and forward reuses the memoized promise: no second chunk or script
     fetch (R-4).
   - With api.stripe.com blackholed on the server, deposit-intent answers
     502 JSON and the step shows the alert and `Back to review` (K-8).
   - **Coverage gap:** a real `CardElement` iframe, card entry and
     `confirmCardPayment` need the real js.stripe.com and a real key, which
     this run was not allowed to use. It does not block: from the moment
     `loadStripe()` resolves, `pure` and the default entry run the same
     `initStripe` code, and the PR changed only where the promise comes
     from. The only real positive-path run that exists is the builder's, and
     it used the leaked keys (section 7). It also only counted script
     requests; it did not enter a card or submit.
3. **e2e-booking and e2e-cancellation pass against a production server, 3
   runs each: CONFIRMED for e2e-cancellation; for e2e-booking, true at the
   builder's run time and NOT REPRODUCED now.**
   - e2e-cancellation: 22/0 three times against the built image on
     `localhost` (flow B skipped each time with its documented notice).
   - e2e-booking: fails 3 of 3 at 19:10Z at `time slots offered`, a clock
     problem the PR did not fix (Warning 4). The part it did fix, the
     heading race, is fixed: the chip-loop copy passes 13/0 three times.
4. **tier_map.yml and smoke.yml have a new deposit-intent tier-3 surface; GET
   returns 405: CONFIRMED.** The entry is `tier: 3`,
   `deep_verify_before_merge: true`, with a reason naming
   `src/app/api/book/[slug]/deposit-intent/route.ts`. GET gave 405 on all
   four containers, and `quick_smoke.sh` reads every `surfaces[]` entry.
5. **.gitattributes adds LF rules for .mjs and .sh: CONFIRMED.** Exactly
   `*.mjs text eol=lf` and `*.sh text eol=lf`; all 12 matching files are LF
   in the index and resolve `eol: lf`.
6. **Regression of #27 and #30 (pk_live_ and sk_live_ refused): CONFIRMED.**
   With either live key the card step never appears, no `pk_` string reaches
   the page, 0 Stripe requests happen, and deposit-intent answers 503
   (L-1 to L-4, LS-1 to LS-4). `sk_live_` is logged without the key.

## First run, 4. Theater Check

| PR #37 claimed | Verification found | Verdict |
|---|---|---|
| `stripe-client.ts` dynamically imports `@stripe/stripe-js/pure` only when a real key reaches `getStripeClient` | Source; chunk 703 is the only `js.stripe.com` chunk and is not in `/book`'s initial scripts; K-6, K-7 | CONFIRMED |
| No key: 0 requests to js.stripe.com on `/book` | N-1 on `/book` and every other page | CONFIRMED |
| With a key, Stripe.js loads when the card step mounts | K-1, K-6 (0 before), K-7 (loaded on mount) | CONFIRMED |
| The default entry schedules its own script injection at import time | `index.mjs` line 176; absent from `pure.mjs` | CONFIRMED |
| `@stripe/react-stripe-js` does not reintroduce the eager load | chunk 939 loads on every `/book`, requests stay 0 | CONFIRMED |
| Memoization unchanged; `<Elements>` never re-initializes | R-4: no second chunk or script fetch | CONFIRMED |
| "Elements still renders, deposit card entry still works" (D-015 text) | Builder's own check counted `js.stripe.com` requests (32) and stopped there; no card was entered. This run: stub only | OVERCLAIMED (not shown by the builder; not verifiable here without real Stripe) |
| With-key contrast used "test keys" | Those were the real keys from the `.secrets` file, leaked earlier today (section 7) | CONFIRMED as test keys; UNDISCLOSED reuse of leaked keys |
| e2e-booking 3/3 against a production server | Builder transcript: 3 PASS runs at 18:34Z. This run at 19:10Z: 3 FAIL at the slot step (clock) | NOT REPRODUCED (true at run time) |
| e2e-cancellation 3/3, flow B skipped | 3 x 22/0 on `localhost`, flow B skipped | CONFIRMED |
| `e2e-cancellation` failed because bare `fetch()` drops the visitor cookie | Old script on the same container: the 3 confirmation checks and 7 `.ics` checks fail; new script passes them | CONFIRMED |
| deposit-intent tier-3 entry and smoke GET 405 | Files, and 405 on 4 containers | CONFIRMED |
| `.gitattributes`; renormalize touched 0 files | `ls-files --eol` all `i/lf` | CONFIRMED |
| All listed suites, tsc and lint green | Reproduced; counts match | CONFIRMED |
| Did not touch the files owned by "open PR #35" | Correct for the files; but #35 was already merged at 07:36Z, before this PR was opened at 18:41Z. The branch was cut from `4d19760` instead of current `origin/main` | CONFIRMED (files); STALE BASE |
| CI Deep Verify green | It matched the #27 report under the branch's old gate | THEATER (Warning 1) |

## First run, 5. Blockers

None in the code under test. Two things block the merge itself, and both
need a new commit on the branch:

1. **Conflict with `main`.** GitHub reports `CONFLICTING` / `DIRTY`. The
   only conflicted file is `docs/decisions.md`; every code file merges
   cleanly (`git merge-tree`). **Fix:** rebase onto `origin/main` (or merge
   it) and keep both sets of entries. Mechanical; a Sonnet-class agent can do
   it from PowerShell.
2. **D-015 is already taken on `main`.** `main` has
   `D-015: Sign-out revokes the admin session server-side` and
   `D-016: The visitor cookie is signed` (from #35). This PR's entry must
   become **D-017** in three places: the heading in `docs/decisions.md`, the
   `(see D-015)` in the `src/lib/stripe-client.ts` comment, and the PR body.
   Comment and doc only, but `stripe-client.ts` is the tier-3 file. Sonnet
   can write it.

After either fix, `main`'s gate (Warning 1) will refuse this report, because
code outside `verify/reports/` changes after the tested commit. That is the
gate working. The sequence: land both fixes, then a short re-verify of the
new head (the merged code includes #35's D-016 checks in
`deposit-intent/route.ts`, which this run did not test with this PR), then
commit that report.

## First run, 6. Warnings

### First run: Warning 1: the Tier-3 gate on this PR was theater again

- Deep Verify passed in 4 s by matching `DEEP_VERIFY_2026-09-18_pr27-stripe-pk-runtime.md`.
  The branch still carries the old any-PASS `deep_gate.sh` because it was
  cut from `4d19760`, before #33 landed the per-PR gate on `main`.
- **Fix:** rebasing onto `main` (Blocker 1) brings in the per-PR gate. No
  separate work. Tier: CI, rides along with the rebase.

### First run: Warning 2: the builder reused the leaked Stripe keys (section 7)

- **Fix:** rotate the Stripe TEST keys (already required), scrub the copies
  listed in section 7, and make "never read another checkout's `.env.local`"
  explicit in dispatches. Rotation and scrubbing are Drew's call, not
  code; nothing in this PR changes.

### First run: Warning 3: a failed Stripe load shows nothing and never retries

- F-1 (loader chunk blocked) and F-2 (js.stripe.com blocked): the page does
  not crash and Back works, but the button stays on
  `Preparing secure payment...` forever, no message appears, and an uncaught
  rejection lands in the console (`Loading chunk 703 failed.` or
  `Failed to load Stripe.js`).
- Back then Continue again does not retry (chunk 1->1, stripe 1->1):
  `getStripeClient` caches the rejected promise in its `Map` until reload.
- The js.stripe.com half is pre-existing: `main`'s code cached the rejected
  `loadStripe` promise and `<Elements>` has no `.catch` either. **The chunk
  half is new:** before this PR the Stripe code shipped in the initial
  bundle. A redeploy while a customer has `/book` open (new chunk hashes)
  now leaves the card step stuck.
- **Fix:** in `getStripeClient`, attach a `.catch` that deletes the cache
  entry and rethrows, and in `DepositForm` await the same promise to show an
  error with a retry (`<Elements>` exposes no error hook). Tier-3 file;
  Sonnet-class can write it, the deep verify stays with Opus.

### First run: Warning 4: e2e-booking is still red for part of every business day

- It clicks the first enabled date chip, and chips are enabled by weekday,
  not by remaining slots. After the day's last slot, today is enabled and
  empty, and the script fails at `time slots offered`.
- **Fix:** loop over enabled chips until one yields slots (what the builder's
  own ad hoc check did, and what `e2e-cancellation`'s `getSlots` search
  does). Test-only, Haiku- or Sonnet-class. Separately, and optional: an
  enabled day with no remaining slots is a small UX nit in the wizard.

### First run: Warning 5: e2e-cancellation fails its `.ics` checks on `http://127.0.0.1`

- Playwright's `page.request` does not send the `Secure` visitor cookie to
  `http://127.0.0.1` (only to `https:` or `localhost`); the browser does.
  The script's default `BASE_URL` is `http://localhost:3000`, so the
  default passes.
- **Fix:** fetch the `.ics` inside the page (`page.evaluate(() => fetch(...))`),
  or document that `BASE_URL` must be `localhost` or `https`. Test-only,
  Haiku- or Sonnet-class.

### First run: Minor, not blocking

- The PR body says the files it avoided are "owned by open PR #35"; #35 was
  merged before this PR was opened. Correct the body when renumbering.
- The builder's ad hoc scripts (`scripts/_check-stripe-request-present.mjs`
  and the no-request check) were written into the repo's `scripts/` and
  deleted; none is in the diff.
- The worktree has `w/crlf` working copies of 10 `.mjs`/`.sh` files from
  before the attribute existed; a fresh checkout gets LF.

### First run: Coverage gaps (stated so the PASS is not overclaimed)

- **Layer 5 (headed Chrome) was not run**, by instruction.
- No real Stripe: `CardElement`, card entry and `confirmCardPayment` were not
  exercised (section 3, claim 2). Recommend one real positive-path run with
  the rotated keys.
- The merge result (`main` plus this PR) was not built or tested; see
  Blockers for why a re-verify follows anyway.
- `e2e:visitor-scope` was not re-run (unchanged by this PR).
- axe, visual regression and cross-browser runs were not done.

## First run, 7. Key hygiene

**Question:** did the builder's "with-key" contrast check use the real keys
from `C:\Users\Drama\.secrets\demo_env_slatewell.local.txt`, which leaked
earlier today?

**Answer: yes.** Compared by prefix, length and the first 12 hex characters
of SHA-256 only:

| Source | STRIPE_SECRET_KEY | STRIPE_PUBLISHABLE_KEY |
|---|---|---|
| `.secrets\demo_env_slatewell.local.txt` | `sk_test_`, 107 chars, `b4d76e4c4672` | `pk_test_`, 107 chars, `e6bd5a43be90` |
| `C:\dev\demo-slatewell\.env.local` (dated 2026-06-29) | same hash | same hash |
| Builder transcript (`agent-aafee63721c4911c8.jsonl`): the only `sk_test_` / `pk_test_` values in it | same hash (1 distinct) | same hash (1 distinct) |

- The builder read `C:\dev\demo-slatewell\.env.local` (the main checkout)
  at 18:30:47Z, wrote those two values into the worktree's `.env.local` at
  18:36:24Z with a comment naming `C:\dev\_secrets\stripe_test_keys.local.txt`
  as the source (that file does not exist), ran its with-key check to
  `PASS ... (32 request(s))` at about 18:39Z, then deleted the file.
- That check ran `next start` on `localhost:3123` with no block on
  `api.stripe.com`, and it reached the card step, whose `useEffect` POSTs
  `/deposit-intent` on mount. **So the leaked `sk_test_` key almost certainly
  created at least one TEST PaymentIntent on the real Stripe account at about
  18:37 to 18:39Z.** That is an inference from the code path; the Stripe test
  dashboard can confirm it. The browser also loaded the real Stripe.js with
  the leaked `pk_test_` key. No live key appears anywhere.
- No key value is in the diff, and `.env.local` is gitignored and gone from
  the worktree.

**This run's own incident.** While computing those hashes, a PowerShell
helper named `H` collided with the built-in `h` alias for `Get-History`. The
call failed, and the error text echoed both full values (the `sk_test_` and
the `pk_test_` from the `.secrets` file and the same two from `.env.local`)
into this session's tool output. They are now in this session's transcript
on disk. The comparison was redone with a helper named `Get-ShortHash`,
which printed only hashes. The values are the same already-leaked TEST keys,
and none of them is in this report, any container, or any log this run
wrote.

**Copies to scrub after rotation** (recommendation; nothing was deleted):
`C:\Users\Drama\.secrets\demo_env_slatewell.local.txt` (replace with the
rotated keys), `C:\dev\demo-slatewell\.env.local`, the builder transcript
`C:\Users\Drama\.claude\projects\C--dev\c411ea0d-b7a5-4294-9c55-34d74f91e960\subagents\agent-aafee63721c4911c8.jsonl`,
and this run's transcript in the same `subagents` folder.
