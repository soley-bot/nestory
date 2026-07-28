# Plan 04 Authoritative Lease Terms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make normalized lease terms and an effective-dated rent-policy version the only checked authority for future rent readiness without implementing rent occurrences or generation.

**Architecture:** An append-only migration hardens existing `lease_terms`, adds explicit authority/provenance and replacement identity, adds normalized rent-policy versions, and exposes checked resolvers and Admin mutation RPCs. Existing `leases` fields become compatibility projections written only by the checked term transaction; application loaders/actions/imports consume the typed term/policy/readiness contract while Plan 09 generation remains untouched.

**Tech Stack:** PostgreSQL 17, Supabase RLS/RPC/pgTAP, Next.js 16.2.9 App Router, React 19, TypeScript, Vitest, Zod.

**Execution status:** Implementation and exact-head local acceptance are
complete. The final checklist remains the source of truth for push/draft-PR
handoff.

## Global Constraints

- Baseline is `64d72fcb545fa2feedebb05a2a261af23cc49bd6`; Plan 03 must remain an ancestor.
- Branch is `codex/plan-04-authoritative-lease-terms` in `D:\nestory-plan-04-lease-terms`.
- Do not invent IPS proration, due-day, notice, concession, rent-free, or frequency policy.
- Do not introduce charge occurrences, rent generation, finance settlement, backfill, hosted access, deployment, or merge.
- Use RED before GREEN for every production behavior.
- Preserve Plan 03 property-period lock order and payload-bound idempotency.
- PR #38 is conflict evidence only and contributes no code or defaults.

---

### Task 1: Ratify the executable Plan 04 documentation

**Files:**
- Create: `docs/implementation/owner-close/04-authoritative-lease-terms-and-rent-policy.md`
- Modify: `docs/implementation/owner-close/README.md`
- Modify: `docs/implementation/owner-close/97-ratified-final-sequence.md`
- Modify: legacy broad plan files `03-*.md` through `12-*.md`

**Interfaces:**
- Consumes: final sequence rows from `97-ratified-final-sequence.md`
- Produces: one executable Plan 04 and an explicit legacy-to-current mapping

- [x] Add the implementation-ready Plan 04 with the exact merged baseline, authority model, unresolved-policy behavior, invariants, acceptance criteria, verification, exclusions, deliverables, and stop conditions.
- [x] Update README status to Plans 00-03 complete and Plan 04 current.
- [x] Add the legacy mapping table and banners without deleting source analysis.
- [x] Update only status wording in file 97.
- [x] Run `rg -n "Plan 04|legacy|superseded|Plan 09|Plan 06" docs/implementation/owner-close`.
- [x] Run `git diff --check`.
- [x] Commit the documentation checkpoint.

### Task 2: Capture current authority failures in RED pgTAP

**Files:**
- Create: `supabase/tests/lease_term_authority_test.sql`
- Create: `supabase/tests/rent_policy_contract_test.sql`
- Test existing: `supabase/tests/financial_authority_kernel_test.sql`

**Interfaces:**
- Consumes: existing `leases`, `lease_terms`, `activity_logs`, memberships, properties, units, and Plan 03 authority helpers
- Produces: executable failing assertions for provenance, privileges, overlap, policy lifecycle, locked-period behavior, and atomicity

- [x] Add fixed-ID Admin/Manager/Member, organization, property, unit, lease, and legacy-term fixtures.
- [x] Assert RED that changing compatibility rent fields rewrites term sequence 1 and derives due day from lease start.
- [x] Assert RED that API roles have unintended direct lease-term DML.
- [x] Assert RED that no explicit legacy-inferred provenance/readiness distinction exists.
- [x] Assert RED that no effective-dated approved-policy completeness boundary exists.
- [x] Assert RED that no checked idempotent future-term operation exists.
- [x] Assert RED that retroactive edits do not acquire/reject Plan 03 closed-period authority.
- [x] Run each file individually and record the expected missing-object or behavioral failures.

### Task 3: Add authoritative term and policy schema

**Files:**
- Create via `supabase migration new`: `supabase/migrations/<timestamp>_authoritative_lease_terms_and_rent_policy.sql`
- Modify: `src/types/database.generated.ts`
- Test: `supabase/tests/lease_term_authority_test.sql`
- Test: `supabase/tests/rent_policy_contract_test.sql`

**Interfaces:**
- Produces: term authority/lifecycle types, `rent_policy_versions`, term replacement/provenance fields, exclusion constraints, and private mutation contexts

- [x] Add provenance and immutable replacement identity to `lease_terms` without rewriting existing rows as confirmed.
- [x] Classify existing rows as `legacy_inferred` in a deterministic non-destructive migration.
- [x] Add a GiST-backed non-overlap constraint for authoritative non-archived term date ranges scoped by organization and lease.
- [x] Add normalized policy columns whose unresolved values are nullable and lifecycle-constrained.
- [x] Enable RLS and revoke direct API/service-role mutation; grant only intended Admin read surfaces.
- [x] Add triggers that block unauthorized term/policy mutation and approved-policy changes.
- [x] Apply SQL to the disposable local database and run focused pgTAP until schema/lifecycle tests pass.
- [x] Generate types and confirm only intended type drift.
- [x] Commit the schema and lifecycle checkpoint.

### Task 4: Implement deterministic term and readiness resolvers

**Files:**
- Modify: Plan 04 migration
- Modify: `src/features/leases/data/lease-summary.ts`
- Modify: `src/features/leases/data/lease-summary.test.ts`
- Modify: `src/features/leases/lease.types.ts`
- Test: focused Plan 04 pgTAP files

**Interfaces:**
- Produces: `public.resolve_authoritative_lease_term(uuid, uuid, date)`
- Produces: `public.resolve_lease_rent_readiness(uuid, uuid, date)`
- Produces TypeScript: `buildLeaseTermReadiness(row): LeaseTermReadiness`

- [x] Write failing pgTAP for exact identity, inclusive boundaries, no-term, overlap, legacy, scope mismatch, lifecycle, and policy reasons.
- [x] Write failing Vitest for stable readiness reason mapping and repair context.
- [x] Implement security-invoker checked resolver functions with organization membership and typed result rows.
- [x] Resolve policies by approved effective version without newest-row ambiguity.
- [x] Return exact reason codes and term/policy identities; never infer readiness from compatibility rent.
- [x] Run focused pgTAP and Vitest GREEN.
- [x] Commit the resolver checkpoint.

### Task 5: Implement checked idempotent term and policy mutations

**Files:**
- Modify: Plan 04 migration
- Test: `supabase/tests/lease_term_authority_test.sql`
- Test: `supabase/tests/rent_policy_contract_test.sql`

**Interfaces:**
- Produces Admin-only versioned RPCs for initial term, draft/future correction, future change, supersession/termination, legacy confirmation, draft policy, policy approval, and policy supersession
- Consumes Plan 03 `app_private.lock_open_property_reporting_period`, `claim_financial_idempotency`, and `complete_financial_idempotency`

- [x] Write RED assertions for Admin/non-Admin, wrong scope, payload replay/change, duplicate retry, overlap, dependent evidence, and locked/closed period.
- [x] Acquire property-period authority before material date/economic changes and preserve the Plan 03 lock order.
- [x] Use transaction-local private contexts for term/policy writes.
- [x] Write complete previous/new activity payloads with exact identities.
- [x] Reject incomplete policy approval and in-place approved-policy mutation.
- [x] Return stable result identities from idempotent replays.
- [x] Run focused pgTAP GREEN and commit.

### Task 6: Reverse compatibility authority

**Files:**
- Modify: Plan 04 migration
- Test: `supabase/tests/lease_term_authority_test.sql`
- Test: existing lease/import pgTAP suites

**Interfaces:**
- Produces: private compatibility projection from an exact confirmed term
- Preserves: tenant, occupancy, and deposit synchronization

- [x] Write RED assertions proving compatibility edits cannot change authoritative terms.
- [x] Replace only the rent-term portion of `sync_lease_backbone_records`.
- [x] Guard direct compatibility economic edits unless invoked by checked term projection.
- [x] Project compatibility fields only inside the checked mutation transaction.
- [x] Keep the legacy generator separate and add only a corruption-prevention guard if required.
- [x] Run focused and neighboring pgTAP GREEN and commit.

### Task 7: Route create/edit/import through term authority

**Files:**
- Modify: `src/features/leases/actions.ts`
- Modify: `src/features/leases/data/leases.ts`
- Modify: `src/features/leases/lease.types.ts`
- Modify: `src/features/imports/actions.ts`
- Modify: `src/features/imports/import-config.ts`
- Modify: Plan 04 migration import commit RPC
- Test: lease action/data/import tests

**Interfaces:**
- Consumes: checked term RPCs
- Produces: explicit `rentDueDay`, `paymentFrequency`, lifecycle, and readiness data

- [x] Write failing action tests for explicit due day/frequency and typed RPC errors.
- [x] Write failing import tests proving absent due day/frequency is blocked instead of inferred.
- [x] Update checked application actions and Zod validation.
- [x] Route lease import commit through the same checked authority.
- [x] Load authoritative term and readiness information in lease list/detail data.
- [x] Run focused Vitest and pgTAP GREEN and commit.

### Task 8: Add focused table-first Plan 04 UI

**Files:**
- Modify: `src/features/leases/components/lease-form.tsx`
- Modify: `src/features/leases/components/lease-inspector.tsx`
- Modify: `src/features/leases/components/leases-table.tsx`
- Modify: `src/features/leases/components/lease-screen.test.tsx`

**Interfaces:**
- Consumes: readiness, exact term fields, and checked action errors
- Produces: explicit term inputs and concise readiness/repair presentation

- [x] Read relevant Next.js 16.2.9 docs under `node_modules/next/dist/docs/` before server-action/form edits.
- [x] Write failing UI tests for legacy-unconfirmed, unresolved policy, due day, frequency, overlap error, and role denial.
- [x] Add compact due-day/frequency/term inputs without a generic settings platform.
- [x] Show readiness as operational evidence in the table/inspector.
- [x] Preserve desktop/mobile usability and current drawer behavior.
- [x] Run focused UI tests GREEN and commit.

### Task 9: Prove concurrency and forced rollback

**Files:**
- Create: `scripts/lease-term-authority-concurrency.mjs`
- Create: `scripts/lease-term-authority-concurrency-contract.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: deterministic two-session overlap/period-lock harnesses and fault injection

- [x] Write failing contract tests for scenarios and cleanup.
- [x] Prove two concurrent future terms cannot overlap.
- [x] Prove a material edit waits on property-period authority and rejects after close/lock commits.
- [x] Prove unrelated properties remain concurrent.
- [x] Pair forced checked-create rollback evidence with deterministic harness cleanup and prove zero fixtures/sessions remain.
- [x] Run each complete harness three times.
- [x] Add deterministic harnesses to Database CI before shutdown and commit.

### Task 10: Complete exact-head verification and draft PR

**Files:**
- Modify Plan 04/README evidence wording only if verification changes it

**Interfaces:**
- Produces: exact candidate SHA, branch parity, draft PR, and PR #38 disposition

- [x] Run focused lease/policy/import/UI Vitest.
- [x] Run full `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- [x] Run disposable Supabase reset, schema lint, generated-type diff, focused pgTAP, and full pgTAP.
- [x] Run Plan 03 concurrency harnesses and the Plan 04 harness three times.
- [x] Run authenticated Admin/Manager/Member browser verification at desktop and mobile widths.
- [x] Run `git diff --check` and require a clean tree after commit.
- [x] Record PR #38 rebase/reduction/replacement disposition.
- [x] Push `codex/plan-04-authoritative-lease-terms`.
- [x] Open a draft PR with exact evidence; do not merge.
