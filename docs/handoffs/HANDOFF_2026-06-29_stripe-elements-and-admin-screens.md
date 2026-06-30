# HANDOFF: Stripe Elements deposit + admin operator screens

**Date:** 2026-06-29
**Session:** Slatewell gap-closing pass (demo #4), customer-walk follow-up

## What this session did

Closed the two must-have gaps from Drew's gap analysis. Two stacked PRs.

### PR #17 (base main) -- real Stripe Elements card entry (chunk 4.4b, D-012)

- The prior chunk 4.4 (#7) placed the deposit hold server-side with a
  `pm_card_visa` token, so the customer never entered a card. This wires
  real card entry end to end.
- New **Payment** step in the wizard for deposit-bearing services:
  creates an unconfirmed manual-capture PaymentIntent
  (`POST /api/book/[slug]/deposit-intent`, card-only), mounts Stripe
  **CardElement**, customer enters a card, `confirmCardPayment` authorizes
  the hold directly with Stripe. No card data touches our server.
- The booking route verifies the intent before writing (requires_capture,
  exact amount, USD, business-tagged, replay-guarded) and releases the
  hold on a slot race. Settlement (cancel release / no-show capture,
  D-009/D-011) is unchanged. Keyless fallback preserved.
- CardElement, not PaymentElement, on purpose (deposit = card hold; the
  intent is `payment_method_types: ["card"]`).
- Verified: `e2e-deposit.mjs` 15/15 (live test keys, uncaptured hold
  visible in Stripe, replay/tamper/no-hold rejected, release-on-cancel),
  `e2e-deposit-ui.mjs` 7/7 (browser card entry -> Held booking, real PI),
  `e2e-booking.mjs` (no-deposit regression), `npm run build` green.

### PR #18 (base PR #17, stacked) -- admin operator screens

- **Schedule** (`/admin/schedule`): day view of every appointment, staff
  color, status, per-booking deposit state (Held/Captured/Released, Stripe
  PI on hover), Complete + No-show actions that settle the hold, day nav.
- **Services** (`/admin/services`): list all services (active+inactive),
  create/edit name/desc/duration/price/deposit/buffers/active.
- **Staff** (`/admin/staff`): edit profile, service capabilities, and
  weekly availability (per-weekday time blocks).
- All write to the SAME tables the customer wizard reads
  (services / staff / staff_services / availability_blocks).
- New: `admin-repo.ts`, `admin-auth.ts`, `service-schema.ts`,
  `admin-nav.tsx`, three client editors, admin API routes (services CRUD,
  staff update, booking complete), all demo-admin-cookie gated (D-010).
- Verified: `e2e-admin.mjs` 18/18 (actions settle deposits, CRUD +
  validation, auth gate, and the same-source-of-truth proof: a staff
  availability edit removes the matching customer slots), `e2e-admin-ui.mjs`
  9/9 (screens render, client action round-trips), `npm run build` green.

## What is currently broken or incomplete

- **PRs not merged.** #17 and #18 are open and MERGEABLE. Merge bottom-up:
  #17 first (GitHub auto-retargets #18 to main on merge since
  delete_branch_on_merge is on), then #18.
- **No production deploy yet.** After merge, run `deploy-demo.ps1` to
  DREWSPC, then `node scripts/verify-prod.mjs`. Production needs
  `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` +
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set (TEST keys; Infisical/env, not
  hardcoded). `verify-prod.mjs` does not yet exercise the deposit path.
- **No Stripe webhook.** Confirmation is synchronous (fine for the demo);
  no `whsec_` available. A real product would reconcile via webhook.
- **Pre-existing config left dirty/stashed on main.** When the session
  started, main had uncommitted: `.gitignore` (+`.env.demo` ignore),
  `tsconfig.json` (exclude scripts), and untracked
  `.github/branch-protection.json`. These were `git stash`ed to start
  clean (`stash@{0}` "pre-stripe-elements pending config changes"). The
  tsconfig change is also included in PR #17 (same edit -- no conflict).
  Pop the stash on main and commit `.github/branch-protection.json` +
  `.gitignore` separately, or discard if superseded.
- `.env.local` (gitignored) holds the TEST keys for local dev.
- Pre-existing ESLint warning in booking-wizard.tsx (`capableStaff`
  useMemo dep) -- non-blocking, untouched.
- This handoff rides on PR #18 (committed on
  `feat/admin-operator-screens`); it lands on main when #18 merges.

## What the next session should do first

1. Read `C:\dev\SESSION_PROTOCOL.md`, project `CLAUDE.md`, this file; run
   `vstart`; check `C:\dev\DEMOS_RUNNING_HANDOFF.md`.
2. Merge PR #17 then PR #18 (bottom-up). Confirm branches auto-deleted.
3. Pop `stash@{0}` on main, sort the config files, commit.
4. Deploy to DREWSPC with the three Stripe env vars set; run
   `verify-prod.mjs`; smoke the deposit flow + admin screens in prod.
5. Optional follow-ups: extend `verify-prod.mjs` to cover a deposit hold;
   editable per-service prep instructions (D-008); remaining admin nav
   (Customers, Communications, Reports, Settings).

## Open questions for Drew

- Confirm TEST Stripe keys are wired in the production env (Infisical) for
  DREWSPC, same values as `_secrets/stripe_test_keys.local.txt`.
- Keep the four "soon" admin items (Customers/Comms/Reports/Settings)
  disabled for the demo, or build them too?

## Pointers

- Decisions: `docs/decisions.md` (now through D-012).
- Stripe lib: `src/lib/deposits.ts`, `src/lib/stripe.ts`,
  `src/lib/stripe-client.ts`. Card UI:
  `src/components/booking/deposit-payment-step.tsx`.
- Admin: `src/lib/admin-repo.ts`, `src/app/admin/*`,
  `src/app/api/admin/*`, `src/components/admin/*`.
- Tests: `node scripts/e2e-deposit.mjs`, `e2e-deposit-ui.mjs`,
  `e2e-admin.mjs`, `e2e-admin-ui.mjs` (all need a local server + seeded DB);
  unit: `npx tsx scripts/test-deposits.ts` (+ cancellation, scheduling,
  admin-queries, verify-seed).
- HARD-WON (still true): never `npm run build` with the dev server
  running; Preview MCP text tools work on this box but use Playwright for
  screenshots; Stripe PaymentElement injects bank/Link methods even on a
  card-only intent -- use CardElement for a pure card field.

## Next Session Onboarding

Future sessions: read `C:\dev\SESSION_PROTOCOL.md`, then `CLAUDE.md` in
this project, then this file, then run `vstart`.
