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
