# Deep Verify: PR #39 bound admin session lifetime by value (2026-09-19)

Overall: PASS
Tested-SHA: cacc3db571459bd827225a8ba1d8cb5657e9a2ad

Every claim in the PR body holds. 115 of 116 harness checks passed against a
freshly built production image and, separately, against a build with the Edge
middleware switched off so the Node guards answer alone. The one non-pass is
an assertion-shape artifact in my own harness, not a defect (Warning 5). The
PR's stated suite counts reproduced exactly (94 and 260), and both stated
mutation checks reproduced exactly: 4 and 25 red with the explicit `exp - iat`
bound removed, 1 and 10 red with `maxTokenAge` removed.

Thirty eight hand-signed hostile token shapes, each signed with the
container's real key and paired with a validly signed visitor cookie, were
refused on all 8 admin pages and all 5 mutating admin APIs at both layers,
with the database byte identical afterwards and a positive control proving the
same request bodies do write when the token is good. That includes every shape
the PR admits it did not test: `exp` and `iat` as strings, `NaN`, `Infinity`,
`-Infinity`, values past `Number.MAX_SAFE_INTEGER`, exponent notation, and a
negative `iat`. The TTL boundary is exact: `exp - iat === 28800` passes,
`28801` fails, `iat` exactly now passes, `iat` one second in the future fails.
The bound reads the real `SESSION_TTL_SECONDS` import; changing that constant
to 600 in a scratch copy moved the boundary with it.

Zero clock tolerance is safe in this deployment. The compose file runs exactly
one `demo-slatewell` container with a pinned `container_name` and no replica
setting, and `docker top` shows a single `next-server` process, so the Edge
middleware and the Node guards mint and verify against the same `Date.now()`.
See section 6 for what changes with more than one instance.

The PASS carries five warnings. The one worth reading is Warning 1: the
float-rounded pair `iat: 1e18, exp: 1000000000000003600` is refused by
`maxTokenAge` alone, and the explicit bound alone accepts it. No test in the
repo covers that shape, so the "1 and 10" mutation numbers understate what
`maxTokenAge` is actually load bearing for.

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-slatewell` PR #39, branch
  `fix/session-lifetime-bounds`, head `cacc3db`
  (`cacc3db571459bd827225a8ba1d8cb5657e9a2ad`), base `main` at `5c09359`
  (the merge base is `5c09359`, so the PR is exactly one commit on top of
  merged #38). Not merged at the time of this run. The `tier-3` label is on
  the PR.
- **Why deep:** the change is inside `verifyAdminSession()`, the single
  function the Edge middleware, the page guard (`authorizeAdmin`) and every
  API guard (`requireAdminApi`) verify a session through.
  `verify/tier_map.yml` lists `admin-session-post` and `admin-unauthenticated`
  at tier 3.
- **Mode:** deep. Layers 1, 2, 3, 4 and 6 ran. **Layer 5 (headed Chrome) was
  not run**, by instruction; all browser work was headless Chromium
  (Playwright 1.60.0). The adversarial generator was not run; the attack list
  came from the dispatch, the diff, D-019, jose 6.2.3's source and my own
  reading.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC that did not write the
  PR.
- **Image:** one image, `demo-slatewell:dv39`, built from the worktree
  `C:\dev\demo-slatewell-wt-life` at `cacc3db` with
  `docker build --secret id=npmrc,src=<scratch npmrc>`. Build exit 0.
  `NODE_ENV=production`, so every cookie is `Secure`.
- **Containers:** `dvs39-main` (18751, throwaway `SESSION_SECRET` K1, no
  Stripe variables), `dvs39-stripe` (18752, K1 plus the fake Stripe env file
  passed by path with `--env-file`), `dvs39-nosecret` (18753, no
  `SESSION_SECRET`). All bound to `127.0.0.1`, all with
  `--add-host api.stripe.com:127.0.0.1`.
- **One extra server, not a container:** `next start -H 127.0.0.1 -p 18759`
  from a scratch `git archive` copy of `cacc3db` whose only edit is
  `src/middleware.ts`'s matcher, changed to a path that never matches. The
  worktree was not touched. This is the only way to watch the Node guards
  refuse on their own, because in the shipped app the middleware answers first
  for every `/admin` and `/api/admin` request.
- **Secrets:** `SESSION_SECRET` K1 is 32 random bytes as 64 hex characters,
  generated in node for this run, written to the run directory, never printed
  and never passed on a command line. No file under `C:\Users\Drama\.secrets`
  and no `.env*` file was read, opened, hashed or printed. The npmrc and the
  fake Stripe env file were passed by path only. No 401 occurred at any point.
- **Not touched:** the live `demo-slatewell` container, the public URL,
  `demo-proxy`, `C:\dev\_deploy\cloudflare-config` (read only, for section 6),
  and `demo-slatewell:latest` and `:previous`.
- **Cleanup:** all `dvs39-*` containers and the `demo-slatewell:dv39` image
  were removed at the end of the run, the `next start` process was stopped,
  and the scratch copies and their `node_modules` junctions were deleted.
- **Evidence:** raw logs and the harnesses under the session scratchpad,
  `verify-runs/demo-slatewell-pr39-deep/` (`h39.mjs`, `r39.mjs`, `b39.mjs`,
  `mutate.mjs`, `probe-image.js`, `h39-main.log`, `h39-nomw.log`,
  `regress.log`, `browser.log`, `runtime-dvs39-*.log`,
  `e2e-visitor-scope.log`, `e2e-stripe-load-failure.log`, `mutA-*.log`,
  `mutB-*.log`, `mutC-ttl600-*.log`, `build.log`, `nomw-build.log`).

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| auth_lifecycle | PASS | R-1 to R-13, P-01 to P-07 |
| lifetime bounds (D-019) | PASS (2 WARN) | H-01 to H-39 and H-DB on both layers |
| claim requirement (D-018) | PASS | H-32, H-33, H-34 on both layers |
| revocation (D-015) | PASS | R-5 to R-10 |
| signed visitor (D-016) | PASS | V-1, R-12 |
| security (fail closed) | PASS | R-13 on `dvs39-nosecret` |
| data_crud / scope (#29) | PASS | R-11, e2e-visitor-scope 52 of 52 |
| error_handling | PASS | H-DB, R-13, B-5 |
| edge_cases | PASS | the H sweep, 38 variants on 13 surfaces, twice |
| smoke | PASS | all three containers served `/` 200, 0 restarts |
| navigation | PASS | e2e-visitor-scope 52 of 52, B-2 to B-4 |
| performance | SKIP | the change adds one integer comparison inside an existing verify |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge |
| accessibility | SKIP | axe is not in the harness |
| mobile_responsive | SKIP | the PR renders nothing |
| visual_regression | SKIP | no baseline exists |
| cross_browser | SKIP | headless Chromium only |

### Layer 1: code (at `cacc3db`)

- `npx tsc --noEmit`: exit 0. `npm run lint`: exit 0, one pre-existing
  `react-hooks/exhaustive-deps` warning in `booking-wizard.tsx:146`.
- `docker build`: exit 0. The built artifact carries the fix in both runtimes.
  The exact string `requiredClaims:["exp","iat","jti"],maxTokenAge:28800`
  appears in `.next/server/src/middleware.js` (Edge) and in the Node server
  chunks `chunks/132.js` and `chunks/590.js`, each followed by the minified
  explicit bound (`...||d-f<=0||d-f>28800`).
- The PR's suites, run locally with `SESSION_SECRET` unset in the shell:

  | Suite | PR claimed | This run |
  |---|---|---|
  | test:admin-session | 94/0 | 94 passed, 0 failed |
  | test:admin-security | 260/0 | 260 passed, 0 failed |
  | test:admin-queries | pass | all passed |
  | test:retention | pass | 31 passed, 0 failed |
  | test:portal-token | pass | 15 passed, 0 failed |
  | test:portal-handoff | pass | 31 passed, 0 failed |
  | test:deposits | pass | 7 passed |
  | test:stripe-config | pass | 29 passed, 0 failed |
  | test-cancellation, test-scheduling | pass | all PASS, exit 0 |

- **Diff review:** `git diff --numstat origin/main...cacc3db` is exactly the
  four stated files: `docs/decisions.md` (+82/-1, the new D-019 section plus
  one line inside D-018 replaced by two), `scripts/test-admin-security.ts`
  (+94/-22), `scripts/test-admin-session.ts` (+72/-0),
  `src/lib/admin-session.ts` (+41/-0).
  Nothing under `src/` outside `admin-session.ts`, nothing under `verify/`,
  no `package.json` or lockfile change, no workflow change. The source change
  is one `jwtVerify` option, one eleven line post-verify block and a comment.
- **The constant is the real import, not a copy (attack 3).** `src/` contains
  exactly one definition, `export const SESSION_TTL_SECONDS = 60 * 60 * 8;`
  at `admin-session.ts:35`, read by the mint at line 274, by `maxTokenAge` at
  line 339 and by the bound at line 357. There is no `28800` literal anywhere
  in `src/`. Proof beyond grep: in a scratch copy with that one constant
  changed to `600`, `test:admin-session` goes 93 passed, 1 failed, and the one
  failure is the unrelated hardcoded assertion `expiry is about 8h out`. Every
  W1 boundary check still passes, which can only happen if the accepted
  boundary moved from 28800 to 600 with the constant. A duplicated literal
  would have left `one second over the TTL rejected` red.
- **Handler coverage (attack 4).** Enumerated by grep for `^export` under
  `src/app/api/admin`: six exported HTTP handlers exist, no more.
  `bookings/[bookingId]/complete` POST, `bookings/[bookingId]/no-show` POST,
  `services` POST, `services/[id]` PUT, `staff/[id]` PUT, and `session` POST.
  `allAdminApis` covers the first five. The sixth is the sign-in endpoint,
  correctly excluded because it is the way in; its sign-out branch
  (`?signout=1`) does call `verifyAdminSession` and is covered by the suite's
  section 9 and by R-5 to R-10 below. No `export const GET/POST/...` style
  handler exists anywhere under that tree. The coverage claim is accurate.

#### Mutation checks (attack 5), redone independently

Both were done in a scratch `git archive` copy of `cacc3db` with a
`node_modules` junction, never in the worktree. The pristine file was hashed
before each mutation and compared after each restore.

- **Removing only the explicit `exp - iat` block** (keeping `maxTokenAge`):
  `test:admin-session` **90 passed, 4 failed**; `test:admin-security`
  **235 passed, 25 failed**. The PR claims 4 and 25. Exact match. The four
  unit failures are `exp 100 years out`, `fractional exp`, `fractional iat`
  and `exp - iat one second over the TTL`. The 25 integration failures break
  down as 4 shapes times 5 direct checks (two middleware page checks, one
  middleware API check, the page guard, the five-handler API guard) = 20,
  plus the 3 `W1: rejected bad-lifetime tokens changed nothing` data
  assertions = 23, plus 2 cascade failures later in the suite
  (`A's booking unchanged by B` and `no-show: A on own booking -> 200 (409)`)
  caused by the accepted tokens having already completed booking A and
  renamed service 1 and staff 1 to "Hacked". The cascade is real, not noise:
  it is the same mutation showing up downstream.
- **Removing only `maxTokenAge`** (keeping the explicit block):
  `test:admin-session` **93 passed, 1 failed**; `test:admin-security`
  **250 passed, 10 failed**. The PR claims 1 and 10. Exact match. The single
  unit failure is `W1: iat in the future rejected`; the ten are that one shape
  times 5, plus the same 3 data assertions, plus the same 2 cascades.
- **Restore.** After each mutation the file was restored from the pristine
  copy and `Get-FileHash` matched byte for byte, and the full suites were
  green again (94 and 260). `git status --porcelain` and `git diff --stat` in
  `C:\dev\demo-slatewell-wt-life` are both empty, and `git rev-parse HEAD` is
  still `cacc3db571459bd827225a8ba1d8cb5657e9a2ad`.

#### Which layer catches which shape

A direct probe of `verifyAdminSession` in the scratch copy, unmutated and
under each mutation (`probe-float.ts`):

| Shape | PR head | no `maxTokenAge` | no explicit bound |
|---|---|---|---|
| float-rounded pair, `iat: 1e18`, `exp: 1000000000000003600` | REJECTED | **ACCEPTED** | REJECTED |
| `exp` 100 years out | REJECTED | REJECTED | **ACCEPTED** |
| `iat` in the future | REJECTED | **ACCEPTED** | REJECTED |
| `iat` at the epoch | REJECTED | REJECTED | REJECTED |
| negative `iat` | REJECTED | REJECTED | REJECTED |
| fractional `exp` | REJECTED | REJECTED | **ACCEPTED** |
| `exp - iat` = TTL but already expired | REJECTED | REJECTED | REJECTED |
| control: ordinary token | ACCEPTED | ACCEPTED | ACCEPTED |

Two things follow, both in section 6. `maxTokenAge` is load bearing for more
than the one shape the suite covers (Warning 1), and `iat` at the epoch and
negative `iat` are caught by the explicit bound on its own, so the code
comment's claim that `maxTokenAge` "catches `iat` at/near the epoch" is true
in isolation but redundant in the shipped combination (Warning 2).

### Layer 2: runtime

`dvs39-main`, `dvs39-stripe` and `dvs39-nosecret` were all `running` with
`RestartCount=0` after their sweeps. No error lines in `dvs39-main` or
`dvs39-stripe` logs. `dvs39-nosecret` logs exactly one expected line, the
`[admin-session] Admin area disabled (404)` warning. The signing secret does
not appear in any container's log. `docker top dvs39-main` shows a single
`next-server` process.

### Layers 3, 4 and 6: the lifetime matrix

Every variant is signed with the container's REAL key and sent with a valid
signed visitor cookie for the `vid` it claims, so a refusal isolates the
session check rather than the visitor binding. V-1 proves the harness's
visitor signature is the app's own: signing in with it returns a session and
mints no replacement visitor cookie. Each variant was sent to all 8 admin
pages and all 5 admin APIs with bodies that WOULD mutate (`complete` and
`no-show` on a real seeded Confirmed booking, `POST /api/admin/services`,
`PUT /api/admin/services/1`, `PUT /api/admin/staff/1`, the last three with the
suite's own "Hacked" payloads). Clock-relative variants are re-signed
immediately before every single request, so none of them goes stale mid sweep.

```
== C: lifetime matrix, production image dvs39-main (Edge middleware first) ==
PASS  V-1   harness-signed visitor cookie accepted by the app, no new visitor minted
PASS  V-2   app-minted session: exp - iat === 28800, 128-bit hex jti
INFO  V-3   target booking bk_07nr1jnnk0 (seeded, Confirmed)
PASS  H-01  exp as a numeric STRING "9999999999"    8 pages 307 /?admin=required, 5 APIs 401
PASS  H-02  iat as a numeric STRING                 idem
PASS  H-03  exp NaN (raw JSON token)                idem
PASS  H-04  iat NaN (raw JSON token)                idem
PASS  H-05  exp Infinity (raw JSON token)           idem
PASS  H-06  exp -Infinity (raw JSON token)          idem
PASS  H-07  iat Infinity (raw JSON token)           idem
PASS  H-08  exp 1e12 (exponent notation)            idem
PASS  H-09  exp 9007199254740993 (> MAX_SAFE_INTEGER) idem
PASS  H-10  negative iat (-1000)                    idem
PASS  H-11  float-rounded pair: iat 1e18, exp 1000000000000003600
            (exp - iat rounds to 3584, both integers, lifetime in bounds)   idem
PASS  H-12  float-rounded pair in the far past: iat -1e18   idem
PASS  H-13  exp 100 years out, fresh iat            idem
PASS  H-14  iat one hour in the future              idem
PASS  H-15  iat after exp, both in the future       idem
PASS  H-16  iat after exp, already expired          idem
PASS  H-17  iat at the epoch (0)                    idem
PASS  H-18  fractional exp                          idem
PASS  H-19  fractional iat                          idem
PASS  H-20  exp equal to iat (zero lifetime)        idem
PASS  H-21  exp - iat one second over the TTL       idem
PASS  H-22  iat one second in the future            idem
PASS  H-23  iat 60 seconds in the future            idem
PASS  H-24  exp boolean true                        idem
PASS  H-25  exp null                                idem
PASS  H-26  exp object                              idem
PASS  H-27  exp array                               idem
PASS  H-28  stale iat (30000 s ago, exp still future)  idem
PASS  H-30  duplicate exp keys, valid first and huge last (JSON keeps the last)  idem
PASS  H-31  exp - iat exactly the TTL but exp already in the past  idem
PASS  H-32  missing exp   (D-018 regression)        idem
PASS  H-33  missing iat   (D-018 regression)        idem
PASS  H-34  missing jti   (D-018 regression)        idem
PASS  H-35  exp 1e1000 (parses to Infinity)         idem
PASS  H-36  iat -1e1000 (parses to -Infinity)       idem
PASS  H-37  iat 1e1000 (parses to Infinity)         idem
PASS  H-38  exp and iat both 1e1000 (exp - iat is NaN)  idem
PASS  H-39  nbf one hour in the future (regression) idem
PASS  H-RSC RSC-header probe on /admin with exp 100 years out: 307, body 16 bytes,
            no admin data
PASS  H-DB  no rejected call changed the database (services, staff, staff_services,
            booking status counts) [byte identical]
PASS  P-01  exp - iat exactly the TTL, iat now           all 8 pages 200
PASS  P-02  ordinary short-lived token (60 s)            all 8 pages 200
PASS  P-03  iat TTL-30 s ago, exp 30 s out (lifetime exactly the TTL)  all 8 pages 200
PASS  P-04  app-minted session                           all 8 pages 200
PASS  P-07  duplicate exp keys, huge FIRST and valid last (effective exp is valid,
            so acceptance is correct)                    all 8 pages 200
PASS  P-05  valid token: all 5 admin APIs get past auth (no 401)
PASS  P-06  the SAME bodies DID write with a valid token, so H-DB is meaningful
            (services 8 -> 9, service 1 and staff 1 renamed, booking A Completed)

49 passed, 0 failed
```

On every page refusal in the production image the body was under 100 bytes and
the session cookie was cleared, which is the Edge middleware's own 307.

The same 38 hostile variants and the same controls were then replayed against
the middleware-disabled server on 18759:

```
== NM: lifetime matrix, middleware DISABLED (Node guards alone) ==
PASS  NM-0   a junk session value reaches the page render (307, ~9.6 KB body,
             session cookie NOT cleared), which proves the middleware is off:
             the container answers the same request with a 16 byte body and a
             cleared cookie
PASS  H-01 .. H-39   identical verdicts, all 13 surfaces, this time refused by
             requireAdminPage / requireAdminApi through authorizeAdmin
PASS  H-DB   no database change
PASS  P-01 .. P-07   same positive controls, all 8 pages 200, 5 APIs past auth
NOTE  H-RSC  200 rather than 307, see Warning 5: Next answers an RSC request
             with the flight encoding of the redirect. Inspected by hand: the
             5077 byte body contains "admin=required" and contains neither
             "Wave Wellness" nor any admin nav, so no admin data leaks

48 passed, 1 assertion-shape note, 0 real failures
```

P-01 and H-21 together are the boundary the dispatch asked for, measured
against the real constant: `exp - iat === 28800` passes on all 13 surfaces,
`28801` fails on all 13. P-01 and H-22 are the `iat` boundary: `iat` exactly
now passes, `iat` one second in the future fails, re-signed per request so the
verdict does not rest on a race. P-03 shows the two checks compose rather than
one masking the other: an `iat` almost a full TTL in the past with a lifetime
of exactly the TTL and an `exp` still in the future is accepted, which needs
`maxTokenAge` to allow it and the explicit bound to allow it at the same time.

### Regression sweep (`regress.log`, 13 of 13)

```
PASS  R-1   no cookies: /admin 307 /?admin=required, admin API 401
PASS  R-2   sign-in 303 to /admin, cookie HttpOnly; SameSite=Lax; Secure; Path=/
PASS  R-3   minted session: exp - iat === 28800, 128-bit hex jti, src demo, vid bound
PASS  R-4   valid pair: all 8 pages 200, all 5 APIs past auth
PASS  R-5   sign-out: 303 to /, cookie cleared, exactly one new revocation row
            whose jti AND exp are the JWT's (D-015, #35)
PASS  R-6   the same pair AFTER sign-out: 8 pages 307, 5 APIs 401
PASS  R-7   second sign-out with the revoked token is idempotent (no extra row)
PASS  R-8   revocation is per jti: the signed-out sibling is 307, a second
            session on the same visitor is still 200
PASS  R-9   sign-out with ONLY the session cookie still revokes it
PASS  R-10  a hand-signed token at the exact TTL boundary: 200 before sign-out,
            revocation row written, 307 after (the new bound does not break D-015)
PASS  R-11  #29 forgery matrix, 9 variants (legacy name-only value, alg none,
            foreign HS256 key, the .env.example placeholder, src admin, missing
            sub, missing vid, another browser's vid, jti not 128-bit hex):
            /admin 307 and admin API 401 on every one
PASS  R-12  visitor binding (D-016): another visitor, an unsigned visitor id, a
            foreign-key visitor tag and no visitor cookie are all 307; only the
            matching signed visitor is 200
PASS  R-13  no SESSION_SECRET: landing 200, /admin 404, sign-in 404, admin APIs 404
```

### Headless Chromium (`browser.log`), every `*.stripe.com` request aborted

```
PASS  B-1  #37: /book on the container with no Stripe keys fires zero
           *.stripe.com requests and throws nothing
PASS  B-2  real browser, exp 100 years out: /admin lands on /?admin=required
           with no admin chrome
PASS  B-3  same token on /admin/schedule: redirected home
PASS  B-4  control: one-click sign-in renders the dashboard
PASS  B-5  no page errors during the whole walk
```

### Repo suites against the containers

- `e2e:visitor-scope` (unmodified, `BASE_URL=http://127.0.0.1:18751`,
  `E2E_DB_CONTAINER=dvs39-main`): **52 passed, 0 failed**, including the
  captured-pair-after-sign-out section on all 8 pages and all 5 APIs. This is
  the per-visitor scope check (#29) the dispatch asked for.
- `e2e-stripe-load-failure` against `dvs39-stripe` with the fake keys and
  `api.stripe.com` pinned to `127.0.0.1`: **7 passed, 0 failed**, which also
  exercises the card step reached through the wizard with `js.stripe.com`
  blocked (#37).

## 3. Claim by claim

1. **`verifyAdminSession` passes `maxTokenAge: SESSION_TTL_SECONDS`, the same
   constant minting uses, plus a post-verify check that `exp - iat` is a
   positive integer no greater than that TTL: CONFIRMED.** Source lines 339
   and 350 to 360, one constant definition at line 35, no `28800` literal in
   `src/`, and the TTL-600 experiment proves the bound follows the import.
   The built image carries both in the Edge bundle and the Node chunks.
2. **Together they refuse exp far in the future, iat in the future, iat after
   exp, fractional exp or iat, and a lifetime one second over the TTL:
   CONFIRMED.** H-13, H-14, H-15, H-16, H-18, H-19, H-21 on 13 surfaces at
   both layers, plus the unit suite.
3. **No clock tolerance was added, deliberately: CONFIRMED and judged safe
   here.** No `clockTolerance` anywhere in the repo. Section 6 has the
   topology argument and the condition that would change it.
4. **`test:admin-security` now exercises all 5 admin API handlers everywhere:
   CONFIRMED.** Both the D-018 missing-claim section and the new D-019 section
   call the one `allAdminApis` helper, and the helper's five entries are
   exactly the five non-sign-in exported handlers that exist. I enumerated
   them independently.
5. **Counts 94 and 260: CONFIRMED.** Reproduced exactly.
6. **Mutation numbers 4/25 and 1/10: CONFIRMED.** Reproduced exactly,
   independently, in a scratch copy, with the red check names listed above.
7. **Shapes the PR admits it did not test: ALL REFUSED.** Strings, `NaN`,
   `Infinity`, `-Infinity`, `> MAX_SAFE_INTEGER`, exponent notation, negative
   `iat`, and the float-rounded pair I added. H-01 to H-12, H-35 to H-38.
8. **Nothing else changed: CONFIRMED.** Four files, listed above.
9. **#35 revocation, #38 missing-claim refusals, #37 lazy Stripe and the
   per-visitor scope are unregressed: CONFIRMED.** R-5 to R-10, H-32 to H-34,
   B-1 and the Stripe e2e, R-12 and e2e-visitor-scope 52 of 52.

### How each unreachable shape actually dies, so the PASS is not overclaimed

`NaN`, `Infinity` and `-Infinity` cannot be carried as JSON literals: raw
`NaN` or `Infinity` text makes `JSON.parse` throw inside jose, so H-03 to H-07
are refused at payload parse, before either new check runs. That is a real
refusal but not evidence for the new bound. The reachable way to get a
non-finite value is `1e1000`, which parses to `Infinity`; H-35 to H-38 use it,
and those die on `Number.isInteger`, which is the new block. Strings, booleans,
`null`, objects and arrays in `exp` die in jose's own type check before the
new block. The shapes that genuinely depend on this PR are H-11, H-13, H-14,
H-18, H-19, H-21, H-22, H-23 and H-35 to H-38.

## 4. Theater Check

| PR #39 claimed | Verification found | Verdict |
|---|---|---|
| `maxTokenAge: SESSION_TTL_SECONDS` is passed to `jwtVerify` | Source line 339; `maxTokenAge:28800` in the Edge bundle and both Node chunks | CONFIRMED |
| Plus an explicit `exp - iat` positive-integer bound no greater than the TTL | Source lines 350 to 360; same minified form in the image | CONFIRMED |
| The same 8-hour constant minting uses, not a second copy | One definition, no `28800` literal in `src/`, and the bound moves when the constant moves | CONFIRMED |
| Those refuse exp far out, iat future, iat after exp, fractional claims, TTL + 1 | 38 hostile shapes, 13 surfaces, both layers, no DB change | CONFIRMED |
| No clock tolerance, because mint and verify share one process clock | One container, one `next-server` process, no replicas in compose | CONFIRMED |
| `test:admin-security` exercises all five admin API handlers everywhere | Both sections call one helper; the five are the complete non-sign-in set | CONFIRMED |
| test:admin-session 94/0, test:admin-security 260/0 | Reproduced exactly | CONFIRMED |
| Mutation: removing the explicit bound turns 4 and 25 red | 90/4 and 235/25, same check names | CONFIRMED |
| Mutation: removing `maxTokenAge` turns 1 and 10 red | 93/1 and 250/10, same check names | CONFIRMED |
| Both mutations reverted, file byte identical, suite green | Reproduced; hash match after every restore; worktree clean | CONFIRMED |
| tsc clean, lint exit 0, build succeeds | Reproduced, same single pre-existing warning | CONFIRMED |
| Every existing check unchanged (HS256 pin, requiredClaims, shape, visitor binding, revocation) | R-5 to R-13, H-32 to H-34, e2e 52 of 52 | CONFIRMED |
| D-019: "`maxTokenAge` catches `iat` at/near the epoch or otherwise stale" | True of that layer alone, but the explicit bound already refuses both shapes on its own, so nothing depends on `maxTokenAge` for them | OVERSTATED, see Warning 2 |
| D-019: removing `maxTokenAge` turns only the "iat in the future" shape red, implying that is all it buys | The float-rounded pair `iat: 1e18` is also accepted without it, and no test covers that shape | UNDERSTATED, see Warning 1 |

## 5. Blockers

None. Nothing in this PR regressed any behavior this run could reach, every
stated claim held on every surface at both layers, and no hostile shape I
could construct got past the gate.

## 6. Warnings

### Warning 1: `maxTokenAge` is load bearing for a shape no test covers

The PR's mutation numbers say removing `maxTokenAge` costs exactly one shape,
"`iat` in the future with an otherwise in-bounds `exp - iat`". That is true of
the test suite but not of the code. A second shape also slips through without
it: very large `iat` and `exp` values where double rounding puts their
difference back inside the TTL. With `iat: 1e18` and
`exp: 1000000000000003600`, both values are integers by `Number.isInteger`,
and `exp - iat` evaluates to 3584, comfortably inside the 28800 bound, so the
explicit check accepts it. Only `maxTokenAge` refuses it, because `1e18`
seconds is in the future. The table in section 2 shows this directly.

This is not a defect in the PR, whose shipped combination refuses the shape
(H-11, on 13 surfaces, at both layers). It is a durability gap: if a later
change ever removed `maxTokenAge` on the reasoning that the explicit bound
covers everything, one unit check would go red and a silent forever-session
would become reachable. Two lines in `test:admin-session` with this token
shape would pin it. Test-only, Haiku or Sonnet class.

### Warning 2: the `iat` at/near the epoch reasoning is redundant, not wrong

Both `docs/decisions.md` D-019 and the comment on `verifyAdminSession` say
`maxTokenAge` "catches `iat` at/near the epoch or otherwise stale". In
isolation that is true. In the shipped combination it is redundant: an `iat`
at the epoch or 30000 seconds ago with an `exp` in the near future produces a
lifetime far over the TTL, so the explicit bound refuses it first, and the
probe table confirms both shapes are still REJECTED with `maxTokenAge`
removed. The same is true of `iat` after `exp`, which D-019 already flags as
defense in depth. This is the same shape of finding as #38's Warning 3 about
`jti`: nothing is wrong with the belt and braces, but the stated security
gain of the `maxTokenAge` layer is specifically "`iat` in the future" and the
large-value rounding case, not the epoch cases.

### Warning 3: jose's own `exp` check is an unstated dependency

The new block deliberately does not check `exp` against "now"; it only relates
`exp` to `iat`. A token with `exp - iat` exactly the TTL but `exp` already in
the past is refused by jose's expiry validation, not by anything in this PR
(H-31, and the probe table shows it stays REJECTED under both mutations). That
is correct and not worth duplicating, but it means the invariant "an expired
session never verifies" now rests on a jose option the repo never asserts
against directly. `test:admin-session` does cover an expired token elsewhere,
so this is a documentation point rather than a coverage gap.

### Warning 4: zero clock tolerance is safe today, and the condition is unwritten

The deployment is one container per demo:
`C:\dev\_deploy\cloudflare-config\edge\docker-compose.yml` declares
`demo-slatewell` with `container_name: demo-slatewell`, a single `8105:3000`
port mapping, no `deploy.replicas` and no scale setting, and the pinned
`container_name` makes scaling impossible without editing that file. Inside
the container `docker top` shows one `next-server` process, and self-hosted
Next runs the Edge middleware in that same Node process, so mint and verify
read the same `Date.now()`. There is no cross-host skew to absorb, and the
run bears this out: `iat` exactly now and `exp - iat` exactly 28800 passed
every time across several hundred requests, with no flake. **Zero tolerance
is the right call here.**

What would change it: more than one instance behind a load balancer, or
minting in one process and verifying in another (a separate Edge runtime, a
second container, a Worker). Then an `iat` stamped on host A can be a second
or two in the future from host B's clock, and `maxTokenAge` with zero
tolerance refuses a freshly minted, entirely legitimate session. NTP keeps
hosts within tens of milliseconds normally but drifts further after a network
partition or on a VM resumed from a snapshot. The fix at that point is either
a small `clockTolerance` (a few seconds, which costs exactly that much of the
slack this PR closes) or minting `iat` a few seconds in the past, and either
is a tier-3 change with its own deep verify. Nothing in the repo records that
precondition; a line in D-019 saying "this assumes a single instance, revisit
if slatewell is ever scaled out" would make the assumption survive the next
deployment change. Docs-only.

### Warning 5: my RSC assertion, not the app

On the middleware-disabled server the RSC-header probe on `/admin` returns 200
rather than 307, because Next answers an RSC request with the flight encoding
of a redirect instead of an HTTP redirect. My harness asserted 307 and counted
it a failure. Inspected by hand, the 5077 byte body contains `admin=required`
and contains neither `Wave Wellness` nor any admin nav, so no admin data
leaks. On the production image the same probe is a plain 307 with a 16 byte
body. No defect; recorded so the 115 of 116 number is honest.

### Minor, not blocking

- The middleware-disabled build exists only in the scratch run directory and
  was never pushed anywhere; it is the only way to observe the Node guards in
  isolation, since the shipped middleware answers first.
- `H-29` in an earlier pass of my harness (duplicate `exp` keys, huge first
  and valid last) was accepted, and that is correct: `JSON.parse` keeps the
  last duplicate key, so the effective `exp` is the valid one. There is no
  parser split-brain, jose and the new block read the same parsed object.
  It is recorded as positive control P-07, and its mirror image H-30 (valid
  first, huge last) is refused.
- `nbf` is still only validated by jose. H-39 confirms a future `nbf` is
  refused; nothing in this PR touches that.
- The portal handoff mints through `mintAdminSession`, so it always gets
  `exp - iat = 28800` and is covered by the same bound. Its own RS256 token
  verification (`src/lib/portal-token-bespoke.ts`) is a separate path this PR
  does not touch, and it rests on `test:portal-handoff` 31 of 31.
- The `sk_live_` refusal (#30) was not re-injected into a container: the run
  rules allow Stripe keys only from the provided fake env file. It rests on
  `test:stripe-config` 29 of 29.
- `Deep Verify (tier-3 PRs only)` is red on this PR for the right reason:
  `verify/ci/deep_gate.sh` reports "no deep-verify report for this PR". This
  commit adds one as a child of `cacc3db` with nothing but the report changed,
  which is what the gate's ancestry rule expects.

## 7. Coverage gaps (stated so the PASS is not overclaimed)

- **Layer 5 (headed Chrome) was not run**, by instruction. All browser work
  was headless Chromium.
- No test drove the public edge, the live container, `demo-proxy` or
  Cloudflare. The compose file was read, never applied.
- The `sk_live_` refusal (#30) was verified by unit suite only.
- The portal handoff was not exercised with a real Portal-signed RS256 token
  (no key available).
- No axe, visual-regression or cross-browser run, and no mobile viewport
  sweep: this PR renders nothing.
- Latency was not measured; the change adds two type checks and two integer
  comparisons inside an existing verify path.
- Clock skew was not simulated. The zero-tolerance judgement in Warning 4
  rests on the observed topology (one container, one process) plus the
  compose file, not on an experiment with two clocks.
