# Property Finance Accounting Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a balanced, immutable, organization-scoped accounting kernel and atomically dual-post existing Nestory finance activity into it without breaking the current operational ledger.

**Architecture:** New accounting books, chart-of-accounts, periods, journal headers, and journal lines become the accounting source of truth. Existing finance RPCs continue to create `ledger_entries`, but the same database transaction also creates a balanced journal and links it back to the legacy row; historical legacy rows are backfilled through deterministic mappings and clearing accounts.

**Tech Stack:** PostgreSQL 17, Supabase CLI 2.108.0, Supabase RLS/RPC, pgTAP, Next.js 16.2.9 App Router, TypeScript 5, Vitest 4, React 19.

## Global Constraints

- Target professional third-party property management with separate client and management-company books.
- Keep every business and accounting record organization-scoped.
- Keep exact money in PostgreSQL `numeric`; do not use JavaScript floats for accounting writes.
- Use append-only Supabase migrations created with `npx supabase migration new`.
- Use `SECURITY INVOKER` for public accounting RPCs, revoke `PUBLIC`, and grant only required execution to `authenticated`.
- Enable RLS on every new table in `public`; direct accounting table writes remain unavailable to Data API roles.
- Posted journals are immutable and corrections use linked reversals.
- A journal posts only when total debits equal total credits and both totals are positive.
- One active default book is allowed per organization, book type, and currency.
- Until an FX subsystem exists, each journal currency must equal its book currency.
- Security deposits, owner contributions, owner distributions, and management-company activity must not distort property profit and loss.
- Preserve the current `ledger_entries`, Rent & Income, Bills & Expenses, Petty Cash, reports, activity logs, linked records, and period locks during compatibility mode.
- Owner payouts are blocked from new generic expense posting until the owner-distribution subledger exists.
- Follow test-first red-green-refactor for every production behavior.
- Do not push, deploy, or mutate the linked production database as part of this local implementation plan.

---

## File Map

- `supabase/tests/accounting_kernel_test.sql`: pgTAP contract for schema, balanced posting, idempotency, period locks, and reversals.
- `supabase/tests/accounting_security_test.sql`: pgTAP contract for RLS, cross-organization rejection, grants, and immutability.
- `supabase/tests/accounting_compatibility_test.sql`: pgTAP contract for domain mappings and legacy dual-posting.
- `supabase/tests/accounting_dual_post_test.sql`: pgTAP integration contract for current income, expense, manual ledger, and petty-cash posting RPCs.
- `supabase/seed.sql`: invoke the idempotent historical backfill after local demo finance rows are inserted.
- `supabase/migrations/20260710005932_property_finance_accounting_kernel.sql`: CLI-generated migration containing tables, indexes, RLS, bootstrap helpers, journal posting, reversal, and historical backfill.
- `supabase/migrations/20260710011833_property_finance_accounting_compatibility.sql`: CLI-generated migration replacing existing finance, petty-cash, and manual-ledger posting RPCs with atomic dual-posting.
- `src/types/database.generated.ts`: regenerated local Supabase types.
- `src/features/accounting/accounting.types.ts`: journal-link and posting-health application types.
- `src/features/accounting/data/accounting-health.ts`: organization-scoped count of active legacy rows without journals.
- `src/features/accounting/data/accounting-health.test.ts`: mapping and error tests for posting health.
- `src/features/finance/finance.types.ts`: close-summary accounting health fields.
- `src/features/finance/data/finance-close.ts`: accounting-health query added to finance close.
- `src/features/ledger/ledger.types.ts`: optional accounting journal reference on ledger rows.
- `src/features/ledger/data/ledger.ts`: select and map the linked journal ID.
- `src/features/ledger/components/ledger-inspector.tsx`: display the journal reference and accounting status.
- `src/features/ledger/components/ledger-screen.tsx`: include unlinked-journal exceptions in close readiness.
- `docs/current-state.md`: document the implemented kernel and explicitly retain later subledger/banking work as incomplete.
- `docs/verification.md`: add the pgTAP accounting test command.

---

### Task 1: Create the Accounting Schema and Default Books

**Files:**
- Create: `supabase/tests/accounting_kernel_test.sql`
- Create via CLI: `supabase/migrations/20260710005932_property_finance_accounting_kernel.sql`

**Interfaces:**
- Consumes: `public.currency_code`, `public.organizations`, `public.organization_members`, `app_private.is_org_admin(uuid)`.
- Produces: `accounting_books`, `accounting_accounts`, `accounting_periods`, `accounting_journal_entries`, `accounting_journal_lines`, and `ledger_entries.accounting_journal_entry_id`.

- [ ] **Step 1: Start local Supabase and record baseline health**

Run:

```powershell
npm run supabase:start
npm run db:lint
```

Expected: local services start and database lint reports no pre-existing errors that would be confused with this change.

- [ ] **Step 2: Write the failing schema contract**

Create `supabase/tests/accounting_kernel_test.sql` with a transaction-scoped pgTAP plan asserting:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public', 'accounting_books', 'accounting_books exists');
select has_table('public', 'accounting_accounts', 'accounting_accounts exists');
select has_table('public', 'accounting_periods', 'accounting_periods exists');
select has_table('public', 'accounting_journal_entries', 'accounting_journal_entries exists');
select has_table('public', 'accounting_journal_lines', 'accounting_journal_lines exists');
select has_column('public', 'ledger_entries', 'accounting_journal_entry_id', 'ledger entries link to accounting journals');

select col_type_is('public', 'accounting_journal_lines', 'debit_amount', 'numeric(18,2)', 'journal debits use exact money');
select col_type_is('public', 'accounting_journal_lines', 'credit_amount', 'numeric(18,2)', 'journal credits use exact money');
select col_not_null('public', 'accounting_books', 'organization_id', 'accounting books are organization scoped');
select col_not_null('public', 'accounting_accounts', 'book_id', 'accounting accounts require a book');
select col_not_null('public', 'accounting_journal_entries', 'book_id', 'journal entries require a book');
select col_not_null('public', 'accounting_journal_lines', 'journal_entry_id', 'journal lines require a journal entry');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.accounting_books'::regclass),
  'accounting_books has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.accounting_journal_entries'::regclass),
  'accounting_journal_entries has RLS enabled'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Run the schema test and verify RED**

Run:

```powershell
npx supabase test db --local supabase/tests/accounting_kernel_test.sql
```

Expected: FAIL because the accounting tables and ledger link do not exist.

- [ ] **Step 4: Generate the migration through the Supabase CLI**

Run:

```powershell
npx supabase migration new property_finance_accounting_kernel
```

Expected: the CLI prints one new timestamped migration path ending in `_property_finance_accounting_kernel.sql`. Replace both wildcard references for this migration in this plan with that exact path before continuing.

- [ ] **Step 5: Implement tables, checks, and indexes**

In the generated migration, create the five tables and ledger link defined by the design. Include these database-level checks:

```sql
check (book_type in ('client', 'management_company'))
check (account_type in ('asset', 'liability', 'equity', 'income', 'expense'))
check (normal_balance in ('debit', 'credit'))
check (status in ('open', 'locked'))
check (status in ('posted', 'reversed'))
check (
  (debit_amount > 0 and credit_amount = 0)
  or (credit_amount > 0 and debit_amount = 0)
)
```

Use `numeric(18,2)` for journal line amounts, book-scoped unique constraints for account `code` and `system_code`, a book/month unique constraint for periods, an entry/line-number unique constraint, and foreign-key indexes for every new reference.

- [ ] **Step 6: Add RLS and read-only authenticated grants**

Enable RLS on all five tables. Add admin-scoped `SELECT` policies using `app_private.is_org_admin(organization_id)`. Revoke all table privileges from `anon` and `authenticated`, then grant only `SELECT` to `authenticated`. Do not create INSERT, UPDATE, or DELETE policies.

- [ ] **Step 7: Add default-book and chart bootstrap**

Create private `SECURITY DEFINER` helper `app_private.ensure_accounting_books_and_accounts(uuid, currency_code)` that:

```sql
if (select auth.uid()) is not null
   and not app_private.is_org_admin(target_organization_id) then
  raise exception 'Not authorized' using errcode = '42501';
end if;
```

It inserts one active default client book and one active default management-company book for the currency, then inserts every system account from the approved design with `on conflict do nothing`. Revoke `PUBLIC`; grant execution only to `authenticated` and `service_role`.

- [ ] **Step 8: Run schema tests and reset verification**

Run:

```powershell
npm run db:reset
npx supabase test db --local supabase/tests/accounting_kernel_test.sql
npm run db:lint
```

Expected: reset succeeds, all 14 pgTAP assertions pass, and lint is clean.

- [ ] **Step 9: Commit the schema slice**

Run:

```powershell
git add supabase/tests/accounting_kernel_test.sql supabase/migrations/20260710005932_property_finance_accounting_kernel.sql
git commit -m "feat: add property accounting book schema"
```

---

### Task 2: Implement Balanced and Idempotent Journal Posting

**Files:**
- Modify: `supabase/tests/accounting_kernel_test.sql`
- Modify: `supabase/migrations/20260710005932_property_finance_accounting_kernel.sql`

**Interfaces:**
- Consumes: `app_private.ensure_accounting_books_and_accounts(uuid, currency_code)` and JSON line objects containing `account_system_code`, `debit_amount`, `credit_amount`, and optional operational dimensions.
- Produces: `app_private.post_accounting_journal_internal(uuid, uuid, text, uuid, text, date, currency_code, text, text, jsonb, uuid) returns uuid` and `public.post_accounting_journal(uuid, uuid, text, uuid, text, date, currency_code, text, text, jsonb) returns uuid`.

- [ ] **Step 1: Extend the pgTAP plan with posting behavior**

Add tests that set the seeded admin JWT context:

```sql
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
```

Call `app_private.ensure_accounting_books_and_accounts` for organization `00000000-0000-0000-0000-000000000001` and USD, then assert:

- A two-line 125.00 debit/credit journal posts.
- Its debit and credit totals are both 125.00.
- An identical retry returns the same journal ID.
- A retry with 126.00 raises `22023` and `Conflicting accounting posting`.
- An unbalanced journal raises `22023` and `Journal is not balanced`.
- A zero-line journal raises `22023` and `Journal requires at least two lines`.
- A book/currency mismatch raises `22023` and `Accounting book currency does not match`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx supabase test db --local supabase/tests/accounting_kernel_test.sql
```

Expected: existing schema assertions pass and new posting assertions fail because `post_accounting_journal` is absent.

- [ ] **Step 3: Implement the private posting primitive and public authorization wrapper**

Create `app_private.post_accounting_journal_internal` as the only function that inserts headers and lines. It accepts an explicit actor ID so the migration backfill can run under the migration role. Create `public.post_accounting_journal` as a `SECURITY INVOKER` wrapper that requires `auth.uid()`, checks organization admin access, and delegates with `(select auth.uid())`. Revoke `PUBLIC` from both; grant the public wrapper to `authenticated` and keep the internal primitive unavailable to Data API roles.

- [ ] **Step 4: Implement payload normalization and source locking**

Add `app_private.accounting_payload_hash(...) returns text` using `digest(..., 'sha256')` from `pgcrypto` over the normalized header and ordered JSON lines. In `post_accounting_journal`, acquire:

```sql
perform pg_advisory_xact_lock(
  hashtextextended(
    concat_ws(':', p_organization_id, p_book_id, p_source_type, p_source_id, p_posting_key),
    0
  )
);
```

Compare the stored payload hash on retries. Return the existing ID only when hashes match.

- [ ] **Step 5: Implement validation and atomic inserts**

The RPC must verify auth, admin membership, book ownership, currency, open legacy and accounting periods, at least two lines, positive single-sided lines, exact balance, system-account existence, and same-organization dimensions. Insert the header and all lines only after validation. Write one `activity_logs` row with action `accounting_journal_posted`.

- [ ] **Step 6: Run the posting tests and verify GREEN**

Run:

```powershell
npx supabase test db --local supabase/tests/accounting_kernel_test.sql
```

Expected: all schema and posting assertions pass.

- [ ] **Step 7: Commit the posting primitive**

Run:

```powershell
git add supabase/tests/accounting_kernel_test.sql supabase/migrations/20260710005932_property_finance_accounting_kernel.sql
git commit -m "feat: enforce balanced accounting journals"
```

---

### Task 3: Enforce Period Locks, Immutability, Reversals, and RLS

**Files:**
- Create: `supabase/tests/accounting_security_test.sql`
- Modify: `supabase/migrations/20260710005932_property_finance_accounting_kernel.sql`

**Interfaces:**
- Consumes: posted journals from `post_accounting_journal`.
- Produces: `public.set_accounting_period_lock(uuid, uuid, date, boolean, text) returns void` and `public.reverse_accounting_journal(uuid, uuid, date, text) returns uuid`.

- [ ] **Step 1: Write the failing security and reversal tests**

Create a pgTAP transaction that proves:

```sql
select throws_ok(
  $$update public.accounting_journal_entries set description = 'changed' where id = :'journal_id'$$,
  '55000',
  'Posted accounting journals are immutable'
);

select throws_ok(
  $$delete from public.accounting_journal_lines where journal_entry_id = :'journal_id'$$,
  '55000',
  'Posted accounting journal lines are immutable'
);
```

Also assert locked-period posting rejection, successful open-period reversal with swapped totals, double-reversal rejection, reversal-in-locked-period rejection, and inability of organization 2's admin to select or post organization 1 records.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npx supabase test db --local supabase/tests/accounting_security_test.sql
```

Expected: FAIL because period-lock, immutability, reversal, and complete RLS behavior are absent.

- [ ] **Step 3: Implement mutation guards**

Create trigger functions that reject UPDATE or DELETE of posted journal headers and any line whose parent journal is posted. Allow only the reversal RPC to set the original header from `posted` to `reversed` by using a transaction-local guard set with `set_config('app.accounting_reversal', 'on', true)` and checked by the header trigger.

- [ ] **Step 4: Implement book-specific period locking**

`set_accounting_period_lock` must upsert the book/month row, set `status`, lock metadata, and activity log. Posting must reject a locked accounting period and continue honoring `ledger_period_locks` during compatibility mode.

- [ ] **Step 5: Implement reversal posting**

`reverse_accounting_journal` must lock the original journal, verify it is posted and unreversed, post a new entry with all debit/credit amounts swapped, link both IDs, mark the original reversed, and log `accounting_journal_reversed`. Reversal uses posting key `reversal:<original-id>`.

- [ ] **Step 6: Tighten RLS and function grants**

Confirm all public functions revoke `PUBLIC` and grant `authenticated`; all private helpers revoke `PUBLIC`. Add admin-only SELECT policies to accounts, periods, journals, and lines using their own `organization_id` columns for indexable predicates.

- [ ] **Step 7: Run security tests and database lint**

Run:

```powershell
npx supabase test db --local supabase/tests/accounting_security_test.sql
npm run db:lint
```

Expected: all security assertions pass and lint is clean.

- [ ] **Step 8: Commit the control slice**

Run:

```powershell
git add supabase/tests/accounting_security_test.sql supabase/migrations/20260710005932_property_finance_accounting_kernel.sql
git commit -m "feat: protect accounting periods and reversals"
```

---

### Task 4: Bootstrap and Backfill Existing Financial History

**Files:**
- Create: `supabase/tests/accounting_compatibility_test.sql`
- Modify: `supabase/migrations/20260710005932_property_finance_accounting_kernel.sql`

**Interfaces:**
- Consumes: legacy `ledger_entries.source_type`, `source_id`, related finance/petty-cash rows, and system charts.
- Produces: one linked balanced historical journal for every active legacy ledger entry, with posting key `legacy_backfill`.

- [ ] **Step 1: Write failing backfill classification tests**

Create `supabase/tests/accounting_compatibility_test.sql` and assert that reset seed data produces:

- Active legacy ledger rows have non-null `accounting_journal_entry_id`.
- Every linked journal balances.
- `finance_income` security deposits credit `refundable_security_deposits`.
- `finance_income` owner contributions credit `owner_funds_held`.
- Management fee, commission, service fee, and markup sources use management-company books.
- Property income and property expenses use client books.
- Company costs and advances use management-company books.
- Existing owner-payout expense rows remain historical and are marked through `legacy_balance_offset`, not a property expense account.
- Running the bootstrap/backfill helper again creates zero additional journals.

- [ ] **Step 2: Run the backfill test and verify RED**

Run:

```powershell
npx supabase test db --local supabase/tests/accounting_compatibility_test.sql
```

Expected: FAIL because historical rows are not linked.

- [ ] **Step 3: Add deterministic domain classification helpers**

Add private helpers returning `(book_type, debit_system_code, credit_system_code)` for income, expense, petty cash, and manual ledger sources. The mapping must exactly implement the design and must return `legacy_balance_offset` for historical owner payouts.

- [ ] **Step 4: Bootstrap every organization/currency pair**

Insert distinct organization/currency pairs from `ledger_entries`, `finance_income_items`, `finance_expense_items`, and `petty_cash_entries`, then call the bootstrap helper for each pair. Organizations without financial rows receive books in their preferred currency from organization settings.

- [ ] **Step 5: Backfill active legacy rows idempotently**

For each active legacy row without a journal link, resolve its domain mapping, call `app_private.post_accounting_journal_internal` with the legacy creator as actor when available, and update `ledger_entries.accounting_journal_entry_id`. Preserve transaction date, description, property, unit, source type, and source ID. Never mark historical records as bank reconciled.

- [ ] **Step 6: Run reset and backfill tests**

Run:

```powershell
npm run db:reset
npx supabase test db --local supabase/tests/accounting_compatibility_test.sql
```

Expected: all backfill and idempotency assertions pass.

- [ ] **Step 7: Commit the history migration**

Run:

```powershell
git add supabase/tests/accounting_compatibility_test.sql supabase/migrations/20260710005932_property_finance_accounting_kernel.sql
git commit -m "feat: backfill balanced property journals"
```

---

### Task 5: Atomically Dual-Post Current Finance Workflows

**Files:**
- Modify: `supabase/tests/accounting_compatibility_test.sql`
- Create via CLI: `supabase/migrations/20260710011833_property_finance_accounting_compatibility.sql`

**Interfaces:**
- Consumes: `post_accounting_journal` and domain classification helpers.
- Produces: replaced `create_ledger_entry`, `post_finance_income_item`, `post_finance_expense_item`, and `post_petty_cash_entry` RPCs that atomically link journals.

- [ ] **Step 1: Extend tests with new posting mappings and atomicity**

Add pgTAP cases creating fresh workflow rows and proving:

- Rent receipt: client cash debit and rental income credit.
- Security deposit: deposit cash debit and refundable-deposit liability credit.
- Owner contribution: client cash debit and owner-funds credit.
- Management fee: due-from-client debit and company revenue credit in the management-company book.
- Property expense: property expense debit and client cash credit.
- Company cost: company expense debit and company cash credit.
- Company advance: company advance expense debit and company cash credit.
- New owner payout generic posting raises `22023` with `Use the owner distribution workflow`.
- A deliberately locked accounting period leaves the finance source unposted and creates neither journal nor legacy ledger row.
- An identical retry returns the existing legacy ledger ID and does not duplicate the journal.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npx supabase test db --local supabase/tests/accounting_compatibility_test.sql
```

Expected: new dual-post assertions fail against the old RPC definitions.

- [ ] **Step 3: Generate the compatibility migration through the CLI**

Run:

```powershell
npx supabase migration new property_finance_accounting_compatibility
```

Expected: one new timestamped path ending in `_property_finance_accounting_compatibility.sql`. Replace both wildcard references for this migration in this plan with the exact path.

- [ ] **Step 4: Replace domain posting RPCs**

Each RPC must lock its source row, validate the source state, determine book and system accounts, create the legacy ledger row, call `post_accounting_journal`, update the ledger journal link, update the source status/link, and write the existing activity log inside one transaction. The functions return the legacy ledger ID to preserve the TypeScript action contract.

- [ ] **Step 5: Preserve manual and petty-cash behavior**

Manual `create_ledger_entry` posts to client books by default and uses `other_property_income` or `property_operating_expense`. Petty-cash advances remain reconciliation movements and do not post; cleared property expenses, company expenses, and company advances use their correct books and accounts.

- [ ] **Step 6: Run compatibility tests and existing finance tests**

Run:

```powershell
npm run db:reset
npx supabase test db --local supabase/tests/accounting_compatibility_test.sql
npm run test -- src/features/rent-income src/features/bills-expenses src/features/ledger src/features/petty-cash
```

Expected: all database mapping tests and existing feature tests pass.

- [ ] **Step 7: Commit dual-posting**

Run:

```powershell
git add supabase/tests/accounting_compatibility_test.sql supabase/migrations/20260710011833_property_finance_accounting_compatibility.sql
git commit -m "feat: dual-post finance workflows to journals"
```

---

### Task 6: Surface Journal Linkage and Close Exceptions

**Files:**
- Create: `src/features/accounting/accounting.types.ts`
- Create: `src/features/accounting/data/accounting-health.ts`
- Create: `src/features/accounting/data/accounting-health.test.ts`
- Modify: `src/features/finance/finance.types.ts`
- Modify: `src/features/finance/data/finance-close.ts`
- Modify: `src/features/ledger/ledger.types.ts`
- Modify: `src/features/ledger/data/ledger.ts`
- Modify: `src/features/ledger/components/ledger-inspector.tsx`
- Modify: `src/features/ledger/components/ledger-screen.tsx`

**Interfaces:**
- Consumes: `ledger_entries.accounting_journal_entry_id` and active legacy ledger rows.
- Produces: `AccountingPostingHealth`, `getAccountingPostingHealth`, `LedgerEntry.accountingJournalEntryId`, and close-summary unlinked counts.

- [ ] **Step 1: Write failing accounting-health tests**

Create Vitest cases for this pure mapper API:

```ts
export type AccountingPostingHealth = {
  linkedCount: number;
  unlinkedCount: number;
};

export function mapAccountingPostingHealth({
  linkedCount,
  totalCount,
}: {
  linkedCount: number | null;
  totalCount: number | null;
}): AccountingPostingHealth;
```

Assert null counts become zero, unlinked count never becomes negative, and `10 total / 8 linked` maps to `{ linkedCount: 8, unlinkedCount: 2 }`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
npm run test -- src/features/accounting/data/accounting-health.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement accounting health data loading**

Query active `ledger_entries` twice using exact counts: total rows and rows with a non-null journal ID. Scope both by organization. Throw contextual errors. Return the pure mapped result.

- [ ] **Step 4: Add accounting health to finance close**

Extend `FinanceCloseSummary` with:

```ts
accountingUnlinkedCount: string;
accountingUnlinkedHref: string;
```

Load health alongside income, bills, and petty cash. Set the href to `/ledger?archiveState=active` and include the count in close readiness.

- [ ] **Step 5: Map and display the journal reference**

Select `accounting_journal_entry_id` in the ledger loader, map it to `LedgerEntry.accountingJournalEntryId?: string`, and show `Balanced journal linked` or `Accounting journal missing` in the inspector. Do not expose the raw UUID as the primary label; it may appear only as secondary copyable audit text.

- [ ] **Step 6: Run focused tests and lint**

Run:

```powershell
npm run test -- src/features/accounting/data/accounting-health.test.ts src/features/ledger src/features/finance
npm run lint -- "src/features/accounting/**/*.ts" "src/features/finance/**/*.ts" "src/features/ledger/**/*.{ts,tsx}"
npx tsc --noEmit
```

Expected: focused tests, lint, and typecheck pass.

- [ ] **Step 7: Commit the read model**

Run:

```powershell
git add src/features/accounting src/features/finance src/features/ledger
git commit -m "feat: expose balanced journal health"
```

---

### Task 7: Regenerate Types and Prove Ledger-to-Journal Parity

**Files:**
- Modify: `src/types/database.generated.ts`
- Create: `supabase/tests/accounting_parity_test.sql`

**Interfaces:**
- Consumes: fully migrated local database and linked journal IDs.
- Produces: generated TypeScript schema types and automated parity evidence.

- [ ] **Step 1: Write the failing parity test**

Create pgTAP queries grouping active legacy rows and their linked journals by organization, property, currency, and month. Assert:

```sql
select is(
  (select count(*)::bigint from public.ledger_entries where archived_at is null and accounting_journal_entry_id is null),
  0::bigint,
  'every active legacy ledger row is journal linked'
);

select is(
  (
    select count(*)::bigint
    from public.accounting_journal_entries journal
    join lateral (
      select coalesce(sum(debit_amount), 0) debits,
             coalesce(sum(credit_amount), 0) credits
      from public.accounting_journal_lines
      where journal_entry_id = journal.id
    ) totals on true
    where totals.debits <> totals.credits or totals.debits <= 0
  ),
  0::bigint,
  'all journals remain balanced'
);
```

Add grouped P&L comparisons that exclude security deposits, owner funds, owner payouts, company revenue/costs, and legacy balance offsets from property P&L, then compare ordinary property income and expense totals to the corresponding journal accounts.

- [ ] **Step 2: Run parity test and verify RED if any mapping is incomplete**

Run:

```powershell
npx supabase test db --local supabase/tests/accounting_parity_test.sql
```

Expected: PASS only when every active row is linked, every journal balances, and ordinary property P&L totals agree.

- [ ] **Step 3: Regenerate local database types**

Run:

```powershell
npm run db:types
```

Expected: generated types contain all accounting tables, the ledger journal link, and accounting RPC signatures.

- [ ] **Step 4: Run the complete database gate**

Run:

```powershell
npm run db:reset
npm run db:lint
npx supabase test db --local supabase/tests
git diff --check
```

Expected: reset, lint, all pgTAP tests, and whitespace checks pass.

- [ ] **Step 5: Commit types and parity tests**

Run:

```powershell
git add src/types/database.generated.ts supabase/tests/accounting_parity_test.sql
git commit -m "test: prove accounting journal parity"
```

---

### Task 8: Document, Build, and Browser-Smoke the Kernel

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/verification.md`

**Interfaces:**
- Consumes: completed accounting kernel and compatibility bridge.
- Produces: accurate current-state documentation and final verification evidence.

- [ ] **Step 1: Update current-state documentation**

Document the implemented accounting books, chart, periods, balanced journals, reversals, historical backfill, dual-posting, and journal health. Explicitly state that tenant payment allocation, deposit custody lifecycle, bill-line/AP lifecycle, owner distributions, bank accounts, three-way reconciliation, and owner statement publication remain subsequent sub-projects.

- [ ] **Step 2: Add the database accounting test command**

Add to `docs/verification.md`:

```powershell
npx supabase test db --local supabase/tests
```

Explain that it is required when accounting tables, posting mappings, RLS, periods, or reconciliation logic changes.

- [ ] **Step 3: Run the full local application gate**

Run:

```powershell
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Expected: all four commands pass without errors.

- [ ] **Step 4: Run an authenticated browser smoke**

Start the app and sign in with the local seeded admin. Verify `/rent-income`, `/bills-expenses`, `/petty-cash`, `/ledger`, one property detail, and one unit detail. Post one rent receipt and one property expense in an open period, confirm each creates one ledger row and one balanced journal, and confirm the ledger inspector shows the journal linkage. Confirm owner payout posting is blocked with the dedicated workflow message.

- [ ] **Step 5: Run the completion audit against the specification**

For each of the twelve accounting invariants and ten verification requirements in `docs/superpowers/specs/2026-07-10-property-finance-accounting-kernel-design.md`, record the proving migration, pgTAP assertion, command output, or browser observation. Treat missing evidence as incomplete work.

- [ ] **Step 6: Commit documentation and any verification fixes**

Run:

```powershell
git add docs/current-state.md docs/verification.md
git commit -m "docs: record accounting kernel state"
```

- [ ] **Step 7: Report kernel completion without closing the full finance goal**

Report changed files, user-visible behavior, database and application checks, browser routes tested, branch/commit state, and remaining sub-projects. The full `implement the recommendation` goal stays active until operational subledgers, banking/three-way reconciliation, owner close, and statement publication are implemented and verified.
