# Property Finance Accounting Kernel Design

**Date:** 2026-07-10
**Status:** Proposed for implementation
**Product model:** Professional third-party property management

## Purpose

Build the accounting foundation required for Nestory to hold and report owner
and tenant money without treating every cash movement as ordinary property
income or expense. The foundation must support balanced journals, separate
client and management-company books, property and unit drill-down, immutable
posted history, period controls, and a safe migration from the existing
operational ledger.

This is the first of three implementation sub-projects:

1. Accounting kernel and compatibility posting bridge.
2. Tenant, deposit, bill, payment, fee, reserve, and distribution subledgers.
3. Banking, three-way reconciliation, owner close, and statement publication.

Each sub-project must leave working, testable software. The existing Rent &
Income, Bills & Expenses, Ledger, Petty Cash, property/unit records, and reports
remain usable while the accounting foundation is introduced.

## Chosen Operating Model

Nestory will target professional managers who hold money on behalf of owners
and tenants. It will maintain two conceptually separate sets of books:

- **Client books** record property income, property expenses, refundable
  deposits, owner funds, reserves, vendor obligations, and client cash.
- **Management-company books** record Nestory customers' own management-fee
  revenue, company expenses, advances, reimbursements, and amounts due to or
  from client books.

Property, unit, lease, owner, tenant, vendor, and bank dimensions provide
drill-down without creating a separate physical chart of accounts for every
property.

Jurisdiction-specific deposit deadlines, record-retention periods, tax forms,
and trust-account naming rules will be configuration and later compliance
work. The kernel will enforce the jurisdiction-neutral invariants needed by
all of them.

## Approaches Considered

### 1. Add debit and credit columns to `ledger_entries`

This has the smallest initial migration, but it keeps one record responsible
for operational display, source workflow, banking, and accounting. Existing
archive/update behavior would also remain incompatible with immutable posted
journals. This approach is rejected.

### 2. Add a parallel accounting kernel and dual-post through RPCs

New journal tables become the accounting source of truth while the current
ledger remains a compatibility projection during migration. Existing posting
RPCs atomically create both the new journal and the legacy ledger row until
all loaders and reports move to accounting views. This is the selected
approach because it preserves current product behavior while creating a clean
cutover path.

### 3. Replace all finance tables and screens in one release

This produces a cleaner final schema sooner, but combines accounting,
receivables, payables, deposits, banking, owner close, reports, and UI changes
into one high-risk cutover. It is rejected because failures would be difficult
to isolate and rollback.

## Accounting Invariants

The database, not only the UI, must enforce these rules:

1. Every posted journal entry balances exactly: total debits equal total
   credits and both totals are greater than zero.
2. Every business record and accounting record is organization-scoped.
3. A journal, account, property, unit, lease, person, and bank reference must
   belong to the same organization.
4. A journal can post only into an open period for its accounting book.
5. A posted journal cannot be edited, archived, or deleted.
6. Corrections use a dated reversal journal linked to the original journal.
7. A source event posts at most once for a given posting key.
8. Every journal uses the accounting book's currency. Multi-currency activity
   uses a separate book per currency until an explicit FX subsystem exists.
9. Refundable security deposits post to a liability account, never directly
   to rental income.
10. Owner contributions and distributions post to owner-funds accounts, not
    property income or operating expense.
11. Management-company revenue and company costs do not post into client
    property profit and loss.
12. RPCs that move money or create journals are atomic and idempotent.

## Schema

### `accounting_books`

One organization may have multiple books, including one client book per
currency and one management-company book per currency.

Required fields:

- `id`, `organization_id`
- `book_type`: `client` or `management_company`
- `name`
- `currency`
- `is_default`
- `created_at`, `created_by`, `updated_at`, `updated_by`
- `archived_at`, `archived_by`

A partial unique index allows only one active default book for each
organization, book type, and currency.

### `accounting_accounts`

The chart of accounts belongs to a book. Stable `system_code` values allow
posting RPCs to find required accounts without depending on editable labels.

Required fields:

- `id`, `organization_id`, `book_id`
- `code`, `name`
- `account_type`: `asset`, `liability`, `equity`, `income`, or `expense`
- `normal_balance`: `debit` or `credit`
- `system_code`
- `is_control_account`, `is_active`
- audit and archive fields

Initial client-book system accounts:

- `client_cash_clearing`
- `security_deposit_cash_clearing`
- `tenant_receivable`
- `accounts_payable`
- `refundable_security_deposits`
- `owner_funds_held`
- `due_to_management_company`
- `rental_income`
- `other_property_income`
- `property_operating_expense`
- `management_fee_expense`
- `legacy_balance_offset`

Initial management-company system accounts:

- `company_cash_clearing`
- `due_from_client_books`
- `owner_reimbursement_receivable`
- `management_fee_revenue`
- `leasing_commission_revenue`
- `service_fee_revenue`
- `maintenance_markup_revenue`
- `company_operating_expense`
- `company_advance_expense`
- `legacy_balance_offset`

### `accounting_periods`

Periods are book-specific because client and company books may close at
different times.

Required fields:

- `id`, `organization_id`, `book_id`, `period_start`
- `status`: `open` or `locked`
- `locked_at`, `locked_by`, `lock_reason`
- audit fields

There is one row per book and calendar month. Missing periods are treated as
open until created and locked. The existing organization-wide
`ledger_period_locks` remains active during compatibility mode; posting is
blocked when either the legacy month or the target accounting period is
locked.

### `accounting_journal_entries`

The header represents one atomic accounting event.

Required fields:

- `id`, `organization_id`, `book_id`
- `entry_date`, `description`, `reference`
- `source_type`, `source_id`, `posting_key`
- `status`: `posted` or `reversed`
- `reversal_of_id`, `reversed_by_id`
- `legacy_ledger_entry_id`
- `posted_at`, `posted_by`
- audit timestamps

An active unique constraint on organization, source type, source ID, posting
key, and book prevents duplicate posting.

### `accounting_journal_lines`

Lines carry debits, credits, and operational dimensions.

Required fields:

- `id`, `organization_id`, `journal_entry_id`, `account_id`
- `line_number`, `description`
- `debit_amount`, `credit_amount`
- `property_id`, `unit_id`, `lease_id`
- `owner_person_id`, `tenant_person_id`, `vendor_person_id`
- audit timestamp

Exactly one of debit or credit must be greater than zero. Lines are immutable
after their journal is posted. Property is required for client-book property
income and expense postings; unit and lease remain optional dimensions.

### Later banking tables

`accounting_bank_accounts`, imported bank transactions, matches, and
reconciliations belong to the third sub-project. The kernel reserves stable
cash-control accounts so those records can link to the chart without changing
existing journals.

## Posting API

All accounting writes use RPC boundaries. Tables grant authenticated users
read access only through organization-scoped RLS; direct insert, update, and
delete grants are not exposed.

### `post_accounting_journal`

The internal posting primitive accepts a book, source identity, posting key,
date, description, and JSON line array. It:

1. Verifies authentication and organization admin access.
2. Locks the source posting identity to serialize duplicate requests.
3. Resolves the target book and all system accounts.
4. Verifies organization, dimensions, currency, and period state.
5. Validates each line and exact journal balance.
6. Inserts the header and lines in one transaction.
7. Writes an activity-log event.
8. Returns the existing journal ID on an identical retry.
9. Rejects a retry whose financial payload differs from the posted journal.

The primitive uses `SECURITY INVOKER`. Public execute permission is revoked
before an explicit grant to `authenticated`.

### `reverse_accounting_journal`

The reversal RPC creates a new journal with all original debits and credits
swapped. It requires an open reversal date, a reason, and admin access. It
links both journals, marks the original as reversed, and records activity.

### Compatibility posting

Existing `post_finance_income_item`, `post_finance_expense_item`, petty-cash
posting, and manual ledger creation will call domain-specific accounting
posting functions and create the legacy ledger row in the same database
transaction.

During the kernel sub-project:

- Rent and ordinary property receipts post to the client book.
- Security deposits post to client cash and refundable-deposit liability.
- Owner contributions post to client cash and owner funds held.
- Property expenses post to client property expense and cash clearing.
- Management fees, commissions, service fees, and maintenance markups post to
  management-company revenue and due-from-client-books.
- Company costs and advances post only to management-company books.
- Owner payouts are blocked from the generic expense posting path until the
  owner-distribution subledger is implemented; existing posted rows are
  retained as historical records.

The application continues to read `ledger_entries` until accounting-backed
loaders and reports are introduced. Every new legacy row stores its linked
journal ID through a new nullable `accounting_journal_entry_id` column.

## Historical Migration

The migration is append-only and non-destructive.

1. Create kernel tables, indexes, RLS, and RPCs.
2. Create default client and management-company books for every organization
   and currency already present in active financial records.
3. Seed the system chart of accounts for each book.
4. Add the nullable journal link to `ledger_entries`.
5. Backfill each active legacy ledger row into a balanced historical journal.
6. Use source metadata to classify known security deposits, owner
   contributions, company revenue, company costs, and ordinary property
   activity.
7. Post records without reliable cash-account history against the relevant
   `client_cash_clearing` or `company_cash_clearing` control account and mark
   them with posting key `legacy_backfill`.
8. Do not claim historical bank reconciliation. Opening bank balances and
   reconciliation begin only after bank accounts are configured.
9. Compare journal-derived income and expense totals with the existing ledger
   by organization, property, currency, and month before enabling new reports.

The backfill is idempotent and safe to run again after an interrupted local
reset.

## Read Model and UI

The kernel adds no broad new dashboard. It provides focused read models used
by later finance surfaces:

- Trial balance by book and period.
- Journal detail with source and reversal links.
- Account activity with property and unit dimensions.
- Posting-health summary for unlinked or failed legacy rows.

Initial user-visible changes are limited to:

- A journal reference in the existing ledger inspector.
- Correct accounting labels for deposit, owner-fund, and company activity.
- A close warning when operational rows have not produced balanced journals.

The authenticated UI remains dense, neutral, and table-first.

## Authorization and Audit

- Admins can view and post accounting records.
- Managers and members receive no new finance permissions in the kernel
  release.
- All tables use organization-scoped RLS.
- All posting and reversal functions check `auth.uid()` and organization admin
  access.
- Posted journals and lines have database triggers preventing mutation or
  deletion.
- Source documents remain linked through existing finance, ledger, task, and
  document records.
- Activity logs record journal posting, reversal, period locking, and failed
  compatibility-posting exceptions where a durable source record exists.

Segregation-of-duties roles and approval thresholds belong to the subledger
and banking projects because the current product has only admin, manager, and
member workspace roles.

## Failure Handling

- Unbalanced journals fail before any header or legacy ledger row commits.
- Missing system accounts fail with a configuration-specific message.
- Cross-organization dimensions fail as authorization errors.
- Locked periods fail without modifying the source workflow status.
- Duplicate identical requests return the original journal ID.
- Duplicate conflicting requests fail and require operator review.
- Compatibility posting is atomic: neither the accounting journal nor legacy
  ledger is committed alone.
- Reversal in a locked period fails; the operator must use an open date.
- Historical backfill reports unclassifiable rows rather than silently
  dropping them.

## Verification

The implementation is complete only when all of the following evidence is
green:

1. Database tests prove balanced posting, imbalance rejection, duplicate
   idempotency, conflicting duplicate rejection, cross-organization rejection,
   period-lock rejection, immutability, and reversal behavior.
2. Mapping tests prove security deposits, owner contributions, owner payouts,
   property income/expense, company revenue, company costs, and advances use
   the correct book and system accounts.
3. RLS tests prove one organization cannot read or post another
   organization's accounting records.
4. Local Supabase reset applies the migration and seed cleanly.
5. Database lint passes.
6. Generated database types are current.
7. Existing finance and ledger tests remain green.
8. A reconciliation query proves journal-derived legacy totals match the
   existing ledger totals for every organization, property, currency, and
   month, with explicitly reported exceptions for non-P&L movements.
9. TypeScript typecheck, lint, full test suite, and production build pass.
10. An authenticated browser smoke proves the existing Rent & Income, Bills &
    Expenses, Ledger, unit detail, property detail, and finance close flows
    still load and expose the new journal linkage.

## Subsequent Sub-projects

After the kernel is verified, separate designs and plans will implement:

1. Tenant charges, receipts, allocations, credits, refunds, and returned
   payments.
2. Security-deposit custody, deductions, conversion, and refunds.
3. Bill lines, approvals, payables, partial payments, and vendor disbursement.
4. Management agreements, fee rules, owner reserves, contributions, and
   distributions.
5. Bank accounts, statement imports or feeds, matching, bank reconciliation,
   and three-way client-money reconciliation.
6. Month-close checklists, owner-statement approval/publication, and expanded
   accounting reports.

The full finance recommendation is complete only after all three sub-projects
are implemented and verified. The accounting kernel is the required first
release, not a redefinition of the final scope.
