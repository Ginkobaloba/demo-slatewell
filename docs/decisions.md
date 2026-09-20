# Slatewell design decisions

Numbered log of design and architecture decisions. Append, don't rewrite.

## D-001: Tailwind v4, not v3 (2026-06-10)

The shadcn CLI (v4.11) emits Tailwind v4-style components (base-ui
primitives, v4-only variants, oklch/var theming) and no longer maintains
the v3 HSL-config style. The create-next-app@14 template ships Tailwind
v3. Rather than pin an old shadcn CLI and lock ourselves out of the
current registry (including the calendar primitives this demo needs), we
migrated the scaffold to Tailwind v4 (`@tailwindcss/postcss`, CSS-based
config in `globals.css`, no `tailwind.config.ts`). Next.js 14 supports
this via PostCSS. Verified with a production build and compiled-CSS
probes for the brand tokens.

## D-002: Marketing landing at /, booking under /book/[slug] (2026-06-10)

Per the program handoff recommendation: two audiences, two funnels. The
SaaS marketing page (Slatewell itself) is /; the end-customer booking
flow for the demo business is /book/wave-wellness. Until chunk 4.14, /
is a branded placeholder linking to both demo flows.

## D-003: Local-time ISO timestamps, single timezone (2026-06-10)

Bookings store `start_at`/`end_at` as ISO strings without timezone
offset, interpreted in the business's timezone (column on `businesses`,
demo fixed to America/New_York). A real multi-region product would store
UTC; for a single-business demo, local-naive keeps every query and the
calendar UI simple and avoids DST math in seed data. ICS export (chunk
4.5) will emit TZID-qualified times. Times of day (availability blocks)
are minutes-from-midnight integers.

## D-004: Deterministic seed, database not in git (2026-06-10)

`scripts/seed.ts` uses a seeded RNG (mulberry32) so the dataset is
stable run-to-run, but anchors dates to the day it runs so the calendar
always has ~90 days of history and ~30 days of upcoming bookings.
`data/` is gitignored; the Docker build (deploy chunk) runs the seed at
image build time, matching the AxlePoint posture (SQLite baked into the
image). `scripts/verify-seed.ts` is the integrity gate.

## D-005: Local Paradigm banner pending Phase 0 (2026-06-10)

Phase 0 owns the shared Paradigm banner component. Until it lands,
`src/components/paradigm-banner.tsx` implements the published spec
locally (32px, #1f5a44 on #f7f5f0, 7-day dismiss cookie, icon-only on
mobile) so the demo is never blocked. Swap when Phase 0 ships. The
banner renders after mount (client cookie check); SSR HTML intentionally
omits it to avoid hydration mismatch.

## D-006: Buffers occupy staff time, not customer time (2026-06-10)

A service's `buffer_before_min`/`buffer_after_min` extend the staff
member's busy window for slot computation and conflict checks, but the
customer-visible appointment is `start_at + duration_min`. This is how
practitioners actually think about turnover time.

## D-007: Opaque booking IDs plus a separate cancel token (2026-06-10)

Booking IDs (`bk_` + base36) appear in confirmation URLs and are
guessable-adjacent; destructive actions need more. The public
cancel/reschedule route requires the per-booking `cancel_token` (32 hex
chars) in addition to the ID. Admin routes use the demo-admin cookie
instead.

## D-008: Pre-appointment instructions live in code (2026-06-12)

Per-service prep instructions (confirmation page + ICS description) are
a typed map in `src/lib/instructions.ts` keyed by service name, with a
generic fallback. A real multi-tenant product would put these on the
`services` table; for the demo, code keeps the schema stable and the
copy reviewable in one place. Revisit if chunk 4.8 (service CRUD) needs
editable instructions.

## D-009: Deposit kept = Captured (2026-06-12)

Cancelling inside the free window (more than
`cancellation_window_hours` before start) releases a Held deposit
(deposit_status Released). Cancelling later keeps it: the business
charges the hold, recorded as Captured, matching the seed's No-Show
semantics. Refunded stays reserved for goodwill reversals issued from
the admin UI (later chunk).

## D-010: Demo-admin auth via httpOnly cookie (2026-06-16)

Admin routes (/admin/*) are guarded by Next.js middleware
(`src/middleware.ts`) that checks for a `slatewell_admin_session`
cookie; missing cookie redirects to `/?admin=required`. POST
`/api/admin/session` sets the cookie (one-click, no credentials); POST
with `?signout=1` clears it. This is the same pattern as AxlePoint's
`axle_demo_session`. The cookie is httpOnly + sameSite=lax, 24h MaxAge.
Admin actions (future chunks) will read the cookie server-side; for this
demo, the cookie's presence is sufficient authorization -- there is no
user identity inside it.

The session route returns a path-relative `Location` (303 via a bare
`NextResponse` with a `Location` header), NOT
`NextResponse.redirect(new URL("/admin", request.url))`. Behind the demo
reverse proxy, `request.url`'s origin is the container's internal bind
address (0.0.0.0:3000), so an absolute Location would send the browser to
an unreachable host. A relative Location resolves against the real public
origin. Same fix applied to lumen/axlepoint.

## D-011: Stripe deposit holds use manual capture (2026-06-17)

Chunk 4.4 makes the deposit real. Decisions:

- **Manual-capture PaymentIntents are the hold.** A service with
  deposit_cents > 0 authorizes the amount at booking time with
  capture_method: "manual" (status requires_capture). The card is
  authorized, not charged. The cancellation policy (D-009) then releases
  (cancel the PaymentIntent) inside the free window, or captures (charge)
  outside it or on a no-show.
- **Stripe runs in the async route layer, not the sync repo tx.**
  createBooking and cancelBooking are synchronous better-sqlite3
  transactions and cannot await Stripe. So the booking route authorizes
  after the row is inserted (and voids the booking, freeing the slot, on a
  declined card), and the cancel route settles the hold after the DB
  records the policy outcome. The DB stays authoritative; a Stripe error is
  logged, never blocks a cancellation.
- **Demo card source is a Stripe test token.** There is no PCI card-entry
  UI, so the hold is placed with pm_card_visa (override via
  STRIPE_DEMO_PAYMENT_METHOD). The authorize -> hold -> release/capture
  lifecycle is the real Stripe flow; only the card source is a test token.
- **No-show capture is an admin action.** POST
  /api/admin/bookings/[id]/no-show (admin-cookie gated) marks the booking
  No-Show and captures the held deposit.
- **Keyless still works.** Stripe is read lazily, so next build needs no
  key and a keyless environment falls back to a policy-only hold
  (deposit_status without a real PaymentIntent). Deposit settlement is a
  no-op without a real PaymentIntent id.

## D-012: Real customer card entry via Stripe Elements (2026-06-29)

Chunk 4.4 placed the hold server-side with a `pm_card_visa` test token, so
there was no customer card-entry step (the gap in the customer-walk
audit). 4.4b makes the card entry real:

- **PaymentIntent-first, booking-on-confirm.** A deposit-bearing service
  adds a "Payment" step after Review. On entry the wizard creates an
  unconfirmed manual-capture PaymentIntent (`POST
  /api/book/[slug]/deposit-intent`, card-only) and mounts Stripe
  `<CardElement>`. The customer enters a card; `stripe.confirmCardPayment`
  authorizes the hold (status requires_capture) directly with Stripe -- no
  card data touches our server. Only then does the client POST the booking
  with the PaymentIntent id.
- **The booking route verifies before it writes.** It re-checks the intent
  is requires_capture, priced exactly at the deposit, USD, and tagged for
  this business, and that no other booking already holds it (replay guard).
  A slot lost to a race releases the hold so the card is never left
  blocked. The DB stays authoritative.
- **CardElement, not PaymentElement.** A deposit is a card authorization
  (auth now, capture/release later), so the intent is `payment_method_types:
  ["card"]` and the UI is one clean card field -- not an accordion of
  bank/wallet/Link methods that do not fit the hold model.
- **Settlement is unchanged.** Cancel (D-009) and the no-show admin action
  still release/capture the same real PaymentIntent; D-011's lifecycle is
  intact. The legacy `authorizeDeposit(pm_card_visa)` path remains only for
  the keyless unit test.
- **Keyless fallback preserved.** Without a publishable key the wizard
  skips the Payment step and books with a policy-only hold, exactly as
  before.
- **Verification.** `scripts/e2e-deposit.mjs` (API + live test keys: hold
  visible uncaptured in Stripe, replay/tamper/no-hold rejected,
  release-on-cancel) and `scripts/e2e-deposit-ui.mjs` (full browser card
  entry into Elements through to a Held booking with a real, non-mock
  PaymentIntent).

## D-013: Stripe publishable key is delivered at runtime, not build time (2026-09-18)

The deployed image never showed the card field, so deposit bookings could
not complete. Cause: the client read `process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
which Next.js inlines only at `next build`. The Docker image is built with
no Stripe env (keys arrive via `--env-file` at `docker run`), so the browser
bundle kept the literal `process.env...` reference and `loadStripe` never ran.
Meanwhile the server saw the key at runtime and routed deposit services to a
Payment step that could not render.

- **Server reads, client receives.** `getStripePublishableKey()` in
  `src/lib/stripe.ts` reads `STRIPE_PUBLISHABLE_KEY` (falling back to
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) at request time. The force-dynamic
  booking page passes it to the wizard as a prop, and `getStripeClient(key)`
  calls `loadStripe` with it (memoized per key). A publishable key is public
  by design, so shipping it in the RSC payload is expected.
- **No build args.** A build-arg would bake a key into the image and tie
  every rotation to a rebuild; runtime delivery keeps the image env-free.
- **One predicate for the whole flow.** `isDepositCardFlowEnabled()` =
  secret key AND publishable key. It gates the wizard's Payment step, the
  deposit-intent route, and the booking route's "hold required" check, so
  the UI never routes to a card step it cannot render and the booking route
  never demands a hold the UI could not collect. Settlement (cancel,
  complete, no-show) still keys off the secret alone, since it only needs
  to act on existing PaymentIntents.
- **Test mode enforced.** A publishable key that is not `pk_test_` is
  treated as absent.
- **Verification.** `npm run test:stripe-config` covers the predicate
  matrix, fallback order, and per-key memoization.

## D-014: Signed admin sessions and per-browser demo scope (2026-09-18)

Supersedes the authorization part of D-010. The admin area was gated only
by the NAME of the `slatewell_admin_session` cookie, so anyone could set it
by hand, and the one-click sign-in handed it to every visitor. Any visitor
could then read the names, emails, and phone numbers other visitors typed
into the booking form. Decisions:

- **Signed session.** The cookie is an HS256 JWT (HMAC-SHA-256 keyed by
  `SESSION_SECRET`) over a random 128-bit session id (`jti`) and the
  visitor id (`vid`) it was issued to. `src/lib/admin-session.ts` is
  Edge-safe (jose + Web Crypto), so the middleware and the Node handlers
  run the identical check (`checkAdminCookies`).
- **Middleware is not the only gate.** Every admin API handler calls
  `requireAdminApi`, and every admin page and the admin layout call
  `requireAdminPage`. A matcher mistake still fails closed.
- **Fail closed.** No `SESSION_SECRET`, one under 32 characters, or the
  published `.env.example` placeholder means the admin area, the sign-in
  endpoint, and the Portal handoff answer 404. So does a value that looks
  like a mangled env line: internal whitespace, a path fragment (drive
  letter + `:\`, `_secrets`, `.local.txt`), or a leading `generated `.
  Surrounding whitespace is trimmed first. Each failing rule is logged once
  by name, never the value. There is no dev fallback secret on purpose.
- **Demo value kept, scope narrowed.** "Sign in as demo admin" still works
  without credentials, but the session is bound to the browser's HttpOnly
  `slatewell_visitor` cookie (random 128-bit, SameSite=Lax, Secure in
  production). A session copied into another browser is rejected.
- **Per-browser data scope.** Bookings carry `visitor_id` and `seeded`.
  Admin views and aggregates show seed rows plus the caller's own bookings;
  complete/no-show on anything else is a 404 (indistinguishable from an
  unknown id). Customers created from the booking form are tagged too, and
  `findOrCreateCustomer` only matches within the same browser, so typing
  someone else's email never attaches to their row.
- **Public detail pages.** Confirmation and `.ics` require the booking's own
  visitor cookie (booking ids are short enough to guess, and both pages
  expose the cancel token). The cancel page and API keep their existing
  128-bit `cancel_token` check (D-007); that token is the unguessable link.
- **Portal handoff does not widen access.** It still verifies the Portal
  RS256 token, then mints the same visitor-bound session with the same
  scope.
- **Retention.** Visitor-created bookings, their mock messages, and orphaned
  visitor customers are deleted 24 hours after creation
  (`src/lib/retention.ts`), on database open and at most hourly after.
- **Legacy rows.** A database created before D-014 is upgraded in place;
  all of its existing rows (old seed rows included, since they cannot be
  told apart reliably) get `seeded = 0` and no visitor id, so they are
  hidden from every session and the purge leaves them alone. Deleting them
  is a separate, approved one-time step; `npm run db:seed` restores the demo
  data. The image build seeds a fresh database, which marks seed bookings
  `seeded = 1`.
- **Booking form notice.** The details step says "This is a demo. Please
  don't enter real personal details."
- **Verification.** `test:admin-session`, `test:admin-security`,
  `test:admin-queries`, `test:retention`, `test:portal-handoff`, and the
  two-browser `e2e:visitor-scope` against `next start`.

## D-015: Sign-out revokes the admin session server-side (2026-09-19)

Follow-up from the PR #29 deep verify. The D-014 session is a stateless
HS256 JWT, and sign-out only deleted the cookie, so a captured session +
visitor cookie pair kept working for the rest of its 8-hour lifetime.

- **Revocation list, not a session table.** Sign-out verifies the session
  cookie (signature and expiry, not the visitor binding, so a browser that
  lost its visitor cookie can still kill its session) and records its `jti`
  in `revoked_admin_sessions` (`src/lib/session-revocation.ts`). A forged or
  expired token is never written, so the table cannot be filled with junk.
  Sign-out is idempotent.
- **Rows expire with the token.** Each row stores the token's own `exp` as
  Unix epoch seconds (a token attribute, so D-003's local ISO strings do not
  apply). Once `exp` has passed, `jwtVerify` rejects the token on its own, so
  the row is purged: on every revoke, and in the hourly purge that already
  runs for visitor data (`src/lib/retention.ts`).
- **One authoritative Node guard.** The middleware runs in the Edge runtime
  and cannot reach SQLite, so it still passes a signed-out pair. The
  authoritative check is `authorizeAdmin()` in `src/lib/admin-auth.ts`: the
  stateless cookie check, then the revocation lookup. `requireAdminApi`
  (every admin API handler) and `requireAdminPage` (the admin layout and
  every admin page, including the four preview pages that used to rely on
  the layout alone, since Next renders layout and page in parallel) both go
  through it. A database error propagates as a failed request, never as
  "not revoked".
- **Mechanical coverage.** `test:admin-security` walks `src/app/admin` and
  `src/app/api/admin` and fails if any page or layout stops awaiting
  `requireAdminPage()`, if any exported admin API handler (other than the
  sign-in endpoint) stops calling `requireAdminApi` first, or if any of them
  opts into the Edge runtime.
- **Schema.** The table is in `src/db/schema.sql`, and `getDb()` creates it
  on a database seeded before this change.
- **Not in scope.** "Sign out everywhere" and admin-initiated revocation;
  revocation is per session. A secret rotation still invalidates every
  session at once.

## D-016: The visitor cookie is signed (2026-09-19)

Follow-up from the PR #29 deep verify. The D-014 visitor cookie was 128
random bits, HttpOnly, but unsigned, so its value alone was a bearer token
for that browser's bookings and admin scope.

- **Format.** `slatewell_visitor=<32 hex id>.<43 char base64url tag>`, where
  `tag = HMAC-SHA-256(visitorKey, id)`. The database and the admin JWT's
  `vid` claim keep the bare id.
- **Key derivation and domain separation.** `visitorKey =
  HMAC-SHA-256(SESSION_SECRET, "slatewell:visitor-cookie:v1")`. The admin
  JWT stays keyed by the raw secret (so live admin sessions survive the
  deploy), which means the visitor tag and a session signature are always
  computed under different keys, and the label's version lets a future
  format change retire every old cookie at once. Web Crypto only
  (`crypto.subtle`), because the Edge middleware verifies it too.
- **Verification.** `crypto.subtle.verify` (constant-time), and only the
  canonical base64url spelling of the tag is accepted (the last character
  has 2 spare bits, which would otherwise let a second spelling verify).
- **Untrusted cookies are never trusted, only replaced.** An unsigned,
  tampered, malformed, or foreign-secret visitor cookie reads as "no
  visitor". Read paths (confirmation page, `.ics`, the admin gate) treat it
  that way: 404, 404, and unauthenticated. Write paths that mint a visitor
  (booking POST, demo sign-in, Portal handoff) issue a fresh signed visitor
  instead of adopting the claimed id.
- **Existing cookies become new visitors.** Every pre-D-016 cookie is
  unsigned, so after deploy each browser gets a new visitor id on its next
  booking or sign-in and loses sight of its earlier demo bookings and any
  admin session bound to the old id. Accepted: visitor data expires within
  about a day (D-014 retention), the data is demo data, and the alternative
  (grandfathering unsigned ids) would keep the bearer-token hole open.
- **No usable SESSION_SECRET.** Consistent with D-014's fail-closed rule,
  with no key nothing can be signed or verified, so any visitor cookie would
  be a bearer token again. Then: booking POST and deposit-intent answer 503
  ("Online booking is temporarily unavailable.") before any Stripe work, so
  no card hold is ever stranded; confirmation and `.ics` answer 404; no
  visitor cookie is ever set; the admin area stays 404 as in D-014. The
  landing page, booking wizard, availability, and the cancel flow (its own
  128-bit `cancel_token`, D-007) are unaffected. There is still no dev
  fallback secret; `.env.example` says booking needs one too.
- **E2E in production mode.** The production image sets Secure cookies, and
  Playwright's `APIRequestContext` (`context.request`) does not send Secure
  cookies to `http://127.0.0.1`, so `scripts/e2e-visitor-scope.mjs` failed
  its `.ics` check against the container. The script now makes every call
  through the page (navigation or in-page `fetch`, as the real app does),
  reads cookies with `context.cookies()` unfiltered (a URL filter drops
  Secure cookies on http), and can read a container's database via
  `E2E_DB_CONTAINER`. Cookie security was not relaxed.
- **Verification.** `test:admin-session` (format, tamper, unsigned,
  foreign secret, non-canonical tag, key separation, fail closed),
  `test:admin-security` (fresh visitor on every untrusted cookie, 503/404
  without a secret, revocation on all five admin APIs and the page guard,
  route coverage walk), `test:portal-handoff`, `test:retention` (revocation
  expiry), and `e2e:visitor-scope` against `next start` and the production
  image.

## D-017: Stripe.js loads only when the card step mounts (2026-09-19)

`/book/wave-wellness` requested js.stripe.com even with no publishable key
configured, i.e. even when `needsDeposit` is false and the wizard's Payment
step never renders. `booking-wizard.tsx` statically imports
`DepositPaymentStep`, so `deposit-payment-step.tsx` and, transitively,
`@stripe/stripe-js` were always part of the `/book` client bundle. The
default `@stripe/stripe-js` entry point has an import-time side effect: it
schedules its own `<script src="https://js.stripe.com/...">` injection on a
microtask right after the module evaluates, independent of whether
`loadStripe()` is ever called (see `node_modules/@stripe/stripe-js/dist/index.js`,
the `Promise.resolve().then(() => getStripePromise())` right after
`loadStripe` is defined). Bundled is not the same as rendered, but for this
one package it was enough to fire the request.

- **`src/lib/stripe-client.ts` now dynamically imports `@stripe/stripe-js/pure`
  inside `getStripeClient()`**, only once a real publishable key reaches it.
  `/pure` has no import-time side effect (script injection happens only
  when `loadStripe()` is explicitly called), and the dynamic `import()`
  means the module, and the script tag it eventually injects, are fetched
  only when `DepositPaymentStep` actually mounts (wizard step 5, only when
  `needsDeposit` is true). `@stripe/react-stripe-js` does not import
  `@stripe/stripe-js` itself (checked its bundled dist); it only takes a
  `stripe` prop, so it does not reintroduce the eager load.
- **Memoization is unchanged.** The per-key `Map` cache still returns the
  same promise across re-renders so `<Elements>` never re-initializes;
  only the promise's origin (dynamic import of the pure loader) changed.
- **Verification.** With no Stripe env configured, a headless Playwright
  run of `/book/wave-wellness` (`networkidle` plus a 2s settle) logs zero
  requests to `js.stripe.com`. With `STRIPE_PUBLISHABLE_KEY` +
  `STRIPE_SECRET_KEY` set, the same style of run driven through to the
  Payment step shows `js.stripe.com` requests once `#card-element` mounts,
  confirming the positive path (Elements still renders, deposit card entry
  still works) is intact.
- **A failed load must not strand the button.** `getStripeClient()`'s
  dynamic import (or the `loadStripe()` call it wraps) can reject -- a
  network hiccup, or `js.stripe.com` itself unreachable -- and before this
  fix that rejection was never caught: the promise stayed cached forever
  (so a retry replayed the same rejection), `<Elements>` never resolved a
  `stripe` instance (so `DepositForm`'s submit button stuck on "Preparing
  secure payment..." with no way out), and the rejection surfaced as an
  uncaught error in the page. `getStripeClient()` now catches the failure,
  evicts the cached promise so the next call re-attempts the import from
  scratch, and re-throws so the caller sees it instead of it going
  unhandled. `DepositPaymentStep` awaits `getStripeClient()` itself (rather
  than handing the raw promise to `<Elements stripe>`, which has no catch
  path of its own): on rejection it renders a clear error with a Retry
  button instead of mounting `<Elements>`/`DepositForm` at all, and Retry
  re-attempts the load.
- **Verification.** A headless Playwright run
  (`scripts/e2e-stripe-load-failure.mjs`) aborts every request to
  `js.stripe.com` (the same abort every fake-key run in this repo already
  applies) and confirms the deposit step surfaces the "could not load the
  secure payment form" error with a Retry button, that Retry re-surfaces
  the same clean error rather than hanging or duplicating state, and that
  `page.on("pageerror")` sees zero uncaught exceptions or unhandled
  rejections through the whole run.

## D-018: Admin sessions require exp, iat, and jti (2026-09-19)

W2 from the #35 deep verify: `verifyAdminSession()` (`src/lib/admin-session.ts`)
accepted a validly signed admin token with no `exp` claim -- `/admin`
answered 200 for it -- and sign-out on such a token was a no-op (0 rows in
`revoked_admin_sessions`), because `signOut()` in
`src/app/api/admin/session/route.ts` only revokes when `session.exp` is a
number. `jose`'s `jwtVerify` only validates `exp`, `iat` (and `nbf`) when the
claim is present; an absent `exp` is not rejected on its own, it is simply
never checked. `mintAdminSession()` always sets `exp`, `iat`, and `jti` (D-014),
so no code path in this app can produce a session without them -- but
anyone holding `SESSION_SECRET` could sign one by hand, and the verifier has
to refuse it regardless.

- **Fix.** `verifyAdminSession()` now passes `requiredClaims: ["exp", "iat",
  "jti"]` to `jwtVerify`, alongside the existing `algorithms: ["HS256"]`
  pin. A token missing any of the three now fails verification and
  `verifyAdminSession` returns `null`, same as any other malformed token.
  The visitor-binding (`checkAdminCookies`) and revocation
  (`authorizeAdmin`) checks are unchanged; they already only run once a
  session verifies.
- **Why `exp`/`iat`/`jti` specifically, not `sub`/`vid`/`src`.** `exp`
  without a floor lets a hand-signed token outlive the 8-hour TTL every
  minted session gets, `iat` backs the token's own age claim (defense in
  depth, since `exp` alone bounds validity), and `jti` is what
  `revokeAdminSession`/`isAdminSessionRevoked` (D-015) key on -- a token
  without one cannot be revoked at all, so it must never verify in the
  first place. `vid`, `src`, and `sub` were already checked by hand after
  `jwtVerify` returns (see the block right after the `requiredClaims` call);
  `requiredClaims` only needed to cover the three that were checked by
  `jwtVerify` alone.
- **Reach.** `verifyAdminSession` is the one place both the Edge middleware
  (`checkAdminCookies`, used directly by `src/middleware.ts`) and the Node
  guard (`authorizeAdmin`, used by `requireAdminPage` and `requireAdminApi`
  in `src/lib/admin-auth.ts`) verify a session, so the fix closes all three
  at once; no caller needed its own change.
- **Verification.** `test:admin-session` signs tokens missing `exp` only,
  `iat` only, and `jti` only (each with the other two, plus `vid`/`src`/`sub`,
  present) and confirms `verifyAdminSession` rejects every one, plus a
  positive control with all three present. `test:admin-security` signs the
  same three tokens bound to a real visitor cookie and confirms each is
  refused by the Edge middleware (page redirect, API 401), by the page guard
  (`authorizeAdmin`), and by three real API handlers (`requireAdminApi`),
  that none of the rejected calls mutate the database, and that a normally
  minted session still passes every guard. (D-019 extended this section's
  API coverage from three handlers to all five.)

## D-019: Admin session lifetime is bound by value, not just presence (2026-09-19)

W1 from the #38 deep verify: D-018's `requiredClaims: ["exp", "iat", "jti"]`
only checks that those claims are *present*; it does not check that their
*values* make sense. `jose`'s `jwtVerify` validates `iat`'s value against
the clock only when the caller passes `maxTokenAge` (this code did not),
and it never relates `exp` to `iat` at all, at any settings. A holder of
`SESSION_SECRET` could still hand-sign a token that passes every existing
check -- HS256 signature, `exp`/`iat`/`jti` present, `jti`/`vid`/`src`/`sub`
shaped correctly -- with `exp` decades out, `iat` in the future, `iat`
after `exp`, `iat` at or before the Unix epoch, or a fractional `exp` or
`iat`.

- **Fix.** `verifyAdminSession()` (`src/lib/admin-session.ts`) now passes
  `maxTokenAge: SESSION_TTL_SECONDS` to `jwtVerify` (the same 8-hour
  constant `mintAdminSession()` uses, not a second copy), which makes
  `jose` itself refuse an `iat` more than the TTL in the past or an `iat`
  in the future at all (zero clock tolerance). On top of that, an explicit
  check after `jwtVerify` returns requires `exp - iat` to be a positive
  integer no greater than `SESSION_TTL_SECONDS`, and rejects a fractional
  `exp` or `iat` outright. The two checks cover different gaps:
  `maxTokenAge` bounds `iat` against "now" but never looks at `exp` at
  all, so it would not by itself catch a token minted this second with
  `exp` set 100 years out; the explicit `exp - iat` check catches that, and
  the fractional-claim case `jose` accepts as long as the number is finite.
  `iat` after `exp` and `iat` at/before the epoch are refused by both
  layers for different reasons (see the code comment on
  `verifyAdminSession` for the detail), which is intentional
  defense-in-depth rather than redundant.
- **No clock tolerance added.** Mint and verify both read `Date.now()` in
  the same process, so there is no cross-host clock skew to absorb, and
  nothing else in this codebase sets `clockTolerance`. Adding one here
  would only reopen a few seconds of exactly the slack this fix closes (a
  session minted a few seconds "in the future", or one that outlives its
  TTL by the tolerance window), for no compensating benefit -- so
  `verifyAdminSession` keeps `jose`'s default of zero.
- **Every existing check is unchanged.** The HS256 algorithm pin,
  `requiredClaims`, the post-verify shape check (`jti`/`vid`/`src`/`sub`),
  the visitor binding (`checkAdminCookies`), and sign-out revocation
  (`authorizeAdmin`, D-015) all run exactly as before; this fix only adds
  checks, in the same function D-018 already lives in, so the Edge
  middleware, the page guard, and every API guard close at once as usual.
- **Reach.** Same as D-018: `verifyAdminSession` is the one place the Edge
  middleware, `authorizeAdmin` (page guard), and `requireAdminApi` (API
  guard) all verify a session, so no caller needed its own change.
- **Verification.** `test:admin-session` hand-signs tokens (correct HS256
  signature, valid `jti`/`vid`/`src`/`sub`, only `exp`/`iat` hostile) for
  each shape above -- `exp` 100 years out, `iat` in the future, `iat`
  after `exp` both future and already-expired, `iat` at the epoch,
  negative `iat`, fractional `exp`, fractional `iat`, zero lifetime, and
  one second over the TTL -- and confirms `verifyAdminSession` rejects
  every one, plus a positive control at the exact TTL boundary (`exp -
  iat === SESSION_TTL_SECONDS`) and an ordinary short-lived token, both
  accepted. `test:admin-security` signs the same hostile tokens bound to a
  real visitor cookie and confirms each is refused by the Edge middleware
  (page redirect, API 401), the page guard (`authorizeAdmin`), and all
  five real API handlers (`requireAdminApi`; this section and D-018's 5b
  section now share one `allAdminApis` helper covering `complete`,
  `no-show`, `services POST`, `services/[id] PUT`, and `staff/[id] PUT`),
  that none of the rejected calls mutate the database, that the TTL
  boundary token still passes the page guard and middleware, and that
  sign-out of a normally minted session still revokes it (section 9,
  unchanged by this fix).
- **W2 coverage gap closed too (#38 deep verify).** D-018's 5b section
  only exercised three of the five admin API handlers (missing `no-show`
  and `services/[id] PUT`). Both sections now use the same
  five-handler `allAdminApis` helper, so the missing-claim (D-018) and
  bad-lifetime (D-019) cases cover all five.
- **Mutation check.** Removing the explicit `exp - iat` bound (keeping
  `maxTokenAge`) turned 4 `test:admin-session` checks and 25
  `test:admin-security` checks red (the "decades out", both fractional,
  and "one second over the TTL" cases, plus the downstream
  data-mutation checks). Removing `maxTokenAge` (keeping the explicit
  bound) turned 1 `test:admin-session` check and 10 `test:admin-security`
  checks red (only "`iat` in the future" with an otherwise-in-bounds
  `exp - iat`, since the explicit bound alone does not check `iat`
  against "now"). Both mutations were reverted; the file matched its
  pre-mutation state byte for byte afterward and the full suite was green
  again.

## D-020: Label the portal-handoff machinery as unreached, do not wire it (2026-09-19)

Docs-and-comments only; no behavior, logic, or test changes in this entry.

The portal-handoff route (`src/app/api/auth/portal-handoff/route.ts`) and
the client claim component (`src/components/portal-handoff-claim.tsx`) are
complete, tested machinery that is never exercised in production. Two
independent observations agreed on this tonight:

- demo-harborbistro's Opus deep verify of PR #37 established the sibling
  finding there (`readHarborSession` has zero production callers), the
  same shape of dead-but-tested handoff path this entry addresses here.
- The portal owner (the session that owns portal-shell) reports that
  slatewell is a `shape: "iframe"` tile in the portal, the iframe path
  renders the frame with no fragment, and so the portal never navigates a
  visitor with a `#portal_token=...` fragment at all. `PortalHandoffClaim`
  mounts on the landing page and checks for exactly that fragment on
  mount; it has no live trigger from the portal side.

Two directions landing on the same conclusion is why this is labelled with
confidence rather than left as an open question.

**What is not being done, and why.** We are not wiring iframe identity.
A URL fragment cannot cross into an iframe the way it crosses a top-level
redirect, so making this live needs either a `postMessage` handshake or a
server-side token exchange, either of which is a new feature with its own
design (CSP/`sandbox` implications, replay handling, origin checks). That
design belongs to the portal side, not to a docs-only pass in this repo.

**What changed.** A doc comment was added at the top of each site above,
attributing the "unreached" status to `docs/PORTAL_GATE_CONTRACT.md` in
portal-shell rather than restating the iframe-tile reason as a standalone
fact in this repo -- the portal side owns that decision and can change it
without this repo's comments going stale silently. Each comment names the
date (2026-09-19) so a reader can tell whether it is current.

**If this goes stale.** The portal's tile shape is not this repo's to
track. If `docs/PORTAL_GATE_CONTRACT.md` (portal-shell) later says iframe
tiles receive a token, or the portal moves slatewell to a top-level
redirect, these comments and this entry are stale -- check that file
before assuming this route or component are still dead code.
