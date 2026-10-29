# Large-data performance fixes implementation plan

> **For agentic workers:** Use superpowers:executing-plans and dispatching-parallel-agents for the explicitly separated domains below. Preserve the current worktree and verify each change with behavior tests.

**Goal:** Fix all confirmed missing-record and scaling defects from the 2026-10-29 review.
**Architecture:** Keep scoped reads and financial consistency fences. Move matching, ordering and totals before the transfer/page boundary. Preserve exact complete exports and visible record identity.
**Tech stack:** Next.js 16.4.2, React 19, Supabase/PostgreSQL 17, TypeScript, Vitest and SQL fixtures.
**Spec:** D:/nestory/.codex-artifacts/performance-review-2026-10-29/performance-review.md

## Global constraints
- Isolated checkout: D:/nestory/.worktrees/large-data-performance-fixes; baseline27c19fa9.
- No hosted writes, merges or deployments. New migrations only, created with CLI.
- Preserve organization/branch/property permissions and financial generation/revision checks.
- Do not substitute arbitrary limits or an increased API cap for correctness.
- Reference-data, report and summary agents have disjoint source ownership. Parent owns properties/units, shared database types, migration integration, final checks and commits.

## Tasks
- [x] Preserve review evidence; create isolated branch and start clean dependency installation.
- [x] 1. Missing records: regress 1205 and 5000 records under API caps of 1000 and smaller; fix complete/paged people options and account records without losing hierarchy or selected IDs. Owner: references.
- [x] 2. Portfolio pagination: database-scoped property/unit search/filter/sort pages with stable IDs and exact counts; eliminate full-portfolio fallbacks and per-history summary transfers. Owner: parent.
- [x] 3. Ledger totals: public security-invoker entrypoints and private aggregate-only helpers evaluating the exact canonical finance predicate once per property; preserve currency/direction, corrections and date semantics; verify >100000 ledger rows and unauthorized scopes. Runtime policy-shape guards reject future authority changes. Owner: parent.
- [x] 4. Finance/Leases dependencies: remove duplicate broad people reads and intent-load creation/edit selection data. Owner: references.
- [x] 5. Dashboard/Maintenance: aggregate summary results and preserve visible portfolio/attention contracts. Owner: summaries.
- [x] 6. Reports: server screen pagination with complete totals/exports and pregrouped property event/owner lookup. Owner: reports.
- [x] 7. Remove the confirmed duplicate lease index via a new migration after dependency verification. Add only measured, predecessor-guarded, source-equivalent permission-plan optimizations; retain policies, permissions and ACLs. Owner: parent.
- [x] 8. Verify migrations on a disposable local Postgres target with large synthetic fixtures, relevant Vitest/UI tests, typecheck, lint, migration discipline and independent final review. Record missing checks honestly.
- [x] 9. Commit concrete reviewable changes and deliver verification report; keep release a separate step.

## Review focus
- Small server row caps, repeated labels and late-page records cannot hide eligible records.
- Archived identities, current lease semantics, whole-property leases and owner relationship search remain correct.
- Financial aggregates preserve separate currencies, reversals and generation/source changes.
- Restricted organization/branch users cannot obtain counts, totals or references outside their permission scope.
- Empty and out-of-range pages preserve exact totals; grouped reports keep all rows available and exports complete.

## Execution record
Detailed progress and evidence: .superpowers/sdd/large-data-performance-fixes/progress.md.

Final outcomes, verification, review decisions and release limits: [verification report](../../reviews/2026-10-29-large-data-performance-fixes.md).
