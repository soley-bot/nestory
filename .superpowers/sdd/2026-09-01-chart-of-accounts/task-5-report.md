# Task 5 report — connect Chart accounts to Finance workflows

## Outcome

Implemented Task 5 on `codex/finance-chart-pilot-integration` in commit `1b7f60c4` (`feat: use chart accounts in finance workflows`). The customer-facing expense, tenant-charge, tenant-payment, and lease-deposit flows now submit Chart account IDs. New checked database wrappers resolve those IDs to the stable reconciliation-source or Finance-category identities inside the same transaction as the existing canonical financial mutation.

The PR114 paid-cost UX remains intact: Payment is still a dedicated step, `Payment made by` remains `Management company`, the owner-held-cash consequence is retained, and the owner-account-after-approval preview remains visible. No PR112 multiline expense work was included.

## Changed files

Application and contracts:

- `src/features/finance-operations/finance-operations.types.ts`
- `src/features/finance-operations/data/finance-operations.ts`
- `src/features/finance-operations/data/finance-operations.loader.test.ts`
- `src/features/finance-operations/data/finance-operations.test.ts`
- `src/features/finance-operations/actions.ts`
- `src/features/finance-operations/actions.test.ts`
- `src/features/finance-operations/components/finance-operations-screen.tsx`
- `src/features/finance-operations/components/finance-operations-screen.test.tsx`
- `src/features/finance-operations/components/tenant-invoice-payment-form.tsx`
- `src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx`
- `src/features/finance-operations/components/finance-category-manager.tsx`
- `src/features/finance-operations/components/finance-category-manager.test.tsx`
- `src/features/finance-accounts/finance-accounts.types.ts`
- `src/features/finance-accounts/data/finance-accounts.ts`
- `src/features/workspace-operations/finance-workspace.test.ts`
- `src/types/database.ts`

Lease payment/deposit consumers:

- `src/app/(dashboard)/leases/[leaseId]/page.tsx`
- `src/app/(dashboard)/leases/[leaseId]/page.test.tsx`
- `src/features/leases/actions.ts`
- `src/features/leases/actions.test.ts`
- `src/features/leases/components/lease-detail-screen.tsx`
- `src/features/leases/components/lease-detail-screen.test.tsx`
- `src/features/leases/components/lease-payment-resolution-view.tsx`
- `src/features/leases/components/lease-payment-resolution-view.test.tsx`

Database:

- `supabase/migrations/20260904084609_connect_chart_accounts_to_finance_workflows.sql`
- `supabase/tests/finance_category_workflow_connection_test.sql`

The new migration was generated with Supabase CLI 2.108.0:

```text
npx supabase migration new connect_chart_accounts_to_finance_workflows --workdir .
Created new migration at supabase\migrations\20260904084609_connect_chart_accounts_to_finance_workflows.sql
```

Neither existing Chart migration was changed. Their working-tree SHA-256 values at closeout were:

- `20260901005125_manage_financial_reconciliation_sources.sql`: `5D0CC91284BEFEA363D5B4413ED6E1F12B1B8B7657CEAD8C493710D185ED028F`
- `20260901081254_chart_of_accounts_foundation.sql`: `CD939AF2EED82D97EDBBB2DA2FAC34DB6E413E7E73777ADD7EACF3E2F05E6EE2`

## Implementation details

- `FinanceOperationsData` now carries `payFromAccounts`, `expenseAccounts`, `leaseChargeAccounts`, and `leaseDepositAccounts` populated by the Task 2 selectors.
- Expense inputs use `Category` and `Pay from`; account defaults are explicit once record/property context exists. Tenant recoverable costs accept only Expense accounts enabled for lease credits.
- Tenant charges submit a compatible Income account. Tenant invoice payments submit a receiving Asset account; the checked database wrapper refuses Credit Card for money received.
- The category-manager customer surface now routes to `/finance/accounts`; legacy Finance categories remain display-only compatibility data.
- Lease payment resolution now carries account options rather than direct reconciliation-source choices.
- Lease deposit activity has its own checked Liability account selector and `record_lease_deposit_event_with_account` boundary. `lease_deposit_events.liability_account_id` retains the selected account, and reversal inserts inherit it.
- Liability/Credit Card has a real `credit_card` reconciliation-source kind. Compatibility, source creation, and backfill use that kind; it is never coerced to `other`.
- Checked wrappers lock and validate organization, active state, class/subtype, property scope, category namespace, and mapping rows before calling the existing mutations. Existing idempotency, month-lock, approval, evidence, allocation, reversal, and Ledger logic remains owned by those canonical functions.
- The forward migration adds `privileged_email_step_up_enforcement` to `finance_accounts`, `finance_account_roles`, `finance_account_source_links`, and `finance_account_category_links`, reasserts RLS and authenticated SELECT, and explicitly denies authenticated INSERT/UPDATE/DELETE. No Pilot policy row was added or enabled.

## RED evidence

Initial required focused run:

```text
npm test -- src/features/finance-operations/data/finance-operations.test.ts src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/finance-operations/actions.test.ts
Test Files: 2 failed | 1 passed
Tests: 5 failed | 164 passed
```

The failures proved the old manual-charge, expense-submit, and expense-review RPCs were still called and the new `Category`/account-ID fields were absent.

Additional widened-consumer RED runs:

```text
npm test -- src/features/finance-operations/data/finance-operations.loader.test.ts
1 failed | 3 passed — payFromAccounts was undefined

npm test -- src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx
4 failed | 9 passed — receivingAccountId/account choices were absent

npm test -- --reporter=dot src/features/finance-operations/components/finance-category-manager.test.tsx
2 failed — Chart link/read-only category contract was absent

npm test -- --reporter=dot src/features/finance-operations/data/finance-operations.test.ts src/features/leases/components/lease-payment-resolution-view.test.tsx
13 failed | 25 passed — resolution still exposed reconciliation sources

npm test -- --reporter=dot src/features/leases/actions.test.ts src/features/leases/components/lease-detail-screen.test.tsx
2 failed | 58 passed — deposit liability selector/account-aware RPC were absent
```

## GREEN evidence

```text
npm test -- src/features/finance-operations
Test Files: 12 passed (12)
Tests: 268 passed (268)

npm test -- --reporter=dot src/features/finance-accounts/data/finance-accounts.test.ts src/features/finance-operations src/features/leases/actions.test.ts src/features/leases/components/lease-detail-screen.test.tsx src/features/leases/components/lease-payment-resolution-view.test.tsx src/features/workspace-operations/finance-workspace.test.ts
Test Files: 17 passed (17)
Tests: 349 passed (349)

npm test -- --reporter=dot "src/app/(dashboard)/leases/[leaseId]/page.test.tsx"
Test Files: 1 passed (1)
Tests: 16 passed (16)

npx tsc --noEmit
exit 0

npm run lint
exit 0

npm run db:verify-migrations
Migration discipline passed: 135 immutable base migrations and 3 forward migrations checked against origin/main; 20 historical reconciliation declarations validated.

git diff --check
exit 0 (line-ending notices only)
```

A full repository Vitest run before the lease-page mock was updated reported 18 failures: 16 were the newly added account-data dependency in that page test and are now covered by the 16/16 focused GREEN run above. The remaining two reproduce independently and are unrelated existing route-evidence/content-review fixture failures:

```text
npm test -- --reporter=dot src/lib/ui/enterprise-content-review.test.ts src/lib/ui/route-state-evidence.test.ts
Test Files: 2 failed
Tests: 2 failed | 3 passed
```

No production code or evidence fixture in those unrelated suites was changed.

## Local database blocker

Local database execution was attempted and not bypassed with hosted data.

```text
npm run db:reset
failed to inspect service: error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/containers/supabase_db_nestory/json": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
Docker Desktop is a prerequisite for local development.
exit 1
```

Each requested pgTAP command was then attempted and failed closed with the same unavailable local database:

```text
npx supabase test db --local supabase/tests/finance_category_workflow_connection_test.sql
npx supabase test db --local supabase/tests/finance_expense_approval_test.sql
npx supabase test db --local supabase/tests/tenant_invoice_collection_behavior_test.sql
npx supabase test db --local supabase/tests/privileged_email_step_up_enforcement_test.sql
Connecting to local database...
LegacyDbConnectError: failed to connect to postgres
exit 1
```

`npm run db:types` also exited 1 because the local schema was unavailable. Its shell redirection temporarily truncated `src/types/database.generated.ts`; the file was immediately restored byte-for-byte from the clean starting HEAD, and the required new RPC compile contracts were added to the repository's existing manual override layer in `src/types/database.ts`. Repeat local generation/no-drift proof remains blocked until Docker's local engine pipe is restored.

No hosted Supabase, Pilot, Vercel, remote, `main`, or source-branch mutation was performed.

## Fix Round 1

### Range and commit

- Review fix base: `0e70e7b7` (`docs: record chart workflow integration evidence`)
- Fix implementation head: `a14419358acfc0ab8137cbd7c0b965fab62c7928`
- Commit: `a1441935 fix: tighten chart workflow boundaries`
- Worktree/branch: `D:/nestory/.worktrees/finance-chart-pilot-integration`, `codex/finance-chart-pilot-integration`

### Findings addressed

- Paid costs now use an exact Expense-account resolver. Tenant-responsible paid costs additionally require `use_for_lease_credits`; manual tenant charges use a separate exact Income/`use_for_lease_charges` resolver. The shared mixed-class `tenant_billing` resolver is no longer called by these wrappers.
- Workflow options carry raw configured-default and system-role codes. Payment, review, tenant receipt, tenant charge, and deposit surfaces explicitly prefer `operating_bank`, `rental_income`, and `security_deposits` within compatible property scope instead of relying on list order.
- `app_private.finance_chart_workflow_idempotency_bindings` immutably binds the exact submitted Chart account IDs and resolved category/source identities to the canonical operation/key. Existing bindings are read before active resolution, so exact replay survives later account/category archival or mapping replacement. A completed historical canonical request may establish a missing binding, while a fresh key cannot resolve an archived account/category. Conflicting replay identities fail.
- Authenticated execution of legacy `record_lease_deposit_event(uuid,uuid,text,date,numeric,text)` is revoked. Authenticated deposit writes must cross the account-aware liability boundary; reversals inherit the original liability identity.
- Wrapper reads of expense submissions, leases, invoices, and lease deposits no longer take `FOR SHARE` before canonical mutations. Canonical functions retain their established month/advisory/update-lock order; the wrapper adds no shared-to-update lock upgrade. The only new update lock is the immutable idempotency-binding row, acquired consistently before canonical replay.
- Behavioral pgTAP now calls the actual resolvers/binder for valid and invalid class, lease-credit/charge capability, Credit Card pay-from vs receive-into, property, organization, archive, exact replay, repeated/conflicting replay, and account-aware deposit recording/reversal lineage. The existing deposit workflow test now exercises the account-aware writer and asserts no lineage gaps.
- `LeasePaymentResolutionView` and `TenantInvoicePaymentForm` share the same receiving-account predicate; Credit Card-only data renders the no-receiving-account state.

### Files

- `src/features/finance-accounts/finance-account-selection.ts`
- `src/features/finance-accounts/finance-accounts.types.ts`
- `src/features/finance-accounts/data/finance-accounts.ts`
- `src/features/finance-accounts/data/finance-accounts.test.ts`
- `src/features/finance-accounts/components/finance-accounts-screen.test.tsx`
- `src/features/finance-operations/components/finance-operations-screen.tsx`
- `src/features/finance-operations/components/finance-operations-screen.test.tsx`
- `src/features/finance-operations/components/tenant-invoice-payment-form.tsx`
- `src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx`
- `src/features/leases/components/lease-detail-screen.tsx`
- `src/features/leases/components/lease-detail-screen.test.tsx`
- `src/features/leases/components/lease-payment-resolution-view.tsx`
- `src/features/leases/components/lease-payment-resolution-view.test.tsx`
- `supabase/migrations/20260904092136_correct_chart_workflow_boundaries.sql`
- `supabase/tests/finance_category_workflow_connection_test.sql`
- `supabase/tests/lease_deposit_event_workflow_test.sql`

The corrective migration was generated only through the repository Supabase CLI workflow:

```text
npx supabase migration new correct_chart_workflow_boundaries --workdir .
Created new migration at supabase\migrations\20260904092136_correct_chart_workflow_boundaries.sql
```

No committed migration was edited. Closeout hashes remain:

- `20260901005125_manage_financial_reconciliation_sources.sql`: `5D0CC91284BEFEA363D5B4413ED6E1F12B1B8B7657CEAD8C493710D185ED028F`
- `20260901081254_chart_of_accounts_foundation.sql`: `CD939AF2EED82D97EDBBB2DA2FAC34DB6E413E7E73777ADD7EACF3E2F05E6EE2`
- `20260904084609_connect_chart_accounts_to_finance_workflows.sql`: `109FDEF26E20DF4FBE6EA0BE784CEFA47E12AA583A35B85768D75F1651308504`

### RED evidence

The focused UI RED run after adding the review regressions produced the expected four failures:

```text
npx vitest run src/features/finance-accounts/data/finance-accounts.test.ts src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx src/features/leases/components/lease-payment-resolution-view.test.tsx
Test Files 3 failed (3)
Tests 4 failed | 30 passed (34)
```

The failures proved raw role identities were missing, configured `operating_bank` did not win among multiple receiving accounts, and a Credit Card-only Lease resolution still exposed a dead-end submit action.

Database RED was the independently reviewed behavior in `task-5-review-1.md`: mixed Income/Expense resolution, pre-resolution archive rejection, legacy deposit execute privilege, and shared-to-update wrapper locks. Executable local RED/GREEN pgTAP remains unavailable because local Postgres cannot be reached; hosted data was not used as a substitute.

### GREEN and static evidence

```text
npx vitest run src/features/finance-accounts/data/finance-accounts.test.ts src/features/finance-operations/components/tenant-invoice-payment-form.test.tsx src/features/leases/components/lease-payment-resolution-view.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/leases/components/lease-detail-screen.test.tsx
Test Files 5 passed (5)
Tests 154 passed (154)

npx tsc --noEmit
exit 0

npm run lint -- [seven amended production TypeScript/TSX files]
exit 0

npm run db:verify-migrations
Migration discipline passed: 135 immutable base migrations and 4 forward migrations checked against origin/main; 20 historical reconciliation declarations validated.

git diff --check
exit 0 (line-ending notices only)
```

The configured-default GREEN coverage deliberately places non-default options first: `rental_income` still initializes the tenant charge and `security_deposits` still initializes deposit activity. The tenant payment test likewise places cash before `operating_bank` and proves the configured bank is selected.

### Residual local database blocker

The focused pgTAP command was attempted after Docker Desktop appeared in the process list, but local Postgres remained unreachable:

```text
npx supabase test db --local supabase/tests/finance_category_workflow_connection_test.sql supabase/tests/lease_deposit_event_workflow_test.sql --workdir .
Connecting to local database...
{"_tag":"Error","error":{"code":"LegacyDbConnectError","message":"failed to connect to postgres: effect/sql/SqlError: PgClient: Failed to connect"}}
```

Direct `docker version`, `supabase status`, and an earlier reset attempt also became unresponsive against the local Docker engine; the processes started by those bounded diagnostics were terminated. This is consistent with the reported stale/inaccessible local Docker host condition. Exact migration replay, pgTAP execution, `db:lint`, and generated-type no-drift proof must be rerun when Docker Desktop/local Postgres is healthy. No hosted Supabase, Pilot, Vercel, remote, `main`, source branch, or PR112 surface was accessed or mutated.
