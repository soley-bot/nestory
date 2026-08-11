# IPS production readiness report

Status: **BLOCKED — template only; no production approval recorded**

Complete this record with redacted exact-target evidence. Empty checkboxes are
blocking. A local result cannot be used as hosted or production proof.

## Candidate provenance

- target environment:
- target branch:
- runtime candidate full SHA:
- fetched remote-tracking ref and full SHA:
- ahead / behind:
- tracked worktree clean:
- Vercel deployment full SHA and production alias:
- deployment full SHA:
- CI full SHA:
- CI status:
- CI check URL:
- CI checked at (UTC):
- evidence recorded at (UTC):
- evidence owner:

The verifier records the evidence commit SHA from `HEAD`; do not place a
self-referential SHA inside this tracked file.

## Local exact-head gates

For every gate, record the exact command, result, duration, artifact path, and
SHA. Link evidence files rather than pasting logs that may contain secrets.

- [ ] affected Vitest and Node contract tests
- [ ] affected pgTAP and concurrency tests
- [ ] database reset/migration replay and generated types
- [ ] database lint and local advisors
- [ ] TypeScript, ESLint, and production build
- [ ] five-role browser journeys
- [ ] accessibility gate
- [ ] release parity checker

Gate evidence paths and SHA-256 values:

-

## Hosted Supabase and data

- project reference:
- expected / actual migration head:
- migration parity evidence:
- RLS/RPC verification evidence:
- database advisor result:
- backup checkpoint and timestamp:
- recovery owner:
- restore rehearsal result and duration:
- rollback threshold and decision owner:

- [ ] setup readiness blocks incomplete property/unit/lease authority
- [ ] paid-cost evidence is exclusively service-registered and task-bound
- [ ] maintenance cost reaches finance and owner statement exactly once
- [ ] recurrence catch-up is idempotent under concurrent/duplicate execution
- [ ] notification delivery and retry history are durable and scoped

## Deployment and scheduled work

- Vercel project / environment:
- deployment full SHA:
- production alias smoke result:
- environment parity evidence:
- scheduled runner path and UTC schedule:
- cron secret presence verified by:
- successful run ID / timestamp:
- duplicate invocation result:
- failed-run visibility and escalation owner:

## Hosted role acceptance

Record one redacted fixture or pilot identity per role and the result of the
full journey. Do not include email addresses, tokens, raw IDs, or personal
financial data.

- [ ] Super Admin
- [ ] Finance Manager
- [ ] Finance Member
- [ ] Operations Manager
- [ ] Operations Member

Journey evidence paths:

-

## Pilot and reconciliation

- pilot scope:
- pilot window:
- reconciliation record:
- expected / actual record counts:
- expected / actual financial totals:
- unresolved exceptions:
- support owner and escalation path:
- pilot rollback result:

## Approvals and decision

- product/data owner:
- finance approver:
- operations approver:
- technical release operator:
- independent reviewer:
- approval timestamps and references:
- waivers, owners, and expiry dates:
- final decision: **BLOCKED**
- decision reason:
