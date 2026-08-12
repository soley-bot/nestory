# IPS production readiness report

Status: **BLOCKED — synthetic hosted rehearsal complete; production approval not recorded**

This record captures the authorized synthetic production rehearsal. It is not a
real IPS data reconciliation or an independent business approval.

## Candidate provenance

- target environment: Vercel production and Supabase project `pfvmztxktkwyewvxfgot`
- target branch: `codex/ips-operational-readiness`
- runtime candidate full SHA: `fdd0c91537ee96cad754bdfa5c47e883b0805ec7`
- fetched remote-tracking ref and full SHA: `origin/codex/ips-operational-readiness` at `fdd0c91537ee96cad754bdfa5c47e883b0805ec7`
- ahead / behind: `0 / 0` at runtime-candidate verification
- tracked worktree clean: yes in the isolated release clone; unrelated UI/UX work remained untouched in the shared checkout
- Vercel deployment full SHA and production alias: `fdd0c91537ee96cad754bdfa5c47e883b0805ec7` at `https://nestory-bay.vercel.app`
- deployment full SHA: `fdd0c91537ee96cad754bdfa5c47e883b0805ec7`
- CI full SHA: `fdd0c91537ee96cad754bdfa5c47e883b0805ec7`
- CI status: success
- CI check URL: https://github.com/soley-bot/nestory/actions/runs/31562115548
- CI checked at (UTC): `2026-08-12T04:17:00Z`
- evidence recorded at (UTC): `2026-08-12T04:20:00Z`
- evidence owner: sole synthetic-rehearsal operator

The evidence commit follows the runtime candidate and changes only the two
canonical readiness records. The verifier records that evidence commit from
`HEAD`; no self-referential evidence SHA is stored here.

## Local exact-head gates

- [x] affected Vitest and Node contract tests
- [x] affected pgTAP and concurrency tests
- [ ] database reset/migration replay and generated types — affected forward migrations and generated typing were verified; no destructive reset was run at release
- [x] database lint and local advisors
- [x] TypeScript, ESLint, and production build
- [x] five-role browser journeys
- [x] accessibility gate
- [x] release parity checker

Gate evidence:

- paid-cost/billing/readiness batch: pgTAP `247/247`, Vitest `55/55`, TypeScript and ESLint clean, local and linked database lint clean
- missing-period owner-close regression: pgTAP `3/3`, owner-close revision `83/83`, statement publication `39/39`, database lint clean
- release parity contracts: `16/16`
- UI role/accessibility evidence: `188` route results, `235` role audits, four board captures, and six keyboard/zoom checks with zero recorded failures
- exact candidate CI: https://github.com/soley-bot/nestory/actions/runs/31562115548

## Hosted Supabase and data

- project reference: `pfvmztxktkwyewvxfgot`
- expected / actual migration head: `20260812040230` / `20260812040230`
- migration parity evidence: linked migration list matched after both forward migrations were applied
- RLS/RPC verification evidence: five-role hosted workflow plus affected pgTAP role and forgery contracts
- database advisor result: linked database lint clean in affected schemas
- backup checkpoint and timestamp: **none listed by Supabase backup inventory**
- recovery owner: **unassigned**
- restore rehearsal result and duration: **not run; no restorable physical/PITR checkpoint was listed**
- rollback threshold and decision owner: **not approved**

- [x] setup readiness blocks incomplete property/unit/lease authority
- [x] paid-cost evidence is exclusively service-registered and task-bound
- [x] maintenance cost reaches finance and owner statement exactly once
- [ ] recurrence catch-up is idempotent under concurrent/duplicate hosted execution — local contract passes; hosted schedule was deliberately not activated
- [x] notification delivery and role-scoped status history were exercised without cron

## Deployment and scheduled work

- Vercel project / environment: `soley-bots-projects/nestory` / production
- deployment full SHA: `fdd0c91537ee96cad754bdfa5c47e883b0805ec7`
- production alias smoke result: pass through setup, rent, maintenance, finance, owner close, report publication, and artifact download
- environment parity evidence: production deployment metadata matched the runtime candidate SHA
- scheduled runner path and UTC schedule: configured code path only; activation excluded by user authorization
- cron secret presence verified by: not verified
- successful run ID / timestamp: not run
- duplicate invocation result: local contract only
- failed-run visibility and escalation owner: unassigned
- Vercel deployment metadata reported no active crons

## Hosted role acceptance

All five accounts were synthetic and operated by the same person. This proves
permission boundaries and workflow behavior, not separation-of-duties signoff.
The canonical approval boxes remain empty because no independent role holder
signed this release.

- [ ] Super Admin
- [ ] Finance Manager
- [ ] Finance Member
- [ ] Operations Manager
- [ ] Operations Member

Journey evidence paths:

- Super Admin: setup approval, rent policy approval, owner close, and statement publication passed
- Finance Manager: paid-cost approvals and financial-month lock passed
- Finance Member: direct paid-cost submission and read-only review state passed
- Operations Manager: task creation, evidence-bound cost submission, and completion review passed
- Operations Member: assigned-task start/submission and scoped access passed

## Pilot and reconciliation

- pilot scope: one synthetic branch, property, unit, owner, lease, tenant, bank, and vendor set
- pilot window: `2026-08-12` UTC
- reconciliation record: `docs/verification/ips-pilot-reconciliation.md`
- expected / actual record counts: matched for the synthetic scope
- expected / actual financial totals: USD `925.00` rent, USD `162.50` paid costs, USD `74.00` management fee, and USD `688.50` closing owner cash
- unresolved exceptions: real IPS import absent; recurrence runner not activated; backup/restore absent; one human operated all roles
- support owner and escalation path: unassigned
- pilot rollback result: not run

## Approvals and decision

- product/data owner: not signed
- finance approver: not independently signed
- operations approver: not independently signed
- technical release operator: sole synthetic-rehearsal operator
- independent reviewer: not signed
- approval timestamps and references: none
- waivers, owners, and expiry dates: none
- final decision: **BLOCKED**
- decision reason: synthetic end-to-end behavior is green, but production/pilot approval still requires a real IPS dataset and reconciliation, independent business signoffs, a restorable backup plus restore rehearsal, and scheduled-runner approval. Cron activation was expressly excluded.
