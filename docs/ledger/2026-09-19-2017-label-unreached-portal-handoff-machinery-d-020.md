# 2026-09-19 20:17 CDT - Label unreached portal-handoff machinery, D-020
- **Who:** Claude Sonnet 5 (Orchestrator session), for Drew
- **Change:** Docs-and-comments only, no behavior/logic/test changes. Added
  an UNREACHED-in-production note (dated 2026-09-19) to the top of
  `src/app/api/auth/portal-handoff/route.ts` and
  `src/components/portal-handoff-claim.tsx`. Each note attributes the
  reason to `docs/PORTAL_GATE_CONTRACT.md` (portal-shell) rather than
  restating it as a standalone fact, so it does not go stale silently if
  the portal's tile shape changes. Added D-020 in `docs/decisions.md`.
- **Why:** Two independent observations tonight agreed the portal-handoff
  machinery is dead code in production: demo-harborbistro's PR #37 deep
  verify established the sibling finding there (its `readHarborSession`
  has zero production callers), and the portal owner (portal-shell
  session) reports slatewell is an iframe tile, the iframe path renders
  with no fragment, so the portal never navigates a visitor with a
  `#portal_token=...` fragment that `PortalHandoffClaim` checks for on
  mount. Wiring iframe identity (postMessage or a server-side token
  exchange) is a portal-side feature needing its own design, not a docs
  pass; we are labelling the risk, not fixing it, so a future reader does
  not mistake "tested" for "exercised" or treat this route as closing a
  live hole.
- **State after:** Tests unchanged (comment-only diff); check output
  recorded in the PR description. The route and component remain fully
  implemented and unit-tested but unreached from production traffic, same
  as before this change.
- **Refs:** D-020 (docs/decisions.md); PR #42
  (demo-slatewell); branch `docs/portal-gate-contract-note`; portal-shell
  `docs/PORTAL_GATE_CONTRACT.md`
