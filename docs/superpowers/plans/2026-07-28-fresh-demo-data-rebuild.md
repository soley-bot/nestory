# Fresh Demo Data Rebuild Implementation Plan

**Status:** Implementation and local verification complete; PR #40 merged
**Branch:** `codex/rebuild-fresh-demo-data`  
**Merged baseline:** `b592557f3d2919ab5bd7932426fc218a1bea5d4d`  
**Scope:** Historical implementation/PR scope: deterministic local demo data
plus fail-closed hosted cutover preparation. This implementation slice did not
execute a hosted mutation, hosted migration apply, production deployment, or
PR merge; PR #40 later merged in a separate approved cutover.

## Outcome

Replace the stale June/July sample story with a compact Cambodia-oriented
portfolio that exercises the product currently merged through Plan 04. Keep
the fixed identities required by automated verification, keep the Demo
workspace empty, and make every relative operational date derive from one
seed reference date.

The hosted deliverable in this PR is preparation only. It will validate
project/organization/migration/non-target guards and generate a proposed
manifest from read-only inputs. The destructive executor and a real hosted
snapshot remain a separately approved cutover task.

## Decisions

- Keep the existing local login identities and the fixed organization,
  property, unit, person, lease, task, and access UUIDs that are contractual.
- Keep three active operating properties. Fixed properties needed only by
  rollback-based accounting tests may remain archived fixture anchors so they
  do not pollute normal operator views.
- Keep two active branches, two active owners, 18 active units, a bounded
  tenant/staff/vendor directory, and one empty Demo organization.
- Use `app.demo_seed_reference_date` when explicitly supplied, otherwise
  `current_date`. Every demo business date derives from that expression. The
  reset wrapper replays the seed in one local PostgreSQL session when an
  override is requested.
- Keep deterministic IDs for all committed seed rows. Seed SQL may therefore
  insert exact relational fixtures directly as the local superuser. This is a
  deliberate fixture boundary, not an application write path. Contract tests
  must prove the same invariants enforced by checked RPCs.
- Use current normalized source tables for lease authority, receipts,
  payments, allocations, deposits, petty cash, maintenance, ledger,
  accounting compatibility, and reports. Do not create Plan 09 rent
  occurrences or any later owner-close data model.
- Leave document/photo metadata empty until real storage objects can be
  provisioned as fixtures.
- Never reuse `supabase/seed.sql` for hosted data.

## Phase 1: Contract and safety

**Files**

- Add `scripts/demo-seed-manifest.mjs`
- Add `scripts/demo-seed-manifest.node-test.mjs`
- Add `scripts/reset-demo-data.mjs`
- Add `scripts/reset-demo-data.node-test.mjs`
- Add `supabase/tests/demo_seed_contract_test.sql`
- Update `package.json`

**Work**

1. Add contract tests for the local-only guard, one reference date, required
   login identities, deterministic anchor IDs, and the absence of broken
   document/photo metadata.
2. Add RED database assertions for portfolio counts, owner/occupancy/lease
   invariants, role links, finance cases, petty-cash linkage, maintenance
   states, empty Demo workspace, and current-date bounds.
3. Implement a read-only seed verifier that emits a stable JSON manifest of
   counts and invariant results.

## Phase 2: Rebuild the local portfolio

**File**

- Rewrite `supabase/seed.sql`

**Layers**

1. Local-only safety guard and reference-date context.
2. Stable auth, organization, branch, access, and fixture anchors.
3. Three-property, 18-unit operating portfolio and two-owner model.
4. People roles, contacts, workspace-linked Staff, and branch scope.
5. Normalized lease parties, authoritative terms, occupancies, deposits, and
   one ended historical lease.
6. Rent & Income obligations, receipts, allocations, and deposit events.
7. Bills & Expenses obligations, payments, allocations, and exact Ledger
   sources.
8. Petty-cash account, period, entries, running balance, and posted link.
9. Maintenance cases/tasks covering member execution, manager coordination,
   review, completion, blockers, recurrence, vendors, costs, and traceability.
10. Minimal canonical timeline/activity evidence and locked historical period.

## Phase 3: Hosted cutover preparation

**Files**

- Add `scripts/hosted-demo-cutover-plan.mjs`
- Add `scripts/hosted-demo-cutover-plan-core.mjs`
- Add `scripts/hosted-demo-cutover-plan.node-test.mjs`
- Add `docs/verification/hosted-demo-cutover-runbook.md`

**Work**

1. Require project ref `pfvmztxktkwyewvxfgot`, slug `nestory`, and observed
   organization ID `1221152a-3a7d-48f6-a109-45f2b2173813`.
2. Reject loopback, preview, unknown project, duplicate slug, ID mismatch,
   missing non-target organizations, or migration mismatch.
3. Consume a read-only inventory JSON and produce a deterministic proposed
   deletion/insertion manifest plus invitation report.
4. Refuse `--execute` in this PR. Print the future explicitly destructive
   command only as a not-yet-enabled handoff.
5. Commit no hosted row data, PII snapshot, secret, or service-role key.

## Verification

1. Two consecutive `npx supabase db reset` runs.
2. Compare the two generated seed manifests byte-for-byte.
3. `npm run db:lint`
4. `npm run db:types` and clean generated-type diff.
5. Full pgTAP.
6. Ledger, accounting, and lease-term concurrency harnesses.
7. Focused finance, lease/deposit, maintenance, People, and access tests.
8. Full Vitest, ESLint, `npx tsc --noEmit`, production build, route/copy checks,
   and `git diff --check`.
9. Authenticated local browser checks for Admin, Manager, Member, Demo, finance,
   maintenance, reports, timeline, and mobile member work.

## Stop conditions

- A fixed fixture contract cannot be preserved without weakening production
  authorization.
- A finance row cannot be tied to an exact supported source or balanced
  compatibility journal.
- Demo data would require Plan 09 or another unmerged owner-close slice.
- A hosted input fails project, organization, migration, non-target, or
  invitation preservation checks.
- Any command would mutate hosted Supabase.

## Completion evidence

- Repeated local resets succeeded, including a controlled
  `2030-01-15` replay.
- Consecutive reset manifests were byte-identical:
  `AE4F6E5188E11B21C9693AB5C061E703E7EE8B64D380D35311B56EA40E569B38`.
- pgTAP passed 26 files and 900 assertions.
- Vitest passed 168 files and 1,317 tests; the native demo-tool suite passed
  17 tests.
- ESLint, TypeScript, DB lint, production build, 54/54 route coverage, UI copy,
  and all ledger/accounting/lease concurrency harnesses passed.
- Authenticated UI baseline, property mutation flow, and maintenance workspace
  smoke passed against the rebuilt local data.
- No hosted database, migration, deployment, or organization was mutated.
