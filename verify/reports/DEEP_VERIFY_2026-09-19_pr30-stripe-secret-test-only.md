# Deep Verify: PR #30 Stripe secret key TEST-only (2026-09-19)

Overall: PASS

Tested-SHA: acb11548b8f96709bffc9fbb4309b2685cc9d66a

(Added 2026-09-19 after the run, to meet the per-PR gate convention. The runtime
matrix ran on the PR head above. #30 was squash-merged onto #29 as `4d19760`.
`git patch-id --stable` of the merged change (`4253ee7..4d19760`) equals that of
the tested change (`merge-base..acb1154`): `429b71c0`. The #29 tree it sits on
(`4253ee7`) is byte-identical to the separately deep-verified #29 head `b01e073`.)

Every claim PR #30 makes held with evidence:
- the guard probe matched expectations on 10 of 10 values;
- the runtime harness passed 238 of 238 (HTTP matrix 187, headless 51);
- the repo's own assertions passed 33 of 33 (5 N/A, 2 SKIP);
- the combined #29 + #30 tree is green.

No request reached Stripe.

Two process findings come before the details:
1. **#30 merged before this deep verify finished.** The Ginkobaloba account
   squash-merged #29 at 06:45:25Z and #30 at 06:45:53Z. That was 2.5 minutes
   after this run built its image (06:43:09Z) and before any runtime evidence
   existed. The merged head was `acb1154`, the exact commit verified here, so
   the PASS applies to what shipped. It was not a gate on the merge.
2. **The Tier-3 gate is not per-PR.** CI "Deep Verify" passed on `acb1154` in
   4 seconds at 06:35Z. `verify/ci/deep_gate.sh` greps every
   `verify/reports/*.md` for a PASS marker, and PR #27's report already on
   `main` satisfies it. See Warnings.

Because the head branch was deleted on merge, this report is filed from a
follow-up branch off `main` (`4d19760`).

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-slatewell` PR #30, branch
  `fix/stripe-secret-test-only`, code under test at `acb1154`. Squash-merged
  to `main` as `4d19760`. `src/lib/stripe.ts` and
  `scripts/test-stripe-config.ts` are byte-identical between `acb1154` and
  `4d19760`. The rest of the difference is #29's files.
- **Why deep:** the PR gates the server-side Stripe secret key. Payment is
  Tier-3 (`verify/tier_map.yml` `booking-flow`, tier 3). Drew approved this
  run.
- **Mode:** deep (`paradigm-verify`), with these layers:
  - Layer 1 (code);
  - Layer 2 (runtime);
  - Layers 3 and 4 (network and headless Chromium);
  - Layer 6 (edge sweep plus the enable and settlement matrix).
- **Not run:**
  - Layer 5 (headed Chrome): a sibling agent was using the browser.
  - The adversarial generator.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC, not a human.
- **Environment:** one image, `demo-slatewell:dv30`, built locally from
  `acb1154` with `docker build --secret id=npmrc,...`. The npm ci layer came
  from cache; seed and `next build` ran fresh on this context. Nine throwaway
  containers ran from it. All used the runtime env file
  (`C:\Users\Drama\.secrets\demo_env_slatewell.local.txt`) with per-container
  overrides. The fake keys all carry a distinctive marker, so a single grep
  proves no key was echoed anywhere.

  | Container | Port | STRIPE_SECRET_KEY (prefix, length) | Publishable key | Expected |
  |---|---|---|---|---|
  | sktest | 127.0.0.1:18601 | fake `sk_test_`, 40 | env file `pk_test_` | Stripe ON (control) |
  | nosk | 127.0.0.1:18602 | empty, 0 | env file `pk_test_` | refused |
  | sklive | 127.0.0.1:18603 | fake `sk_live_`, 40 | env file `pk_test_` | refused, warn once |
  | rklive | 127.0.0.1:18604 | fake `rk_live_`, 40 | env file `pk_test_` | refused, warn once |
  | rktest | 127.0.0.1:18605 | fake `rk_test_`, 40 | env file `pk_test_` | refused, warn once |
  | ws | 127.0.0.1:18606 | whitespace only, raw 6 / trimmed 0 | env file `pk_test_` | treated as unset |
  | upper | 127.0.0.1:18607 | fake `SK_TEST_`, 40 | env file `pk_test_` | refused, warn once |
  | none | 127.0.0.1:18608 | empty, 0 | empty (both vars) | no keys at all |
  | pad | 127.0.0.1:18609 | fake `sk_test_` with surrounding spaces, raw 44 / trimmed 40 | env file `pk_test_` | Stripe ON (trim) |

  The publishable key was held at a valid `pk_test_` in every container but
  `none`. That leaves the secret key as the only variable, and a refused
  secret has to be what turns the card flow off. A probe inside each container
  confirmed the override by prefix and length only (evidence file `probe.log`).
  Docker kept the whitespace-only value, so `ws` is a distinct case and not a
  collapsed empty one.
- **No Stripe API calls, enforced three ways:**
  - every container ran with `--add-host api.stripe.com:127.0.0.1`, and a
    probe inside each resolved `api.stripe.com -> 127.0.0.1`;
  - every secret key was fake;
  - headless Chromium aborted every `*.stripe.com` request.

  The only server paths that try Stripe are the controls: `sktest` and `pad`
  deposit-intent, verify and settlement. They fail at DNS, which proves an
  attempt was made without any traffic leaving the host. No payment was
  submitted.
- No key value was printed at any point. Only prefixes, lengths and counts were
  recorded.
- The live `demo-slatewell` container, the public URL, the demo-proxy and
  `C:\dev\cloudflare-config` were not touched. The live container was still
  "Up 4 hours" at cleanup. All `dv30-*` containers and the `dv30` image were
  removed afterwards.

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| smoke | PASS | smoke.yml at the origin: 6 PASS, 5 N/A (3 HSTS edge-only, 2 admin edge-404 containment) |
| navigation | PASS | Headless wizard walks from Service to Review in all 9 containers; to confirmation in the 7 refused ones |
| data_crud | PASS | Bookings created by API and UI; DB read back `deposit_status`, `stripe_payment_intent_id`; settlement transitions (Released, Captured) |
| error_handling | PASS | 402/403/405/409/503 paths; 502 (not 500) when Stripe is unreachable on the controls |
| security (key exposure) | PASS | 0 `sk_`/`rk_` (any case) and 0 fake markers across `/`, `/book`, confirmation, cancel page, .ics, admin dashboard and rendered DOM, all 9 containers; 0 in `.next/static`; 0 key values in any container log |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge |
| performance | PASS (local) | home LCP 88 ms at the local origin, not a mobile or edge number |
| accessibility | SKIP | `axe_no_critical` (2 assertions): axe-core is not in the harness |
| mobile_responsive | PASS (partial) | Every headless check ran at 390x844 |
| auth_lifecycle | PASS | admin-session.yml at the origin; no-show and complete without the admin cookie return 401 |
| edge_cases | PASS | E block 16 of 16 on `sklive` and `rklive` |
| visual_regression | SKIP | No baseline exists |
| cross_browser | SKIP | Chromium only; the headed layer was not run |

### Layer 1: code

At `acb1154`:
- `npx tsx scripts/test-stripe-config.ts` printed `stripe-config: 29 passed,
  0 failed` and exited 0, as the PR claims (19 from #27 plus 10 new). The
  non-test warning printed exactly once for the whole suite, even though
  several refused values are exercised.
- `npx tsc --noEmit`: exit 0.
- `next lint`: 0 errors. Its one warning (`react-hooks/exhaustive-deps` at
  booking-wizard.tsx:146) predates this PR.
- `npx next build`: exit 0 with no compile warnings.
- `npx tsx scripts/test-deposits.ts` (keyless): "All 7 deposit tests passed".
- `.next/static`, both local and in the image, had 0 files matching
  `sk_(test|live)_`, `rk_(test|live)_` or `STRIPE_SECRET_KEY`. `/app/.next` and
  `server.js` in the image had 0 files carrying the fake marker.
- Callers of the guard:
  - `STRIPE_SECRET_KEY` is read in `src/` only by `src/lib/stripe.ts`.
  - `getStripe()` is reached only from `src/lib/deposits.ts`.
  - Every route that reaches `deposits.ts` is gated by
    `isStripeConfigured()` or `isDepositCardFlowEnabled()`: cancel, no-show,
    complete, bookings and deposit-intent.

### Guard probe (claim 2, per value, fresh process each)

A scratch script imported `src/lib/stripe.ts` in a fresh process per value,
because the warn-once flag is module-global. With a fake `pk_test_` set, each
run called `isStripeConfigured()`, `isDepositCardFlowEnabled()` and
`getStripe()` five times, and captured `console.error`. `leak` is true if the
key value or the fake marker appears in any error or warning text. Verbatim
output (it carries no key values):

```
unset    {"rawLen":0,"trimmedPrefix":"","secretAccepted":false,"secretIsTrimmed":null,"configured":[false],"cardFlow":[false],"clientOk":0,"throwCount":5,"throwMsgs":["STRIPE_SECRET_KEY is not set"],"warnCount":0,"otherErrLines":0,"leak":false}
empty    {"rawLen":0,"trimmedPrefix":"","secretAccepted":false,"secretIsTrimmed":null,"configured":[false],"cardFlow":[false],"clientOk":0,"throwCount":5,"throwMsgs":["STRIPE_SECRET_KEY is not set"],"warnCount":0,"otherErrLines":0,"leak":false}
ws       {"rawLen":6,"trimmedPrefix":"","secretAccepted":false,"secretIsTrimmed":null,"configured":[false],"cardFlow":[false],"clientOk":0,"throwCount":5,"throwMsgs":["STRIPE_SECRET_KEY is not set"],"warnCount":0,"otherErrLines":0,"leak":false}
sktest   {"rawLen":40,"trimmedPrefix":"sk_test_","secretAccepted":true,"secretIsTrimmed":true,"configured":[true],"cardFlow":[true],"clientOk":5,"throwCount":0,"throwMsgs":[],"warnCount":0,"otherErrLines":0,"leak":false}
pad      {"rawLen":44,"trimmedPrefix":"sk_test_","secretAccepted":true,"secretIsTrimmed":true,"configured":[true],"cardFlow":[true],"clientOk":5,"throwCount":0,"throwMsgs":[],"warnCount":0,"otherErrLines":0,"leak":false}
sklive   {"rawLen":40,"trimmedPrefix":"sk_live_","secretAccepted":false,"secretIsTrimmed":null,"configured":[false],"cardFlow":[false],"clientOk":0,"throwCount":5,"throwMsgs":["STRIPE_SECRET_KEY must be a Stripe TEST key (sk_test_). Live keys are refused."],"warnCount":1,"otherErrLines":0,"leak":false}
rklive   {"rawLen":40,"trimmedPrefix":"rk_live_","secretAccepted":false,"secretIsTrimmed":null,"configured":[false],"cardFlow":[false],"clientOk":0,"throwCount":5,"throwMsgs":["STRIPE_SECRET_KEY must be a Stripe TEST key (sk_test_). Live keys are refused."],"warnCount":1,"otherErrLines":0,"leak":false}
rktest   {"rawLen":40,"trimmedPrefix":"rk_test_","secretAccepted":false,"secretIsTrimmed":null,"configured":[false],"cardFlow":[false],"clientOk":0,"throwCount":5,"throwMsgs":["STRIPE_SECRET_KEY must be a Stripe TEST key (sk_test_). Live keys are refused."],"warnCount":1,"otherErrLines":0,"leak":false}
upper    {"rawLen":40,"trimmedPrefix":"SK_TEST_","secretAccepted":false,"secretIsTrimmed":null,"configured":[false],"cardFlow":[false],"clientOk":0,"throwCount":5,"throwMsgs":["STRIPE_SECRET_KEY must be a Stripe TEST key (sk_test_). Live keys are refused."],"warnCount":1,"otherErrLines":0,"leak":false}
pkslot   {"rawLen":19,"trimmedPrefix":"pk_test_","secretAccepted":false,"secretIsTrimmed":null,"configured":[false],"cardFlow":[false],"clientOk":0,"throwCount":5,"throwMsgs":["STRIPE_SECRET_KEY must be a Stripe TEST key (sk_test_). Live keys are refused."],"warnCount":1,"otherErrLines":0,"leak":false}
```

All 10 values matched expectations. Only `sk_test_` (and `sk_test_` with
padding, trimmed) is accepted.

For `sk_live_`, `rk_live_`, `rk_test_`, `SK_TEST_` and a publishable key in
the secret slot:
- `getStripe()` throws
  `STRIPE_SECRET_KEY must be a Stripe TEST key (sk_test_). Live keys are refused.`
  on every call;
- the warning fires exactly once per process across 5 rounds;
- nothing leaks.

Unset, empty and whitespace-only are treated as unset: `getStripe()` throws
`STRIPE_SECRET_KEY is not set` and no non-test warning is logged.

### Layer 2: runtime

- All 9 containers were `running` with `RestartCount=0` after the full sweep,
  and each still served `/` with 200 (R block).
- In the refused containers the only non-startup log line is the single
  `[stripe] ... is not a TEST key` warning. There were 0 other error lines.
- In the controls the only error lines were the expected settlement attempts
  that failed on the DNS block. They are counted by S-sktest-6 and S-pad-6.
- Redacted per-container logs are kept in the run dir (`container-logs/`), and
  0 of them contain the fake marker.

### Layers 3 and 4: network and headless (repo's own assertions)

These are `verify/smoke.yml`, `verify/assertions/home.yml` and
`verify/assertions/admin-session.yml`, run over HTTP plus headless Chromium at
390x844 against container `sklive`. `sklive` was chosen because it carries a
refused live key, so the admin and marketing surfaces were proven unaffected
by the guard.

```
PASS  smoke.home.status  / 200  [200]
PASS  home.text  "Booking that respects your customers"  []
PASS  home.text  "Wave Wellness"  []
PASS  home.text  "fewer no-shows with deposits on file"  []
PASS  home.text  "Wave Wellness, Tuesday"  []
N/A   smoke.home.hsts  Strict-Transport-Security (edge-only)  []
N/A   home.hsts  Strict-Transport-Security (edge-only)  []
PASS  smoke.booking-flow.status  /book/wave-wellness 200  [200]
PASS  smoke.booking-flow.text  "Wave Wellness"  []
N/A   smoke.booking-flow.hsts  Strict-Transport-Security (edge-only)  []
N/A   smoke.admin-session-post.404  edge 404 containment (origin is the app)  []
N/A   smoke.admin-unauthenticated.404  edge 404 containment (origin is the app)  []
PASS  smoke.portal-handoff.405  GET -> 405  [405]
PASS  origin.admin-session.GET  GET -> 405 at origin  [405]
PASS  admin-unauth.redirects_to  redirect to /?admin=required (path form)  [307 /?admin=required]
PASS  admin-session-post.303  POST -> 303  [303]
PASS  admin-session-post.set-cookie  set-cookie present  []
PASS  admin-signout.303  signout POST -> 303 /  [303 /]
PASS  home.selector  button[type='submit']  []
PASS  home.selector  footer  []
PASS  home.selector  #platform  []
PASS  home.selector  #capabilities  []
PASS  home.lcp  LCP < 2500 ms (local origin)  [88 ms]
PASS  home.no_console_errors  no console errors  []
SKIP  home.axe  axe_no_critical (axe not in harness)  []
PASS  admin-unauth.final  lands on /?admin=required  [/?admin=required]
PASS  admin-unauth.text  sign-in notice  []
PASS  admin-unauth.no_console_errors  no console errors  []
PASS  admin-dash.status  /admin 200 with cookie  [200]
PASS  admin-dash.text  "Dashboard"  []
PASS  admin-dash.text  "Revenue (completed)"  []
PASS  admin-dash.text  "Deposits held"  []
PASS  admin-dash.text  "Cancellation rate"  []
PASS  admin-dash.text  "Today"  []
PASS  admin-dash.text  "Week ahead"  []
PASS  admin-dash.text  "Wave Wellness"  []
PASS  admin-dash.h1  h1 present  []
PASS  admin-dash.no_console_errors  no console errors  []
SKIP  admin-dash.axe  axe_no_critical (axe not in harness)  []
PASS  admin-dash.no-secret  no sk_/rk_ or fake marker in admin dashboard DOM  [x0]
Tally: {"PASS":33,"FAIL":0,"N/A":5,"SKIP":2}
```

- `redirects_to` was checked as a path (`/?admin=required`) because the
  expected absolute URL is the public host.
- The two smoke.yml admin 404s describe the edge containment in the
  demo-proxy. They are N/A at the origin, and the origin behavior was checked
  instead.
- `sklive` still showed exactly 1 non-test warning after this pass, which
  added the admin dashboard and the session routes.

### Layer 5: headed

Not run. A sibling deep-verify agent was using the browser. See the coverage
gaps.

### Layer 6: edge cases and matrix (verbatim)

The first harness run scored 145 of 187. All 42 failures were harness defects,
not app defects:
- **Slot reuse:** the harness cached one availability list, so later bookings
  landed on slots that overlapped earlier ones and got a correct 409. This
  produced the M-*-6, S-*-0/4/5 and E-*-8 failures.
- **Over-broad log regex:** the check matched the literal text `(sk_test_)`
  inside the warning message itself. The fake-marker count was 0 in that run
  too.

Both were fixed: availability is fetched fresh for every booking, and log
scans look for a key value (prefix plus at least 4 alphanumerics). The
containers were then recreated so the warn-once counts cover one clean process
lifetime. The first run is kept as `matrix.run1-harness-bug.log`. Below is the
clean run, headless first, then HTTP.

Key to the blocks:
- **H:** headless Chromium.
- **M:** the enable matrix.
- **S:** settlement gating.
- **E:** the edge sweep on refused keys.
- **W:** warn-once and key-never-logged.
- **R:** runtime.

```
== H: headless Chromium (390x844), *.stripe.com aborted ==
PASS  H-sktest-1  sktest: wizard reaches Review for a deposit service  []
PASS  H-sktest-2  sktest: control: stepper has Payment, Review offers "Continue to deposit"  [Continue to deposit ($25)]
PASS  H-sktest-3  sktest: control: deposit step renders and requests deposit-intent (server 502, Stripe DNS-blocked)  [deposit-intent x1]
PASS  H-sktest-8  sktest: no console errors beyond Stripe aborts / expected 502  [other: ]
INFO  sktest: *.stripe.com requests aborted: 2; console errors total 3
PASS  H-pad-1  pad: wizard reaches Review for a deposit service  []
PASS  H-pad-2  pad: control: stepper has Payment, Review offers "Continue to deposit"  [Continue to deposit ($25)]
PASS  H-pad-3  pad: control: deposit step renders and requests deposit-intent (server 502, Stripe DNS-blocked)  [deposit-intent x1]
PASS  H-pad-8  pad: no console errors beyond Stripe aborts / expected 502  [other: ]
INFO  pad: *.stripe.com requests aborted: 2; console errors total 3
PASS  H-nosk-1  nosk: wizard reaches Review for a deposit service  []
PASS  H-nosk-2  nosk: Review skips Payment ("Confirm booking", no Payment step)  [Confirm booking | steps: Service / Staff / Time / Details / Review]
PASS  H-nosk-3  nosk: deposit booking completes in the UI to /confirmation/bk_...  [/book/wave-wellness/confirmation/bk_2b66af9a9f]
PASS  H-nosk-4  nosk: deposit-intent never requested; exactly 1 bookings POST  [di x0 posts x1]
PASS  H-nosk-5  nosk: no sk_/rk_ or fake marker in rendered confirmation DOM  [x0]
PASS  H-nosk-8  nosk: no console errors beyond Stripe aborts / expected 502  [other: ]
INFO  nosk: *.stripe.com requests aborted: 1; console errors total 1
PASS  H-sklive-1  sklive: wizard reaches Review for a deposit service  []
PASS  H-sklive-2  sklive: Review skips Payment ("Confirm booking", no Payment step)  [Confirm booking | steps: Service / Staff / Time / Details / Review]
PASS  H-sklive-3  sklive: deposit booking completes in the UI to /confirmation/bk_...  [/book/wave-wellness/confirmation/bk_15e51f0ba1]
PASS  H-sklive-4  sklive: deposit-intent never requested; exactly 1 bookings POST  [di x0 posts x1]
PASS  H-sklive-5  sklive: no sk_/rk_ or fake marker in rendered confirmation DOM  [x0]
PASS  H-sklive-8  sklive: no console errors beyond Stripe aborts / expected 502  [other: ]
INFO  sklive: *.stripe.com requests aborted: 1; console errors total 1
PASS  H-rklive-1  rklive: wizard reaches Review for a deposit service  []
PASS  H-rklive-2  rklive: Review skips Payment ("Confirm booking", no Payment step)  [Confirm booking | steps: Service / Staff / Time / Details / Review]
PASS  H-rklive-3  rklive: deposit booking completes in the UI to /confirmation/bk_...  [/book/wave-wellness/confirmation/bk_d31a7b4157]
PASS  H-rklive-4  rklive: deposit-intent never requested; exactly 1 bookings POST  [di x0 posts x1]
PASS  H-rklive-5  rklive: no sk_/rk_ or fake marker in rendered confirmation DOM  [x0]
PASS  H-rklive-8  rklive: no console errors beyond Stripe aborts / expected 502  [other: ]
INFO  rklive: *.stripe.com requests aborted: 1; console errors total 1
PASS  H-rktest-1  rktest: wizard reaches Review for a deposit service  []
PASS  H-rktest-2  rktest: Review skips Payment ("Confirm booking", no Payment step)  [Confirm booking | steps: Service / Staff / Time / Details / Review]
PASS  H-rktest-3  rktest: deposit booking completes in the UI to /confirmation/bk_...  [/book/wave-wellness/confirmation/bk_a40dbf31f8]
PASS  H-rktest-4  rktest: deposit-intent never requested; exactly 1 bookings POST  [di x0 posts x1]
PASS  H-rktest-5  rktest: no sk_/rk_ or fake marker in rendered confirmation DOM  [x0]
PASS  H-rktest-8  rktest: no console errors beyond Stripe aborts / expected 502  [other: ]
INFO  rktest: *.stripe.com requests aborted: 1; console errors total 1
PASS  H-ws-1  ws: wizard reaches Review for a deposit service  []
PASS  H-ws-2  ws: Review skips Payment ("Confirm booking", no Payment step)  [Confirm booking | steps: Service / Staff / Time / Details / Review]
PASS  H-ws-3  ws: deposit booking completes in the UI to /confirmation/bk_...  [/book/wave-wellness/confirmation/bk_4d228cd289]
PASS  H-ws-4  ws: deposit-intent never requested; exactly 1 bookings POST  [di x0 posts x1]
PASS  H-ws-5  ws: no sk_/rk_ or fake marker in rendered confirmation DOM  [x0]
PASS  H-ws-8  ws: no console errors beyond Stripe aborts / expected 502  [other: ]
INFO  ws: *.stripe.com requests aborted: 1; console errors total 1
PASS  H-upper-1  upper: wizard reaches Review for a deposit service  []
PASS  H-upper-2  upper: Review skips Payment ("Confirm booking", no Payment step)  [Confirm booking | steps: Service / Staff / Time / Details / Review]
PASS  H-upper-3  upper: deposit booking completes in the UI to /confirmation/bk_...  [/book/wave-wellness/confirmation/bk_93c14a70db]
PASS  H-upper-4  upper: deposit-intent never requested; exactly 1 bookings POST  [di x0 posts x1]
PASS  H-upper-5  upper: no sk_/rk_ or fake marker in rendered confirmation DOM  [x0]
PASS  H-upper-8  upper: no console errors beyond Stripe aborts / expected 502  [other: ]
INFO  upper: *.stripe.com requests aborted: 1; console errors total 1
PASS  H-none-1  none: wizard reaches Review for a deposit service  []
PASS  H-none-2  none: Review skips Payment ("Confirm booking", no Payment step)  [Confirm booking | steps: Service / Staff / Time / Details / Review]
PASS  H-none-3  none: deposit booking completes in the UI to /confirmation/bk_...  [/book/wave-wellness/confirmation/bk_cd197c419c]
PASS  H-none-4  none: deposit-intent never requested; exactly 1 bookings POST  [di x0 posts x1]
PASS  H-none-5  none: no sk_/rk_ or fake marker in rendered confirmation DOM  [x0]
PASS  H-none-6  none: customer cancels the booking in the UI (deposit released)  [slatewell Your appointment is cancelled Signature Facial (60 min) on Thursday, ]
PASS  H-none-8  none: no console errors beyond Stripe aborts / expected 502  [other: ]
INFO  none: *.stripe.com requests aborted: 1; console errors total 1

TOTAL 51/51 passed

== M: enable matrix (per container) ==
PASS  M-sktest-1  sktest: /book 200  [200]
PASS  M-sktest-2  sktest: pk_test_ in /book payload >=1 (flow ON)  [pk_test_ x1]
PASS  M-sktest-3  sktest: no sk_/rk_ (any case) and no fake marker in /book payload  [sk/rk x0 mark x0]
PASS  M-sktest-4  sktest: deposit-intent -> 502 (Stripe attempted, DNS-blocked)  [502 {"error":"Could not start the deposit. Please try again."}]
PASS  M-sktest-5  sktest: deposit booking without PI -> 402  [402]
PASS  M-sktest-6  sktest: deposit booking with client PI -> 402 (verify attempted, DNS-blocked)  [402]
PASS  M-sktest-7  sktest: no-deposit booking -> 201  [201]
PASS  M-sktest-8  sktest: no sk_/rk_ or fake marker on / , confirmation, cancel page, ics  [conf 200 home 200 cancel 200 ics 200 sk x0 mark x0]
PASS  M-pad-1  pad: /book 200  [200]
PASS  M-pad-2  pad: pk_test_ in /book payload >=1 (flow ON)  [pk_test_ x1]
PASS  M-pad-3  pad: no sk_/rk_ (any case) and no fake marker in /book payload  [sk/rk x0 mark x0]
PASS  M-pad-4  pad: deposit-intent -> 502 (Stripe attempted, DNS-blocked)  [502 {"error":"Could not start the deposit. Please try again."}]
PASS  M-pad-5  pad: deposit booking without PI -> 402  [402]
PASS  M-pad-6  pad: deposit booking with client PI -> 402 (verify attempted, DNS-blocked)  [402]
PASS  M-pad-7  pad: no-deposit booking -> 201  [201]
PASS  M-pad-8  pad: no sk_/rk_ or fake marker on / , confirmation, cancel page, ics  [conf 200 home 200 cancel 200 ics 200 sk x0 mark x0]
PASS  M-nosk-1  nosk: /book 200  [200]
PASS  M-nosk-2  nosk: pk_test_ in /book payload == 0 (flow off)  [pk_test_ x0]
PASS  M-nosk-3  nosk: no sk_/rk_ (any case) and no fake marker in /book payload  [sk/rk x0 mark x0]
PASS  M-nosk-4  nosk: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-nosk-5  nosk: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-nosk-6  nosk: client-supplied PI ignored, not verified, not stored -> 201  [201 deposit_status=Held pi=null]
PASS  M-nosk-7  nosk: no-deposit booking -> 201  [201]
PASS  M-nosk-8  nosk: no sk_/rk_ or fake marker on / , confirmation, cancel page, ics  [conf 200 home 200 cancel 200 ics 200 sk x0 mark x0]
PASS  M-sklive-1  sklive: /book 200  [200]
PASS  M-sklive-2  sklive: pk_test_ in /book payload == 0 (flow off)  [pk_test_ x0]
PASS  M-sklive-3  sklive: no sk_/rk_ (any case) and no fake marker in /book payload  [sk/rk x0 mark x0]
PASS  M-sklive-4  sklive: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-sklive-5  sklive: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-sklive-6  sklive: client-supplied PI ignored, not verified, not stored -> 201  [201 deposit_status=Held pi=null]
PASS  M-sklive-7  sklive: no-deposit booking -> 201  [201]
PASS  M-sklive-8  sklive: no sk_/rk_ or fake marker on / , confirmation, cancel page, ics  [conf 200 home 200 cancel 200 ics 200 sk x0 mark x0]
PASS  M-rklive-1  rklive: /book 200  [200]
PASS  M-rklive-2  rklive: pk_test_ in /book payload == 0 (flow off)  [pk_test_ x0]
PASS  M-rklive-3  rklive: no sk_/rk_ (any case) and no fake marker in /book payload  [sk/rk x0 mark x0]
PASS  M-rklive-4  rklive: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-rklive-5  rklive: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-rklive-6  rklive: client-supplied PI ignored, not verified, not stored -> 201  [201 deposit_status=Held pi=null]
PASS  M-rklive-7  rklive: no-deposit booking -> 201  [201]
PASS  M-rklive-8  rklive: no sk_/rk_ or fake marker on / , confirmation, cancel page, ics  [conf 200 home 200 cancel 200 ics 200 sk x0 mark x0]
PASS  M-rktest-1  rktest: /book 200  [200]
PASS  M-rktest-2  rktest: pk_test_ in /book payload == 0 (flow off)  [pk_test_ x0]
PASS  M-rktest-3  rktest: no sk_/rk_ (any case) and no fake marker in /book payload  [sk/rk x0 mark x0]
PASS  M-rktest-4  rktest: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-rktest-5  rktest: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-rktest-6  rktest: client-supplied PI ignored, not verified, not stored -> 201  [201 deposit_status=Held pi=null]
PASS  M-rktest-7  rktest: no-deposit booking -> 201  [201]
PASS  M-rktest-8  rktest: no sk_/rk_ or fake marker on / , confirmation, cancel page, ics  [conf 200 home 200 cancel 200 ics 200 sk x0 mark x0]
PASS  M-ws-1  ws: /book 200  [200]
PASS  M-ws-2  ws: pk_test_ in /book payload == 0 (flow off)  [pk_test_ x0]
PASS  M-ws-3  ws: no sk_/rk_ (any case) and no fake marker in /book payload  [sk/rk x0 mark x0]
PASS  M-ws-4  ws: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-ws-5  ws: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-ws-6  ws: client-supplied PI ignored, not verified, not stored -> 201  [201 deposit_status=Held pi=null]
PASS  M-ws-7  ws: no-deposit booking -> 201  [201]
PASS  M-ws-8  ws: no sk_/rk_ or fake marker on / , confirmation, cancel page, ics  [conf 200 home 200 cancel 200 ics 200 sk x0 mark x0]
PASS  M-upper-1  upper: /book 200  [200]
PASS  M-upper-2  upper: pk_test_ in /book payload == 0 (flow off)  [pk_test_ x0]
PASS  M-upper-3  upper: no sk_/rk_ (any case) and no fake marker in /book payload  [sk/rk x0 mark x0]
PASS  M-upper-4  upper: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-upper-5  upper: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-upper-6  upper: client-supplied PI ignored, not verified, not stored -> 201  [201 deposit_status=Held pi=null]
PASS  M-upper-7  upper: no-deposit booking -> 201  [201]
PASS  M-upper-8  upper: no sk_/rk_ or fake marker on / , confirmation, cancel page, ics  [conf 200 home 200 cancel 200 ics 200 sk x0 mark x0]
PASS  M-none-1  none: /book 200  [200]
PASS  M-none-2  none: pk_test_ in /book payload == 0 (flow off)  [pk_test_ x0]
PASS  M-none-3  none: no sk_/rk_ (any case) and no fake marker in /book payload  [sk/rk x0 mark x0]
PASS  M-none-4  none: deposit-intent -> 503 (flow disabled)  [503 {"error":"Card deposits are not available right now."}]
PASS  M-none-5  none: deposit booking falls back to policy-only hold -> 201  [201 deposit_status=Held pi=null]
PASS  M-none-6  none: client-supplied PI ignored, not verified, not stored -> 201  [201 deposit_status=Held pi=null]
PASS  M-none-7  none: no-deposit booking -> 201  [201]
PASS  M-none-8  none: no sk_/rk_ or fake marker on / , confirmation, cancel page, ics  [conf 200 home 200 cancel 200 ics 200 sk x0 mark x0]

== S: settlement makes no Stripe attempt with a refused key ==
PASS  S-sktest-0  sktest: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-sktest-1  sktest: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-sktest-2  sktest: no-show without admin cookie -> 401  [401]
PASS  S-sktest-3  sktest: admin session mints cookie  [303]
PASS  S-sktest-4  sktest: admin no-show -> 200 Captured  [200 Captured]
PASS  S-sktest-5  sktest: admin complete -> 200 Captured  [200 Captured]
PASS  S-sktest-6  sktest: settlement DOES try Stripe (control) -- blocked at DNS  [settlement attempts logged: 3]
PASS  S-sktest-7  sktest: getStripe() never reached (0 refused-key throws in log)  [throw lines x0]
PASS  S-pad-0  pad: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-pad-1  pad: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-pad-2  pad: no-show without admin cookie -> 401  [401]
PASS  S-pad-3  pad: admin session mints cookie  [303]
PASS  S-pad-4  pad: admin no-show -> 200 Captured  [200 Captured]
PASS  S-pad-5  pad: admin complete -> 200 Captured  [200 Captured]
PASS  S-pad-6  pad: settlement DOES try Stripe (control) -- blocked at DNS  [settlement attempts logged: 3]
PASS  S-pad-7  pad: getStripe() never reached (0 refused-key throws in log)  [throw lines x0]
PASS  S-nosk-0  nosk: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-nosk-1  nosk: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-nosk-2  nosk: no-show without admin cookie -> 401  [401]
PASS  S-nosk-3  nosk: admin session mints cookie  [303]
PASS  S-nosk-4  nosk: admin no-show -> 200 Captured  [200 Captured]
PASS  S-nosk-5  nosk: admin complete -> 200 Captured  [200 Captured]
PASS  S-nosk-6  nosk: settlement makes NO Stripe attempt  [settlement attempts logged: 0]
PASS  S-nosk-7  nosk: getStripe() never reached (0 refused-key throws in log)  [throw lines x0]
PASS  S-sklive-0  sklive: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-sklive-1  sklive: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-sklive-2  sklive: no-show without admin cookie -> 401  [401]
PASS  S-sklive-3  sklive: admin session mints cookie  [303]
PASS  S-sklive-4  sklive: admin no-show -> 200 Captured  [200 Captured]
PASS  S-sklive-5  sklive: admin complete -> 200 Captured  [200 Captured]
PASS  S-sklive-6  sklive: settlement makes NO Stripe attempt  [settlement attempts logged: 0]
PASS  S-sklive-7  sklive: getStripe() never reached (0 refused-key throws in log)  [throw lines x0]
PASS  S-rklive-0  rklive: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-rklive-1  rklive: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-rklive-2  rklive: no-show without admin cookie -> 401  [401]
PASS  S-rklive-3  rklive: admin session mints cookie  [303]
PASS  S-rklive-4  rklive: admin no-show -> 200 Captured  [200 Captured]
PASS  S-rklive-5  rklive: admin complete -> 200 Captured  [200 Captured]
PASS  S-rklive-6  rklive: settlement makes NO Stripe attempt  [settlement attempts logged: 0]
PASS  S-rklive-7  rklive: getStripe() never reached (0 refused-key throws in log)  [throw lines x0]
PASS  S-rktest-0  rktest: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-rktest-1  rktest: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-rktest-2  rktest: no-show without admin cookie -> 401  [401]
PASS  S-rktest-3  rktest: admin session mints cookie  [303]
PASS  S-rktest-4  rktest: admin no-show -> 200 Captured  [200 Captured]
PASS  S-rktest-5  rktest: admin complete -> 200 Captured  [200 Captured]
PASS  S-rktest-6  rktest: settlement makes NO Stripe attempt  [settlement attempts logged: 0]
PASS  S-rktest-7  rktest: getStripe() never reached (0 refused-key throws in log)  [throw lines x0]
PASS  S-ws-0  ws: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-ws-1  ws: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-ws-2  ws: no-show without admin cookie -> 401  [401]
PASS  S-ws-3  ws: admin session mints cookie  [303]
PASS  S-ws-4  ws: admin no-show -> 200 Captured  [200 Captured]
PASS  S-ws-5  ws: admin complete -> 200 Captured  [200 Captured]
PASS  S-ws-6  ws: settlement makes NO Stripe attempt  [settlement attempts logged: 0]
PASS  S-ws-7  ws: getStripe() never reached (0 refused-key throws in log)  [throw lines x0]
PASS  S-upper-0  upper: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-upper-1  upper: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-upper-2  upper: no-show without admin cookie -> 401  [401]
PASS  S-upper-3  upper: admin session mints cookie  [303]
PASS  S-upper-4  upper: admin no-show -> 200 Captured  [200 Captured]
PASS  S-upper-5  upper: admin complete -> 200 Captured  [200 Captured]
PASS  S-upper-6  upper: settlement makes NO Stripe attempt  [settlement attempts logged: 0]
PASS  S-upper-7  upper: getStripe() never reached (0 refused-key throws in log)  [throw lines x0]
PASS  S-none-0  none: 3 future Held bookings tagged with fake non-mock PI ids  [3]
PASS  S-none-1  none: customer cancel inside free window -> 200 Released  [200 Released]
PASS  S-none-2  none: no-show without admin cookie -> 401  [401]
PASS  S-none-3  none: admin session mints cookie  [303]
PASS  S-none-4  none: admin no-show -> 200 Captured  [200 Captured]
PASS  S-none-5  none: admin complete -> 200 Captured  [200 Captured]
PASS  S-none-6  none: settlement makes NO Stripe attempt  [settlement attempts logged: 0]
PASS  S-none-7  none: getStripe() never reached (0 refused-key throws in log)  [throw lines x0]

== E: edge sweep on refused keys ==
PASS  E-sklive-1  sklive: deposit-intent garbage body -> 503 (gate runs before parsing)  [503 {"error":"Card deposits are not available right now."}]
PASS  E-sklive-2  sklive: deposit-intent GET -> 405  [405]
PASS  E-sklive-3  sklive: 20 concurrent deposit-intent -> all 503  [503]
PASS  E-sklive-4  sklive: 255-char client PI -> 201, PI not stored  [201]
PASS  E-sklive-5  sklive: same slot twice -> 409 (slot race still enforced without Stripe)  [409]
PASS  E-sklive-6  sklive: cancel with wrong token -> 403  [403]
PASS  E-sklive-7  sklive: complete without admin cookie -> 401  [401]
PASS  E-sklive-8  sklive: pi_mock_ client PI -> 201, not stored  [201]
PASS  E-rklive-1  rklive: deposit-intent garbage body -> 503 (gate runs before parsing)  [503 {"error":"Card deposits are not available right now."}]
PASS  E-rklive-2  rklive: deposit-intent GET -> 405  [405]
PASS  E-rklive-3  rklive: 20 concurrent deposit-intent -> all 503  [503]
PASS  E-rklive-4  rklive: 255-char client PI -> 201, PI not stored  [201]
PASS  E-rklive-5  rklive: same slot twice -> 409 (slot race still enforced without Stripe)  [409]
PASS  E-rklive-6  rklive: cancel with wrong token -> 403  [403]
PASS  E-rklive-7  rklive: complete without admin cookie -> 401  [401]
PASS  E-rklive-8  rklive: pi_mock_ client PI -> 201, not stored  [201]

== W: non-test warning logged once, key never logged ==
PASS  W-sktest-1  sktest: non-test warning count == 0 after full sweep  [warn x0]
PASS  W-sktest-2  sktest: no sk_/rk_ key value (prefix + 4 alnum) or fake marker in container log  [sk/rk x0 mark x0]
PASS  W-pad-1  pad: non-test warning count == 0 after full sweep  [warn x0]
PASS  W-pad-2  pad: no sk_/rk_ key value (prefix + 4 alnum) or fake marker in container log  [sk/rk x0 mark x0]
PASS  W-nosk-1  nosk: non-test warning count == 0 after full sweep  [warn x0]
PASS  W-nosk-2  nosk: no sk_/rk_ key value (prefix + 4 alnum) or fake marker in container log  [sk/rk x0 mark x0]
PASS  W-sklive-1  sklive: non-test warning count == 1 after full sweep  [warn x1]
PASS  W-sklive-2  sklive: no sk_/rk_ key value (prefix + 4 alnum) or fake marker in container log  [sk/rk x0 mark x0]
PASS  W-rklive-1  rklive: non-test warning count == 1 after full sweep  [warn x1]
PASS  W-rklive-2  rklive: no sk_/rk_ key value (prefix + 4 alnum) or fake marker in container log  [sk/rk x0 mark x0]
PASS  W-rktest-1  rktest: non-test warning count == 1 after full sweep  [warn x1]
PASS  W-rktest-2  rktest: no sk_/rk_ key value (prefix + 4 alnum) or fake marker in container log  [sk/rk x0 mark x0]
PASS  W-ws-1  ws: non-test warning count == 0 after full sweep  [warn x0]
PASS  W-ws-2  ws: no sk_/rk_ key value (prefix + 4 alnum) or fake marker in container log  [sk/rk x0 mark x0]
PASS  W-upper-1  upper: non-test warning count == 1 after full sweep  [warn x1]
PASS  W-upper-2  upper: no sk_/rk_ key value (prefix + 4 alnum) or fake marker in container log  [sk/rk x0 mark x0]
PASS  W-none-1  none: non-test warning count == 0 after full sweep  [warn x0]
PASS  W-none-2  none: no sk_/rk_ key value (prefix + 4 alnum) or fake marker in container log  [sk/rk x0 mark x0]

== R: runtime ==
PASS  R-sktest  sktest: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected xn/a(control)]
PASS  R-pad  pad: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected xn/a(control)]
PASS  R-nosk  nosk: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected x0]
PASS  R-sklive  sklive: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected x0]
PASS  R-rklive  rklive: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected x0]
PASS  R-rktest  rktest: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected x0]
PASS  R-ws  ws: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected x0]
PASS  R-upper  upper: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected x0]
PASS  R-none  none: running, 0 restarts, still serves /, no unexpected error lines  [running 0; / 200; unexpected x0]

TOTAL 187/187 passed

TOTAL 238/238 passed (H 51/51 + M/S/E/W/R 187/187)
```

The INFO lines show one aborted `*.stripe.com` request in every refused
container. That request is `js.stripe.com/basil/stripe.js`, which the page
loads even with the card flow off (see Warnings). It is not a secret-key
path.

The curated categories covered are:
- **Missing and empty inputs:** no key, empty key, whitespace key, a garbage
  deposit-intent body.
- **max_inputs:** a 255-character client PaymentIntent id.
- **special_chars and case:** `SK_TEST_`, padded `sk_test_`, a publishable
  key in the secret slot.
- **race_conditions:** 20 concurrent deposit-intents on a refused key, and the
  same slot booked twice.
- **denied_permissions:** no-show and complete without the admin cookie, and
  cancel with a wrong token.
- **Tampering:** a client-supplied PaymentIntent id (`pi_...` and `pi_mock_`)
  on a refused key is ignored. It is not verified and not stored (M-*-6,
  E-*-4, E-*-8).

slow_network and auth_navigation have no surface in this PR.

### Merge-order check (#29 then #30)

- **The dispatcher's premise was wrong.** #29
  (`fix/signed-admin-visitor-scope`) does **not** touch `src/lib/stripe.ts`:
  `git diff origin/main...origin/fix/signed-admin-visitor-scope --
  src/lib/stripe.ts` is empty. The PR body's "Stripe-free on purpose, either
  order" was correct.
- #29 does touch three routes that call the guard: no-show, complete and
  bookings. Its diff keeps the `isStripeConfigured()` settlement gates and the
  `isDepositCardFlowEnabled()` booking gate unchanged, and it adds signed
  sessions and visitor scope around them.
- **Throwaway merge:** a local branch `tmp/dv30-merge30` (never pushed) was
  created in a scratch worktree off `origin/main`. It merged
  `origin/fix/signed-admin-visitor-scope`, then
  `origin/fix/stripe-secret-test-only`. Both merges were clean with the `ort`
  strategy and **no conflicts**.
- By the time of this check `origin/main` had already advanced to `4d19760`
  (#29 then #30). The throwaway merge tree was **identical** to `4d19760`
  (0-line diff). So the order held, and the combined tree is what is on
  `main` now.
- Combined tree results:
  - `test-stripe-config.ts`: 29 passed, 0 failed.
  - `tsc --noEmit`: exit 0.
  - `next lint`: 0 errors, the same pre-existing warning.
  - `next build`: exit 0.
- The combined build prints one new "Compiled with warnings". jose's
  `deflate.js` uses `CompressionStream`, which the Edge Runtime does not
  support, and the import trace comes from #29's middleware and admin session
  code. The PR #30 build alone had no such warning.
- The throwaway worktree and branch were deleted afterwards.

## 3. Theater Check

| PR #30 claimed | Verification found | Verdict |
|---|---|---|
| `getStripeSecretKey()` returns the trimmed key only if it starts with `sk_test_`, else null | Guard probe: accepted only for `sk_test_` and padded `sk_test_` (trimmed, 44 to 40); null for unset, empty, whitespace, `sk_live_`, `rk_live_`, `rk_test_`, `SK_TEST_`, `pk_test_` | CONFIRMED |
| A non-test key is logged once, without the key | Probe: warnCount 1 over 5 rounds per refused value, leak false. Runtime: exactly 1 warning line in sklive, rklive, rktest, upper after the full sweep plus the admin walk; 0 in nosk, ws, none, sktest, pad; 0 key values or fake markers in any log (W block) | CONFIRMED |
| `isStripeConfigured()` uses it, so a live key falls back to policy-only holds | All 7 refused containers: deposit booking 201 with `deposit_status=Held`, PaymentIntent null (M-*-5); the UI completes a deposit booking with no Payment step (H-*-2/3/4) | CONFIRMED |
| Settlement skips Stripe with a refused key | S block: 3 Held bookings tagged with fake non-mock PI ids; cancel, admin no-show and admin complete returned 200 with correct DB outcomes; 0 settlement attempts in all 7 refused containers versus 3 in each control | CONFIRMED |
| The card step stays off (`isDepositCardFlowEnabled` false) with a live secret and a valid `pk_test_` | Refused containers: 0 `pk_test_` in the page, Review shows "Confirm booking", deposit-intent returns 503 and is never requested by the UI | CONFIRMED |
| `getStripe()` throws a clear error for a non-test key that does not echo the key | Probe: the exact message for every refused non-empty value, with no leak. At runtime `getStripe()` is never reached with a refused key (S-*-7: 0 throw lines), because the gates stop earlier | CONFIRMED (unit level; unreachable at runtime by design) |
| The client is memoized per key | `getStripe()` returned a client on 5 of 5 calls for `sk_test_`; the memo code is per-key. A key change inside one process was not exercised at runtime | CONFIRMED (code read plus probe), key-rotation path NOT VERIFIED at runtime |
| No other files change | `git diff 36c89fc...acb1154 --stat` (pre-merge `main`): 2 files (`src/lib/stripe.ts`, `scripts/test-stripe-config.ts`) | CONFIRMED |
| 29 passed, 0 failed; test-deposits 7/7; tsc clean; lint only the existing warning; build succeeds | Reproduced exactly at `acb1154` | CONFIRMED |
| Independent of #29; can merge in either order | #29 does not touch `stripe.ts`; the #29-then-#30 merge was clean and equals `main`; the combined tree is green. The #30-then-#29 order was not tried because both had merged | CONFIRMED for the order that happened |
| (Brief) No sk_/rk_ in any page payload | 0 across book, home, confirmation, cancel, .ics, admin dashboard and the rendered DOM in all containers, plus `.next/static` | CONFIRMED |
| (Brief) Fail-safe with no key at all: the full booking flow works end to end | `none`: API deposit and no-deposit bookings 201; the UI wizard completes a deposit-service booking to `/confirmation/bk_...` with 0 deposit-intent requests; the UI cancel lands `Cancelled / Released / PaymentIntent null` in the DB; settlement 200 with 0 Stripe attempts | CONFIRMED |

## 4. Blockers

None for the code in PR #30.

## 5. Warnings

### Process: merged before the deep verify completed, and the gate cannot tell

- #30 merged at 06:45:53Z. This run's image was built at 06:43:09Z, and the
  matrix evidence came after the merge. The Tier-3 rule (deep verify before
  merge) was not met in sequence, though the verified commit is the merged
  one.
- CI "Deep Verify (tier-3 PRs only)" passed on `acb1154` in 4 s at 06:35Z.
  `verify/ci/deep_gate.sh` greps **every** `verify/reports/*.md` for
  `overall: pass`, and
  `DEEP_VERIFY_2026-09-18_pr27-stripe-pk-runtime.md` is on `main` with
  `Overall: PASS`. Every tier-3 PR in this repo therefore passes the gate with
  no report of its own.
- **Recommended follow-up (not done here):** make the gate require a report
  that names the PR number or head SHA. For example, match
  `pr${PR_NUMBER}` in the filename, or grep the report for
  `${{ github.event.pull_request.head.sha }}` (short form). Also consider
  ordering: the report commit changes the head SHA, so match on PR number.

### Minor, not blocking

- The refusal message says "Live keys are refused." for every refused value,
  including `rk_test_`, `SK_TEST_` and a publishable key in the secret slot.
  Those are not live keys. The first sentence ("must be a Stripe TEST key
  (sk_test_)") is accurate, so this is wording only.
- `rk_test_` (a restricted TEST key) is refused. That matches "only
  `sk_test_`" and is the conservative choice. If anyone later supplies a
  restricted test key, Stripe turns off quietly (one log line, and bookings
  fall back to policy-only holds).
- With the card flow off, `/book` still loads `js.stripe.com/basil/stripe.js`
  (1 request per page load in every refused container). This is the
  side-effect import of `@stripe/stripe-js` in `src/lib/stripe-client.ts`. It
  predates #30 and exposes no secret, but it sends a third-party script and
  telemetry for no purpose. `@stripe/stripe-js/pure` would load it lazily.
- The combined `main` build has a new jose `CompressionStream` Edge Runtime
  warning. It is attributable to #29's middleware and admin session code, not
  to #30. It is harmless unless the middleware actually reaches that code
  path; worth checking in #29's own verify.
- The brief says Drew has no Stripe key, but the runtime env file holds
  `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` values with `sk_test_` and
  `pk_test_` prefixes, 107 characters each (the length of real Stripe keys).
  These were overridden in every container here and never used.
  - If they are real TEST keys, the live demo keeps working in Stripe test
    mode after #30 deploys.
  - If they are dead or placeholder keys, the live card step will 502 on
    deposit-intent.

  Either way #30 does not change that. It only refuses non-test keys.

### Coverage gaps (stated so the PASS is not overclaimed)

- **The runtime matrix ran on the PR head `acb1154`, not on `main`
  `4d19760`.** The guard code is identical. The settlement and booking routes
  on `main` also carry #29's signed-session and visitor-scope changes. Those
  were verified by diff reading and by a green combined build and unit suite,
  but not by a runtime settlement run: this run was limited to one image, and
  #29's signed admin sessions would need a different harness.
- Settlement was proven *gated* (attempted or not), not *successful*, because
  api.stripe.com was pinned to localhost. A real `sk_test_` hold, capture and
  release lifecycle was not exercised, and no Stripe account was used.
- The headed Chrome layer (5) was not run because a sibling agent held the
  browser. The adversarial generator was not run. Coverage is Chromium only.
  axe was skipped. HSTS is not observable at the local origin.
- Rotating the key inside a running process (the per-key memo) was not
  exercised at runtime.
- The deploy state of the live demo was not checked beyond "container still
  up". Whether `main` has been rebuilt and redeployed is out of scope.

## 6. Run artifacts

Run dir (scratch, not in the repo):
`C:\Users\Drama\AppData\Local\Temp\claude\C--dev\c411ea0d-b7a5-4294-9c55-34d74f91e960\scratchpad\verify-runs\pr30-deep\`.

It contains:
- `build.log`
- `l1-*.log`
- `guard-probe.ts` and `guard-probe.log`
- `probe.log`
- `headless.mjs` and `headless.log`
- `matrix.mjs` and `matrix.log`
- `matrix.run1-harness-bug.log`
- `assertions.mjs` and `assertions.log`
- `merge-*.log`
- `container-logs/*.log` (key values redacted; none present)
