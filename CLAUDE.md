# demo-slatewell: project instructions

Slatewell is demo #4 of the four Paradigm portfolio demos. Fictional
booking/scheduling platform; demo business is "Wave Wellness" (med-spa).
Target: https://slatewell.projectnexuscode.org

## Session protocol

Follow `C:\dev\SESSION_PROTOCOL.md`. Coordinate with the parallel demo
sessions (Phase 0 infra, AxlePoint, Lumen, HarborBistro) via
`C:\dev\DEMOS_RUNNING_HANDOFF.md`: append to the Slatewell section, never
rewrite another session's section.

## Hard constraints

- No em dashes anywhere (code, copy, docs). Use `--`, parentheses, commas.
- Slatewell has its OWN brand: deep slate blue #2e4057, warm white
  #fafafa, muted terracotta #c97b5a, text #1a242f. Tokens live in
  `src/app/globals.css`.
- The Paradigm banner footer is the ONLY Paradigm-colored element
  (#1f5a44 on #f7f5f0, 32px, dismissible 7-day cookie, icon-only on
  mobile): `src/components/paradigm-banner.tsx`. It stays at the very
  bottom of every page.
- Stripe TEST mode only. Never a live key.
- SMS/email are MOCK sends: write rows to `communications`, surface them
  in /admin/communications. Never integrate a real sender.
- Record design decisions in `docs/decisions.md` (D-numbered entries).
- Calendar UI: lean into restraint. Clear hierarchy, touch-friendly slot
  picker on mobile, accessible contrast.

## Working with the database

- `npm run db:seed` rebuilds `data/slatewell.db` from
  `src/db/schema.sql` + `scripts/seed.ts` (deterministic RNG, dates
  anchored to the run day).
- `npx tsx scripts/verify-seed.ts` checks integrity; run it after any
  seed change.
- Access in app code only through `getDb()` in `src/lib/db.ts`.
- Times of day are minutes-from-midnight integers; timestamps are local
  ISO strings (see docs/decisions.md D-003).

## Git

- All index-touching git commands from Windows PowerShell, never WSL/bash
  (SESSION_PROTOCOL.md section 7).
- Repo standing rule: `delete_branch_on_merge` enabled.

## Build chunks (program handoff)

4.1 scaffold/brand, 4.2 schema+seed, 4.3 booking flow, 4.4 Stripe
deposit, 4.5 confirmation+ICS+cancel, 4.6 admin dashboard, 4.7 master
calendar, 4.8 services, 4.9 staff+availability editor, 4.10 customers,
4.11 communications log, 4.12 reports, 4.13 settings, 4.14 marketing
landing, 4.15 mobile polish + a11y audit, 4.16 Work page entry.
