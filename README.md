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
