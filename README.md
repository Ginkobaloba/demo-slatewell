# Slatewell

Booking that respects your customers and your staff calendar.

Slatewell is a fictional booking and scheduling platform for
small-to-mid-size service businesses (med-spas, salons, consultancies,
personal trainers, photographers, tutors). It is a portfolio demo built
by Paradigm: Calendly is for solo operators, Boulevard is
industry-specific, and the enterprise suites are too heavy. Slatewell
sits in the middle for businesses that need multi-staff scheduling
without the overhead.

**Live demo:** https://slatewell.projectnexuscode.org (pending deploy)

## What the demo shows

- A customer-facing booking flow for "Wave Wellness", a fictional
  med-spa: service, staff, date, time slot, customer info, deposit hold
  (Stripe Test Mode), confirmation with ICS download, token-protected
  cancel/reschedule.
- The business admin product: dashboard, master calendar (day/week/month,
  color-coded by staff), service CRUD, staff availability editor,
  customer profiles, a mock SMS/email communications log, and reports.

Nothing real happens: payments run in Stripe Test Mode, SMS/email
"sends" are rows written to the database and surfaced in the admin
communications log.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui
- SQLite via better-sqlite3, seeded with deterministic mock data

## Local development

```bash
npm install
npm run db:seed     # builds data/slatewell.db with the Wave Wellness dataset
npm run dev
```

`npx tsx scripts/verify-seed.ts` runs integrity checks on the seeded
database (no double-booked staff, schedule fits availability, deposit
state consistency).

## Brand

Slatewell has its own identity, separate from Paradigm: deep slate blue
`#2e4057`, warm white `#fafafa`, muted terracotta `#c97b5a`, dark slate
text `#1a242f`. The Paradigm attribution banner at the bottom of every
page is the one element in Paradigm colors.

## Project docs

- Design decisions: `docs/decisions.md`
- Session handoffs: `docs/handoffs/`

## Verification

The `verify/` directory declares what "passing" means for this repo. The engine
that reads and executes these files is the `paradigm-verify` skill. No central
choke point -- each demo owns its own assertions.

### Quick reference

**Run a fast smoke check (every PR):**
```
/verify C:\dev\demo-slatewell
```
Runs `verify/smoke.yml` against all surfaces. Safe to require in CI. Covers
home, the booking flow, the admin session endpoint, the unauthenticated-admin
redirect, and the portal-handoff endpoint.

**Run a deep verify (required before merging any tier-3 PR):**
```
/verify deep C:\dev\demo-slatewell
```
Runs all `verify/assertions/<surface>.yml` files. Required before merging
any PR that touches a surface marked `tier: 3` in `verify/tier_map.yml`.

### Tier-3 surfaces (deep verify required before merge)

- `admin-session-post` -- session cookie minting changed from plain string to
  HS256 JWT in the "standardize-session-cookie" branch; a regression locks out
  all admins or silently breaks auth.
- `admin-unauthenticated` -- middleware guard on `/admin/:path*`; regression
  exposes the dashboard publicly.
- `portal-handoff-endpoint` -- Portal RS256 JWT verification and local session
  mint; a regression breaks SSO from portal-shell.

### CI

The workflow at `.github/workflows/verify.yml` runs:
- **Quick smoke** on every PR (all PRs, ubuntu-latest, layers 1-4).
- **Deep verify gate** only when the PR carries the `tier-3` label; requires a
  committed `verify/reports/` report with `Overall: PASS`.

Headed-browser (Layer 5, Windows MCP) and adversarial (Layer 6) steps cannot
run in CI -- they require a local Windows desktop run before merging tier-3 PRs.
