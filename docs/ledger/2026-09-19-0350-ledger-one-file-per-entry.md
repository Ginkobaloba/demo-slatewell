# 2026-09-19 03:50 CDT - Ledger: one file per entry
- **Who:** Claude Opus 5 (1M context), at the Orchestrator's request, rolling out the pattern from paradigm-site.
- **Change:** this repo had no `docs/LEDGER.md`, so there was nothing to migrate. Added `docs/ledger/README.md` and `scripts/ledger.mjs` (new, check, print), plus a `ledger:check` npm script since this repo has no vitest/jest to wire a test file into.
- **Why:** every future entry lands in its own file under `docs/ledger/`, so parallel PRs never conflict on a single append-only file the way six open PRs did in paradigm-site.
- **State after:** the ledger is empty except for this entry. `npm run ledger:check` fails if a future entry is malformed; nothing runs it automatically yet since this repo's CI is HTTP-surface smoke tests (verify/smoke.yml), not a unit-test runner.
- **Refs:** Ginkobaloba/paradigm-site#97, scripts/ledger.mjs, docs/ledger/README.md.
