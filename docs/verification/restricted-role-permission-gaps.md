# Restricted-role CRUD and permission-gap review

Baseline: `9b9d7a86a7937d3eff0cd7e84611eaebe2cba04a` (main). This change adds tests and a proposal only. All four pilot users remain SuperAdmin; no live assignments, authorization state, customer rows, migrations, or production permissions are changed.

## Scope and isolation

Custom memberships currently resolve one active branch in one company. Branch A and branch B fixtures test separate single-branch memberships. A/B/both membership selection is a proposed product feature, not an existing capability. Linking a Person to two branches does not grant a user two branches.

Database verification uses copied migrations with LF normalization in a separate workspace, project ID `nestory-restricted-task10-20261002`, database port `57322`, seed disabled, and database-only containers. No shared database reset is needed or authorized. Every pgTAP suite runs synthetic `example.test` fixtures inside BEGIN/ROLLBACK. The fixture-only Property trigger suspension is restored before any authenticated test operation and rolls back with the transaction.

## Current authority and proposed matrix

Every ordinary allow below also requires active membership, active custom role, ordinary access enabled, an active assigned branch, and exact company/branch access to all referenced records. SuperAdmin access remains company-scoped. IDs and query parameters never establish authority. A visible parent must not expose an otherwise forbidden linked record.

| Operation | Current custom-role authority | Proposed authority pending decision |
| --- | --- | --- |
| Property/Unit read, create/edit, archive/restore | `properties.view`, `properties.write`, `properties.archive` respectively | Retain existing operation split and exact parent branch checks |
| People read, create/edit, archive/restore | `people.view`, `people.write`, `people.archive`; branch relationship rules also apply | Retain split; separately decide who may link existing identities across branches |
| Lease read, draft, activate, terms, close, archive/restore | Existing corresponding `leases.*` keys | Retain lifecycle split |
| Deposit received/retained/refunded events | `leases.change_terms` in application and database | Separate deposit recording authority; decide whether receipt/refund/retention need distinct keys or finance payment authority |
| Deposit reversal | `leases.change_terms` | Separate reversal authority; decide whether `finance.correct_records` is required in addition |
| Maintenance read/create/assign/complete/review | Existing corresponding `maintenance.*` keys; completion retains actor/assignment constraints | Retain workflow split |
| Maintenance archive/restore | Application requires SuperAdmin; database RPC predicate specifies branch-scoped `maintenance.create_assign`, but execution fails with `42501: permission denied for function assert_property_permission` | Choose SuperAdmin-only RPC enforcement or an explicit delegated archive permission; align UI, action and RPC together |
| Maintenance evidence upload | `canUploadMaintenanceEvidence` is false for every custom role, including roles with all catalog permissions | Keep restriction until approved; if delegated, introduce evidence upload authority and checked case/storage scope |
| Finance read/payment/expense submission/approval/correction/period close | Existing corresponding `finance.*` keys | Retain split; decide any approval separation requirements independently |
| Finance report read and PDF/Excel export | `finance.publish` projects `canReadFinanceReports`; endpoints use report membership helper | Separate report read and export authority from official publication |
| Official owner-statement publication | `finance.publish` | Preserve explicit publication authority; do not auto-grant it to report readers/exporters |
| Physical DELETE / raw core INSERT and UPDATE | Core Data API writes closed; checked workflow RPCs used instead | Retain closure; archive/restore is the ordinary deletion workflow |
| Role/access administration | SuperAdmin only; all custom catalog permissions still deny access administration | Retain restriction |

Suggested new keys in unit tests are placeholders (`maintenance.evidence`, `maintenance.archive`, `leases.record_deposits`, `leases.reverse_deposits`, `finance.reports_view`, `finance.export`). They are deliberately rejected by the current catalog. They are not production permission definitions or an approved migration plan.

## Evidence and coverage

New tests live in separate files to avoid overlap with ordinary-record and finance UI changes:

- `src/lib/auth/restricted-role-gaps.test.ts`: every individual permission cannot grant unrelated operations; A and B single-branch contexts; all-permission custom role still cannot archive/upload maintenance evidence/administer access; finance report-publication coupling; unimplemented granular keys rejected.
- `src/features/leases/restricted-deposit-authority.test.ts`: record/reverse actions require term permission before database access; authorized company wins over forged form input; linked-ID database denial propagates as an error.
- `src/features/maintenance/restricted-archive-authority.test.ts`: archive/restore application guard denies before resolving guessed case IDs.
- `src/app/api/reports/restricted-export-boundaries.test.ts`: PDF and Excel allow/deny, guessed artifact IDs, no storage or record loading after denial, membership company overrides forged query scope, unavailable artifact errors do not reveal internal details.
- `supabase/tests/restricted_role_direct_id_crud_test.sql`: writer/viewer reads and checked create/update/archive/restore; denied cross-company and cross-branch IDs, parent reassignment, linked joins, raw INSERT/UPDATE/DELETE; persisted values/cardinality after denial; maintenance archive RPC/application mismatch.

Existing database suites additionally exercise People links, Lease mutation/lifecycle, documents and storage metadata, finance and maintenance branch access, inactive roles/branches, anonymous access, and security-invoker views: `custom_role_domain_authority_test.sql`, `core_domain_mutation_authority_test.sql`, `remaining_core_domain_mutation_authority_test.sql`, `remaining_branch_scope_domain_enforcement_test.sql`.

Route unit tests mock membership and data/storage loaders. They demonstrate application ordering and company binding, not actual row isolation or HTTP PostgREST authorization. SQL tests execute as authenticated and validate database/RPC enforcement. A full browser journey, live PostgREST HTTP CRUD, binary Storage download/upload, and export content comparison with two real branch datasets require a separate disposable full-stack acceptance run. None of those is inferred from mocked route passes.

## Verification result

Executed on the baseline in this isolated checkout:

| Check | Result |
| --- | --- |
| Seven targeted Vitest files (four new suites plus permission context, membership and existing report routes) | Passed: 89 tests, including 45 new tests |
| ESLint on all four new TypeScript test files | Passed |
| TypeScript `tsc --noEmit` | Passed |
| Staged diff whitespace and repository secret scan | Passed |
| Six targeted pgTAP suites listed above plus `scoped_lease_finance_read_context_test.sql` | 349 assertions: 347 passed, 2 failed |
| New direct-ID pgTAP suite | 26 assertions: 24 passed, 2 failed |
| Browser, PostgREST HTTP, binary Storage and two-branch export contents | Not run; database-only stack and mocked application route tests |

The two retained failures are allowed same-branch maintenance archive and restore under `maintenance.create_assign`. Both fail with SQLSTATE `42501`, `permission denied for function assert_property_permission`. The RPCs call an internal helper that authenticated callers cannot execute. Their predicate expresses delegated authority while the application insists on SuperAdmin. The draft intentionally exposes these failures and does not grant helper EXECUTE or expand production access. The other five existing SQL suites pass (323 assertions). Early fixture setup/status errors and the Property active-Unit lifecycle guard were corrected before the final run; they are not remaining failures.

The task-specific disposable database was stopped and its volumes removed using its exact project ID after verification. No shared stack was stopped or reset.

Reproduce application checks with:

```powershell
npx vitest run src/lib/auth/restricted-role-gaps.test.ts src/app/api/reports/restricted-export-boundaries.test.ts src/features/leases/restricted-deposit-authority.test.ts src/features/maintenance/restricted-archive-authority.test.ts src/lib/auth/permission-context.test.ts src/lib/auth/context.permission-membership.test.ts src/app/api/reports/report-routes.test.ts
npx eslint src/lib/auth/restricted-role-gaps.test.ts src/app/api/reports/restricted-export-boundaries.test.ts src/features/leases/restricted-deposit-authority.test.ts src/features/maintenance/restricted-archive-authority.test.ts
```

Run database tests only in a newly created disposable local stack with a unique project ID and unused ports. The test command does not provision or reset a database:

```powershell
npx supabase test db --local --workdir ../restricted-role-disposable supabase/tests/restricted_role_direct_id_crud_test.sql supabase/tests/custom_role_domain_authority_test.sql supabase/tests/core_domain_mutation_authority_test.sql supabase/tests/remaining_core_domain_mutation_authority_test.sql supabase/tests/remaining_branch_scope_domain_enforcement_test.sql supabase/tests/scoped_lease_finance_read_context_test.sql
```

## Required business decisions

1. Does maintenance archive/restore remain SuperAdmin-only, or may selected coordinators archive? The RPC predicate delegates it through create/assign, but its private-helper ACL prevents successful execution. Decide intended authority before repairing the RPC; selecting SuperAdmin-only requires tightening its predicate as well.
2. Who may upload maintenance evidence: assigned executor, coordinator, reviewer, or a separate evidence role? May they replace/archive evidence, and does access persist after task completion/archive? Decide upload and lifecycle authority separately.
3. Should lease term editors move deposit money? Decide authority independently for receipt, retention, refund and reversal, including any finance approval/correction requirement.
4. Can report readers export PDF/Excel without publishing official statements? Decide read, export and official publish separately, including whether every report type follows the same matrix.
5. For proposed A/B/both membership, are permissions identical across selected branches or branch-specific? Who grants/revokes scope, what happens when one branch becomes inactive, and are combined exports permitted? Default remains the current single-branch model until implemented and tested.
6. May a restricted People editor link an existing Person to another branch or change shared identity fields used in both branches? Specify who can establish and remove cross-branch relationships before delegating that workflow.

These are proposals for review. No decision here grants authority or changes any pilot user.
