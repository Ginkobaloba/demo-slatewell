# Deep Verify: PR #35 server-side sign-out revocation, signed visitor cookie, prod-mode e2e (2026-09-19)

Overall: PASS
Tested-SHA: 5344a6128d323cfe53dff8e2d8bddadf80d35b8e

Every claim this run was asked to prove held, with evidence: 160 of 160
harness checks passed against the production image, with 1 WARN and 16 INFO
lines. Three harness criteria were wrong on the first try and were corrected
and re-run; each one is listed under "Harness notes" with the raw output that
showed it was the harness, not the app. The PR's own suites reproduced its
stated counts exactly. Its e2e passed 52 of 52 against the production image.
The builder's "pre-existing" claim for `e2e-booking` and `e2e-cancellation`
is **confirmed**: both fail the same way on a build of `main` (`4d19760`).

The PASS carries one real finding worth fixing before anyone calls sign-out a
complete control (Warning 2): a token that verifies but has no `exp` claim is
accepted by the admin gate, and sign-out answers 303 without revoking it. The
app never mints such a token, so only a holder of `SESSION_SECRET` can make
one. The gate on this PR also went green again by matching an unrelated
report (Warning 1).

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-slatewell` PR #35, branch
  `fix/session-revoke-signed-visitor`, head `5344a61`
  (`5344a6128d323cfe53dff8e2d8bddadf80d35b8e`), base `main` at `4d19760`.
  Not merged at the time of this run.
- **Why deep:** the PR changes admin authorization (every admin page, the
  layout and all 5 admin API handlers), sign-out, and the visitor cookie that
  scopes customer PII. The `tier-3` label is on the PR.
- **Mode:** deep was requested. Layers 1 to 4 and 6 ran. **Layer 5 (headed
  Chrome) was not run**, by instruction: all browser work was headless
  Chromium (Playwright). The adversarial generator was not run; the attack
  list below was written by hand from the dispatch and the diff.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC, not a human. It did not
  write this PR.
- **Images:** `demo-slatewell:dv35` built from the PR head and
  `demo-slatewell:dv35base` built from `origin/main` `4d19760`, both with
  `docker build --secret id=npmrc,...`. The npmrc was written to the run dir,
  never printed, and deleted in a `finally` block (`npmrc removed: True`).
  Both images carry `NODE_ENV=production`, so every cookie is `Secure`. The
  build's route table marks all 8 `/admin` pages and all 6 `/api/admin`
  routes as dynamic (`ƒ`).
- **Containers:** all named `dv35-*`, all on `127.0.0.1`, all with
  `--add-host api.stripe.com:127.0.0.1`, all with the three Stripe variables
  blank (except `dv35-live`, which carried a dummy `sk_live_` key on purpose).
  Env came from `C:\Users\Drama\.secrets\demo_env_slatewell.local.txt`,
  rewritten per container into scratch env files.

  | Container | Port | SESSION_SECRET | Used for |
  |---|---|---|---|
  | dv35-main | 18711 | the env file's (64 chars) | lifecycle, revocation matrix, oracle, #29 scope regression, PR e2e |
  | dv35-known | 18712 | generated K1, then recreated with K2 | forged sessions, visitor-cookie variants, sign-out spam, rotation |
  | dv35-nosecret | 18713 | empty | no-secret matrix |
  | dv35-unset | 18714 | variable absent | no-secret matrix |
  | dv35-dbfail | 18715 | env file | SQLite failure injection |
  | dv35-upgrade | 18716 | env file | pre-D-015 DB (copied from `dv35base`) |
  | dv35-upg14 | 18716 (after) | env file | pre-D-014 DB (copied from `demo-slatewell:latest`) |
  | dv35-short | 18716 (after) | 31 chars | no-secret matrix |
  | dv35-live | 18717 | env file | PR #30 regression, dummy `sk_live_` key |
  | dv35-placeholder | 18717 (after) | the `.env.example` placeholder | no-secret matrix |
  | next start (main) | 18718 | K1 | baseline e2e on `4d19760` |
  | next start (head) | 18719 | K1 | the same e2e on the PR head |

- **The two `next start` servers** ran from scratch `git archive` copies of
  `4d19760` and `5344a61` (node_modules junctioned to the worktree's; the PR
  changes no dependency), each seeded and built fresh, bound to
  `127.0.0.1`. They are processes, not containers; they were stopped at the
  end.
- **Not touched:** the live `demo-slatewell` container, the public URL,
  `demo-proxy` and `C:\dev\cloudflare-config`. One read-only `docker create`
  on the `demo-slatewell:latest` image copied its database out for the
  pre-D-014 test; that container was never started and was removed at once.
- **Secrets:** no secret value was printed. The live env file's
  `SESSION_SECRET` is present and 64 characters long. No signing secret (the
  env file's, K1 or K2) appears in any container log (RT-*).
- **Cleanup:** every `dv35-*` container and both `dv35` images were removed.
  `docker ps -a` shows no `dv35` name; `demo-slatewell:latest` and
  `:previous` are untouched.
- **Evidence:** raw logs and the harness are under the session scratchpad,
  `verify-runs/demo-slatewell-pr35-deep/` (`h35.mjs`, one `*.log` per phase,
  `bl_*.log` for the baseline e2e, `build.log`, `build-base.log`).

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| auth_lifecycle | PASS (1 WARN) | A-1 to A-14, J-00 to J-25, R-1, R-2, R-4, R-5; J-26 is the WARN |
| revocation (D-015) | PASS | O-0 to O-13, SP-1 to SP-10, D-0 to D-7, U-0 to U-6, U14 |
| signed visitor (D-016) | PASS | V-0 to V-17, V-4x, V-W1 to V-W8 |
| security (fail closed) | PASS | N-* on 4 unconfigured containers, N-ctl |
| data_crud / scope (#29 regression) | PASS | S-1 to S-18, C-1, C-2 |
| error_handling | PASS | D-1, D-5, D-6, D-7 (5xx on DB failure, never "not revoked"); A-14 |
| edge_cases | PASS | the V, SP, O-4 to O-6, T sweeps |
| smoke | PASS | every container served `/` 200; RT-* 0 restarts |
| navigation | PASS | PR e2e: wizard to confirmation, sign-in button to `/admin`, Sign out button |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge |
| performance | INFO only | local latency medians in T-3, T-4; no mobile or edge numbers |
| accessibility | SKIP | axe-core is not in the harness |
| mobile_responsive | SKIP | the repo's 390x844 assertions were not re-run (landing page untouched by this PR) |
| visual_regression | SKIP | no baseline exists |
| cross_browser | SKIP | Chromium only, headless |

### Layer 1: code (at `5344a61`)

- `npx tsc --noEmit`: exit 0.
- `npx next lint`: 0 errors. The one warning (`react-hooks/exhaustive-deps`
  at booking-wizard.tsx:146) predates this PR.
- `docker build` of the head and of `main`: both exit 0. The head's build log
  has no `SESSION_SECRET` string.
- The PR's suites, run locally with `SESSION_SECRET` unset in the shell:

  | Suite | PR claimed | This run |
  |---|---|---|
  | test:admin-session | 78/0 | 78 passed, 0 failed |
  | test:admin-security | 184/0 | 184 passed, 0 failed |
  | test:retention | 31/0 | 31 passed, 0 failed |
  | test:portal-handoff | 31/0 | 31 passed, 0 failed |
  | test:admin-queries | pass | all passed |
  | test:portal-token | 15/0 | 15 passed, 0 failed |
  | test:stripe-config | 29/0 | 29 passed, 0 failed |
  | test:deposits | 7/7 | 7 passed |
  | test-cancellation, test-scheduling, verify-seed | pass | all PASS, exit 0 |

- **Mutation check of the coverage walker** (run in a scratch copy of the
  head, never in the worktree). Each mutation turned `test:admin-security`
  red, and restoring it turned it green again (184/0):
  - `requireAdminPage()` removed from `admin/reports/page.tsx`: 1 failure,
    `coverage: admin/reports/page.tsx awaits requireAdminPage()`.
  - The revocation lookup in `authorizeAdmin()` disabled: 3 failures,
    including `after sign-out: A's captured pair -> 401 on all five admin APIs`.
  - `requireAdminApi` removed from `PUT /api/admin/staff/[id]`: 7 failures,
    including `forged cookie -> 401 on all five admin APIs (... staffPut: 200)`.
- **CI on #35:** Quick Verify passed. Deep Verify passed at 07:37:06Z to
  07:37:09Z, before this run existed, by matching the PR #27 report. See
  Warning 1.

### Layer 2: runtime

- `dv35-main`, `dv35-known`, `dv35-nosecret`, `dv35-unset`, `dv35-dbfail` and
  `dv35-live` were `running` with `RestartCount=0` after their sweeps. No
  signing secret appears in any of their logs (RT-*). The unconfigured
  containers boot normally, serve `/`, and are not in a crash loop.
- The only error lines in any log are the ones this run injected on
  `dv35-dbfail` (3 `sign-out revocation failed` lines plus the missing-table
  stack traces) and the `[stripe] ... not a TEST key` line on `dv35-live`.

### Layer 3 and 4: network and headless

**The PR's own e2e against the production image** (`dv35-main`, unmodified
script, `E2E_DB_CONTAINER=dv35-main`): `e2e-visitor-scope: 52 passed, 0 failed`.
That includes browsers T and U (A's id with a tampered tag, and unsigned) and
browser E (a copy of A's full pair works before Sign out, then is refused on
all 8 admin pages and all 5 admin APIs).

**The same e2e against `next start` on `127.0.0.1:18719`:** 48 passed, 4
failed, twice in a row. The 4 are the T and U checks that read the fresh
visitor cookie. A debug copy of the script showed why, and it is not the app:

- On `next start`, the middleware's redirect for `/admin` is absolute and
  names `localhost`: `location: http://localhost:18719/?admin=required`.
  The production image answers a relative `/?admin=required`. `main`'s
  `next start` does the same (`http://localhost:18718/...`), so this predates
  the PR.
- The T and U pages follow that redirect to `localhost`, so their next
  in-page `fetch` sets the fresh cookie on `localhost`, while the untrusted
  one stays on `127.0.0.1`. The debug line:
  `[{"len":76,"sec":false,"dom":"127.0.0.1"},{"len":76,"sec":true,"dom":"localhost"}]`.
  `visitorOf()` then returns the old one.
- The server did the right thing: the booking row's `visitor_id` is a fresh
  id, not A's, and a raw HTTP booking with an unsigned cookie returns the same
  fresh signed `Set-Cookie` on both servers (`probe3`).
- The PR says it passed 52/0 against `next start` on `127.0.0.1:3107`. That
  was not reproduced here with `-H 127.0.0.1`. See Warning 5.

### Layer 6: edge cases and claims (verbatim)

- **A** is the lifecycle; **J** forged sessions on `dv35-known` (whose key
  the harness holds), each sent with a harness-signed visitor cookie for the
  claimed `vid`, so each refusal isolates the session check; **R**
  cross-secret replay and rotation.
- **O** is the revocation matrix; **M** anonymous table growth; **SP**
  sign-out spam; **T** revoked-versus-invalid oracle.
- **V** is the signed visitor cookie; **N** no usable secret; **D** SQLite
  failure; **U** and **U14** pre-change databases; **S/C** the #29 scope
  regression; **L** the #30 regression; **RT** runtime.

```
== A: sign-in lifecycle and signed visitor cookie format (main) ==
PASS  A-1  GET /api/admin/session -> 405  [405]
PASS  A-1b  GET ?signout=1 -> 405 (sign-out is POST only)  [405]
PASS  A-2  no cookies: /admin -> 307 /?admin=required  [307 /?admin=required]
PASS  A-3  no cookies: POST /api/admin/services -> 401  [401]
PASS  A-4  POST /api/admin/session -> 303 Location /admin  [303 /admin]
PASS  A-5  session cookie HttpOnly; SameSite=Lax; Secure; Path=/  [path=/,secure,httponly,samesite=lax]
PASS  A-6  visitor cookie HttpOnly; SameSite=Lax; Secure; Max-Age=86400  [path=/,max-age=86400,secure,httponly,samesite=lax]
PASS  A-6b  visitor cookie value is <32 hex>.<43 char base64url>  [len 76, dot at 32]
PASS  A-7  JWT alg HS256, exp - iat = 28800 s  [alg HS256, ttl 28800]
PASS  A-9  jti 128-bit hex; JWT vid is the BARE id (== cookie id part)  [jti len 32]
PASS  A-10  both cookies: /admin -> 200 Dashboard  [200]
PASS  A-11  sign-in with a valid signed visitor cookie reuses it (no new visitor cookie)
PASS  A-12  malformed visitor cookie is replaced by a fresh signed visitor
PASS  A-13  x-middleware-subrequest bypass header, no cookies: still 307 / 401  [307/401]
PASS  A-14  7 KB garbage session cookie -> 307, no 500  [307]

== J: forged and tampered sessions (known-secret container, each WITH a valid signed visitor cookie for the claimed vid) ==
PASS  J-00  app-minted visitor cookie equals the harness's HMAC(HMAC(K1, label), id) byte for byte (format and derivation claim)
PASS  J-0  positive control: harness-minted HS256 token + harness-signed visitor accepted  [200]
PASS  J-0b  positive control: app-minted pair accepted  [200]
PASS  J-1  name-only value '1': /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-3  alg none: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-5  HS256 wrong secret: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-6  HS256 with the .env.example placeholder: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-6b  HS256 keyed with the DERIVED visitor key (cross-domain): /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-7  HS512 with the real key: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-10  vid swapped, original signature: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-11  exp extended, original signature: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-13  signature one char flipped: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-16  expired 60 s ago, real key: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-17  nbf +1 h, real key: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-18  missing jti, real key: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-20  src 'admin', real key: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-22b  vid is the SIGNED cookie string (id.tag), real key: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-23  valid session, another browser's valid signed visitor: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-23b  valid session, its own id but UNSIGNED (pre-D-016 format): /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-24  valid session, no visitor cookie: /admin 307 ?admin=required and API 401  [307; api 401; cookie cleared=true]
PASS  J-25  visitor only, no session: /admin 307 ?admin=required and API 401  [307; api 401]
WARN  J-26  real-key token with NO exp claim: accepted? revocable?  [accepted 200; sign-out 303; rows 0->0; after sign-out 200]

== R: cross-secret replay ==
PASS  R-1  main pair replayed to known  [307/401]
PASS  R-2  known pair replayed to main  [307/401]

== R: known container recreated with K2 ==
PASS  R-4  pre-rotation pair refused after rotation  [307/401]
PASS  R-5  rotation also retires the visitor cookie: sign-in mints a fresh K2-signed visitor, admin 200

== O: server-side sign-out (main container) ==
PASS  O-0  before sign-out the copied pair passes all 8 pages (200) and all 5 APIs (past auth: 400/404 validation, not 401)  [200,200,200,200,200,200,200,200,404,404,400,400,400]
PASS  O-0b  positive control: every admin page's 200 body contains at least one data marker (Sign out, KPI labels, staff names)  [4,2,1,6,1,1,1,1]
PASS  O-1  POST ?signout=1 -> 303 Location / and clears the session cookie  [303 / cleared=true]
PASS  O-2  exactly one row: jti, exp == JWT exp (epoch s), revoked_at ~ now  [exp match true; ttl 28799s; revoked_at delta 0s]
PASS  O-3  copied pair AFTER sign-out: all 8 pages 307 -> /?admin=required with no page content, all 5 APIs 401 Unauthorized  [307,307,307,307,307,307,307,307,401,401,401,401,401]
INFO  O-3b  revoked pair on a page: Location form and whether the session cookie is cleared (page cannot clear it; middleware passed it)  [Location /?admin=required; cleared on any page=false]
PASS  O-4  revoked pair with RSC headers on all 8 pages: redirect (307 or NEXT_REDIRECT digest to /?admin=required), no admin data in the flight  [200,200,200,200,200,200,200,200]
PASS  O-5  revoked pair with RSC+Next-Router-Prefetch on all 8 pages: no admin data, and byte-identical to a VALID pair's prefetch (dynamic pages are not rendered on prefetch)  [8 identical empty trees]
PASS  O-5b  revoked pair with RSC+Next-Router-State-Tree headers on all 8 pages: redirect (307 or NEXT_REDIRECT digest to /?admin=required), no admin data in the flight  [200,200,200,200,200,200,200,200]
PASS  O-6  HEAD /admin/schedule with the revoked pair -> 307  [307]
PASS  O-7  second sign-out with the same (revoked) token: 303, idempotent (no second row)  [303 rows 1]
PASS  O-8a  two sessions share one visitor, distinct jti
PASS  O-8  revocation is by jti: revoked session refused on 13 surfaces, sibling session on the same visitor still passes 13  [revoked 307,307,307,307,307,307,307,307,401,401,401,401,401 | sibling 200,200,200,200,200,200,200,200,404,404,400,400,400]
PASS  O-9  same browser can sign in again after sign-out (visitor not blacklisted)  [200]
PASS  O-10  sign-out with ONLY the session cookie (visitor cookie lost): revokes (1 row); full pair then refused on 13 surfaces  [303 rows +1; 307,307,307,307,307,307,307,307,401,401,401,401,401]
PASS  O-11  sign-out with the session + a mismatched visitor cookie still revokes (binding not required, per D-015)  [rows +1; 307]
PASS  O-12  sign-out with no cookies: 303, no row  [303]
PASS  O-13  browser after sign-out (session cookie gone) -> 307  [307]

== M: mint + revoke growth (unauthenticated table growth) ==
INFO  M-1  40 anonymous sign-in + sign-out cycles write 40 rows (each row lives until its token's exp, 8 h)  [rows +40]

== SP: sign-out spam with forged, wrong-secret or expired tokens (known container) ==
PASS  SP-1  10 sign-outs with wrong secret K2: 0 rows written  [+0]
PASS  SP-2  10 sign-outs with placeholder secret: 0 rows written  [+0]
PASS  SP-3  10 sign-outs with alg none: 0 rows written  [+0]
PASS  SP-4  10 sign-outs with derived visitor key as JWT key: 0 rows written  [+0]
PASS  SP-5  10 sign-outs with expired 60 s ago, REAL key: 0 rows written  [+0]
PASS  SP-6  10 sign-outs with nbf in the future, REAL key: 0 rows written  [+0]
PASS  SP-7  10 sign-outs with tampered jti, original signature: 0 rows written  [+0]
PASS  SP-8  10 sign-outs with garbage: 0 rows written  [+0]
PASS  SP-9  10 sign-outs with HS512 real key: 0 rows written  [+0]
PASS  SP-10  100 concurrent sign-outs with random-key tokens: 0 rows; all forged sign-outs answered  [total +0; codes 303]
INFO  SP-11  control: a REAL-key token with a random jti and vid IS written (the signature is the gate)  [+1]

== T: revoked vs invalid: response and timing differences (main) ==
INFO  T-1  GET /admin/schedule: revoked | forged-signature | no cookies all refused; DISTINGUISHABLE response shape  [revoked 307 loc=/?admin=required clear=false body=10414 || forged 307 loc=/?admin=required clear=true body=16 || none 307 loc=/?admin=required clear=false body=16]
PASS  T-2  POST /api/admin/services: revoked | forged-signature | no cookies all refused; identical response shape  [revoked 401 loc= clear=false body=24 || forged 401 loc= clear=false body=24 || none 401 loc= clear=false body=24]
INFO  T-3  POST /api/admin/services median latency ms over 30 (revoked / forged / none / valid)  [17.7 / 13.8 / 11.9 / 18.8]
INFO  T-4  GET /admin/schedule median latency ms over 30 (revoked / forged / none / valid)  [44.6 / 8.0 / 8.0 / 47.0]

== V: signed visitor cookie variants (known container, key K1 held by the harness) ==
PASS  V-0  A books: 201 and the minted cookie equals HMAC(HMAC(K1,label), id)  [201]
PASS  V-0b  DB stores the bare id (no tag)  [32]
PASS  V-0c  A's own signed cookie: confirmation 200 (shows name) and .ics 200  [200/200]
PASS  V-00  positive control: a harness-signed visitor for a new id is ACCEPTED (no new cookie, session bound to it)
PASS  V-00b  positive control: booking with it adopts that id (no new cookie)
PASS  V-1  unsigned pre-D-016 format (bare id): conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-2  tampered tag (one char flipped): conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-3  B's tag on A's id: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-4  non-canonical final base64url char (I -> J; decodes to the same 32 bytes: true): conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-5  tag under a foreign secret (K2, with label): conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-6  tag keyed with the RAW secret and no label (domain separation): conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-7  tag keyed with HMAC(label, secret) (derivation arguments swapped): conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-8  upper-case id with a VALID HMAC over the upper-case id: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-9  upper-case id with A's original tag: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-10  tag with '=' padding appended: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-11  standard base64 alphabet (+/) spelling of a valid tag: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-12  tag truncated to 42 chars: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-13  extra segment id.tag.x: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-14  empty tag (id.): conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-15  the admin session JWT in the visitor slot: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-16  HMAC-SHA-256 tag hex-encoded instead of base64url: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-17  tag over 'id' with a trailing newline: conf/.ics 404, admin gate refused, booking and sign-in mint a FRESH signed visitor  [conf 404/404; gate 307/401; book 201 fresh=true; signin fresh=true]
PASS  V-4x  harness sanity: the V-4 non-canonical spelling decodes to exactly the valid tag bytes  [true]
PASS  V-W1  leading space before the value: refused (404)  [404]
INFO  V-W2  trailing space after the value: ACCEPTED as A (parser normalized to A's exact valid cookie)  [200]
PASS  V-W3  tab inside (id\t.tag): refused (404)  [404]
PASS  V-W4  space inside (id .tag): refused (404)  [404]
PASS  V-W5  value double-quoted: refused (404)  [404]
INFO  V-W6  dot percent-encoded (%2E): ACCEPTED as A (parser normalized to A's exact valid cookie)  [200]
INFO  V-W7  two visitor cookies: bogus first, A's valid second: ACCEPTED as A (parser normalized to A's exact valid cookie)  [200]
PASS  V-W8  two visitor cookies: A's valid first, bogus second: refused (404)  [404]

== N: no usable SESSION_SECRET (nosecret) ==
PASS  N-nosecret-1  landing, wizard and availability still 200  [200/200/200]
PASS  N-nosecret-2  booking POST (no cookie, a signed cookie from another server, a deposit service) -> 503, no Set-Cookie at all, no row written  [503/503/503; set-cookie 0; rows 300->300]
PASS  N-nosecret-3  deposit-intent -> 503 'Online booking is temporarily unavailable.' (the D-016 branch, before any Stripe or body work), no Set-Cookie  [503 {"error":"Online booking is temporarily unavailable."}; garbage body 503]
PASS  N-nosecret-4  confirmation and .ics -> 404, no visitor cookie set  [404/404]
PASS  N-nosecret-5  admin: /admin and /admin/schedule 404, sign-in 404 with no cookies, all 5 admin APIs 404  [404/404/404; apis 404,404,404,404,404]
INFO  N-nosecret-6  sign-out on an unconfigured server (nothing verifiable, so nothing written)  [303 clear=true]
PASS  N-nosecret-7  cancel flow (own 128-bit token) unaffected: page 200, POST 200, row Cancelled  [200/200 Cancelled]

== N: no usable SESSION_SECRET (unset) ==
PASS  N-unset-1  landing, wizard and availability still 200  [200/200/200]
PASS  N-unset-2  booking POST (no cookie, a signed cookie from another server, a deposit service) -> 503, no Set-Cookie at all, no row written  [503/503/503; set-cookie 0; rows 300->300]
PASS  N-unset-3  deposit-intent -> 503 'Online booking is temporarily unavailable.' (the D-016 branch, before any Stripe or body work), no Set-Cookie  [503 {"error":"Online booking is temporarily unavailable."}; garbage body 503]
PASS  N-unset-4  confirmation and .ics -> 404, no visitor cookie set  [404/404]
PASS  N-unset-5  admin: /admin and /admin/schedule 404, sign-in 404 with no cookies, all 5 admin APIs 404  [404/404/404; apis 404,404,404,404,404]
INFO  N-unset-6  sign-out on an unconfigured server (nothing verifiable, so nothing written)  [303 clear=true]
PASS  N-unset-7  cancel flow (own 128-bit token) unaffected: page 200, POST 200, row Cancelled  [200/200 Cancelled]

== N: no usable SESSION_SECRET (short) ==
PASS  N-short-1  landing, wizard and availability still 200  [200/200/200]
PASS  N-short-2  booking POST (no cookie, a signed cookie from another server, a deposit service) -> 503, no Set-Cookie at all, no row written  [503/503/503; set-cookie 0; rows 300->300]
PASS  N-short-3  deposit-intent -> 503 'Online booking is temporarily unavailable.' (the D-016 branch, before any Stripe or body work), no Set-Cookie  [503 {"error":"Online booking is temporarily unavailable."}; garbage body 503]
PASS  N-short-4  confirmation and .ics -> 404, no visitor cookie set  [404/404]
PASS  N-short-5  admin: /admin and /admin/schedule 404, sign-in 404 with no cookies, all 5 admin APIs 404  [404/404/404; apis 404,404,404,404,404]
INFO  N-short-6  sign-out on an unconfigured server (nothing verifiable, so nothing written)  [303 clear=true]
PASS  N-short-7  cancel flow (own 128-bit token) unaffected: page 200, POST 200, row Cancelled  [200/200 Cancelled]

== N: no usable SESSION_SECRET (placeholder) ==
PASS  N-placeholder-1  landing, wizard and availability still 200  [200/200/200]
PASS  N-placeholder-2  booking POST (no cookie, a signed cookie from another server, a deposit service) -> 503, no Set-Cookie at all, no row written  [503/503/503; set-cookie 0; rows 300->300]
PASS  N-placeholder-3  deposit-intent -> 503 'Online booking is temporarily unavailable.' (the D-016 branch, before any Stripe or body work), no Set-Cookie  [503 {"error":"Online booking is temporarily unavailable."}; garbage body 503]
PASS  N-placeholder-4  confirmation and .ics -> 404, no visitor cookie set  [404/404]
PASS  N-placeholder-5  admin: /admin and /admin/schedule 404, sign-in 404 with no cookies, all 5 admin APIs 404  [404/404/404; apis 404,404,404,404,404]
INFO  N-placeholder-6  sign-out on an unconfigured server (nothing verifiable, so nothing written)  [303 clear=true]
PASS  N-placeholder-7  cancel flow (own 128-bit token) unaffected: page 200, POST 200, row Cancelled  [200/200 Cancelled]

== N: ordering control on a CONFIGURED server with Stripe blank (main) ==
PASS  N-ctl  configured server answers the Stripe message instead, so the D-016 check is what fired above  [503 {"error":"Card deposits are not available right now."}]

== D: SQLite failure during sign-out and during the revocation lookup (dv35-dbfail) ==
PASS  D-0  control: fresh pair -> /admin 200
PASS  D-1  INSERT fails (trigger ABORT): sign-out -> 500 JSON, session cookie still cleared, no 303  [500 clear=true {"error":"Sign-out could not be recorded. Please try again."}]
PASS  D-2  no row written  [0->0]
INFO  D-3  after the failed sign-out the copied pair still works (the 500 told the user the sign-out did not take)  [200]
PASS  D-4  trigger removed: retry -> 303, row written, pair refused  [303]
PASS  D-5  DB write-locked by another writer: sign-out -> 500 (busy), cookie cleared  [500 after 5037 ms clear=true]
INFO  D-5b  revocation READ while another connection holds the write lock (WAL readers are not blocked)  [/admin 200]
PASS  D-6  revocation table gone: valid pair on /admin, /admin/schedule and an admin API -> 5xx, no admin content (fails closed, never 'not revoked')  [500/500/500 leak=false]
PASS  D-7  table gone: sign-out -> 500 with the cookie cleared  [500 clear=true]
INFO  D-8  dv35-dbfail: 'sign-out revocation failed' lines (trigger, busy, missing table)  [3]

== U: pre-D-015 database (copied from the dv35base image, origin/main 4d19760) ==
PASS  U-0  before any request the DB has no revoked_admin_sessions table
PASS  U-1  first DB-touching request: 200 and getDb() created the table  [200]
PASS  U-1b  exp index created too  [true]
PASS  U-2  sign-in works, sign-out writes the row, the revoked pair is refused  [200/307]
PASS  U-3  revoke path purges rows whose exp has passed (backdated row gone)  [1]
PASS  U-4  after docker restart, before any request: backdated row still present (no timer)
PASS  U-5  first request after restart: hourly purge removes the expired row, keeps the live one, logs counts only  [[retention] purged 0 bookings, 0 customers, 0 messages, 1 expired revocations]
PASS  U-6  revoked pair still refused after restart (revocation is durable)

== U14: pre-D-014 database (copied from demo-slatewell:latest, the live image; read-only docker create) ==
U14-1 first request 200; revoked table + visitor_id column: true true
U14-2 sign-in pair /admin 200; sign-out 303; replay 307
PASS  U14 pre-D-014 DB upgraded in place (columns + revocation table), sign-out revokes

== S: #29 per-visitor scope regression (main) ==
PASS  S-1  A books (no cookies): 201, signed visitor minted  [201]
PASS  S-2  A's own confirmation 200 and .ics 200  [200/200]
PASS  S-3  A's admin schedule shows A's booking  [3 markers]
PASS  S-6  B's schedule for A's day: no A data  [[]]
PASS  S-8  B on all 8 admin pages: 200, no A data, no A booking id or visitor id  [clean]
PASS  S-10  B complete on A's booking: 404 identical to an unknown id, row unchanged  [404 {"error":"Booking not found"}]
PASS  S-13  A's confirmation/.ics with B's visitor: 404, no A data  [404/404]
PASS  S-14  A's confirmation/.ics with no cookies: 404, no A data  [404/404]
PASS  S-15  A's confirmation/.ics with random bare id: 404, no A data  [404/404]
PASS  S-16  A's confirmation/.ics with B signed in: 404, no A data  [404/404]
PASS  C-1  A's second booking reuses A's customer row (DB visitor_id is the bare id)  [1]
PASS  C-2  B booking with A's email gets B's own customer row; never A's name  [2 rows]
PASS  S-17  seed booking confirmation is not public  [404]
PASS  S-18  A may act on a seed booking  [200]

== L: PR #30 regression (sk_live_ dummy key must be refused) ==
PASS  L-1  deposit-intent with an sk_live_ key -> 503 card deposits unavailable  [503 {"error":"Card deposits are not available right no]
PASS  L-2  sk_live_ refusal logged without the key; pk_live_ not delivered to the wizard page  [refusal lines 1; key in log false; pk in page false]
PASS  L-3  no-deposit booking still 201 with a signed visitor  [201]

== RT: runtime (restarts, secret values in logs, unexpected errors) ==
PASS  RT-dv35-main  dv35-main: running, 0 restarts, no signing secret in logs  [running true; restarts 0; secret hits 0; other error-ish lines 0]
PASS  RT-dv35-known  dv35-known: running, 0 restarts, no signing secret in logs  [running true; restarts 0; secret hits 0; other error-ish lines 0]
PASS  RT-dv35-nosecret  dv35-nosecret: running, 0 restarts, no signing secret in logs  [running true; restarts 0; secret hits 0; other error-ish lines 0]
PASS  RT-dv35-unset  dv35-unset: running, 0 restarts, no signing secret in logs  [running true; restarts 0; secret hits 0; other error-ish lines 0]
PASS  RT-dv35-dbfail  dv35-dbfail: running, 0 restarts, no signing secret in logs  [running true; restarts 0; secret hits 0; other error-ish lines 0]
PASS  RT-dv35-live  dv35-live: running, 0 restarts, no signing secret in logs  [running true; restarts 0; secret hits 0; other error-ish lines 0]
TOTAL 160/160 passed (0 FAIL; 16 INFO; 1 WARN = J-26, see Warning 2)
```

Harness notes (not app defects; stated so the log is honest):

- **Revocation run 1 (O-3, O-4, O-5b) flagged a false leak.** The first
  criterion searched each redirect body for the page's own `<h1>` text.
  Next emits route metadata even on a redirect, so the 307 body carries
  `<title>Schedule | Slatewell</title>` plus
  `NEXT_REDIRECT;replace;/?admin=required;307;` and nothing else from the
  page. The raw bodies were inspected (`probe_html_*.txt`,
  `probe_rsc_*.txt`). The criterion was changed to data markers (the
  layout's Sign out button, KPI labels, staff names) with a positive control
  (O-0b), and the phase was re-run in full. The run 1 log is kept as
  `revoke_run1_harness_fp.log`.
- **O-5 (prefetch) failed its first criterion** because a
  `Next-Router-Prefetch` request for a dynamic page returns a 186-byte empty
  tree with no redirect digest. A valid pair gets the byte-identical tree
  (`probe2`), so no page is rendered on prefetch at all. The check was
  re-run as "no data and identical to a valid pair's prefetch".
- **D-8 and L-2 read only `docker logs` stdout** at first, and the lines they
  look for go to stderr. They were re-run reading both streams.
- The harness keeps the `revoke` phase's 40 mint-and-revoke cycles (M-1) in
  `dv35-main`'s table, so later row counts in that container are relative.

### Baseline: are `e2e-booking` and `e2e-cancellation` pre-existing failures?

**Confirmed pre-existing.** Both scripts, unmodified, were run 3 times each
against `next start` of `main` (`4d19760`, port 18718) and of the PR head
(port 18719), each on its own freshly seeded database, with the same
`SESSION_SECRET`:

| Script | main 4d19760 (3 runs) | PR head 5344a61 (3 runs) |
|---|---|---|
| e2e-booking | 10/3, 10/3, 11/2 | 10/3, 10/3, 10/3 |
| e2e-cancellation | 17/10, 17/10, 17/10 | 17/10, 17/10, 17/10 |

- `e2e-booking` fails the same `isVisible()`-without-a-wait heading checks
  on both: "date step renders", "details step renders", "review step
  renders". On `main` one run passed "review step renders", so they are
  timing races, not a broken wizard.
- `e2e-cancellation` fails the same 10 checks on both. The three
  confirmation-page link checks and 7 `.ics` checks
  (`ics: HTTP 200  404`) fail because it books with bare Node `fetch`,
  drops the visitor cookie, and then opens the confirmation and `.ics` with
  no cookie. That is #29's D-014 gate working as designed.
- Every other check in both scripts, including the token-protected cancel
  flow and the DB side effects, passes on both.

## 3. Claim by claim

1. **Sign-out revokes server-side: CONFIRMED.**
   - The one `authorizeAdmin()` guard covers all 8 admin pages, the layout
     and all 5 admin API handlers:
     - A copied pair works everywhere before sign-out (O-0).
     - After sign-out it is refused on every one: pages 307 to
       `/?admin=required` with no admin data, APIs 401 `Unauthorized` (O-3).
     - The same holds for RSC, prefetch, router-state and HEAD requests
       (O-4 to O-6).
     - The source grep and the mutation check show every page, the layout
       and every handler calling the guard.
   - Revocation is by `jti`. A sibling session on the same visitor keeps
     working (O-8), and the browser can sign in again (O-9).
   - Sign-out works with only the session cookie (O-10), or with a
     mismatched visitor cookie (O-11). It is idempotent (O-7).
   - **Rows expire with the token.** The row stores the JWT's own `exp` in
     epoch seconds, about 28799 s ahead (O-2). The revoke path purges
     expired rows (U-3). So does the hourly retention purge on the first
     request after a restart, which logs counts only (U-4, U-5).
   - **Forged or expired tokens are never written.** Nine forgery kinds times
     10 each, plus 100 concurrent random-key sign-outs, wrote 0 rows
     (SP-1 to SP-10). The control: a real-key token is written (SP-11).
   - **DB failure:** a failed INSERT (trigger), a busy lock or a missing
     table all give 500 JSON with the session cookie cleared, never a 303
     (D-1, D-5, D-7). A missing table on the READ side gives 5xx on pages
     and APIs, never "not revoked" (D-6).
   - A pre-D-015 DB and a pre-D-014 DB are both upgraded in place, and
     sign-out works on them (U-0 to U-6, U14).
   - **Caveat:** see Warning 2 (J-26). A verified token with no `exp` claim
     is accepted and cannot be revoked.
2. **Signed visitor cookie: CONFIRMED.**
   - The format is exactly `<32 hex>.<43 char base64url>`. The tag equals
     `HMAC-SHA-256(HMAC-SHA-256(SESSION_SECRET, "slatewell:visitor-cookie:v1"), id)`
     byte for byte (J-00, V-0), and the DB keeps the bare id (V-0b).
   - Positive controls: a harness-signed cookie is accepted for booking,
     sign-in and the admin gate (V-00, V-00b, J-0).
   - 17 variants were refused on every read and every write. Reads gave
     confirmation 404, `.ics` 404 and an admin gate refusal. Booking and
     sign-in minted a fresh signed visitor whose id is not A's (V-1 to V-17).
     The variants cover:
     - unsigned, tampered, and B's tag on A's id;
     - a non-canonical last character that decodes to the same 32 bytes
       (V-4, sanity V-4x);
     - a foreign secret;
     - the raw secret with no label, and swapped derivation arguments
       (domain separation, V-6, V-7);
     - upper case, padding, the standard alphabet, truncation, an extra
       segment, an empty tag, hex encoding, a trailing newline;
     - the admin JWT in the visitor slot.
   - Cookie-level encodings that reduce to A's exact valid cookie are
     accepted. These are a trailing space (the HTTP client trims it), `%2E`
     for the dot (the cookie parser decodes it), and a duplicate cookie where
     the valid value comes last (V-W2, V-W6, V-W7). None needs anything but
     the valid tag, so none is a forgery. Leading or inner whitespace,
     quotes and the reversed duplicate are refused.
   - With no usable secret (empty, unset, 31 chars, placeholder):
     - booking POST gives 503 with no `Set-Cookie` and no row;
     - deposit-intent gives 503 from the D-016 branch, before any Stripe or
       body work (N-ctl proves the order);
     - confirmation and `.ics` give 404;
     - the admin area, sign-in and all 5 APIs give 404;
     - landing, wizard, availability and the cancel flow still work
       (N-*-1 to N-*-7).
3. **The e2e works against a production-mode server: CONFIRMED on the
   production image**, 52 of 52. The `next start` variant gave 48/4 for an
   environmental reason that predates this PR (see Layer 3 and 4, and
   Warning 5).
4. **#29 and #30 guarantees still hold: CONFIRMED.**
   - The forged-session matrix still holds (J-*), and so do cross-secret
     replay and rotation (R-*).
   - Per-visitor scope holds on all 8 admin pages and the confirmation and
     `.ics`, and the customer find-or-create stays per browser (S-*, C-*).
   - The fail-closed admin 404 still holds (N-*-5), and the `sk_live_` key is
     refused (L-*).
   - **One #29 behavior changed on purpose:** with no usable secret, public
     booking used to return 201 with an unsigned visitor (#29 F-*-8). It now
     returns 503 (D-016). That is the intended change, not a regression.

## 4. Theater Check

| PR #35 claimed | Verification found | Verdict |
|---|---|---|
| Sign-out writes the `jti` and the token's `exp` (epoch s) to `revoked_admin_sessions` | O-2: one row, `exp` equals the JWT's, `revoked_at` about now | CONFIRMED |
| `authorizeAdmin()` guards the layout, all 8 pages and all 5 APIs | O-0, O-3 to O-6 on a copied pair; the grep; the mutation check | CONFIRMED |
| The Edge middleware still passes a signed-out pair; the page or handler refuses it | O-3b: 307 from the page render (10 KB body with the redirect digest), not the 16-byte middleware redirect; cookie not cleared | CONFIRMED |
| Forged or expired tokens are never written; idempotent | SP-1 to SP-10 zero rows; O-7 | CONFIRMED |
| DB failure on sign-out gives 500 with the cookie cleared | D-1, D-5, D-7 | CONFIRMED |
| A DB error on the lookup propagates, never "not revoked" | D-6: 500/500/500, no admin data | CONFIRMED |
| Rows are purged after `exp`, on revoke and in the hourly purge | U-3, U-4, U-5 | CONFIRMED |
| `getDb()` creates the table on older DBs | U-0, U-1, U-1b, U14 | CONFIRMED |
| Sign-out with only the session cookie still revokes | O-10 | CONFIRMED |
| Visitor cookie format and key derivation as stated | J-00, V-0 byte-for-byte | CONFIRMED |
| Only the canonical tag spelling verifies | V-4 with V-4x: same bytes, different last char, refused | CONFIRMED |
| Unsigned, tampered, foreign or malformed cookies are never trusted; writers mint fresh | V-1 to V-17 | CONFIRMED |
| No usable secret: booking and deposit-intent 503 before Stripe, no `Set-Cookie`; confirmation and `.ics` 404; admin 404 | N-* on 4 variants, N-ctl | CONFIRMED |
| Landing, wizard, availability and the cancel flow unaffected without a secret | N-*-1, N-*-7 | CONFIRMED |
| The four preview pages now call the guard and are `force-dynamic` | Source, and the build route table (`ƒ`); O-3 covers them | CONFIRMED |
| test:admin-session 78, admin-security 184, retention 31, portal-handoff 31, and the rest | Reproduced exactly | CONFIRMED |
| A mutation check turns the suite red | Page guard, revocation lookup and API guard mutations: 1, 3 and 7 failures | CONFIRMED |
| e2e:visitor-scope 52/0 against the production image | 52/0 on `dv35-main` | CONFIRMED |
| e2e:visitor-scope 52/0 against `next start` on `127.0.0.1` | 48/4 with `-H 127.0.0.1`, twice; the cause is the middleware's absolute `localhost` redirect under `next start`, same on `main` | NOT REPRODUCED (environment, not app) |
| Afterwards the container showed 1 revocation row with a TTL of 28799 s, and no secret in its logs | O-2 TTL 28799 s; RT-* 0 secret hits | CONFIRMED |
| `e2e-booking` and `e2e-cancellation` failures predate this PR | Identical failure sets on a `main` build, 3 runs each | CONFIRMED |
| Portal handoff mints from a signed visitor and 404s on an untrusted-but-unconfigured path | `test:portal-handoff` 31/31 only; no Portal-signed token available | NOT VERIFIED in-container (unit suite only) |

## 5. Blockers

None. Every claim held, and the one real gap (Warning 2) needs the signing
secret to exploit.

## 6. Warnings

### Warning 1: the Tier-3 gate was theater again

- The Deep Verify job on #35 passed at 07:37:09Z. This run started after
  that. `verify/ci/deep_gate.sh` still passes if ANY file under
  `verify/reports/` has an `Overall: PASS` line, and it matched the PR #27
  report again (#29's Warning 1, still open).
- This report carries `Tested-SHA: 5344a61...`, so a SHA-matching gate
  could use it.
- **Fix:** make `deep_gate.sh` require a report whose `Tested-SHA:` equals
  the PR head SHA and whose line 3 is `Overall: PASS`. It is small and
  mechanical, a Sonnet-class agent can do it, and it changes CI, not the app.
  Keep it out of tier-3 scope unless Drew wants it gated.

### Warning 2: a token with no `exp` is accepted and cannot be revoked (J-26)

- `verifyAdminSession()` does not require `exp`: `jose`'s `jwtVerify`
  only checks `exp` when the claim is present. `signOut()` then skips the
  revoke when `typeof session.exp !== "number"` and still answers 303.
- Evidence: a real-key token without `exp` gets `/admin` 200. Its sign-out
  returns 303 with 0 rows written, and it still gets 200 afterwards.
- Impact is low: the app always sets `exp`, so only a holder of
  `SESSION_SECRET` can mint such a token, and that holder can already mint
  anything. It still breaks the invariant that sign-out either revokes or
  says it failed.
- **Fix:** pass `requiredClaims: ["exp", "iat", "jti"]` to `jwtVerify` in
  `verifyAdminSession()`, and add a J-26-style test to
  `test:admin-session`. Two lines plus a test in auth code, so it needs a
  tier-3 PR. A Sonnet-class agent can write it; the deep verify stays with
  Opus.

### Warning 3: "revoked" and "invalid" are distinguishable (T-1, T-3, T-4)

- Both are refused, but they look different:
  - A revoked pair on a page gets a 307 from the page render: about 10 KB
    of body carrying the route title and the redirect digest, the session
    cookie not cleared, and about 45 ms (a valid pair takes about 47 ms).
  - A forged or absent pair gets the middleware's 16-byte 307, the cookie
    cleared (when present), and about 8 ms.
- On the APIs the responses are byte-identical (T-2), and only latency
  differs slightly.
- This only tells a holder of a validly signed pair that the pair was
  revoked, which they can infer anyway. The PR already discloses the
  side effect that matters: a signed-out browser keeps bouncing until the
  token expires.
- **Fix, optional:** have the page guard clear the cookie through a route
  handler redirect (for example `/api/admin/session?signout=1&stale=1`
  answering 303 with the cookie deleted) instead of a server-component
  `redirect()`. It is a design choice, so it takes an Opus-class agent plus
  Drew, as a tier-3 follow-up. Accepting it as is is also reasonable for a
  demo.

### Warning 4: anyone can grow the revocation table (M-1)

- The demo sign-in needs no credentials, so each anonymous sign-in and
  sign-out writes one row, which lives for up to 8 h. 40 cycles wrote 40
  rows.
- The PR's claim, "cannot be used to fill the table with junk", holds for
  forged tokens (SP-*), not for real ones. Each row is about 100 bytes, and
  public booking already lets anyone add rows.
- **Fix:** rate-limit `POST /api/admin/session` at the edge (Cloudflare
  rule), or accept it. An infra change a Sonnet-class agent can draft;
  applying it follows the cloudflare-config gates.

### Warning 5: the PR's e2e still breaks under `next start -H 127.0.0.1`

- Under `next start`, middleware redirects to an absolute
  `http://localhost:<port>/...`. Browsers T and U follow it to `localhost`,
  store the fresh cookie there, and then read the stale `127.0.0.1` cookie:
  48/4.
- The production image redirects relatively and passes 52/0. `main` behaves
  the same way under `next start`, so this predates the PR.
- **Fix:** in `scripts/e2e-visitor-scope.mjs`, `goto(BASE_URL + "/")` after
  the admin redirect, before the booking fetch in T and U. Or pick the
  cookie whose `domain` matches `new URL(BASE_URL).hostname`. Test-only, so
  a Haiku- or Sonnet-class agent can do it.

### Warning 6: two e2e scripts are red on `main` (pre-existing, confirmed)

- `e2e-cancellation` books through bare Node `fetch`, so it drops the visitor
  cookie and its confirmation and `.ics` checks 404 under D-014.
- `e2e-booking` has heading checks racing the wizard.
- **Fix:** in `e2e-cancellation`, book inside a Playwright page and keep that
  context for the confirmation and `.ics`. In `e2e-booking`, add
  `waitFor()` before each `isVisible()`. Test-only, so a Sonnet-class agent
  can do it.

### Minor, not blocking

- A failed sign-out (500) leaves the copied pair valid (D-3). That is honest
  and documented: the user is told it did not take.
- The duplicate `slatewell_visitor` rule is "last one wins" (V-W7, V-W8).
  That is harmless today and worth knowing if a parent-domain cookie ever
  appears.
- The build still prints the `jose` "Node.js API in Edge Runtime" warnings,
  which predate this PR.

### Coverage gaps (stated so the PASS is not overclaimed)

- **Layer 5 (headed Chrome) was not run**, by instruction. All browser work
  was headless Chromium.
- The Portal handoff was not exercised with a real Portal-signed token (no
  key). Its signed-visitor mint rests on `test:portal-handoff` (31/31).
- Timing (T-3, T-4) was measured on the local loopback only, not through
  the edge.
- The repo's `smoke.yml` and `home.yml` assertion runner was not re-run.
  This PR does not touch the landing page. The admin-session assertions
  are covered by A-2, A-4, A-10, O-1 and O-13.
- The public edge and the live container were not touched. What the live
  container runs with, and whether `data/` is volume-mounted there, was not
  inspected.
- Cross-site CSRF behavior of `SameSite=Lax` on sign-out was not tested in a
  browser.
- axe, visual regression and cross-browser runs were not done.
