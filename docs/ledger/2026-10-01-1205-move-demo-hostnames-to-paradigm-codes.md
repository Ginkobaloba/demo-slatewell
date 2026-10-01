# 2026-10-01 12:05 CDT - move demo hostnames to paradigm.codes
- **Who:** Claude (subagent of the main session), for Drew, who authorized the move on 2026-10-01.
- **Change:** SITE_URL, banner link, README, verify/smoke.yml, assertions/admin-session.yml and scripts/verify-prod.mjs (default base URL; the ICS check now derives the host from BASE_URL) move to slatewell.paradigm.codes.
- **Why:** projectnexuscode.org lapses around 2026-10-31. The demos move to <name>.paradigm.codes additively: both names serve, then the legacy names 301, then they are removed. Sequencing is in cloudflare-config docs/demos/MIGRATE_TO_PARADIGM_CODES_2026-10.md.
- **State after:** Not merged or deployed. The app already derives its public origin from the forwarded Host, so it needs no env change. The npm test:* scripts and next build pass.
- **Refs:** cloudflare-config docs/demos/MIGRATE_TO_PARADIGM_CODES_2026-10.md (runbook, step 3).
