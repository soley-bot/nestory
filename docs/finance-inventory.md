# Financial inventory and parity diagnostics

Plan 01 produces read-only, organization- and property-scoped evidence. It does
not establish financial authority, repair or relink data, change a report
source, or authorize any proposed classification.

## Database boundary

`public.get_finance_inventory_page` is a checked, cursor-paginated RPC. A view
was not selected because one deterministic contract must combine typed source
facts, cross-source diagnostics, current privilege metadata, and a staleness
watermark. The public wrapper:

- requires an authenticated organization administrator;
- validates that the selected property belongs to that organization;
- bounds periods to 366 days and pages to 1,000 rows;
- exposes only `sources`, `diagnostics`, `access`, and `watermark` sections; and
- delegates to a private, read-only helper that API roles cannot execute.

The merged Plan 01 migration is
`20260727010101_finance_inventory_diagnostics.sql`. Plan 03 appends
reconciliation-source awareness in
`20260727174623_shared_financial_authority_kernel.sql`; it does not switch a
report or current mutation to the diagnostic contract.

Every row uses contract version `finance_inventory_v3`. Source rows preserve
typed identities and exact two-decimal strings. Receipt, payment, deposit, and
petty-cash reversals retain their parent/original identity and use the exact
opposite signed effect.

Cash-bearing source rows expose `reconciliationSourceId` and
`reconciliationSourceState`. Exact links use `linked_exact_identity`; null
links use `missing_stable_identity`. Missing-source diagnostics are emitted
only for unlinked rows. The watermark includes the applicable reconciliation
source catalog and property reporting-period/revision state so source-label,
archive, scope, lifecycle, or close-history changes invalidate an in-flight
artifact.

## Disposable local command

The command will not accept a URL, project label, or environment label supplied
by the caller as proof of isolation. It requires the ignored disposable stack
workdir and verifies its actual config and status: project
`nestory-finance-inventory`, loopback API URL, API port `55321`, and exact path
`artifacts/finance-inventory-stack`. The default Nestory local ports and hosted
URLs are rejected.

```powershell
npm run finance:inventory:stack -- prepare
npm run finance:inventory:stack -- start
npm run finance:inventory:stack -- reset
```

Load `supabase/fixtures/finance_inventory_fixture.sql` only into that disposable
stack. It creates random IDs and prints the organization/property scope. Obtain
the generated local admin email from that stack and set only:

```powershell
$env:FINANCE_INVENTORY_ADMIN_EMAIL = "<fixture email>"
$env:FINANCE_INVENTORY_ADMIN_PASSWORD = "finance-inventory-local-only"
```

Run the inventory with explicit scope and actual stack identity:

```powershell
npm run finance:inventory -- `
  --organization <fixture organization uuid> `
  --property <fixture property uuid> `
  --currency USD `
  --period-start 2026-07-01 `
  --period-end 2026-07-31 `
  --stack-workdir artifacts/finance-inventory-stack
```

Optional `--issues`, `--sources`, `--page-size`, and `--strict` filters are
supported. A dirty Git worktree fails closed unless `--record-dirty` is supplied,
in which case the dirty state is recorded in provenance. The CLI derives its
local API URL and anonymous key from stack status without writing either to the
artifact. A material watermark change during collection fails the run.

Output is written below ignored
`artifacts/finance-inventory/<timestamp>/`. `inventory.normalized.json` excludes
runtime metadata, so unchanged source state is byte-stable. `run-metadata.json`
contains the explicit timestamp and normalized SHA-256.

## Current-state issue taxonomy

The SQL contract executes the following deterministic diagnostics:

- Settlement projection: `RECEIPT_ALLOCATION_MISSING_LEDGER`,
  `RECEIPT_ALLOCATION_MISSING_JOURNAL`,
  `PAYMENT_ALLOCATION_MISSING_LEDGER`,
  `PAYMENT_ALLOCATION_MISSING_JOURNAL`,
  `OBLIGATION_COMPATIBILITY_MISMATCH`, and
  `OBLIGATION_LEVEL_POSTING_MULTI_SETTLEMENT`.
- Operational and accounting control: `MANUAL_LEDGER_ROW`,
  `SOURCE_LINKED_LEDGER_WITHOUT_SETTLEMENT_IDENTITY`,
  `JOURNAL_WITHOUT_OPERATIONAL_SOURCE`,
  `LEDGER_JOURNAL_AMOUNT_MISMATCH`, `LEDGER_JOURNAL_DATE_MISMATCH`,
  `LEDGER_JOURNAL_PROPERTY_UNIT_MISMATCH`, and
  `LEDGER_JOURNAL_SOURCE_REVERSAL_MISMATCH`.
- Maintenance and petty cash: `MAINTENANCE_TASK_LEDGER_LINK_ONLY`,
  `MAINTENANCE_BILL_DUPLICATE_EXACT_TASK`,
  `PETTY_CASH_PROJECTION_MISSING`,
  `PETTY_CASH_INFERRED_DISBURSEMENT_DATE`, and
  `PETTY_CASH_BILL_DUPLICATE_EXACT_LEDGER`.
- Deposits and owner cash: `DEPOSIT_INCOME_WITHOUT_DEPOSIT_EVENT`,
  `DEPOSIT_EVENT_WITHOUT_CASH_EVIDENCE`,
  `OWNER_CONTRIBUTION_DUAL_AUTHORITY`,
  `OWNER_PAYOUT_WITHOUT_DISTRIBUTION_AUTHORITY`, and
  `MANAGEMENT_FEE_WITHOUT_AGREEMENT`.
- Identity, history, and scope: `WRONG_LINKED_RECORD_SCOPE`,
  `MISSING_STABLE_RECONCILIATION_IDENTITY`,
  `DUPLICATE_EXACT_SOURCE_IDENTITY`,
  `ARCHIVED_SOURCE_REMAINS_EFFECTIVE`,
  `ARCHIVED_HISTORICAL_PARTY_OMITTED`,
  `BACKFILL_INFERRED_DATE`, and
  `OWNERSHIP_INVALID_ON_RELEVANT_DATE`.
- Authority and parity: `LOCK_STATE_DISAGREEMENT`,
  `GENERIC_NAMESPACE_IMPERSONATION_CAPABILITY`,
  `RESERVED_NAMESPACE_IMPERSONATION_CAPABILITY`,
  `REPORT_TOTAL_CONTRADICTION`, and `SOURCE_LOAD_LIMIT_EXCEEDED`.

Stable diagnostic keys include the source family and source ID. Duplicate
diagnostics use exact task/source/legacy-Ledger identities only. Amount, date,
description, and vendor similarity never establish or suppress a link. Because
the current deposit schema has no deposit-to-cash identity,
`DEPOSIT_EVENT_WITHOUT_CASH_EVIDENCE` remains unresolved even when an
amount/date candidate exists; candidates are labelled non-authoritative.

## Economic classification

The artifact keeps current gross facts separate from non-authoritative proposed
buckets:

| Current typed source | Diagnostic economic class | Proposed bucket |
| --- | --- | --- |
| receipt allocation for rent/other income | `operating_income` | operating income received |
| receipt allocation for management fee | `management_fee` | management-fee effects |
| receipt allocation for owner contribution | `owner_contribution` | owner contributions |
| payment allocation for `property_expense` | `property_expense` | property expenses paid |
| payment allocation for owner payout | `owner_distribution` | owner distributions |
| payment allocation for company advance/cost/refund | corresponding company/refund class | excluded and unresolved, never property expense |
| security/utilities/pet/other deposit event | `deposit_custody` plus exact deposit type | deposit custody movement only |
| Ledger and journal lines | control representations | separate Ledger/journal control buckets |

Operating net is operating income received less paid property expenses.
Non-authoritative owner-liability movement is shown separately from deposit
custody. Deposit custody is never included in operating net or owner carried
balance.

Each proposed bucket lists included, excluded, and unresolved typed source
identities and a confidence state. No bucket declares a current source
authoritative.

## Named read-path parity

The artifact names each present calculation instead of treating shared Ledger
read paths as independent:

| Surface | Current formula represented |
| --- | --- |
| Owner Statement/property cash | signed receipt allocations by obligation class, signed paid property-expense allocations, cumulative typed deposit custody, ownership |
| Ledger | active property/currency/date-scoped `ledger_entries` |
| Property Performance | existing trusted-report helper over Ledger rows |
| Unit Performance | existing trusted-report helper over unit-linked Ledger rows, with unit-context coverage |
| Income & Expense | existing trusted-report helper over Ledger rows |
| property-record finance summary | exact production all-time Ledger formula, plus clearly labelled selected-period comparison |
| finance-close queues | current obligation/petty-cash readiness counts and cited production formula |
| journal/accounting control | property/currency/entry-date debit and credit controls |

The current Ledger-versus-Owner-Statement contradiction is emitted explicitly.
No production read path or user-visible total is changed.

## Business-requirement gaps

`businessRequirementGaps` separately inventories the requested IPS income and
expense categories as stable, free-text-only, missing, or ambiguous between an
income recharge and an actual property expense. It also records:

- no durable Owner Balance chain or controlled owner-distribution workflow;
- no opening/closing carried balance;
- current Owner Statement rows are not grouped by unit;
- current source contracts do not uniformly preserve unit ID; and
- deposits must be excluded from operating and carried-balance totals.

`unitContextCoverage` reports, per source family, rows with a unit ID,
legitimate property-level rows, and rows unexpectedly missing unit context.
Ownership diagnostics apply the IPS rule—one 100% property owner, inherited by
all units—on each relevant event/obligation date and period end. Plan 01 does
not add unit ownership, co-ownership, categories, balances, or distributions.

## Staleness, access, and limitations

The source watermark covers obligations, settlement headers and allocations,
deposit definitions/events, Ledger, journals/lines, maintenance, petty cash,
ownership, people/contact archival metadata, property/organization Ledger
locks, accounting books/period locks, migrations/schema identity, table
privileges/RLS policies, function ACLs, organization membership, and the
selected property's reporting-period and close-revision state. The CLI checks
the watermark before and after collection and validates every page's contract
version.

The `access` section records privilege metadata; it does not claim that metadata
is an observed runtime outcome. `finance_inventory_authorization_test.sql`
separately executes the anonymous/member/manager/admin/cross-organization role
matrix, direct DML, public/private RPC, generic Ledger/journal operations,
wrong-link attempts, and reserved namespace impersonation.

Known unresolved limits are evidence, not defects repaired here:

- no exact deposit-to-receipt/payment identity exists;
- no universal settlement-to-Ledger/journal identity exists;
- several reports intentionally share Ledger and its loader limits;
- property-record totals are all-time in production and are not silently
  replaced by the CLI's bounded period;
- proposed classifications cannot become authority without later controlled
  contracts; and
- Plan 01 does not revoke current grants or change any financial write path.

Allowed proposal labels remain:
`exact_existing_link`, `candidate_controlled_adjustment`,
`candidate_explicit_exclusion`, `ambiguous_requires_resolution`,
`inferred_date_requires_evidence`, and `unsupported_current_source`.
