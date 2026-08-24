# Legacy test and compatibility inventory

Audit base: merged `main` commit
`5dc8da4824bee0e4b1d6cbbb1ff49b99ce0d4800` (PR #91).

This inventory distinguishes executable contracts from historical names. A
legacy label is not deletion evidence: coverage remains unless the protected
data shape or callable surface is proven impossible in production.

## Scope and counts

- 281 source Vitest files.
- 63 script tests, contracts, and concurrency files.
- 90 pgTAP SQL tests.
- 1 local SQL fixture, `supabase/test-fixtures/baseline.sql`.
- 435 unique scoped test and fixture files in total.
- No exact duplicate file hashes in that set.
- `supabase/seed.sql` is intentionally absent. Local database tests load the
  explicit baseline fixture; `[db.seed]` remains disabled in
  `supabase/config.toml`.

## Current behavior contracts

Retain the Application tiers, migration discipline, pgTAP suite, database
fixture contract, and concurrency harnesses. At the audit baseline, three
current Node tests existed without any package-gate reference:

- `scripts/cleanup-paid-cost-storage-orphans.node-test.mjs`
- `scripts/sentry-autofix.node-test.mjs`
- `scripts/supabase-portable-migrations.node-test.mjs`

They protect destructive-cleanup selection, Sentry issue mutation safeguards,
and portable migration path handling. They are active safety contracts, not
obsolete operator artifacts, and now run in `test:contracts`.

The old generated script inventory masked this condition because a
`.node-test.mjs` file mentioned only by generated documentation was classified
as a documented operator. The classifier now has an explicit `ungated-test`
state and ignores its own generated output as reference evidence.

## Live legacy-compatibility contracts

These contracts protect released or production-possible shapes and remain:

- `supabase/tests/core_domain_mutation_authority_test.sql` proves the released
  Unit create and update overloads remain callable with their constrained
  authority.
- `supabase/tests/custom_roles_test.sql`,
  `supabase/tests/branch_scope_core_test.sql`, and
  `supabase/tests/fixed_role_capabilities_test.sql` contain pre-transition
  fixed-role memberships and invitations until an exact transition manifest
  resolves them.
- `supabase/tests/maintenance_role_workflow_test.sql` preserves the rejected
  active-but-unlinked Staff shape.
- `src/features/documents/actions.test.ts` and
  `src/features/documents/content-fingerprint.test.ts` preserve legacy stored
  document evidence and byte-derived fingerprint behavior.
- `supabase/tests/lease_derived_rent_generation_test.sql` preserves compatible
  pre-existing month obligations and incomplete historical billing setup.
- `supabase/test-fixtures/baseline.sql` intentionally distinguishes historical
  `historical_policy_snapshot` billing rows from active `lease_default_v1`
  rows. PR #91 made that compatibility boundary explicit.
- Negative route and RPC retirement tests remain useful because they prevent
  released stale entry points from silently returning.

No compatibility test in this audit has proof sufficient for deletion.

## Brittle clock, date, timezone, and workspace assumptions

The merged baseline uses 92 `current_date` references and 10 transaction-stable
`now()` calls. The SQL is one transaction, but its session timezone is implicit.
The demo company is located in Phnom Penh while the organization inherits UTC
and the approved rent policy says `Asia/Bangkok`. The offsets currently match,
but the semantic mismatch makes boundary behavior and fixture intent brittle.

The cleanup:

- set the fixture transaction timezone explicitly to `Asia/Phnom_Penh`;
- persist `Asia/Phnom_Penh` as the demo organization's operational timezone;
- use the same named timezone for the approved demo rent policy;
- derive the pgTAP demo operating month from loaded invoice facts rather than
  the pgTAP runner's `current_date`;
- retain dedicated UTC and timezone-boundary coverage in
  `src/lib/dates/business-date.test.ts`,
  `src/features/leases/data/leases.test.ts`, and the database lease timezone
  tests; and
- replace Windows-specific sample paths in
  `scripts/load-test-fixture.node-test.mjs` with platform-neutral path inputs.

All six changes were implemented. The fixture's transaction-scoped clock is
still relative so the demo remains current, but its business timezone and the
contract's operating month are now deterministic facts rather than runner
timezone assumptions. Dedicated UTC and named-timezone boundary tests remain.

## Local project isolation and stale concurrency harnesses

Several concurrency helpers predated multi-worktree local Supabase usage. The
shared selector preferred `supabase_db_<checkout-directory>` even when
`supabase/config.toml` named a different isolated project. With sibling local
stacks present, that could send a fixture reload to the wrong local container.
The selector now resolves and verifies the configured project ID first, and a
new contract proves that the configured isolated project wins over the folder
basename. The owner-balance loaded-fixture helper now uses that same selector.

Three released concurrency cleanups also predated PR #91's finance-category
foreign keys or the expanded paid-cost demo:

- Lease-history and lease-relationship cleanup now remove their synthetic
  lease billing terms and finance categories before deleting organizations.
- The paid-cost harness now preserves both legitimate `GDN-PUMP-2088` rows and
  selects exactly one complete general paid-cost scope. It fails closed on zero
  or multiple complete matches instead of flattening reused references.

No production migration or application mutation implementation changed.

## Duplicate and overlapping coverage

There are no byte-identical duplicates. These similarly named pairs cover
different layers and remain separate:

- `lease_billing_terms_test.sql` has 15 schema assertions;
  `lease_billing_terms_behavior_test.sql` has 9 behavior assertions.
- `property_owner_account_test.sql` has 14 schema assertions;
  `property_owner_account_behavior_test.sql` has 30 behavior assertions.
- `tenant_invoice_collection_test.sql` has 20 schema assertions;
  `tenant_invoice_collection_behavior_test.sql` has 36 behavior assertions.

Consolidating them would blur schema versus workflow failures without removing
meaningful duplication.

## Truly obsolete coverage and deletions

No test or fixture is classified as truly obsolete. No files or assertions are
approved for deletion by this cleanup.

## Seed and fixture contract

The local baseline keeps five deterministic development personas, one tenant,
four properties, ten units, five current leases, current lease-owned billing
authority, and retained historical compatibility shapes. The executable demo
contract already proves four properties; `PROJECT.md` is corrected without
changing the fixture stories or login identities.

## Compatibility debt reported, not repaired

- Released compatibility overloads and fixed-role transition machinery remain
  in production migrations and product code. Their tests demonstrate that the
  shapes are still supported; removing them requires a separate production-data
  proof and forward migration plan.
- PR #91 added forward repair migrations for incomplete legacy lease billing
  authority and history. Those migrations are immutable on this branch and are
  not cleanup targets.
- `leases:test-history-integrity` still fails its unrelated-Person lock-wait
  assertion. The released `archive_person` and lease-creation authorization
  paths do not acquire the organization authorization-scope lock that the test
  expects, so the unrelated archive commits before a lock wait is observable.
  The assertion is retained because changing it would weaken a recently added
  authorization-snapshot contract; repairing released product SQL requires a
  separately reviewed forward migration.
- `scripts/cleanup-paid-cost-storage-orphans.mjs` remains a real but unreferenced
  operator wrapper after inventory regeneration. Its destructive-selection
  core test is now gated; the wrapper itself is preserved pending an operator
  workflow decision.
- Local database lint passes with existing unused-variable and text-to-UUID
  target warnings in released routines. The production build passes with the
  existing Sentry `onRouterTransitionStart` instrumentation warning. Neither is
  repaired in this test-only lane.
- `npm ci` currently reports dependency audit findings. Dependency upgrades are
  outside this focused legacy-test cleanup unless a verification gate proves
  they block it.
