# Financial inventory and parity diagnostics

Plan 01 adds read-only evidence. It does not establish financial authority, repair
data, change a report source, or authorize any proposed classification.

## Database boundary

`public.get_finance_inventory_page` is a checked, cursor-paginated RPC. A view
was not selected because this inventory combines source facts, cross-source
diagnostics, privilege evidence, and a source watermark. The wrapper requires an
authenticated organization administrator, validates the property belongs to the
organization, bounds the period to 366 days, and limits each page to 1,000 rows.
Its `app_private` helper is denied to API roles. Both functions are stable and
contain only `SELECT` statements.

Rows are divided into four explicit sections:

- `sources`: typed current-state source facts with exact decimal strings.
- `diagnostics`: deterministic issue facts and a separately named,
  non-authoritative proposed resolution class.
- `access`: current table/function privilege and role-matrix evidence.
- `watermark`: a deterministic hash and row count for staleness detection.

The migration is append-only:
`20260727010101_finance_inventory_diagnostics.sql`.

## Local command

Prepare the disposable stack:

```powershell
npm run finance:inventory:stack -- prepare
npm run finance:inventory:stack -- start
npm run finance:inventory:stack -- reset
```

Load `supabase/fixtures/finance_inventory_fixture.sql` only into that
stack. The fixture emits its randomly generated organization and property scope.
Set the three local-only environment variables
`FINANCE_INVENTORY_ANON_KEY`, `FINANCE_INVENTORY_ADMIN_EMAIL`, and
`FINANCE_INVENTORY_ADMIN_PASSWORD`, then run:

```powershell
npm run finance:inventory -- `
  --organization <uuid> `
  --property <uuid> `
  --currency USD `
  --period-start 2026-07-01 `
  --period-end 2026-07-31 `
  --supabase-url http://127.0.0.1:55321 `
  --project-id nestory-finance-inventory `
  --environment-id local-disposable
```

Optional `--issues`, `--sources`, `--page-size`, and `--strict` arguments are
supported. Hosted URLs and identity mismatches are rejected before
authentication. A watermark change during collection fails the run. Output is
written below ignored `artifacts/finance-inventory/<timestamp>/`; normalized
JSON excludes run-time metadata so unchanged runs remain byte-stable.

## Current-state issue taxonomy

The executable diagnostic contract currently emits:

- `RECEIPT_ALLOCATION_MISSING_LEDGER`
- `RECEIPT_ALLOCATION_MISSING_JOURNAL`
- `PAYMENT_ALLOCATION_MISSING_LEDGER`
- `PAYMENT_ALLOCATION_MISSING_JOURNAL`
- `MANUAL_LEDGER_ROW`
- `MAINTENANCE_TASK_LEDGER_LINK_ONLY`
- `PETTY_CASH_PROJECTION_MISSING`
- `PETTY_CASH_INFERRED_DISBURSEMENT_DATE`
- `JOURNAL_WITHOUT_OPERATIONAL_SOURCE`
- `OWNERSHIP_INVALID_OR_AMBIGUOUS`
- `BACKFILL_INFERRED_DATE`
- `REPORT_TOTAL_CONTRADICTION`
- `SOURCE_LOAD_LIMIT_EXCEEDED`

Access evidence inventories direct table privileges and generic Ledger/journal
RPC execution without changing any grant. Source facts also expose obligation
compatibility amounts/statuses, archived state, source identity, deposit events,
maintenance, petty cash, Ledger, journal, and settlement amounts for further
offline reconciliation.

The following ratified categories remain represented as inventory evidence or
cross-source review inputs rather than write-side enforcement:

- compatibility status/amount and multi-settlement limitations;
- source-linked Ledger rows without settlement identity;
- maintenance/bill and petty-cash duplication;
- deposit evidence, owner-cash, management-fee, and distribution authority;
- Ledger/journal field and reversal mismatches;
- generic namespace impersonation and wrong-linked-record paths;
- archived historical party/reporting effects;
- property/organization/book lock disagreement;
- duplicate effects and missing reconciliation identity.

Those findings are deliberately not repaired in Plan 01.

## Artifact contract

`inventory.normalized.json` contains contract version, scope, repository SHA,
migration identity, source watermark, current-state rows, current gross totals,
issue counts, and a structurally separate `proposedClassification` section.
Money is parsed and summed as integer minor units and serialized as fixed
two-decimal strings. Allowed proposal labels are:

- `exact_existing_link`
- `candidate_controlled_adjustment`
- `candidate_explicit_exclusion`
- `ambiguous_requires_resolution`
- `inferred_date_requires_evidence`
- `unsupported_current_source`

These labels are recommendations only.
