# IPS operational readiness progress

## Track 2.0 — authenticated route discoverability

- Status: pending independent review; this prerequisite is not approved yet.
- Outcome: implemented from exact clean base `e64756e9251824b723716bb070623993eb896e05`; the tracked contract covers all 38 authenticated dashboard routes, all five fixed roles, visible entries, denials, and dead-end checks.
- Tests: contract and node tests cover one workspace session per role, 66 shell/context-relative journeys, forbidden global-anchor absence, four separate direct-denial probes, and existing role, guard, navigation, and finance-safe-link behavior. Exact runtime evidence will be recorded only after the runtime commit is cut and tested.
- Database prerequisite: N/A. This track changes no financial schema and requires no hosted migration; browser verification uses only the reset local Supabase fixture.
- Limitations: hosted Supabase, hosted RLS/RPCs, Vercel deployment parity, email, cron, real IPS data, and production recovery remain unverified and unchanged.
- Next route task: Track 2.1 remains blocked until independent review accepts this route-discoverability gate.
