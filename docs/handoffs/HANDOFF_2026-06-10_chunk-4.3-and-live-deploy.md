# HANDOFF: Chunk 4.3 shipped, Slatewell LIVE in production

**Date:** 2026-06-10 (pm session)
**Session:** Slatewell executor (demo #4)

## What this session did

- State check: vstart clean, seed verify 10/10, build green, and a REAL
  browser look (the gap flagged last session). The first screenshots
  exposed a corrupted `.next` from running `npm run build` while the dev
  server was up -- cleared, re-verified, both desktop and mobile render
  the brand correctly. Lesson recorded below and in the running handoff.
- Screenshot tooling: Claude Preview MCP screenshots hang on this box.
  Playwright is the answer (`npx playwright screenshot`, Chromium
  installed; e2e harness in `scripts/e2e-booking.mjs`). Shots land in
  `.shots/` (gitignored).
- **Chunk 4.3 (PR #1, squash-merged): customer booking flow.**
  - `src/lib/scheduling.ts`: pure slot engine (buffers per D-006,
    same-day lead time, least-busy auto-assign). 12 unit checks in
    `scripts/test-scheduling.ts`.
  - `src/lib/repo.ts`: typed data layer; createBooking re-validates the
    slot in a transaction, throws SlotTakenError -> API 409.
  - APIs: GET /api/book/[slug]/availability, POST /api/book/[slug]/bookings
    (zod-validated).
  - 5-step mobile-first wizard at /book/wave-wellness + v0 confirmation
    page. Mock confirmation SMS/email rows logged to communications.
  - Playwright e2e drives the whole flow at 390px and asserts DB side
    effects: 13/13 passing.
- **Chunk 4.1b (PR #2): Dockerfile + standalone output.** DB seeded at
  image build; better-sqlite3 kept external and verified traced.
- **DEPLOYED: https://slatewell.projectnexuscode.org is LIVE** via
  `deploy-demo.ps1 -Name slatewell -ContextPath C:\dev\demo-slatewell
  -InternalPort 3000`. 200 through Cloudflare, availability API verified
  against prod, booking page screenshot clean. BROOKFIELD skipped
  (known ssh perms issue, single-host until fixed).
- PR #3: Dependabot clean bumps (postcss 8.5.15, glob@10 -> 10.5.0).
  Also enabled `allow_auto_merge` on the repo.

## What is currently broken or incomplete

- Chunk 4.4 (Stripe Test Mode deposit hold) is BLOCKED on credentials:
  no Stripe test keys anywhere in `C:\dev\_secrets`. Needs Drew (Tier 3):
  a Stripe account's TEST mode secret + publishable keys. Until then the
  booking flow records a mock `pi_mock_*` Held intent (by design).
- 14 Dependabot alerts remain: all `next@14`, no patched 14.x exists.
  Next 15 migration is a Tier 3 decision parked with Drew (Phase 0
  recommends ship-on-14 + scheduled migration chunk).
- Production booking writes reset on redeploy (accepted demo posture).
- Confirmation page is v0: no ICS download, no cancel/reschedule link
  yet (that is chunk 4.5, no external dependencies).

## What the next session should do first

1. Read `C:\dev\SESSION_PROTOCOL.md`, project `CLAUDE.md`, this file;
   run `vstart`; check `C:\dev\DEMOS_RUNNING_HANDOFF.md`.
2. Build chunk 4.5 (confirmation page upgrade: ICS download with TZID
   per D-003, pre-appointment instructions, token-protected
   cancel/reschedule at /book/[slug]/cancel/[booking-id] using
   cancel_token per D-007). 4.5 before 4.4 because Stripe keys are
   blocked on Drew.
3. If Stripe test keys have landed in `_secrets`, do 4.4 next.
4. Then admin chunks: 4.6 dashboard, 4.7 master calendar.
5. Redeploy after each shipped chunk (`deploy-demo.ps1`, takes ~3 min,
   refreshes the seeded data window as a bonus).

## Open questions for Drew

- Stripe TEST keys for chunk 4.4 (sk_test_ + pk_test_) -- drop them in
  `C:\dev\_secrets\` (e.g. stripe_test_keys.local.txt) and any session
  can wire the deposit hold.
- Next 14 vs 15 posture (shared fleet decision, see Phase 0 triage).
- Repo is private; flip public whenever it should count as portfolio.

## Pointers

- Coordination: `C:\dev\DEMOS_RUNNING_HANDOFF.md` (Slatewell section at
  the bottom; Phase 0 CURRENT STATE header has fleet-wide facts)
- Decisions: `docs/decisions.md` (D-001..D-007)
- E2E: `node scripts/e2e-booking.mjs` against a running server;
  unit: `npx tsx scripts/test-scheduling.ts`; data:
  `npx tsx scripts/verify-seed.ts`
- HARD-WON: never `npm run build` while the dev server runs (corrupts
  `.next`); Preview MCP screenshots hang on this box, use Playwright.

## Next Session Onboarding

Future sessions: read `C:\dev\SESSION_PROTOCOL.md`, then `CLAUDE.md` in
this project, then this file, then run `vstart`.
