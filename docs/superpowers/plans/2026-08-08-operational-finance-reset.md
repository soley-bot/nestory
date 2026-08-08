# Operational Finance Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Nestory's accounting and legacy compatibility machinery with one authoritative operational-finance data flow, then consolidate the empty-development database into a clean reproducible baseline.

**Architecture:** Keep lease terms, obligations, settlements, approvals, owner effects, operational Ledger events, activity, and reports as the product authorities. Replace accounting/property-period state with one serialized organization-month lock, make Ledger an immutable projection created only by checked source workflows, and remove every compatibility entrypoint after its active caller moves. Consolidate migrations only after the replacement schema passes a clean reset.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript 5, Supabase CLI 2.108.0, PostgreSQL, pgTAP, Supabase Auth/RLS/Storage/Cron, Zod 4, Vitest 4, ESLint 9.

## Global Constraints

- Work only in `D:\nestory\.worktrees\lease-rent-finance-approval` on `codex/operational-finance-reset`.
- Do not push, merge, deploy, mutate linked Supabase, enable hosted Cron, or invite users.
- Preserve the five fixed roles and repeat capability checks in server contexts, RPCs, grants, RLS, navigation, and action visibility.
- Keep exact numeric money, explicit USD currency, business dates, immutable source identity, payload-bound idempotency, activity, and append-only reversal lineage.
- Use one organization-month advisory-lock order for lock changes and every financial mutation.
- Use explicit Data API grants and RLS for every exposed table; revoke direct DML and default function execution.
- Add a failing behavior or retirement contract before each production change.
- Create migrations with `npx supabase migration new`; never invent a migration timestamp.
- Preserve bucket rows and Cron scheduling explicitly because Supabase migration squash omits DML.
- The second clean reset from the consolidated baseline is the schema acceptance authority.

---

### Task 1: Establish executable retirement contracts

**Files:**
- Create: `supabase/tests/operational_finance_reset_test.sql`
- Create: `src/lib/ui/legacy-surface-retirement.test.ts`
- Modify: `docs/superpowers/specs/2026-08-08-operational-finance-reset-design.md`

**Interfaces:**
- Consumes: current final schema at commit `d1fa8f8` and the approved reset design.
- Produces: one pgTAP inventory of required final objects and one source/route inventory that later tasks must satisfy.

- [ ] **Step 1: Mark the approved specification**

Change its status to `Approved for implementation` without changing the approved product boundary.

- [ ] **Step 2: Write the failing database retirement test**

Use pgTAP assertions that name the final contract explicitly:

```sql
begin;
select plan(24);

select has_table('public', 'financial_month_locks');
select has_function('public', 'set_financial_month_lock', array['uuid', 'date', 'boolean', 'text']);
select hasnt_table('public', 'accounting_books');
select hasnt_table('public', 'accounting_accounts');
select hasnt_table('public', 'accounting_periods');
select hasnt_table('public', 'accounting_journal_entries');
select hasnt_table('public', 'accounting_journal_lines');
select hasnt_table('public', 'property_reporting_periods');
select hasnt_table('public', 'property_close_revisions');
select hasnt_table('public', 'finance_receipt_allocation_journals');
select hasnt_table('public', 'ledger_period_locks');
select hasnt_column('public', 'ledger_entries', 'accounting_journal_entry_id');
select hasnt_column('public', 'expense_submissions', 'approved_journal_entry_id');
select hasnt_column('public', 'expense_submissions', 'reversal_journal_entry_id');
select hasnt_function('public', 'post_accounting_journal');
select hasnt_function('public', 'reverse_accounting_journal');
select hasnt_function('public', 'set_accounting_period_lock');
select hasnt_function('public', 'confirm_legacy_lease_term');
select hasnt_function('public', 'generate_monthly_rent_income_items_legacy_unchecked');
select hasnt_function('public', 'commit_generic_import_run_legacy_unchecked');
select has_function('public', 'submit_expense');
select has_function('public', 'review_expense');
select has_function('public', 'reverse_expense');
select has_function('public', 'get_property_cash_events_page');

select * from finish();
rollback;
```

- [ ] **Step 3: Run the retirement test and capture the expected failure**

Run:

```powershell
npx supabase test db --local supabase/tests/operational_finance_reset_test.sql
```

Expected: FAIL because `financial_month_locks` and the canonical cash-event RPC do not exist and accounting/compatibility objects still exist.

- [ ] **Step 4: Write the failing source-surface test**

The test recursively reads `src` and `config/ui-route-coverage.json`, then asserts that runtime files do not contain these retired contracts:

```ts
const retiredRuntimeMarkers = [
  "requireAdminContext",
  "accountingJournalEntryId",
  "legacy_unclassified",
  "buildLegacyRedirect",
  'format: "csv"',
];

const retiredRouteSegments = [
  "/maintenance-dashboard",
  "/property-dashboard",
  "/schedule",
  "/team",
  "/people-reports",
];
```

Exclude the retirement test itself and design/plan documents from the scanned runtime set.

- [ ] **Step 5: Run the source-surface test and capture the expected failure**

Run:

```powershell
npx vitest run src/lib/ui/legacy-surface-retirement.test.ts
```

Expected: FAIL listing current aliases, accounting fields, and route entries.

- [ ] **Step 6: Commit the red contracts**

```powershell
git add -- docs/superpowers/specs/2026-08-08-operational-finance-reset-design.md supabase/tests/operational_finance_reset_test.sql src/lib/ui/legacy-surface-retirement.test.ts
git commit -m "test: define operational finance retirement contracts"
```

### Task 2: Replace all period authorities with one financial month lock

**Files:**
- Create: migration generated by `npx supabase migration new operational_finance_reset`
- Modify: `src/features/ledger/actions.ts`
- Modify: `src/features/ledger/data/ledger.ts`
- Modify: `src/features/ledger/components/ledger-screen.tsx`
- Modify: `src/features/ledger/components/ledger-screen.test.tsx`
- Modify: `src/features/ledger/ledger.types.ts`
- Modify: finance, rent, lease-term, owner, petty-cash, and expense pgTAP tests that assert period behavior.

**Interfaces:**
- Consumes: `app_private.can_read_finance`, `app_private.can_reverse_expense`, organization IDs, and business dates.
- Produces: `app_private.lock_open_financial_month(uuid,date) returns void`, `app_private.is_financial_month_locked(uuid,date) returns boolean`, and `public.set_financial_month_lock(uuid,date,boolean,text)`.

- [ ] **Step 1: Add failing month-lock behavior tests**

Assert Super Admin can lock/unlock, Finance and Operations roles cannot, lock replay is idempotent, and a financial write racing the same month serializes on:

```sql
perform pg_advisory_xact_lock(
  hashtextextended(p_organization_id::text || ':financial-month:' || date_trunc('month', p_date)::date::text, 0)
);
```

Also assert the locked-month error contains no `accounting period`, `close`, or raw UUID text.

- [ ] **Step 2: Run focused lock tests and confirm failure**

```powershell
npx supabase test db --local supabase/tests/operational_finance_reset_test.sql supabase/tests/financial_authority_kernel_test.sql
```

Expected: FAIL on missing financial-month functions.

- [ ] **Step 3: Create the CLI-named migration and implement the month lock**

Run:

```powershell
npx supabase migration new operational_finance_reset
```

In the generated file create `financial_month_locks` with organization/month uniqueness, reason length validation, actor timestamps, explicit indexes, RLS, and read-only Finance access. Create the two private helpers and public checked setter with a fixed empty search path, explicit `auth.uid()` capability checks, and revoked `PUBLIC`/`anon` execution.

- [ ] **Step 4: Route every financial write through the new helper**

Replace calls to `is_ledger_period_locked`, `lock_open_property_reporting_period`, `lock_open_lease_term_periods`, and accounting-period helpers in active rent, receipt, expense, reversal, owner, withdrawal, petty-cash, and lease-term functions. Acquire organization-month before owner-cash, invoice, allocation, or source-row locks and preserve that order in every path.

- [ ] **Step 5: Update the Ledger month-lock application boundary**

Rename the server action to `setFinancialMonthLockAction`, call `set_financial_month_lock`, and use operator copy `Month lock`, `Locked month`, and `Operational financial changes are paused` only.

- [ ] **Step 6: Apply locally and run focused tests**

```powershell
npx supabase migration up --local
npx supabase test db --local supabase/tests/operational_finance_reset_test.sql supabase/tests/financial_authority_kernel_test.sql supabase/tests/lease_derived_rent_generation_test.sql supabase/tests/finance_expense_approval_test.sql supabase/tests/petty_cash_auditability_test.sql
npx vitest run src/features/ledger/components/ledger-screen.test.tsx
```

Expected: month-lock assertions pass; retirement test continues to fail only on objects removed by later tasks.

- [ ] **Step 7: Commit the month-lock slice**

```powershell
git add -- supabase/migrations supabase/tests src/features/ledger
git commit -m "refactor: replace period authority with month locks"
```

### Task 3: Make operational Ledger projection the only internal financial projection

**Files:**
- Modify: the generated operational reset migration.
- Modify: `src/features/ledger/ledger.types.ts`
- Modify: `src/features/ledger/data/ledger.ts`
- Modify: `src/features/ledger/components/ledger-inspector.tsx`
- Modify: `src/features/ledger/components/ledger-inspector.test.tsx`
- Modify: `src/features/ledger/components/ledger-screen.tsx`
- Modify: `src/features/ledger/components/ledger-screen.test.tsx`
- Modify: `src/features/finance-operations/data/finance-operations.ts`
- Modify: `supabase/tests/plan05_atomic_income_settlement_test.sql`
- Modify: `supabase/tests/finance_expense_approval_test.sql`
- Modify: `supabase/tests/tenant_invoice_collection_behavior_test.sql`
- Modify: `supabase/tests/property_owner_account_behavior_test.sql`

**Interfaces:**
- Consumes: immutable receipt/payment/allocation, expense-submission, owner-payment, withdrawal, deposit, and petty-cash source IDs.
- Produces: `app_private.create_operational_ledger_event(...) returns uuid` and exact source-to-`ledger_entries.id` links without journal IDs.

- [ ] **Step 1: Write failing projection tests**

For rent receipt, approved expense, expense reversal, owner payment, withdrawal, and petty-cash posting assert:

```sql
select is(count(*), 1::bigint, 'one Ledger event exists for the source')
from public.ledger_entries
where source_type = 'expense_payment_allocation'
  and source_id = :'allocation_id';

select is(count(*), 0::bigint, 'no accounting journal is required')
from information_schema.columns
where table_schema = 'public'
  and column_name in ('accounting_journal_entry_id', 'approved_journal_entry_id', 'reversal_journal_entry_id');
```

Assert source-owned Ledger rows reject direct update/delete and that reversal rows point to the original event.

- [ ] **Step 2: Run focused projection tests and confirm failure**

```powershell
npx supabase test db --local supabase/tests/plan05_atomic_income_settlement_test.sql supabase/tests/finance_expense_approval_test.sql supabase/tests/petty_cash_auditability_test.sql
```

Expected: FAIL because current projections require journal records/columns.

- [ ] **Step 3: Implement the canonical Ledger-event helper**

The helper validates organization/property/unit/currency/source scope, inserts one immutable `ledger_entries` row, and uses a partial unique index on active system source identity. Replace `create_income_settlement_projection`, `create_expense_payment_projection`, petty-cash posting, owner settlement, withdrawal, and reversal internals to call it directly.

- [ ] **Step 4: Remove generic manual Ledger mutation paths**

Drop or revoke the public create/update/archive/post Ledger RPCs and remove their server actions, drawers, buttons, and tests. Keep read-only filtering, quick view, source links, and Super Admin month locking.

- [ ] **Step 5: Remove journal identity from runtime DTOs**

Delete `accountingJournalEntryId`, balanced/missing-journal states, and journal titles from Ledger and Finance mappings. Source identity and reversal identity become the only projection-health fields.

- [ ] **Step 6: Run database and UI projection tests**

```powershell
npx supabase test db --local supabase/tests/plan05_atomic_income_settlement_test.sql supabase/tests/finance_expense_approval_test.sql supabase/tests/tenant_invoice_collection_behavior_test.sql supabase/tests/property_owner_account_behavior_test.sql supabase/tests/petty_cash_auditability_test.sql
npx vitest run src/features/ledger src/features/finance-operations
```

- [ ] **Step 7: Commit the projection slice**

```powershell
git add -- supabase/migrations supabase/tests src/features/ledger src/features/finance-operations
git commit -m "refactor: make ledger the operational projection"
```

### Task 4: Rebuild property cash and trusted reports without journal compatibility

**Files:**
- Modify: the generated operational reset migration.
- Modify: `src/features/finance/data/property-cash-events.types.ts`
- Modify: `src/features/finance/data/property-cash-events.ts`
- Modify: `src/features/finance/data/property-cash-events.test.ts`
- Modify: `src/features/finance/data/property-cash-events.totals.test.ts`
- Modify: `src/features/finance/data/property-cash-events.links.test.ts`
- Modify: `src/features/reports/data/trusted-report.ts`
- Modify: `src/features/reports/data/trusted-report.test.ts`
- Replace: `supabase/tests/property_cash_events_v1_test.sql` with canonical `supabase/tests/property_cash_events_test.sql`.
- Delete: `src/features/finance/data/property-cash-shadow-parity.ts`
- Delete: shadow/parity tests and `scripts/property-cash-shadow.mjs`.

**Interfaces:**
- Consumes: canonical settlement allocations, exact Ledger source IDs, responsibility scope, reversals, and month dates.
- Produces: `public.get_property_cash_events_page(...)` with cursor pagination and no journal or legacy fields.

- [ ] **Step 1: Write the failing canonical cash-event contract**

The new RPC row contains `event_date`, `source_type`, `source_id`, property/unit/lease/person IDs, signed amount, currency, operational category, description, reference, `ledger_entry_id`, resolution state, and cursor values. It does not contain `journal_entry_id`, `is_legacy`, or compatibility issue codes.

- [ ] **Step 2: Run cash/report tests and confirm failure**

```powershell
npx supabase test db --local supabase/tests/property_cash_events_test.sql
npx vitest run src/features/finance/data/property-cash-events.test.ts src/features/reports/data/trusted-report.test.ts
```

Expected: FAIL because the canonical RPC and DTO do not exist.

- [ ] **Step 3: Implement the canonical cursor-paged projection**

Use `SECURITY DEFINER` only in `app_private`, revoke direct execution, and expose a checked public wrapper that requires `can_read_finance`. Use indexed `(organization_id, property_id, business_date, id)` access paths and preserve all currently supported rent, expense, owner, withdrawal, deposit, petty-cash, and reversal classifications.

- [ ] **Step 4: Update loaders and trusted reports**

Call `get_property_cash_events_page`, map source and Ledger links directly, remove shadow comparison and legacy classification UI, and keep unresolved events excluded from trusted Unit Profit and Loss.

- [ ] **Step 5: Verify exact approval and reversal reporting**

```powershell
npx supabase test db --local supabase/tests/property_cash_events_test.sql supabase/tests/finance_expense_approval_test.sql supabase/tests/lease_derived_rent_generation_test.sql
npx vitest run src/features/finance/data src/features/reports/data
```

- [ ] **Step 6: Commit the reporting slice**

```powershell
git add -A -- supabase src/features/finance src/features/reports scripts/property-cash-shadow.mjs
git commit -m "refactor: derive reports from operational cash events"
```

### Task 5: Remove accounting, close, and finance-inventory objects

**Files:**
- Modify: the generated operational reset migration.
- Delete: `src/features/accounting/data/accounting-health.ts`
- Delete: `src/features/finance/inventory/finance-inventory.ts`
- Delete: `src/features/finance/inventory/finance-inventory.test.ts`
- Delete: `scripts/finance-inventory.mjs`
- Delete: `scripts/finance-inventory-stack.mjs`
- Delete: `scripts/finance-accounting-period-concurrency.mjs`
- Modify: `package.json`
- Delete: accounting-kernel, dual-post, parity, security, inventory, and compatibility pgTAP files after their retained business assertions move to operational tests.

**Interfaces:**
- Consumes: passing Tasks 2-4 behavior and authorization tests.
- Produces: schema with no accounting/close tables, functions, columns, triggers, grants, policies, or runtime consumers.

- [ ] **Step 1: Move retained assertions out of accounting tests**

Before deleting a test, move its still-valid organization scope, direct-DML denial, exact money, atomicity, reversal, and source-link assertions into the canonical rent, expense, owner, petty-cash, cash-event, or reset test.

- [ ] **Step 2: Run the moved assertions before dropping objects**

```powershell
npx supabase test db --local supabase/tests/operational_finance_reset_test.sql supabase/tests/plan05_atomic_income_settlement_test.sql supabase/tests/finance_expense_approval_test.sql supabase/tests/property_cash_events_test.sql
```

Expected: only absence assertions for accounting/close objects remain failing.

- [ ] **Step 3: Drop compatibility dependencies in explicit order**

Remove public wrappers and grants, triggers, private helpers, journal-link columns, allocation-journal bridge, journal tables, accounting periods/accounts/books, property close revisions/reporting periods, and old Ledger-period table. Use explicit `drop ...` statements without `cascade`; a remaining dependency must fail the migration and be replaced deliberately.

- [ ] **Step 4: Remove diagnostics and scripts**

Delete finance-inventory/accounting-health runtime modules and package scripts `finance:inventory`, `finance:inventory:stack`, and `finance:test-accounting-authority`. Keep only operational settlement/month-lock concurrency scripts.

- [ ] **Step 5: Apply and prove retirement contracts green**

```powershell
npx supabase migration up --local
npx supabase test db --local supabase/tests/operational_finance_reset_test.sql
npx supabase db lint --local --schema public --level warning --fail-on error
```

- [ ] **Step 6: Commit the kernel removal**

```powershell
git add -A -- supabase src/features/accounting src/features/finance/inventory scripts package.json
git commit -m "refactor: remove accounting compatibility kernel"
```

### Task 6: Remove lease, maintenance, import, and finance compatibility states

**Files:**
- Modify: the generated operational reset migration.
- Modify: `src/features/leases/data/lease-summary.ts`
- Modify: `src/features/leases/data/lease-summary.test.ts`
- Modify: `src/features/leases/lease.types.ts`
- Modify: `src/features/maintenance/actions.ts`
- Modify: `src/features/maintenance/actions.test.ts`
- Modify: `src/features/maintenance/data/maintenance.ts`
- Modify: `src/features/maintenance/maintenance.types.ts`
- Modify: `src/features/maintenance/components/maintenance-workflow-panel.tsx`
- Modify: `src/features/imports/actions.ts`
- Modify: current lease/import/maintenance pgTAP tests.

**Interfaces:**
- Consumes: authoritative `lease_terms`, checked task RPCs, checked import staging/commit RPCs, and expense submissions.
- Produces: no inferred lease authority, no task Ledger link, no compatibility refresh function, and no checked/unchecked alias chain.

- [ ] **Step 1: Write failing authoritative-only tests**

Assert new/reset lease rows require an authoritative term; lease summary has no `legacy_unconfirmed`; tasks have no `ledger_entry_id` or `link_actual_cost_to_ledger`; current maintenance create/update/assign RPCs are canonical names; and current import commit RPCs do not call functions containing `legacy` or `unchecked` in their names/bodies.

- [ ] **Step 2: Run the focused tests and confirm failure**

```powershell
npx supabase test db --local supabase/tests/lease_term_authority_test.sql supabase/tests/maintenance_role_workflow_test.sql supabase/tests/atomic_import_staging_test.sql supabase/tests/import_commit_entrypoint_guard_test.sql
npx vitest run src/features/leases src/features/maintenance src/features/imports
```

- [ ] **Step 3: Make lease authority single-source**

Move remaining reads to `lease_terms`, drop duplicated lease rent/start/end/due fields, remove `legacy_inferred` and `legacy_unresolved` states and the public confirmation RPC, and simplify fixture creation to insert valid authoritative histories only.

- [ ] **Step 4: Make maintenance and imports canonical**

Rename or inline checked maintenance/import implementations under their public canonical entrypoints, remove the old `ledger_entry_id` task path and UI status, and preserve branch/person, idempotency, evidence, and Finance handoff checks.

- [ ] **Step 5: Remove compatibility status refreshers**

Replace `refresh_finance_income_compatibility` and `refresh_finance_expense_compatibility` with canonical state derivation or narrowly named authoritative helpers. Remove legacy status enum values and retired mutation wrappers while keeping current checked payment/receipt/reversal behavior.

- [ ] **Step 6: Verify authoritative flows**

```powershell
npx supabase test db --local supabase/tests/lease_term_authority_test.sql supabase/tests/lease_derived_rent_generation_test.sql supabase/tests/maintenance_role_workflow_test.sql supabase/tests/maintenance_cost_handoff_test.sql supabase/tests/atomic_import_staging_test.sql supabase/tests/import_commit_entrypoint_guard_test.sql
npx vitest run src/features/leases src/features/maintenance src/features/imports src/features/finance-operations
```

- [ ] **Step 7: Commit the domain cleanup**

```powershell
git add -A -- supabase src/features/leases src/features/maintenance src/features/imports src/features/finance-operations
git commit -m "refactor: remove domain compatibility paths"
```

### Task 7: Retire application aliases and compatibility presentation

**Files:**
- Delete: `src/lib/navigation/legacy-redirect.ts`
- Delete: redirect-only page directories for `maintenance-dashboard`, `property-dashboard`, `schedule`, `team`, `people-reports`, auth `signup`, and `setup`.
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/features/workspace-search/workspace-search.scopes.ts`
- Modify: `config/ui-route-coverage.json`
- Modify: `src/lib/ui/route-coverage.ts`
- Modify: route/navigation tests.
- Modify: `src/lib/auth/context.ts` and every current `requireAdminContext` caller/test.
- Delete: `src/app/api/reports/export/route.ts`
- Delete: `src/features/reports/data/csv.ts`
- Delete: `src/features/reports/data/csv.test.ts`
- Modify: `src/features/overview/overview.filters.ts` and tests.
- Modify: `src/app/globals.css` and runtime callers of compatibility CSS variables.

**Interfaces:**
- Consumes: canonical workspace routes, five explicit capability contexts, PDF/Excel report actions, and current design tokens.
- Produces: no redirect helper, deprecated auth alias, legacy filter normalization, CSV endpoint, or compatibility CSS variable block.

- [ ] **Step 1: Expand the failing source-surface test**

Add assertions for deleted route directories, the CSV route, `financeView`, the `Compatibility aliases` CSS comment, and every compatibility CSS variable name declared in `globals.css`.

- [ ] **Step 2: Run the source test and capture all current failures**

```powershell
npx vitest run src/lib/ui/legacy-surface-retirement.test.ts
```

- [ ] **Step 3: Replace auth and route aliases**

Use `requireSuperAdminContext` for Super Admin-only pages/actions and the existing Finance/Operations contexts elsewhere. Delete redirects, remove their manifest entries and shell aliases, and implement `/reports` as a server-rendered catalog linking only to `monthly-owner-activity` and `unit-profit-loss`.

- [ ] **Step 4: Retire CSV and URL aliases**

Delete the CSV handler/generator/tests, remove CSV route coverage, and accept only canonical Overview query parameters. Update all link builders and tests before deleting normalization.

- [ ] **Step 5: Replace compatibility CSS variables mechanically**

Map aliases to canonical variables exactly:

```text
--surface-canvas -> --background
--surface-work / --surface / --surface-raised -> --card / --popover as declared
--surface-muted -> --muted
--foreground-muted / --foreground-subtle -> --muted-foreground
--border-neutral -> --border
--control-border -> --input
--focus-ring -> --ring
--accent-strong / --brand-solid / --state-selected-strong -> --primary
--accent-soft / --brand-soft / --state-selected -> --accent
--brand-on-solid -> --primary-foreground
--brand-text -> --foreground
```

Run a repository-wide exact-token replacement, inspect the diff for accidental prose/test changes, then delete the alias block.

- [ ] **Step 6: Run route, copy, and focused UI tests**

```powershell
npm run test:ui-coverage
npm run test:ui-copy
npx vitest run src/lib/ui/legacy-surface-retirement.test.ts src/lib/ui/route-coverage.test.ts src/app/api/reports/report-routes.test.ts src/features/overview/overview.filters.test.ts src/features/reports src/components/layout
```

- [ ] **Step 7: Commit the application retirement slice**

```powershell
git add -A -- src config
git commit -m "refactor: retire legacy application surfaces"
```

### Task 8: Regenerate types, fixtures, and canonical project documentation

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `scripts/load-test-fixture.mjs`
- Modify: fixture/seed pgTAP files.
- Regenerate: `src/types/database.generated.ts`
- Modify: `src/types/database.ts`
- Modify: `PROJECT.md`
- Delete: `docs/superpowers/specs/2026-07-10-property-finance-accounting-kernel-design.md`
- Delete: implementation plans and historical documents whose only purpose is the removed accounting/compatibility rollout.
- Modify: `docs/superpowers/specs/2026-08-07-lease-rent-finance-approval-design.md` to use operational Ledger terminology.

**Interfaces:**
- Consumes: final pre-squash schema and canonical five-role product boundary.
- Produces: authoritative generated types, current fixtures, and one project document consistent with runtime behavior.

- [ ] **Step 1: Reset fixture assumptions**

Remove legacy lease, task-Ledger, accounting-book/journal, period-close, compatibility finance, and CSV fixtures. Keep one coherent organization with all five roles, authoritative leases, generated rent, approved/rejected expenses, maintenance handoff, owner effects, petty cash, and reportable reversals.

- [ ] **Step 2: Run fixture and seed contracts**

```powershell
npm run db:test:fixture
npx supabase test db --local supabase/tests/demo_seed_contract_test.sql supabase/tests/fixed_role_capabilities_test.sql
```

- [ ] **Step 3: Regenerate database types**

```powershell
npm run db:types
npx tsc --noEmit
```

Remove only intentional generated-type overrides from `src/types/database.ts`; do not preserve definitions for absent objects.

- [ ] **Step 4: Rewrite the durable project boundary**

Update `PROJECT.md` to state that operational obligations/settlements and Ledger projections are authoritative, there is one month lock, no accounting compatibility kernel, no full close, no CSV endpoint, and no compatibility route/role aliases.

- [ ] **Step 5: Remove superseded accounting documentation**

Delete documents whose target architecture is the removed kernel. Keep the approved reset and lease/expense designs, updating the latter's journal wording to exact Ledger projection wording.

- [ ] **Step 6: Run documentation and type consistency checks**

```powershell
rg -n "accounting compatibility|accounting_journal|property_reporting_period|requireAdminContext|retained CSV|legacy redirect" PROJECT.md src scripts config supabase/seed.sql
npx tsc --noEmit
npm run lint
```

Expected: the grep returns no runtime/project matches; historical wording appears only in the approved reset spec/plan where it documents removal.

- [ ] **Step 7: Commit types, fixtures, and docs**

```powershell
git add -A -- PROJECT.md docs supabase/seed.sql scripts/load-test-fixture.mjs src/types
git commit -m "docs: align project with operational finance authority"
```

### Task 9: Consolidate migrations into a clean baseline

**Files:**
- Replace: `supabase/migrations/*.sql` with the CLI-generated squashed schema baseline plus one explicit bootstrap-data migration if required.
- Modify: `supabase/seed.sql` only if the reset exposes ordering assumptions.

**Interfaces:**
- Consumes: a fully passing pre-squash local schema.
- Produces: an empty-database-reproducible migration baseline with explicit grants, RLS, policies, functions, triggers, Storage setup, and Cron setup.

- [ ] **Step 1: Record pre-squash authority evidence**

```powershell
git status --short
npx supabase migration list --local
npx supabase db lint --local --schema public --level warning --fail-on error
npx supabase test db --local supabase/tests
```

Expected: clean worktree and all database tests pass before history changes.

- [ ] **Step 2: Squash the local schema**

Run:

```powershell
npx supabase migration squash --local --yes
```

Inspect the generated baseline. Do not accept `cascade`, broad `grant all`, default `PUBLIC` function execution, missing RLS, or references to removed objects.

- [ ] **Step 3: Restore omitted DML explicitly**

Because squash omits DML, create a second migration through:

```powershell
npx supabase migration new bootstrap_operational_finance_runtime
```

Copy only required schema-adjacent DML from Git history: private Storage bucket creation/configuration, Cron extension/job registration, and required immutable configuration rows. Keep demo/business records in `supabase/seed.sql`.

- [ ] **Step 4: Perform the destructive local second reset**

```powershell
npx supabase db reset --local --no-seed
npx supabase migration list --local
npx supabase db lint --local --schema public --level warning --fail-on error
npx supabase test db --local supabase/tests/operational_finance_reset_test.sql
```

Expected: the database builds from only the consolidated files and the retirement contract passes.

- [ ] **Step 5: Load the current fixture and rerun the database suite**

```powershell
npm run db:test:fixture
npx supabase test db --local supabase/tests
```

- [ ] **Step 6: Regenerate types after the baseline reset**

```powershell
npm run db:types
git diff --check
```

- [ ] **Step 7: Commit the consolidated baseline**

```powershell
git add -A -- supabase/migrations supabase/seed.sql src/types
git commit -m "chore: consolidate operational schema baseline"
```

### Task 10: Full verification and final review

**Files:**
- Modify only files required by failures that reproduce against the consolidated baseline.

**Interfaces:**
- Consumes: consolidated baseline and all canonical application/runtime contracts.
- Produces: evidence-backed local completion at an exact commit SHA.

- [ ] **Step 1: Verify database from empty state**

```powershell
npx supabase db reset --local --no-seed
npm run db:test:fixture
npx supabase db lint --local --schema public --level warning --fail-on error
npx supabase test db --local supabase/tests
```

- [ ] **Step 2: Run schema security checks**

Query for public tables without RLS, functions executable by `PUBLIC`/`anon`, authenticated direct DML outside approved read tables/RPCs, missing organization/RLS indexes, and missing foreign-key indexes. Explain or fix every result.

- [ ] **Step 3: Run application verification**

```powershell
npm run test:all
npm run test:ui-coverage
npm run test:ui-copy
npx tsc --noEmit
npm run lint
npm run build
```

Use local Supabase public URL/key only as process-scoped build environment values; never write secrets to files or output them.

- [ ] **Step 4: Run focused concurrency and route smoke**

```powershell
npm run finance:test-ledger-authority
npm run finance:test-income-settlement
npm run leases:test-term-authority
npm run test:ui-redesign
```

- [ ] **Step 5: Run final retirement scan**

```powershell
rg -n "accounting_books|accounting_accounts|accounting_periods|accounting_journal|property_reporting_period|property_close_revision|legacy_unchecked|legacy_checked|requireAdminContext|buildLegacyRedirect" PROJECT.md src scripts config supabase/migrations supabase/tests
git diff --check
git status --short --branch
```

Expected: no runtime/schema matches except deliberate negative test strings in `operational_finance_reset_test.sql` and `legacy-surface-retirement.test.ts`.

- [ ] **Step 6: Review the complete branch diff**

```powershell
git diff --stat d1fa8f8...HEAD
git diff --check d1fa8f8...HEAD
git log --oneline --decorate d1fa8f8..HEAD
```

Check specifically for lost role guards, source links, reversal signs, lock ordering, Storage evidence access, route links, and squashed-DML omissions.

- [ ] **Step 7: Commit any verification-only repairs**

```powershell
git add -A
git commit -m "test: verify operational finance reset"
```

Skip the commit when verification requires no changes.

