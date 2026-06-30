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
