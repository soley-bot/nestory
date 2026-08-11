# Tracks 7, 8, 10, 11, and 12 local batch evidence

Date: 2026-08-11

Candidate branch: `codex/ips-operational-readiness`

Implementation baseline before this coordinated batch:
`e108a78fbf50fa5e3069b0056971bb1ed27e503c`

## Decision

This coordinated batch is locally verified but is **not a production-readiness
approval**. Tracks 7, 8, 10, and 11 are locally green. Track 12 remains blocked
until an exact committed candidate is at remote parity and the hosted Supabase,
Vercel, recovery, role, cron, and pilot checkpoints are performed by authorized
operators.

No push, merge, deploy, hosted migration, hosted cron activation, pilot
invitation, or production-data change was performed.

## Track decisions

| Track | Local result | Remaining boundary |
| --- | --- | --- |
| 7 - setup hardening | Locally green | Readiness exposes exact property, unit, owner, lease, occupancy, billing, policy, opening-balance, and deposit blockers. Scheduled and confirmed occupancy remain separate, imports never infer actual dates from lease terms, and the append-only repair path preserves evidence lineage. The mutation-gated golden browser smoke reaches rent-ready and downstream rent, maintenance, and report scope using the same records. Hosted acceptance remains unverified. |
| 8 - maintenance to finance | Locally green | Paid-cost submission and approval require exclusive, task-bound service-registrar evidence; ordinary upload, generic document creation, and reference-only paths cannot satisfy the check. Hosted acceptance remains unverified. |
| 10 - recurring maintenance and notifications | Locally green | Stable series/revisions, exact-once catch-up, advisory locking, durable outbox, delivery attempts, durable in-app feed, signed cron route, and redacted local runner are implemented. Hosted cron and an external delivery provider are not selected or activated. |
| 11 - end-to-end UX and role readiness | Locally green | Operations navigation, finance terminology, maintenance history, five-role fixture journeys, and the complete local accessibility matrix passed across the supported routes and viewports. Hosted role journeys remain unverified. |
| 12 - production and pilot readiness | Local release kit green; release decision blocked | The parity checker, runbook, readiness report, and reconciliation template are ready. A release still requires a committed runtime candidate, later evidence commit, exact remote parity, exact-SHA CI, and hosted/pilot evidence. |

## Verification performed

- One local Supabase reset completed successfully, followed by the guarded
  fixture load and generated database types.
- Affected database acceptance: `325/325` assertions.
  - readiness/recurrence/outbox batch: `28/28`
  - occupancy evidence repair/readiness/import: `13/13`
  - maintenance-to-finance handoff: `71/71`
  - verified paid cost: `37/37`
  - lease relationships: `35/35`
  - billing terms: `9/9`
  - deposits: `16/16`
  - rent generation: `88/88`
  - IPS rent acceptance: `28/28`
- Focused application tests: `176/176` across 16 files.
- Post-review focused application rerun: `80/80` across 7 files.
- Adjacent maintenance-role and deposit workflow regression: `126/126`.
- Final consolidated application correction suite: `84/84` across 12 files.
- Post-review occupancy successor/display regression: `24/24` across 2 files.
- Release parity real-Git contracts: `16/16`.
- UI route manifest: `47/47`; prohibited UI copy: zero.
- TypeScript and ESLint: clean.
- Database lint: no new warning from this batch. Four pre-existing
  unused-variable warnings remain outside the changed migration.
- Production build: passed with the repository-root local environment loaded
  into the process. No hosted environment was queried.
- Authenticated browser smoke: `/overview`, `/properties/setup`,
  `/maintenance`, `/recurring-tasks`, `/finance`, `/balances`, and `/reports`
  loaded without application/runtime errors.
- Mutation-gated golden setup browser acceptance: `PASS 9-phase local golden
  setup (GLD-137479)`. It created Owner -> Property -> Unit -> Tenant -> Lease,
  activated explicit billing, submitted and independently approved all four
  known-zero opening components, reached `9/9` rent readiness, and verified
  exact rent, maintenance property/unit, and owner-activity report context.
  Contract/locality guards passed `5/5`; hosted and credential-bearing URLs
  fail closed, mutation requires `ALLOW_LOCAL_MUTATION_SMOKE=1`, the live app
  must attest the exact loopback Supabase origin reported by local CLI status,
  and every post-login navigation remains on the approved loopback origin.
- The complete local accessibility crawl passed `188/188` route/viewport
  checks, `235/235` role checks, and `6/6` keyboard/zoom audits. It reported
  zero axe violations, navigation errors, page errors, console errors,
  horizontal-overflow failures, inaccessible primary actions, query failures,
  role mismatches, or keyboard-traversal failures. The generated local artifact
  is `artifacts/ui-redesign/ui-redesign-2026-08-11T15-44-38.141Z-axe-p28852`.
- Five-role fixture smoke passed for Super Admin, Finance Manager, Finance
  Member, Operations Manager, and Operations Member.
- Finance Manager day smoke passed controls, mutations, actor-bound replay,
  ledger, month lock, report exports, Owner Statement read/no-publish, and
  database-effect checks.
- `git diff --check` is clean apart from Git's existing LF-to-CRLF notices.

## Independent review corrections

The first independent manual review did not approve the batch. Its six
findings were reproduced and corrected: recurrence edits now create immutable
successor revisions or retire the series; occurrence uniqueness is series-wide;
opening readiness correlates active owners in the organization currency;
deposit events derive custody status; Operations Member notifications are
recipient-scoped; placeholder evidence cannot pass the release checker; and the
maintenance handoff oracle reaches the exact published statement source once.

The second review found three additional gaps. Duplicate recurrence replay now
removes the unreferenced tenant request, Operations Manager notifications are
limited to the exact branch, and the release verifier requires the two
canonical tracked, HEAD-identical evidence records with branch and SHA
provenance binding. Final independent read-only re-review approved the
requested correction scope with no residual Critical, Major, or Minor finding.
The earlier reviewer independently reran release parity `11/11` and batch
pgTAP `26/26`. Subsequent Track 7, full accessibility, and release-provenance
corrections are recorded in the final verification counts above. The final
review found one post-repair ordering defect and one stale route-evidence note:
accepted occupancy successors are now selected explicitly and sorted ahead of
superseded predecessors, the repair form no longer targets stale evidence, and
the `/properties/setup` manifest/evidence limitation now matches the completed
crawl. The final read-only re-review approved those corrections with no
residual finding after independently rerunning lease summary/component `24/24`
and route coverage `47/47`.

The subsequent golden-setup review initially rejected the browser harness
because frontend loopback alone did not prove a local database target and the
rent handoff did not consume its bare `leaseId`. The corrected harness now
requires the configured local database container, exact app-to-CLI loopback
Supabase attestation before mutation and after every login, and invariant app
origin on every route. Rent filters to the exact lease invoice and the browser
oracle requires the created property and unit in that row. Independent
read-only re-review approved the corrected slice with no residual finding after
rerunning the guard contract `5/5` and route/rent/component tests `26/26`.

Local browser captures use synthetic fixture names and totals. They are not
production evidence and are intentionally excluded from this commit-safe
record; retained release evidence must be redacted and explicitly hashed.

## Hosted release and pilot blockers

The following must remain unclaimed until authorized and recorded against one
exact committed SHA:

- remote branch parity and clean tracked worktree;
- hosted Supabase migration head, RLS/RPC checks, and advisors;
- Vercel environment, deployment SHA/alias, logs, and scheduled cron history;
- restorable backup, rollback owner, and timed recovery rehearsal;
- hosted five-role journeys and real notification delivery;
- redacted IPS pilot import, reconciliation, exception disposition, and named
  production approval.

The global Vercel CLI resolved as `58.4.4` on 2026-08-12. Reconfirm its version
before an authorized hosted checkpoint; no `vercel env`, deploy, alias, or log
command was run during this local batch.
