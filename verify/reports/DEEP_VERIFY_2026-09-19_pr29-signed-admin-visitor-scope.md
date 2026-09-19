# Deep Verify: PR #29 signed admin sessions, per-visitor scope, visitor data expiry (2026-09-19)

Overall: PASS
Tested-SHA: b01e07383d505576175a9cac1d2886dea5646b62

Every claim this run was asked to prove held, with evidence: 153 of 153
harness checks passed. The repo's own assertions passed 34 of 34 (5 N/A, 2
SKIP). The PR's own test suites reproduced their stated counts exactly. The
PR's two-browser e2e reproduced 18 of 19 against the container, and the 19th
is a harness cookie artifact (the app behavior was confirmed by two other
checks, see Layer 4). This PASS comes with two process findings that matter
more than any single check:

- **#29 was merged at 2026-09-19 06:45:25Z, before this deep verify
  finished.** The Tier-3 gate on the PR went green at 06:35:47Z by matching
  the unrelated PR #27 report (see Warning 1). The code verified here is
  byte-identical to what landed on `main`.
- **The Deep Verify CI gate cannot tell one PR's report from another's.**

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-slatewell` PR #29, branch
  `fix/signed-admin-visitor-scope`, head `b01e073`
  (`b01e07383d505576175a9cac1d2886dea5646b62`).
- **Merge status:** merged by Drew at 2026-09-19T06:45:25Z as squash commit
  `4253ee7`. `delete_branch_on_merge` then removed the branch. PR #30
  (`4d19760`, the `sk_test_` guard) landed 28 s later.
- **Does the merge match what was verified? Yes.** Both
  `git rev-parse b01e073^{tree}` and `4253ee7^{tree}` return
  `50270e6f14771efafa88223431817d0f94867a0e`. This report verifies the
  exact tree that is on `main` at `4253ee7`. It does not cover #30, which
  has its own report (PR #31).
- **Where this report lives:** the PR branch no longer exists, so this report
  is committed on `chore/verify-report-pr29-deep` off `origin/main`
  (`4d19760`) and changes only `verify/reports/`.
- **Why deep:** the PR changes authentication and authorization for the
  admin area, the Portal handoff and visitor PII handling. The `tier-3`
  label is on the PR. `verify/tier_map.yml` lists `admin-session-post`,
  `admin-unauthenticated` and `portal-handoff-endpoint` as tier 3.
- **Mode:** deep was requested. Layers 1 to 4 and 6 ran. **Layer 5 (headed
  Chrome) was not run**, by instruction, because a sibling agent was using
  the browser. The adversarial generator was not run.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC, not a human.
- **Environment:** one image, `demo-slatewell:dv29`, built locally from
  `b01e073` with `docker build --secret id=npmrc,...`. The image carries
  `NODE_ENV=production`, so all cookies are `Secure`. Every container ran
  from it on `127.0.0.1`, used the runtime env file
  `C:\Users\Drama\.secrets\demo_env_slatewell.local.txt` with
  per-container overrides, and had `--add-host api.stripe.com:127.0.0.1`:

  | Container | Port | SESSION_SECRET | Used for |
  |---|---|---|---|
  | dv29-main | 18501 | from the env file (rotated 2026-09-18) | lifecycle, scope, find-or-create, legacy rows, edge sweep, repo assertions, PR e2e |
  | dv29-known | 18502 | a generated 64-hex value K1, then recreated with K2 | forged tokens signed with the real key, rotation replay |
  | dv29-nosecret | 18503 | empty (`SESSION_SECRET=`) | fail closed |
  | dv29-short | 18504 | 31 chars | fail closed |
  | dv29-placeholder | 18505 | the `.env.example` placeholder | fail closed |
  | dv29-mangled | 18506 | `generated_secrets.local.txt` + 64 hex | fail closed (path rule) |
  | dv29-ws | 18507 | `note <64 hex>` | fail closed (whitespace rule) |
  | dv29-unset | 18508 | variable absent from the environment | fail closed |
  | dv29-retain | 18503 (after the fail-closed set was removed) | env file | retention |
  | dv29-upgrade | 18504 (after the fail-closed set was removed) | env file | in-place upgrade of a pre-D-014 DB |

- **Stripe was kept out entirely.** The env file holds `sk_test_` and
  `pk_test_` values (prefixes and length 107 only; the dispatch for this run
  says Drew has no Stripe account or key). Every container overrode all three Stripe variables
  to empty, and `api.stripe.com` resolved to `127.0.0.1` in all of them.
  This PR does not touch Stripe code.
- **Secrets:** no key or secret value was printed at any point. Only
  prefixes, lengths and counts were recorded. The live env file's
  `SESSION_SECRET` is present, 64 characters after trimming, and passes the
  PR's own `sessionSecretProblem()` (it returns `null`). That closes the PR's
  "verify it at deploy time" ask for the file. It says nothing about what
  the live container was started with (see Coverage gaps).
- **Not touched:** the live `demo-slatewell` container, the public URL, the
  demo-proxy and `C:\dev\cloudflare-config`. The public edge 404s `/admin`
  and `/api/admin`, so every check ran against local containers. One
  read-only `docker create` on the `demo-slatewell:latest` image copied its
  pre-D-014 database out for the upgrade test. That container was never
  started and was removed right away.

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| auth_lifecycle | PASS | A-1 to A-14, J-0 to J-27, R-1 to R-5, O-1 and O-2; admin-session.yml 18/18 plus 1 SKIP |
| security (fail closed) | PASS | F-* 42/42 and FR-* 6/6 across 6 unconfigured containers |
| data_crud / scope | PASS | S-1 to S-19, C-1 to C-6, L-1, X-1, X-2, U-1 to U-5 |
| data retention | PASS | P-1 to P-12 on a fresh container with backdated rows |
| smoke | PASS | smoke.yml 6/6, plus 2 N/A (HSTS) and 2 N/A (admin surfaces expect the edge 404) |
| navigation | PASS | headless wizard walk to confirmation, sign-in button to `/admin`, Sign out button back home |
| error_handling | PASS | 401/404/405/307 paths; no 5xx across 15 path variants, RSC headers, a 1 MB body and a 7 KB cookie |
| edge_cases | PASS | E-1 to E-8 plus the J and F matrices |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge |
| performance | PASS (local) | home LCP 80 ms at the local origin, not a mobile or edge number |
| accessibility | SKIP | `axe_no_critical` (2 assertions): axe-core is not in the harness |
| mobile_responsive | PASS (partial) | the repo assertions ran at 390x844 |
| visual_regression | SKIP | no baseline exists |
| cross_browser | SKIP | Chromium only (headless Playwright) |

### Layer 1: code (at `b01e073`)

- `npx tsc --noEmit`: exit 0.
- `npx next lint`: 0 errors. Its one warning
  (`react-hooks/exhaustive-deps` at booking-wizard.tsx:146) predates this
  PR.
- The build ran inside `docker build` (`npm run db:seed` then
  `npm run build`) and exited 0. No file under `.next/static` in the image
  mentions `SESSION_SECRET`, the placeholder, or `jose`, so the signing code
  and key names stay server-side.
- The PR's suites, run locally with `SESSION_SECRET` unset in the shell:

  | Suite | PR claimed | This run |
  |---|---|---|
  | test:admin-session | 53 passed | 53 passed, 0 failed |
  | test:admin-security | 81 passed | 81 passed, 0 failed |
  | test:retention | 19 passed | 19 passed, 0 failed |
  | test:admin-queries | all passed | all passed |
  | test:portal-handoff | 27 passed | 27 passed, 0 failed |
  | test:portal-token, test:stripe-config | pass | 15 and 19 passed |
  | test-deposits, test-cancellation, test-scheduling | pass | 7 passed; all PASS; all PASS |

- **CI on #29 before the merge:** Quick Verify passed; Deep Verify passed
  (run 35427019268, job ran 06:35:43Z to 06:35:47Z). Its log reads
  `Found deep-verify report(s): verify/reports/DEEP_VERIFY_2026-09-18_pr27-stripe-pk-runtime.md`
  then `Deep-verify report shows PASS. Gate satisfied.` No #29 report
  existed at that time. See Warning 1.

### Layer 2: runtime

- `dv29-main`, `dv29-known`, `dv29-retain` and `dv29-upgrade` were all
  `running` with `RestartCount=0` after the full sweep, and each served `/`
  with 200. None had an unexpected error or warning line in its logs.
  None of the three signing secrets used (the env file value, K1, K2)
  appears anywhere in any container log (R-*).
- The six fail-closed containers started normally and stayed up with 0
  restarts. There is no crash loop and no startup refusal (FR-*).

### Layer 3 and 4: network and headless (repo's own assertions, `dv29-main`)

These are `verify/smoke.yml`, `verify/assertions/home.yml` and
`verify/assertions/admin-session.yml`, run over HTTP and headless Chromium
at 390x844. The authenticated dashboard was reached by clicking the real
"Sign in as demo admin" button, so the browser stored both cookies itself.
Sign-out used the real Sign out button.

```
PASS  smoke home http_status 200 (200)
PASS  smoke home text "Booking that respects your customers"
PASS  smoke home text "Wave Wellness"
N/A  smoke home HSTS (edge-only)
PASS  smoke booking-flow 200 (200)
PASS  smoke booking-flow text Wave Wellness
N/A  smoke booking-flow HSTS (edge-only)
N/A  smoke admin-session-post expects the EDGE 404 (containment); origin answers 405 (app behavior, see A-1)
N/A  smoke admin-unauthenticated expects the EDGE 404 (containment); origin answers 307 -> /?admin=required
PASS  smoke portal-handoff GET 405 (405)
PASS  home http_status 200 (200)
PASS  home text "Booking that respects your customers"
PASS  home text "fewer no-shows with deposits on file"
PASS  home text "Wave Wellness, Tuesday"
PASS  home selector button[type='submit']
PASS  home selector footer
PASS  home selector #platform
PASS  home selector #capabilities
N/A  home HSTS (edge-only)
PASS  home lcp_under_ms 2500 (80 ms, local origin)
PASS  home no_console_errors (0)
SKIP  home axe_no_critical (axe not in harness)
PASS  admin-unauthenticated redirects_to /?admin=required (checked as a path)
PASS  admin-unauthenticated notice text
PASS  admin-unauthenticated final page 200 at /?admin=required (200)
PASS  admin-unauthenticated no_console_errors (0)
PASS  admin-session-post 303 (303)
PASS  admin-session-post set-cookie slatewell_admin_session present
PASS  admin-dashboard reached via the button (http_status 200)
PASS  admin-dashboard text "Dashboard"
PASS  admin-dashboard text "Revenue (completed)"
PASS  admin-dashboard text "Deposits held"
PASS  admin-dashboard text "Cancellation rate"
PASS  admin-dashboard text "Today"
PASS  admin-dashboard text "Week ahead"
PASS  admin-dashboard text "Wave Wellness"
PASS  admin-dashboard selector h1
PASS  admin-dashboard no_console_errors (0)
SKIP  admin-dashboard axe_no_critical (axe not in harness)
PASS  admin-signout 303 (303)
PASS  admin-signout: /admin after the Sign out button redirects home (/?admin=required)
TALLY {"PASS":34,"FAIL":0,"N/A":5,"SKIP":2}
```

- `redirects_to` was checked as a path (`/?admin=required`) because the
  expected absolute URL is the public host.
- `smoke.yml` now asserts the **edge** containment (404 on `/admin` and
  `/api/admin/session`). The origin answers 307 and 405. Those two lines are
  recorded as N/A, not as failures (see Warning 6).

**The PR's own e2e (`scripts/e2e-visitor-scope.mjs`) against the
container.** One change was made to a scratch copy of the script: its single
local `better-sqlite3` read became a `docker exec` read of the container DB,
because the DB lives inside the container. It was run with
`BASE_URL=http://127.0.0.1:18501`:

```
PASS  A: details step renders
PASS  A: booking form shows the demo notice
PASS  A: confirmation reached
PASS  A: confirmation greets A
FAIL  A: own .ics downloads  404
PASS  A: visitor cookie is HttpOnly + Lax
PASS  DB: booking tagged with A's visitor id
PASS  B: A's confirmation page is 404
PASS  B: A's name not on that page
PASS  B: A's .ics is 404
PASS  B: demo sign-in lands on the dashboard
PASS  B: admin schedule renders seed data
PASS  B: A's booking absent from B's admin schedule
PASS  B: complete on A's booking is 404
PASS  B: no-show on A's booking is 404
PASS  A: own booking visible in A's admin schedule
PASS  C: forged cookie is sent home
PASS  C: forged cookie -> admin API 401
PASS  D: A's session copied without A's visitor cookie is sent home
```

The one FAIL is a harness artifact, not an app defect:

- The image sets `NODE_ENV=production`, so the visitor cookie is `Secure`.
- Playwright's `APIRequestContext` (`ctx.request.get`) does not send
  `Secure` cookies to `http://127.0.0.1`, while in-page `fetch` does.
- A probe in one browser context showed the difference on the same
  booking: `{"inPageFetchIcs":200,"playwrightApiRequestIcs":404,"visitorCookieSecure":true}`.
- S-2 below fetched A's own `.ics` with the visitor cookie and got 200.
- The PR author ran the script against `next start` on `localhost`, which
  Playwright treats as secure.

### Layer 6: edge cases and claims (full sweep, verbatim)

- **F** is fail closed per unconfigured container; **FR** covers their
  runtime and logs.
- **A** is the sign-in lifecycle and cookie attributes.
- **J** is forged and tampered sessions against `dv29-known`, whose key the
  harness holds. Every J variant was sent WITH the visitor cookie that its
  `vid` claims, so each refusal isolates the signature and claim checks
  from the visitor binding. J-0 is the positive control: a token the
  harness minted with the real key is accepted, which shows the forging
  code builds valid tokens.
- **R** is cross-secret replay and rotation. **O** is sign-out.
- **S, C, L and X** are per-visitor scope, customer find-or-create, legacy
  rows and a leak scan.
- **P** is retention and **U** is the in-place schema upgrade.
- **E** is the edge sweep; the final **R-dv29-*** lines are runtime.

```
== F: fail closed, nosecret (expect rule missing) ==
PASS  F-nosecret-1  public / and /book still 200  [200/200]
PASS  F-nosecret-2  GET /admin -> 404 from middleware  [404 Not found]
PASS  F-nosecret-3  GET /admin/schedule -> 404  [404]
PASS  F-nosecret-4  POST /api/admin/session (demo sign-in) -> 404, no session cookie  [404]
PASS  F-nosecret-5  POST /api/admin/services and /complete -> 404  [404/404]
PASS  F-nosecret-6  token signed with the published placeholder -> still 404  [404]
INFO  F-nosecret-7  portal-handoff with a bogus token (token is verified before the configured check)  [401 {"ok":false,"reason":"invalid_token"}]
PASS  F-nosecret-8  public booking still 201 and mints a visitor cookie  [201]

== F: fail closed, short (expect rule too_short) ==
PASS  F-short-1  public / and /book still 200  [200/200]
PASS  F-short-2  GET /admin -> 404 from middleware  [404 Not found]
PASS  F-short-3  GET /admin/schedule -> 404  [404]
PASS  F-short-4  POST /api/admin/session (demo sign-in) -> 404, no session cookie  [404]
PASS  F-short-5  POST /api/admin/services and /complete -> 404  [404/404]
PASS  F-short-6  token signed with the published placeholder -> still 404  [404]
INFO  F-short-7  portal-handoff with a bogus token (token is verified before the configured check)  [401 {"ok":false,"reason":"invalid_token"}]
PASS  F-short-8  public booking still 201 and mints a visitor cookie  [201]

== F: fail closed, placeholder (expect rule placeholder) ==
PASS  F-placeholder-1  public / and /book still 200  [200/200]
PASS  F-placeholder-2  GET /admin -> 404 from middleware  [404 Not found]
PASS  F-placeholder-3  GET /admin/schedule -> 404  [404]
PASS  F-placeholder-4  POST /api/admin/session (demo sign-in) -> 404, no session cookie  [404]
PASS  F-placeholder-5  POST /api/admin/services and /complete -> 404  [404/404]
PASS  F-placeholder-6  token signed with the published placeholder -> still 404  [404]
INFO  F-placeholder-7  portal-handoff with a bogus token (token is verified before the configured check)  [401 {"ok":false,"reason":"invalid_token"}]
PASS  F-placeholder-8  public booking still 201 and mints a visitor cookie  [201]

== F: fail closed, mangled (expect rule contains_path) ==
PASS  F-mangled-1  public / and /book still 200  [200/200]
PASS  F-mangled-2  GET /admin -> 404 from middleware  [404 Not found]
PASS  F-mangled-3  GET /admin/schedule -> 404  [404]
PASS  F-mangled-4  POST /api/admin/session (demo sign-in) -> 404, no session cookie  [404]
PASS  F-mangled-5  POST /api/admin/services and /complete -> 404  [404/404]
PASS  F-mangled-6  token signed with the published placeholder -> still 404  [404]
INFO  F-mangled-7  portal-handoff with a bogus token (token is verified before the configured check)  [401 {"ok":false,"reason":"invalid_token"}]
PASS  F-mangled-8  public booking still 201 and mints a visitor cookie  [201]

== F: fail closed, ws (expect rule contains_whitespace) ==
PASS  F-ws-1  public / and /book still 200  [200/200]
PASS  F-ws-2  GET /admin -> 404 from middleware  [404 Not found]
PASS  F-ws-3  GET /admin/schedule -> 404  [404]
PASS  F-ws-4  POST /api/admin/session (demo sign-in) -> 404, no session cookie  [404]
PASS  F-ws-5  POST /api/admin/services and /complete -> 404  [404/404]
PASS  F-ws-6  token signed with the published placeholder -> still 404  [404]
INFO  F-ws-7  portal-handoff with a bogus token (token is verified before the configured check)  [401 {"ok":false,"reason":"invalid_token"}]
PASS  F-ws-8  public booking still 201 and mints a visitor cookie  [201]

== F: fail closed, unset (expect rule missing) ==
PASS  F-unset-1  public / and /book still 200  [200/200]
PASS  F-unset-2  GET /admin -> 404 from middleware  [404 Not found]
PASS  F-unset-3  GET /admin/schedule -> 404  [404]
PASS  F-unset-4  POST /api/admin/session (demo sign-in) -> 404, no session cookie  [404]
PASS  F-unset-5  POST /api/admin/services and /complete -> 404  [404/404]
PASS  F-unset-6  token signed with the published placeholder -> still 404  [404]
INFO  F-unset-7  portal-handoff with a bogus token (token is verified before the configured check)  [401 {"ok":false,"reason":"invalid_token"}]
PASS  F-unset-8  public booking still 201 and mints a visitor cookie  [201]

== FR: fail-closed runtime and logs (criterion: 1 disabled line per runtime, i.e. middleware sandbox + Node server = 2; errors other than the harness's own bogus portal token) ==
PASS  FR-nosecret  running, 0 restarts, disabled line names the rule, secret value not in logs, no unexpected error lines  [running 0; disabled lines 2; rule 'SESSION_SECRET is not set' 2; value hits 0; unexpected error lines 0]
PASS  FR-short  running, 0 restarts, disabled line names the rule, secret value not in logs, no unexpected error lines  [running 0; disabled lines 2; rule 'shorter than 32' 2; value hits 0; unexpected error lines 0]
PASS  FR-placeholder  running, 0 restarts, disabled line names the rule, secret value not in logs, no unexpected error lines  [running 0; disabled lines 2; rule 'placeholder' 2; value hits 0; unexpected error lines 0]
PASS  FR-mangled  running, 0 restarts, disabled line names the rule, secret value not in logs, no unexpected error lines  [running 0; disabled lines 2; rule 'file path fragment' 2; value hits 0; unexpected error lines 0]
PASS  FR-ws  running, 0 restarts, disabled line names the rule, secret value not in logs, no unexpected error lines  [running 0; disabled lines 2; rule 'contains whitespace' 2; value hits 0; unexpected error lines 0]
PASS  FR-unset  running, 0 restarts, disabled line names the rule, secret value not in logs, no unexpected error lines  [running 0; disabled lines 2; rule 'SESSION_SECRET is not set' 2; value hits 0; unexpected error lines 0]

== A: sign-in lifecycle and cookie attributes (main) ==
PASS  A-1  GET /api/admin/session -> 405  [405]
PASS  A-2  no cookies: /admin -> 307 /?admin=required  [307 /?admin=required]
PASS  A-3  no cookies: POST /api/admin/services -> 401  [401]
PASS  A-4  POST /api/admin/session -> 303 Location /admin  [303 /admin]
PASS  A-5  session cookie HttpOnly; SameSite=Lax; Secure; Path=/  [path=/,secure,httponly,samesite=lax]
PASS  A-6  visitor cookie HttpOnly; SameSite=Lax; Secure; Max-Age=86400  [path=/,expires=sun, 20 sep 2026 06:50:06 gmt,max-age=86400,secure,httponly,samesite=lax]
PASS  A-7  JWT alg HS256, exp - iat = 28800 s (8 h)  [alg HS256, ttl 28800]
PASS  A-8  cookie Expires matches JWT exp  [delta 0s]
PASS  A-9  jti 128-bit hex, vid == visitor cookie, src demo  [jti len 32]
PASS  A-10  both cookies: /admin -> 200 Dashboard  [200]
PASS  A-11  sign-in with an existing visitor cookie reuses it (no new visitor cookie, vid bound)
PASS  A-12  malformed visitor cookie is replaced by a fresh 128-bit id
PASS  A-13  x-middleware-subrequest bypass header, no cookies: still 307 / 401 / 401  [307/401/401]
PASS  A-14  7 KB garbage session cookie -> 307, no 500  [307]

== J: forged and tampered sessions (known-secret container; each sent WITH the claimed visitor cookie) ==
PASS  J-0  positive control: harness-minted HS256 token with the real key is accepted (forging mechanics are correct)  [200]
PASS  J-0b  positive control: app-minted session accepted  [200]
PASS  J-1  name-only cookie value '1': /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-2  old plain-string style cookie 'demo-admin': /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-3  alg none, no signature: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-4  alg None (case variant), no signature: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-5  HS256 signed with a wrong secret: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-6  HS256 signed with the .env.example placeholder: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-7  alg switch: HS512 with the REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-8  alg switch: HS384 with the REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-9  alg confusion: header RS256, HMAC-SHA256 body with the REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-10  tampered payload (vid swapped to another browser, original signature): /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-11  tampered payload (exp extended, original signature): /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-12  tampered payload (role admin, original signature): /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-13  tampered signature (one char flipped): /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-14  signature stripped (header.payload.): /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-15  signature truncated: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-16  expired 60 s ago, REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-17  not yet valid (nbf +1 h), REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-18  missing jti, REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-19  short jti, REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-20  src 'admin' (not demo/portal), REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-21  missing sub, REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-22  non-hex vid (matching cookie), REAL key: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-23  valid app session, visitor cookie of ANOTHER browser: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-24  valid app session, NO visitor cookie (copied session): /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  J-25  visitor cookie only, no session cookie (missing cookie): /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401]
PASS  J-26  no cookies at all: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401]
PASS  J-27  JWS JSON / garbage with dots: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]

== R: cross-secret replay (secret rotation stand-in, both directions) ==
PASS  R-1  main-minted session + its visitor cookie replayed to known (different secret): /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  R-2  known-minted session + its visitor cookie replayed to main: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
INFO  R-3  saved the known-container session pair for post-rotation replay

== O: sign-out ==
PASS  O-1  POST ?signout=1 -> 303 / and clears the session cookie  [303 /]
PASS  O-2  browser after sign-out (session cookie gone) -> 307  [307]
WARN  O-3  captured pre-sign-out session pair replayed after sign-out (stateless JWT, no server revocation)  [200]


== R: after recreating the known container with a NEW secret ==
PASS  R-4  pre-rotation session + visitor cookie replayed after rotation: /admin -> 307 ?admin=required, POST /api/admin/services -> 401  [307 /?admin=required; api 401; admin cookie cleared=true]
PASS  R-5  fresh sign-in after rotation works (same visitor cookie)  [200]


== S: per-visitor scope (main container) ==
PASS  S-1  A books (no cookies) -> 201, visitor cookie minted  [201 bk_54cd7582e6]
PASS  S-2  A opens own confirmation (200, shows name) and .ics (200)  [200/200]
PASS  S-3  A's admin schedule for that day shows A's booking  [found 3 of 4 markers]
PASS  S-4  A books for TODAY; A's dashboard Today list shows A's name (the week view shows counts only)  [201 2026-09-19 200]
PASS  S-5  B books and signs in with its own visitor id  [201]
PASS  S-6  B's admin schedule for A's day: none of A's name/email/phone/notes  [markers []]
PASS  S-7  B's dashboard (incl. Today list with A's same-day booking): no A markers, no A booking ids  [markers []]
PASS  S-8  B's other admin pages (customers, communications, reports, settings, services, staff): 200, no A data  [6 pages clean]
PASS  S-9  B's schedule over 9 days (-1..+7): no A markers on any day  [clean]
PASS  S-10  B complete / no-show on A's booking -> 404 (same as unknown id)  [404 {"error":"Booking not found"} / 404]
PASS  S-11  unknown id gives an identical 404 body (no existence oracle)  [{"error":"Booking not found"}]
PASS  S-12  A's booking unchanged in the DB after B's attempts  [{"status":"Confirmed","deposit_status":null}]
PASS  S-13  A's confirmation and .ics with B's visitor cookie -> 404, no A data  [404/404]
PASS  S-14  A's confirmation and .ics with no cookies -> 404, no A data  [404/404]
PASS  S-15  A's confirmation and .ics with random valid-shape visitor cookie -> 404, no A data  [404/404]
PASS  S-16  A's confirmation and .ics with B signed-in admin -> 404, no A data  [404/404]
PASS  S-17  seed booking confirmation / .ics are not public (404)  [404/404]
PASS  S-18  A may act on a seed booking (seed rows are shared demo data)  [200]
PASS  S-19  A may act on its own booking  [200]

== C: customer find-or-create (link by email / phone) ==
PASS  C-1  A's second booking with the same email reused A's customer row  [1 row(s)]
PASS  C-2  B books with A's email (upper-cased): B's confirmation shows B's name, never A's  [201/200]
PASS  C-3  DB: a second customer row for that email, owned by B; A's row untouched  [[["Zephyrine","VA"],["Mallory","VB"]]]
PASS  C-4  B books with A's phone: B's own row, A's row not linked  [["VA","VB"]]
PASS  C-5  cookieless client with A's email AND phone gets a new visitor and a new customer row  [3 rows]
PASS  C-6  A's admin view does not show B's booking made with A's email

== L: legacy (pre-D-014) rows ==
PASS  L-1  legacy row hidden from A and B schedules, confirmation 404, admin action 404  [404/404]

== X: leak scan of everything B or a cookieless client received ==
PASS  X-1  A's visitor id appears in none of the responses B/cookieless received  [0 hits]
PASS  X-2  A's booking id absent from B's admin HTML  [0]

== P: visitor data expiry (fresh dv29-retain, container clock UTC 06:53) ==
INFO  P-0  rows present before any HTTP request  [{"old25":1,"new23":1,"recent":1,"legacy":1,"late26":0,"old25msgs":1,"new23msgs":1,"custOld":1,"custNew":1,"orphan":1,"keepcust":1,"legacyCust":1,"seed":300,"seedCust":121,"comms":1022}]
PASS  P-1  no purge at boot: backdated 25 h row still present, no retention log line  [old25 1, log lines 0]
INFO  P-2  after the first DB-touching request (/book/wave-wellness 200)  [{"old25":0,"new23":1,"recent":1,"legacy":1,"late26":0,"old25msgs":0,"new23msgs":1,"custOld":0,"custNew":1,"orphan":0,"keepcust":1,"legacyCust":1,"seed":300,"seedCust":121,"comms":1021}]
PASS  P-3  25 h old visitor booking and its mock message deleted by the first request  [old25 0, msgs 0]
PASS  P-4  its now-orphaned customer and a 30 h orphan visitor customer deleted  [custOld 0, orphan 0]
PASS  P-5  23 h old visitor booking, message and customer kept (inside window)  [new23 1]
PASS  P-6  30 h old visitor customer that still has a 1 h old booking kept  [recent 1, keepcust 1]
PASS  P-7  30 day old legacy row (seeded=0, no visitor id) kept, as the PR states  [legacy 1]
PASS  P-8  seed bookings, seed customers and all other messages untouched  [seed 300/300, seedCust 121/121, comms 1021/1022]
PASS  P-9  purge logged once, counts only (no PII)  [[retention] purged 1 bookings, 2 customers, 1 messages]
PASS  P-10  a 26 h row inserted after the first purge survives 3 more requests (hourly throttle)  [late26 1]
PASS  P-11  after a process restart it survives until the first DB request, which purges it (on DB open); 23 h row still kept  [before req 1, after 0, new23 1]
PASS  P-12  no error lines in the retention container log  [0]
== U: in-place upgrade of a pre-D-014 database (DB copied from the current main image) ==
PASS  U-1  first request against the old DB succeeds  [200]
PASS  U-2  visitor_id / seeded columns added in place  [visitor_id,seeded,c.visitor_id]
PASS  U-3  all 300 pre-existing rows kept, seeded=0, no visitor id (not purged)  [{"n":300,"s":0,"v":0}]
PASS  U-4  dashboard 200; none of today's pre-existing rows are shown (fail closed)  [200, today old rows 2, shown 0]
PASS  U-5  new booking on the upgraded DB is tagged and visible to its own admin session  [201 bk_87c0d5ea68]
== E: edge sweep (dv29-main, no admin cookies unless stated) ==
PASS  E-1  15 path-normalization / case variants x GET+HEAD: no 200 with admin data, no 5xx  [clean]
PASS  E-2  RSC / prefetch / router-state headers on admin pages without a session: redirected, no flight data  [all 307]
PASS  E-3  OPTIONS /api/admin/services without a session returns no data  [401]
PASS  E-4  upper-case hex visitor cookie is rejected as malformed and replaced  []
PASS  E-5  20 concurrent sign-ins: all 303, 20 distinct jti, 20 distinct visitor ids  [20 jti / 20 vid]
PASS  E-6  1 MB body on the sign-in endpoint: ignored, 303, no 500  [303]
PASS  E-7  duplicate session cookies (both garbage) -> 307  [307]
PASS  E-8  session in a query string or Authorization header is ignored (307 / 401)  [307/401]
== R: runtime ==
PASS  R-dv29-main  running, 0 restarts, / 200, no unexpected error/warn lines, no secret value in logs  [running 0; / 200; unexpected 0; secret hits 0]
PASS  R-dv29-known  running, 0 restarts, / 200, no unexpected error/warn lines, no secret value in logs  [running 0; / 200; unexpected 0; secret hits 0]
PASS  R-dv29-retain  running, 0 restarts, / 200, no unexpected error/warn lines, no secret value in logs  [running 0; / 200; unexpected 0; secret hits 0]
PASS  R-dv29-upgrade  running, 0 restarts, / 200, no unexpected error/warn lines, no secret value in logs  [running 0; / 200; unexpected 0; secret hits 0]
TOTAL 153/153 passed (0 FAIL; 9 INFO; 1 WARN = O-3, see Warning 2)
```

Harness notes (not app defects; stated so the log is honest):

- The first `scope` run failed S-4. It assumed the dashboard's week view
  lists names, but it shows only counts; names appear only for Today. S-4
  was rewritten to book A for today and passed.
- The first two retention attempts died on harness bugs before any
  assertion ran: SQL double-quoted literals, then Git Bash path mangling of
  `docker exec` arguments. The logged retention run is the third, on a
  freshly recreated container.

## 3. Claim by claim

1. **Signed admin session (HS256): every forgery refused.**
   - Refused, each checked on `/admin` (307 to `/?admin=required`, admin
     cookie cleared) and on `POST /api/admin/services` (401):
     - forged cookies: J-1, J-2, J-5, J-6;
     - `alg` none, including a case variant: J-3, J-4;
     - `alg` switch (HS512, HS384, RS256 header) signed with the real key:
       J-7 to J-9;
     - tampered payload (`vid`, `exp`, `role`) and tampered, stripped or
       truncated signatures: J-10 to J-15;
     - expired (with the real key): J-16; `nbf` in the future: J-17;
     - bad claims (with the real key): J-18 to J-22;
     - a replay after rotation: R-4, plus R-1 and R-2 across secrets;
     - a missing cookie: J-24 to J-26.
   - A session with another browser's visitor cookie is refused (J-23).
     So is a session copied without its visitor cookie (J-24, and the PR
     e2e's D check).
   - The lifetime is 8 h: JWT `exp - iat = 28800` and the cookie `Expires`
     matches (A-7, A-8).
   - Both cookies are `HttpOnly; SameSite=Lax; Secure; Path=/`. The visitor
     cookie has `Max-Age=86400` (A-5, A-6).
2. **Missing, short or malformed SESSION_SECRET: fails closed.**
   - Exactly which mode: **not a startup refusal and not a crash loop.**
   - The process boots normally, serves `/` and `/book`, and still takes
     public bookings (F-*-1, F-*-8).
   - The whole admin area answers 404: `/admin` gets middleware's plain
     "Not found"; the demo sign-in and the admin API handlers also 404, and
     no session cookie is issued (F-*-2 to F-*-5). A token signed with the
     placeholder still gets 404 (F-*-6).
   - This held for all six variants: empty, unset, 31 chars, placeholder,
     path fragment, whitespace.
   - The rule is logged lazily, on the first admin-touching request, never
     with the value (FR-*). It is logged once per runtime, so twice per
     container: once from middleware and once from the Node server. The
     PR says "once per process" (see Warning 5).
3. **Per-visitor scope holds.**
   - Visitor B, and any cookieless client, never saw visitor A's name,
     email, phone, notes, booking id or visitor id:
     - B's dashboard, including Today with A's same-day booking (S-7);
     - B's schedule across 9 days (S-6, S-9);
     - B's other admin pages (S-8);
     - A's confirmation and `.ics` under B's cookies, no cookies, a random
       visitor id, or B's admin session (S-13 to S-16);
     - a leak scan of every response B received (X-1, X-2).
   - B's complete and no-show on A's booking return 404 with a body
     identical to an unknown id's, and A's row is unchanged (S-10 to S-12).
   - A still sees and can act on its own bookings and on seed bookings
     (S-3, S-4, S-18, S-19).
   - Customer find-or-create never links across visitors:
     - A's second booking with the same email reused A's own customer row
       (C-1);
     - B booking with A's email (upper-cased) or A's phone got B's own
       customer row, and B's confirmation shows B's name (C-2 to C-4);
     - a cookieless client with A's email and phone got a new visitor and a
       new customer row (C-5);
     - A's admin view does not show B's booking made with A's email (C-6).
   - Legacy rows (`seeded=0`, no visitor id) are invisible to everyone
     (L-1, U-4).
4. **Visitor data expiry works.**
   - Rows were backdated with `docker exec` BEFORE the server process had
     opened the DB.
   - The first DB-touching request deleted:
     - the 25 h old visitor booking and its mock message;
     - its now-orphaned customer, and a 30 h old orphan visitor customer.
   - It kept the 23 h row, a 30 h customer that still has a recent booking,
     the 30 day legacy row, all 300 seed bookings, the seed customers and
     every other message (P-3 to P-8).
   - It logged `[retention] purged 1 bookings, 2 customers, 1 messages`,
     counts only (P-9).
   - **Trigger:** `getDb()` calls `maybePurgeExpiredVisitorData()` on every
     call. The throttle is `globalThis.__slatewellLastPurgeMs`, at most
     once per hour per process. There is no timer:
     - nothing ran at boot (P-1);
     - a 26 h row inserted after the first purge survived 3 more requests
       (P-10);
     - after `docker restart` it was still there until the first request,
       which purged it (P-11).
5. **Repo assertions:** admin-session.yml 18/18 (plus 1 SKIP), home.yml
   11/11 (plus 1 N/A and 1 SKIP), smoke.yml 6/6 (plus 4 N/A). Per-file
   lines are in Layer 3 and 4 above.

## 4. Theater Check

| PR #29 claimed | Verification found | Verdict |
|---|---|---|
| The admin cookie is an HS256 JWT over a 128-bit `jti` and the visitor id | Decoded: `alg` HS256, `jti` 32 hex, `vid` equals the visitor cookie, `src` demo (A-7, A-9) | CONFIRMED |
| Forged plain cookie, tampered signature or payload, `alg=none`, other secret, missing claims and expired are all rejected | J-1 to J-22 refused on both page and API; the J-0 positive control is accepted | CONFIRMED |
| A session copied into another browser is rejected | J-23, J-24 and PR e2e check D | CONFIRMED |
| Middleware is not the only gate | The handlers could not be reached past middleware from outside, including with the `x-middleware-subrequest` bypass header (A-13). Handler-level refusal is shown by `test:admin-security` (81/81), not in-container | CONFIRMED by unit suite; in-container only as defense in depth |
| Fail closed: missing, short, placeholder or malformed secret gives 404 on `/admin`, `/api/admin/*` and sign-in | F-* on 6 containers; no crash loop; the rule is logged, never the value | CONFIRMED |
| ...and the Portal handoff answers 404 | In-container the route verifies the Portal token before the configured check, so a bogus token gets 401 `invalid_token` (F-*-7). The 404 branch needs a Portal-signed token this run could not mint. `test:portal-handoff` 27/27 covers it | CONFIRMED by unit suite only |
| Each failing rule is logged once per process | Logged once per runtime: 2 lines per container (middleware and Node) | MINOR MISMATCH (wording) |
| Admin lists and KPIs show seed rows plus the caller's own bookings | S-3, S-4, S-6 to S-9, S-18 | CONFIRMED |
| Complete/no-show on anything else is 404 and changes nothing | S-10 to S-12, L-1 | CONFIRMED |
| `findOrCreateCustomer` only matches within the same browser | C-1 to C-6 plus a DB read of the customer rows | CONFIRMED |
| Confirmation and `.ics` require the booking's own visitor cookie; seed and legacy rows are not exposed | S-2, S-13 to S-17, L-1 | CONFIRMED |
| The Portal handoff mints the same visitor-bound session and does not widen access | The code path is shared (`mintAdminSession` plus `resolveVisitorId`); `test:portal-handoff` 27/27. Not exercised end to end, since there is no Portal key | NOT VERIFIED in-container (unit suite only) |
| Retention deletes visitor rows after 24 h, on DB open and at most hourly after | P-1 to P-12; "on DB open" means the first DB-touching request, not process start | CONFIRMED |
| An older DB is upgraded in place; old rows are hidden and exempt from the purge | U-1 to U-5 on the DB copied from the current `main` image | CONFIRMED |
| The booking form shows the demo notice | PR e2e: "A: booking form shows the demo notice" | CONFIRMED |
| Test counts 53 / 81 / 19 / 27 | Reproduced exactly | CONFIRMED |
| e2e:visitor-scope 19 passed | 18 of 19 against the container; the 19th is the `Secure` cookie harness artifact, and the app returned 200 by two other routes | CONFIRMED (with harness note) |
| `next start` with no SESSION_SECRET: `/admin` 404, services POST 404, sign-in 404, `/` 200 | Same results on the Docker image with the variable empty and with it unset | CONFIRMED |

## 5. Blockers

None for the code. It does what it claims, and what merged is the tree that
was verified.

## 6. Warnings

### Warning 1: the Tier-3 gate was theater for #29, and #29 merged on it

- `verify/ci/deep_gate.sh` passes if **any** file under `verify/reports/`
  contains an `Overall: PASS` style marker.
- On #29 it matched the PR #27 report at 06:35:45Z and went green. #29
  merged at 06:45:25Z. At that moment no deep verify of #29 existed: this
  run's image was built at 06:41:38Z, and its first container started at
  about 06:45Z.
- The code turned out to hold, but the gate did not know that.
- Now that this report is on its way to `main`, it and the PR #27 report
  will satisfy the gate for every future tier-3 PR too.
- **Recommended follow-up (not done here):** make the gate require a
  report whose `Tested-SHA:` line equals the PR head SHA. This report
  carries that line.

### Warning 2: sign-out does not revoke the session (O-3)

- Sign-out only deletes the cookie. The JWT is stateless.
- A captured session and visitor cookie pair replayed after sign-out still
  gets `/admin` 200, for up to the remaining 8 h.
- This is not a PR claim, and both cookies are `HttpOnly`, which limits
  capture. Note it before anyone calls sign-out a security control.

### Warning 3: scope rests on the visitor cookie as a bearer secret

- `slatewell_visitor` is 128 random bits and `HttpOnly`, but it is not
  signed. The session binds to whatever value the browser presents.
- Anyone who learns a victim's visitor id can sign in as that visitor and
  see that visitor's bookings.
- No path leaked a visitor id to another client in this run (X-1). Keep it
  out of logs, URLs and responses in future changes.

### Warning 4: retention timing nuances

- There is no scheduler. An idle container purges nothing until its next
  DB-touching request, so a row can outlive 24 h by the idle time plus up to
  1 h of throttle.
- `__slatewellLastPurgeMs` is set before the `try`. A purge that throws is
  logged, then not retried for an hour.
- Fine for a demo. Say "within about 25 h of the next visit", not
  "exactly 24 h".

### Warning 5: log wording

The PR says each failing rule is "logged once per process". It is logged
once per runtime: middleware (the edge sandbox) and the Node server each log
it, so a container shows 2 identical lines. The value is never logged.
Cosmetic.

### Warning 6: deploy follow-ups now due (the code is on main)

- **smoke.yml.** It still asserts the edge 404 containment on
  `admin-session-post` and `admin-unauthenticated`. The PR says to flip
  them back to 405 and `?admin=required` only after the containment is
  removed. Deploy this image with a valid `SESSION_SECRET` first, then lift
  the demo-proxy 404s, then flip smoke.yml.
- **Upgraded databases.** On a pre-D-014 DB all old rows become
  `seeded=0`, so the demo dashboard is empty (U-4 shows "No appointments
  scheduled today."). The Dockerfile reseeds at build, so a normal
  redeploy gets `seeded=1` seed rows. It only bites if `data/` is
  volume-mounted. That was not checked (see Coverage gaps).
- **One-time purge.** Live visitor records created before this change stay
  hidden and are never purged until Drew approves a one-time purge, as the
  PR states.

### Warning 7: the PR's e2e is fragile against production-mode servers

`scripts/e2e-visitor-scope.mjs` fetches the `.ics` with
`ctxA.request.get`, which drops `Secure` cookies on `http://127.0.0.1`.
Fetching it with in-page `fetch` would make it run against any
production-mode origin.

### Minor, not blocking

- Services and staff edits are still global demo state (the PR says so).
- The env file carries `sk_test_` and `pk_test_` values although Drew has
  no Stripe account. Whose they are is worth confirming. Not in scope here.

### Coverage gaps (stated so the PASS is not overclaimed)

- **Layer 5 (headed Chrome) was not run**, by instruction. Layers 1 to 4
  and 6 ran.
- The Portal handoff was not exercised with a real Portal-signed RS256
  token (no key), so its 404-when-unconfigured and visitor-bound mint are
  confirmed only by `test:portal-handoff`.
- Forged tokens could not reach the admin API handlers past middleware from
  outside. Handler-level refusal rests on `test:admin-security`.
- Cross-site CSRF behavior of `SameSite=Lax` was not browser-tested.
- The 24 h window was proven with backdated rows (23 h and 25 h), not
  wall-clock time. The exact boundary is covered by `test:retention`.
- Only the live env FILE's `SESSION_SECRET` shape was checked. What the live
  container was started with, and whether it mounts `data/` as a volume,
  were not inspected (the live container was off limits).
- The public edge was not tested, because it 404s the admin area by design.
- HSTS (edge-only), axe (not in the harness), the adversarial generator and
  cross-browser runs were not done.
