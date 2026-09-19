# Deep Verify: PR #38 require exp, iat and jti on admin session tokens (2026-09-19)

Overall: PASS
Tested-SHA: a41b766f21baa22da6a2f0b6736663a03922ffab

The claim holds on a freshly built production image and, separately, on a
build with the Edge middleware switched off so the Node guards answer alone.
126 of 126 harness checks passed (0 FAIL, 12 WARN, 3 INFO), plus 6 PASS, 1
INFO and 0 FAIL in headless Chromium, the repo's own `e2e:visitor-scope` 52
of 52 and
`e2e-stripe-load-failure` 7 of 7 against the containers. The PR's own suites
reproduced its stated counts exactly (82 and 205). A mutation check (delete
the `requiredClaims` line, nothing else) turns both suites red, so the new
tests really test the new line.

Twenty six hand-signed token variants (missing, null, empty, wrong type,
upper case, `__proto__`, expired, future `nbf`) were refused on all 8 admin
pages and all 5 admin APIs, with no database change, at both layers. Sign-out
of a normal session still revokes, and #29, #30, #35 and #37 behavior is
unchanged.

The PASS carries one finding worth knowing (Warning 1): `requiredClaims`
checks that a claim is PRESENT, not that its value is sane. A holder of
`SESSION_SECRET` can still sign a token with `exp` a century out, or `iat` in
the future or after `exp`, and it is accepted. That is not a regression (it
was equally true before this PR) and it needs the signing secret, but D-018's
line about `exp` "without a floor" is only half closed by this change.

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-slatewell` PR #38, branch
  `fix/require-session-claims`, head `a41b766`
  (`a41b766f21baa22da6a2f0b6736663a03922ffab`), base `main` at `0130dab`.
  Not merged at the time of this run. The `tier-3` label is on the PR.
- **Why deep:** the change is in `verifyAdminSession()`, the single function
  the Edge middleware and both Node guards verify an admin session through.
  `verify/tier_map.yml` lists `admin-session-post` and `admin-unauthenticated`
  at tier 3.
- **Mode:** deep. Layers 1, 2, 3, 4 and 6 ran. **Layer 5 (headed Chrome) was
  not run**, by instruction; all browser work was headless Chromium
  (Playwright). The adversarial generator was not run; the attack list was
  written by hand from the dispatch, the diff, D-018 and jose's source.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC that did not write the
  PR.
- **Image:** one image, `demo-slatewell:dv38`, built from the worktree at
  `a41b766` with `docker build --secret id=npmrc,src=<scratch npmrc>` (the
  Dockerfile's secret id is `npmrc`). Build exit 0. The route table marks all
  8 `/admin` pages and all 6 `/api/admin` routes dynamic. `NODE_ENV=production`,
  so every cookie is `Secure`.
- **Containers:** `dvs38-main` (18741, throwaway `SESSION_SECRET` K1, no
  Stripe variables), `dvs38-stripe` (18742, K1 plus the fake Stripe env file
  passed by path with `--env-file`), `dvs38-nosecret` (18743, no
  `SESSION_SECRET`). All bound to `127.0.0.1`, all with
  `--add-host api.stripe.com:127.0.0.1`.
- **One extra server, not a container:** `next start -H 127.0.0.1 -p 18749`
  from a scratch `git archive` copy of `a41b766` whose only edit is
  `src/middleware.ts`'s matcher, changed to a path that never matches. The
  worktree was not touched. This is the only way to see the Node guards
  refuse on their own, because in the shipped app the middleware answers
  first for every `/admin` and `/api/admin` request.
- **Secrets:** `SESSION_SECRET` K1 is 64 random hex characters generated for
  this run, written to the run directory, never printed. No file under
  `C:\Users\Drama\.secrets` and no `.env*` file was read, opened, hashed or
  printed. The npmrc and the fake Stripe env file were passed by path only.
- **Not touched:** the live `demo-slatewell` container, the public URL,
  `demo-proxy`, `C:\dev\cloudflare-config`, and `demo-slatewell:latest` and
  `:previous`.
- **Cleanup:** all `dvs38-*` containers and the `demo-slatewell:dv38` image
  were removed at the end of the run, and the `next start` process stopped.
- **Evidence:** raw logs and the harness under the session scratchpad,
  `verify-runs/demo-slatewell-pr38-deep/` (`h38.mjs`, `h38-browser.mjs`,
  `claims.log`, `claims-nomw.log`, `regress.log`, `stripe.log`,
  `runtime.log`, `browser.log`, `e2e-visitor-scope.log`,
  `e2e-stripe-load-failure.log`, `mut_*.log`, `build.log`).

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| auth_lifecycle | PASS | A-2 to A-9, C-CTL1, C-CTL2, B-6 |
| claim requirement (D-018) | PASS (6 WARN) | C-01 to C-26 and C-DB on both layers; C-W1 to C-W6 are the WARNs |
| revocation (D-015) | PASS | SO-1 to SO-10, O-4 to O-6, B-7 |
| signed visitor (D-016) | PASS | A-6, S-6 to S-10, J-23b, J-23c |
| security (fail closed) | PASS | N-1 on `dvs38-nosecret` |
| data_crud / scope (#29) | PASS | S-1 to S-10, C-DB, C-CTL3 |
| error_handling | PASS | C-DB, L-1, L-2, A-9 |
| edge_cases | PASS | the C, J and SO sweeps |
| smoke | PASS | every container served `/` 200; RT-* 0 restarts |
| navigation | PASS | e2e-visitor-scope 52 of 52; B-4 to B-7 |
| performance | SKIP | this change adds one presence check inside an existing verify |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge |
| accessibility | SKIP | axe is not in the harness |
| mobile_responsive | SKIP | the PR does not touch any rendered page |
| visual_regression | SKIP | no baseline exists |
| cross_browser | SKIP | headless Chromium only |

### Layer 1: code (at `a41b766`)

- `npx tsc --noEmit`: exit 0. `npm run lint`: exit 0, one pre-existing
  `react-hooks/exhaustive-deps` warning in `booking-wizard.tsx:146`.
- `docker build`: exit 0. The built artifact carries the fix in both
  runtimes: `requiredClaims:["exp","iat","jti"]` appears in
  `.next/server/src/middleware.js` (Edge) and in the Node server chunks and
  route bundles (`chunks/132.js`, `chunks/590.js`, the admin API routes, the
  sign-in route, the portal handoff route).
- The PR's suites, run locally with `SESSION_SECRET` unset in the shell:

  | Suite | PR claimed | This run |
  |---|---|---|
  | test:admin-session | 82/0 | 82 passed, 0 failed |
  | test:admin-security | 205/0 | 205 passed, 0 failed |
  | test:deposits | pass | 7 passed |
  | test:stripe-config | pass | 29 passed, 0 failed |
  | test:portal-token | pass | 15 passed, 0 failed |
  | test:portal-handoff | pass | 31 passed, 0 failed |
  | test:admin-queries | pass | all passed |
  | test:retention | pass | 31 passed, 0 failed |
  | test-cancellation, test-scheduling | pass | all PASS, exit 0 |

- **Mutation check** (scratch copy of the head, never the worktree). Deleting
  only the `requiredClaims: ["exp", "iat", "jti"],` line:
  - `test:admin-session` 80 passed, 2 failed: `signed token without exp
    rejected`, `signed token without iat rejected`.
  - `test:admin-security` 191 passed, 14 failed, including
    `page guard (authorizeAdmin): token with missing exp -> unauthenticated
    ({"status":"ok",...})` and `API guard (requireAdminApi): token with
    missing exp -> 401 on all three admin APIs
    ({"complete":200,"servicesPost":201,"staffPut":200})`, plus the data
    assertions `W2: rejected missing-claim tokens changed nothing on booking
    A ({"status":"Completed"})` and `left staff untouched ({"name":"Hacked"})`.
  - Note which checks did NOT go red: the three "missing jti" ones. Without
    `requiredClaims` a token with no `jti` is still refused by the existing
    `typeof payload.jti !== "string"` check right after `jwtVerify`. So the
    coverage this line actually adds is `exp` and `iat`; `jti` is belt and
    braces (Warning 3).
- **Diff review:** `git diff origin/main...a41b766 --stat` is exactly four
  files, all of them the stated ones: `docs/decisions.md` (+46, D-018 only),
  `scripts/test-admin-security.ts` (+78/-4), `scripts/test-admin-session.ts`
  (+40/-1), `src/lib/admin-session.ts` (+6/-1). The source change is one
  option line plus a comment; nothing under `src/` outside
  `admin-session.ts`, nothing under `verify/`, no dependency change, no
  workflow change.

### Layer 2: runtime

`dvs38-main`, `dvs38-stripe` and `dvs38-nosecret` were all `running` with
`RestartCount=0` after their sweeps, with no error lines and no occurrence of
the signing secret in their logs (RT-*).

### Layers 3, 4 and 6: the claim matrix and the sweeps

Every variant below is signed with the container's REAL key and sent with a
valid signed visitor cookie for the `vid` it claims, so a refusal isolates
the session check rather than the visitor binding. Each variant was sent to
all 8 admin pages and all 5 admin APIs, with request bodies that WOULD
mutate (`complete` and `no-show` on a real seeded booking,
`POST /api/admin/services`, `PUT /api/admin/services/1`,
`PUT /api/admin/staff/1` with the suite's own "Hacked" payloads), plus an
RSC-header probe on `/admin`.

```
== C: claim matrix, real key, valid signed visitor (production image dvs38-main) ==
PASS  C-01  missing exp                       8 pages 307 /?admin=required (no data), 5 APIs 401
PASS  C-02  missing iat                       idem
PASS  C-03  missing jti                       idem
PASS  C-04  missing exp, iat and jti          idem
PASS  C-05  exp null                          idem
PASS  C-06  exp empty string                  idem
PASS  C-07  exp numeric string                idem
PASS  C-08  exp boolean true                  idem
PASS  C-09  exp object                        idem
PASS  C-10  exp array                         idem
PASS  C-11  iat null                          idem
PASS  C-12  iat empty string                  idem
PASS  C-13  iat numeric string                idem
PASS  C-14  iat boolean true                  idem
PASS  C-15  jti null                          idem
PASS  C-16  jti empty string                  idem
PASS  C-17  jti number                        idem
PASS  C-18  jti array                         idem
PASS  C-19  jti upper-case hex                idem
PASS  C-20  exp in the past (60 s)            idem
PASS  C-21  exp == now (boundary)             idem
PASS  C-22  nbf in the future (+1 h)          idem
PASS  C-23  nbf null                          idem
PASS  C-24  EXP/IAT/JTI upper-case names only idem
PASS  C-25  exp only on a JSON "__proto__" key idem
PASS  C-26  missing exp and iat               idem
PASS  C-DB  no rejected call changed the DB (services, service 1, staff 1 and its links and
            availability blocks, booking status counts)  [identical]
WARN  C-W1  iat in the future (+1 h): ACCEPTED   [/admin 200]
WARN  C-W2  iat after exp: ACCEPTED              [/admin 200]
WARN  C-W3  exp 100 years out (TTL is 8 h): ACCEPTED  [/admin 200]
WARN  C-W4  iat 0 (1970): ACCEPTED               [/admin 200]
WARN  C-W5  iat negative: ACCEPTED               [/admin 200]
WARN  C-W6  exp fractional: ACCEPTED             [/admin 200]
PASS  C-CTL1 harness-minted token with exp/iat/jti passes all 8 pages 200 and all 5 APIs past auth
PASS  C-CTL2 app-minted session (exp - iat 28800, 128-bit jti) passes all 13
PASS  C-CTL3 the SAME services body the rejected tokens sent creates a service with a valid
             token (services 8 -> 9), so C-DB is meaningful
```

On every page refusal in the production image the body was under 100 bytes
and the session cookie was cleared, which is the Edge middleware's 307, and
the RSC probe returned a redirect with no admin data. The same 26 variants
were then replayed against the middleware-disabled server:

```
== C (next start, middleware matcher disabled: the Node guards alone) ==
PASS  NM-0  a junk session reaches the page guard (page-render redirect, ~10 KB body,
            cookie NOT cleared), proving the middleware is really off on this server
PASS  C-01 .. C-26   identical verdicts, all 13 surfaces, this time refused by
            requireAdminPage/requireAdminApi through authorizeAdmin
PASS  C-DB  no DB change
PASS  C-CTL1, C-CTL2, C-CTL3   same positive controls
WARN  C-W1 .. C-W6  same six acceptances (the same verify function)
```

Sign-out, on both servers:

```
PASS  SO-1  missing exp token: refused BEFORE sign-out (this is the #35 W2 finding: it was
            200 then), sign-out 303 with the cookie cleared, 0 revocation rows, still refused
PASS  SO-2  missing jti token: same
PASS  SO-3  missing iat token: same
PASS  SO-4  normal app session: all 8 pages 200 and all 5 APIs past auth before sign-out
PASS  SO-5  sign-out: 303 Location /, cookie cleared, exactly one row whose jti and exp are
            the JWT's
PASS  SO-6  the copied pair AFTER sign-out: 8 pages 307 with no data, 5 APIs 401
PASS  SO-7  second sign-out with the revoked token: 303, idempotent (no second row)
PASS  SO-8  sign-out with ONLY the session cookie still revokes; the full pair is then refused
PASS  SO-9  a harness-minted full-claims token is revoked by sign-out and then refused
PASS  SO-10 revocation is by jti: a sibling session on the same visitor still gets 200
```

Regression sweep on the production image (`regress.log`, 41 of 41):

- **A-2 to A-9:** unauthenticated 307 and 401, sign-in 303 to `/admin`,
  cookie attributes (`HttpOnly; SameSite=Lax; Secure; Path=/` and the
  visitor's `Max-Age=86400`), the visitor cookie equal byte for byte to
  `HMAC(HMAC(K1, "slatewell:visitor-cookie:v1"), id)`, a minted JWT with
  `exp - iat = 28800` and a 128-bit hex `jti`, `/admin` 200 with both
  cookies, and the `x-middleware-subrequest` bypass header still refused.
- **J-1 to J-25 (#29 forgery matrix):** name-only `1`, the legacy
  `demo-admin` value, `alg: none`, a foreign HS256 key, the `.env.example`
  placeholder, the derived visitor key used as the JWT key, HS512 with the
  real key, `vid` swapped and `exp` extended and `exp` REMOVED under the
  original signature, a flipped signature character, `src: "admin"`, missing
  `sub`, missing `vid`, a valid session with another browser's visitor, with
  its own id unsigned, with a foreign-key visitor tag, with no visitor
  cookie, and a visitor cookie alone. All 307 on `/admin` and 401 on the API.
- **S-1 to S-10 (#29 scope):** A books and gets a signed visitor, A sees its
  own confirmation and `.ics` and its own booking on the admin schedule, B
  sees no A data on any of the 8 pages or on A's schedule day, B's
  `complete` on A's booking is 404 with the row unchanged, and A's
  confirmation and `.ics` are 404 for B's visitor, for no cookies, for A's
  id unsigned and for A's id signed with a foreign key.
- **O-4 to O-6:** the revoked pair with RSC, with Next-Router-State-Tree and
  with HEAD: redirect, never admin data.
- **N-1 (fail closed):** without `SESSION_SECRET` the landing page is 200
  while `/admin`, sign-in and all 5 admin APIs are 404 and booking is 503
  with no `Set-Cookie`.

Headless Chromium (`browser.log`), with every `*.stripe.com` request aborted:

```
PASS  B-1  no Stripe keys: /book fires zero *.stripe.com requests, no page errors (#37)
PASS  B-2  fake keys configured: /book still fires zero at load, before the card step
INFO  B-3  clicking into the deposit service from the first screen did not reach the card
           step in this short walk; the card step is covered by e2e-stripe-load-failure below
PASS  B-4  real browser, token missing exp: /admin lands on /?admin=required, no admin chrome
PASS  B-5  same token on /admin/schedule: redirected home
PASS  B-6  control: one-click sign-in still renders the dashboard
PASS  B-7  control: clicking Sign out then reopening /admin redirects home
```

Repo suites against the containers:

- `e2e:visitor-scope` (unmodified, `BASE_URL=http://127.0.0.1:18741`,
  `E2E_DB_CONTAINER=dvs38-main`): **52 passed, 0 failed**, including the
  captured-pair-after-sign-out section on all 8 pages and all 5 APIs.
- `e2e-stripe-load-failure` against `dvs38-stripe`: **7 passed, 0 failed**,
  which also exercises the card step reached through the wizard with
  `js.stripe.com` aborted.

Stripe guards (`stripe.log`, plus one follow-up probe on a free slot):

- **L-1 PASS:** with no Stripe variables, `deposit-intent` answers 503
  `Card deposits are not available right now.`
- **L-2:** with the fake keys and `api.stripe.com` pinned to `127.0.0.1`,
  `deposit-intent` on a genuinely free deposit slot answers **502**
  `{"error":"Could not start the deposit. Please try again."}` and hands out
  no `client_secret`. The first attempt in `stripe.log` hit a 409 slot
  conflict before reaching Stripe, so the 502 above is the authoritative
  result.
- **L-4 INFO:** the publishable key appears in the wizard page only on the
  container that has keys configured (#27's runtime delivery), and not on
  `dvs38-main`.
- The `sk_live_` refusal (#30) was NOT re-injected into a container: the run
  rules allow Stripe keys only from the provided fake env file. It rests on
  `test:stripe-config` 29 of 29, which covers the `sk_live_` and non-`sk_test_`
  rejections. Stated as a coverage gap, not a pass.

## 3. Claim by claim

1. **`verifyAdminSession()` passes `requiredClaims: ["exp","iat","jti"]`:
   CONFIRMED.** Source diff, and the string is present in the built Edge
   middleware and the Node server chunks of the image under test.
2. **A validly signed admin token missing any of the three is refused by the
   Edge middleware (page redirect, API 401): CONFIRMED.** C-01 to C-04 on
   `dvs38-main`, 13 surfaces each, with sub-100-byte bodies and the session
   cookie cleared, which is the middleware's own refusal.
3. **...by the Node page guard (`authorizeAdmin`): CONFIRMED.** Twice: the
   PR's own suite calls `authorizeAdmin` directly (and the mutation check
   proves that assertion bites), and the middleware-disabled server refuses
   all 8 pages with a page-render redirect, cookie not cleared (NM-0 proves
   the middleware really was off).
4. **...and by every admin API guard: CONFIRMED, and wider than the PR
   tested.** The PR's new section exercises 3 of the 5 handlers; this run put
   every variant through all 5 (`complete`, `no-show`, `POST services`,
   `PUT services/[id]`, `PUT staff/[id]`) on both servers, with mutating
   bodies, and checked the database afterwards (C-DB, with C-CTL3 proving the
   bodies would otherwise have written).
5. **Normal sessions unchanged: CONFIRMED.** C-CTL1, C-CTL2, A-4 to A-8,
   B-6, and 52 of 52 in the repo's own e2e.
6. **Visitor binding unchanged: CONFIRMED.** A-6, J-23, J-23b, J-23c, S-6 to
   S-10.
7. **Revocation and sign-out unchanged: CONFIRMED.** SO-4 to SO-10, O-4 to
   O-6, B-7, and the e2e's sign-out section.
8. **Only the stated files changed: CONFIRMED.** Four files, listed above.

## 4. Theater Check

| PR #38 claimed | Verification found | Verdict |
|---|---|---|
| `verifyAdminSession()` now passes `requiredClaims: ["exp","iat","jti"]` | Source and the built image, both runtimes | CONFIRMED |
| Tokens missing exp, iat or jti are refused at the Edge middleware | C-01 to C-04, 13 surfaces, middleware-shaped refusals | CONFIRMED |
| ...at the page guard (`authorizeAdmin`) | Middleware-disabled build: 8 pages refused by the page render; mutation check makes the suite's assertion real | CONFIRMED |
| ...at every API guard (`requireAdminApi`) | All 5 handlers, both servers, mutating bodies, DB unchanged | CONFIRMED (PR tested 3 of 5) |
| None of the rejected calls mutated the database | C-DB identical on both servers, with C-CTL3 as the positive control | CONFIRMED |
| A normal session still passes every guard | C-CTL1, C-CTL2, e2e 52 of 52 | CONFIRMED |
| Sign-out of a normal session still revokes (D-015) | SO-5 one row with the JWT's jti and exp; SO-6 the pair refused on 13 surfaces | CONFIRMED |
| Visitor binding and revocation checks unchanged | J-23x, S-6 to S-10, SO-7 to SO-10 | CONFIRMED |
| The app never mints a session without all three claims | A-7: exp - iat 28800, 128-bit hex jti, on every mint observed | CONFIRMED |
| test:admin-session 82/0 and test:admin-security 205/0 | Reproduced exactly | CONFIRMED |
| tsc clean, lint exit 0, build succeeds | Reproduced, same single pre-existing warning | CONFIRMED |
| D-018: "`exp` without a floor lets a hand-signed token outlive the 8-hour TTL" (given as the reason to require `exp`) | Requiring presence does not bound the value: `exp` 100 years out is accepted (C-W3) | OVERSTATED, see Warning 1 |
| D-018: a token without `jti` "must never verify in the first place" | True, but it already did not verify before this PR (the post-verify `jti` shape check); the mutation check shows only exp and iat regress | CONFIRMED but not new, see Warning 3 |

## 5. Blockers

None. Nothing in this PR regressed any behavior this run could reach, and the
stated claim held on every surface at both layers.

## 6. Warnings

### Warning 1: `requiredClaims` checks presence, not value (C-W1 to C-W6)

- jose validates `exp` against the clock, and `nbf`, but it only checks
  `iat`'s VALUE when `maxTokenAge` is set, which this code does not set
  (`node_modules/jose/dist/webapi/lib/jwt_claims_set.js`, the `if
  (maxTokenAge)` block). So, with the real signing key:
  - `exp` a century out is accepted, although every minted session gets 8
    hours (C-W3);
  - `iat` in the future, `iat` after `exp`, `iat` 0 and `iat` negative are
    all accepted (C-W1, C-W2, C-W4, C-W5);
  - a fractional `exp` is accepted (C-W6).
- Impact is the same attacker class as the one this PR closes: someone
  holding `SESSION_SECRET`. It is not a regression, and it does not make this
  PR wrong. It does mean the D-018 sentence about `exp` "without a floor"
  describes a gap that is only half closed: the token must now CARRY `exp`,
  but its value is still unbounded, so a hand-signed non-expiring session is
  still reachable by the same holder.
- **Fix, if Drew wants the invariant closed:** add
  `maxTokenAge: SESSION_TTL_SECONDS` (which also refuses an `iat` in the
  future) and an explicit `payload.exp - payload.iat <= SESSION_TTL_SECONDS`
  check in the post-verify block. Small and mechanical, but it is auth code,
  so a tier-3 PR with its own deep verify. A Sonnet-class agent can write it.

### Warning 2: the PR's new integration section covers 3 of the 5 admin APIs

- `scripts/test-admin-security.ts` section 5b puts the three missing-claim
  tokens through `complete`, `POST services` and `PUT staff/[id]`. `no-show`
  and `PUT services/[id]` are exercised elsewhere in the suite for other
  token kinds, but not here.
- This run covered all 5 on both servers, so the behavior is proven; what is
  missing is the permanent regression test. Adding two lines to the existing
  `apiResults` map would close it. Test-only, Haiku or Sonnet class.

### Warning 3: `jti` was already required in practice

- Without `requiredClaims`, a token with no `jti` was still refused by
  `typeof payload.jti !== "string"` immediately after `jwtVerify`. The
  mutation check proves it: removing the line turns the exp and iat cases
  red and leaves every jti case green.
- Nothing is wrong with listing `jti`; it makes the intent explicit and it
  would catch a future refactor of that shape check. It just means the
  security gain of this PR is specifically `exp` and `iat`, and the
  "revocation-proof session" story in D-018 was already covered.

### Warning 4: the Tier-3 gate on this PR is red until this report lands

- `Deep Verify (tier-3 PRs only)` currently fails on #38 for the right
  reason: `verify/ci/deep_gate.sh` finds no `pr38` report. This commit adds
  one, as a child of `a41b766` with nothing but the report changed, which is
  what the gate's ancestry rule expects. If the gate goes green on this push,
  it is green for the first honest reason in this repo's history of the
  check.

### Minor, not blocking

- The middleware-disabled build exists only in the scratch run directory and
  was never pushed anywhere; it is the only way to observe the Node guard in
  isolation, since the shipped middleware answers first.
- `e2e:visitor-scope` has no `*.stripe.com` abort of its own, so it was run
  only against `dvs38-main`, which has no Stripe variables at all, and only
  after B-1 had established that the wizard surface on that container fires
  zero `*.stripe.com` requests. Every browser run written for this verify
  aborts `*.stripe.com` at the context level, and
  `e2e-stripe-load-failure.mjs` aborts `js.stripe.com` itself.
- `dvs38-stripe`'s `deposit-intent` 502 depends on `api.stripe.com` resolving
  to `127.0.0.1`; that is the intended pin for this run, not a production
  condition.
- The portal handoff mints through `mintAdminSession`, so it always carries
  the three claims; its own token verification
  (`src/lib/portal-token-bespoke.ts`) is a separate RS256 path this PR does
  not touch.

## 7. Coverage gaps (stated so the PASS is not overclaimed)

- **Layer 5 (headed Chrome) was not run**, by instruction. All browser work
  was headless Chromium.
- The `sk_live_` refusal (#30) was verified by unit suite only; no container
  was given a live-shaped key, because the run rules allow Stripe keys only
  from the provided fake env file.
- The portal handoff was not exercised with a real Portal-signed RS256 token
  (no key available). It rests on `test:portal-handoff` 31 of 31.
- No test drove the public edge, the live container or `demo-proxy`.
- No axe, visual-regression or cross-browser run. No mobile viewport sweep:
  this PR renders nothing.
- Latency was not measured; the change adds one presence check inside an
  existing verify path.
