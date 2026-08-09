# IPS operational readiness progress

## Track 2.0 — authenticated route discoverability

- Outcome: approved prerequisite implemented from exact clean base `e64756e9251824b723716bb070623993eb896e05`; the tracked contract covers all 38 authenticated dashboard routes, all five fixed roles, visible entries, denials, and dead-end checks.
- Tests: route contract/verifier and focused role, guard, navigation, and finance-safe-link tests pass. The exact-HEAD local fixture browser result is recorded in `authenticated-route-discoverability.md`.
- Database prerequisite: N/A. This track changes no financial schema and requires no hosted migration; the browser run uses only the reset local Supabase fixture.
- Limitations: hosted Supabase, hosted RLS/RPCs, Vercel deployment parity, email, cron, real IPS data, and production recovery remain unverified and unchanged.
- Next route task: begin Track 2.1 only after independent review accepts this route-discoverability gate.
