# Plan 01 — Financial Parity Diagnostics and Safety Rails

**Mode:** Standard  
**Effort:** High  
**Reason:** The repository contains several financial representations; a read-only parity inventory is required before any write path or historical data is changed.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Implementation must start from the latest merged `main` after Plan 00 is approved.

Verified current behavior:

- Owner Statement reads income obligations, receipt allocations, payment allocations, deposit events, and ownership.
- Property records and several reports read `ledger_entries`.
- Accounting journals maintain a separate posting-control representation.
- Maintenance and petty cash may create ledger/journal effects without matching Owner Statement settlement sources.
- Expense payment recording and expense ledger posting are separable.
- Existing local fixture evidence already demonstrated a month where Ledger reported rent while Owner Statement reported zero.

This plan changes no financial write behavior. It creates evidence that later migrations and backfills can use safely.

## Objective

Build an organization-scoped, read-only reconciliation toolkit that identifies every mismatch among obligations, settlements, operational ledger rows, accounting journals, deposit events, maintenance, petty cash, and Owner Statement source facts.

## Verified current behavior to preserve

- Existing operational screens continue using their current loaders.
- Existing RPCs continue accepting or rejecting writes exactly as before.
- No current row is updated, archived, relinked, or backfilled.
- The accounting compatibility kernel remains unchanged.
- Diagnostics remain administrator-only and cannot expose another organization's data.

## Required changes

### 1. Add a read-only diagnostic contract

Create a checked SQL function or security-invoker view plus a feature-owned TypeScript loader that emits one diagnostic row per issue. Each row must include:

- organization and property;
- optional unit, lease, task, owner, vendor, and source IDs;
- issue code and severity;
- source type and exact source record link;
- affected event/transaction date and currency;
- obligation amount, settlement amount, ledger amount, and journal amount when applicable;
- whether the mismatch would affect operating income, expenses, deposits, management fees, owner balance, or statement readiness;
- deterministic explanation and recommended resolution class.

Recommended issue codes:

- `receipt_allocation_missing_ledger_projection`
- `receipt_allocation_missing_journal_projection`
- `payment_allocation_missing_ledger_projection`
- `payment_allocation_missing_journal_projection`
- `obligation_compatibility_total_mismatch`
- `source_linked_ledger_without_canonical_settlement`
- `manual_ledger_unclassified`
- `duplicate_financial_effect`
- `maintenance_ledger_without_expense_handoff`
- `maintenance_and_bill_possible_duplicate`
- `petty_cash_projection_missing`
- `petty_cash_and_bill_possible_duplicate`
- `deposit_income_without_deposit_event`
- `deposit_event_without_supported cash evidence`
- `journal_without_operational_source`
- `ledger_and_journal_amount_or_date_mismatch`
- `ownership_invalid_on_event_date`
- `archived_source_still_financially_effective`
- `locked_period_contains_mutable_statement_source`

Use valid identifiers in implementation; the list is semantic, not a required SQL enum spelling.

### 2. Build a deterministic parity summary

For each organization/property/month, calculate:

- operating cash from receipt allocations;
- operating cash from ledger rows;
- property expenses from payment allocations;
- property expenses from ledger rows;
- maintenance and petty-cash direct effects;
- management-fee effects;
- owner contribution/payout effects;
- deposit held balance;
- journal debit/credit control totals;
- unresolved issue counts by severity.

The summary must show both gross source totals and de-duplicated proposed canonical totals. It must not silently choose one truth.

### 3. Add an internal execution path

Prefer a non-public engineering command such as `npm run finance:parity` that:

- requires explicit local or authorized preview environment configuration;
- accepts organization, property, and month filters;
- fails closed when scope is missing;
- writes JSON and Markdown results under ignored `artifacts/finance-parity/<timestamp>/`;
- never prints secrets or private document URLs;
- exits non-zero when Critical mismatches exist if `--strict` is supplied.

A temporary admin UI is not required. Do not add a permanent dashboard merely to display engineering diagnostics.

### 4. Establish safety rails before later plans

Add tests or database guards proving:

- diagnostic functions are read-only;
- cross-organization calls fail or return no rows;
- direct anonymous/authenticated access cannot bypass the intended admin boundary;
- source-linked rows are identified deterministically even when archived or reversed;
- diagnostics paginate or stream beyond 5,000 records rather than silently truncating;
- one issue has one stable key so repeated runs can be compared.

### 5. Capture a baseline fixture

Create a production-shaped local fixture containing at least:

- an active monthly lease and generated rent charge;
- a partial and final receipt;
- an approved bill with partial payment;
- a maintenance cost posted directly to ledger;
- a cleared petty-cash expense;
- a deposit receipt and refund/reversal;
- a management-fee compatibility row;
- an owner contribution and owner payout compatibility row;
- one manual ledger row;
- a reversed receipt and payment;
- one valid and one ambiguous ownership history.

The fixture must intentionally produce known mismatches so RED diagnostics are proven before later plans eliminate them.

## Invariants to preserve

- Read-only behavior; no repair or auto-linking.
- Organization and role isolation.
- Exact money and currency.
- Stable source identities and exact record links.
- Reversals reported as separate dated effects, not negative mutation of originals.
- Archived operational records remain visible to diagnostics when they have financial history.
- No assumptions that `ledger_entries`, settlement allocations, or journals are already authoritative.

## Acceptance criteria

1. One command produces a bounded, deterministic parity report for a selected organization/property/month.
2. The fixture's expected mismatches are all detected with exact source links.
3. A known Ledger-versus-Owner-Statement contradiction appears explicitly in the output.
4. Clean, fully linked fixture events produce no false Critical issue.
5. Cross-organization and direct-RPC bypass tests pass.
6. The diagnostic can process more than 5,000 source rows without silent truncation.
7. Re-running without data changes produces byte-stable normalized JSON apart from generated metadata.
8. No current UI total or write behavior changes.

## Verification

Required evidence:

- RED pgTAP/Vitest fixtures for each Critical issue class.
- GREEN focused tests for SQL diagnostic functions and TypeScript normalization.
- Full `npm run test`.
- `npm run lint`.
- `npx tsc --noEmit`.
- `npm run build`.
- `npm run db:reset`.
- `npm run db:lint`.
- `npm run db:types` plus generated-type drift check.
- Full `npx supabase test db --local supabase/tests`.
- Direct-RPC and cross-organization authorization tests.
- `git diff --check`.

Browser verification is not required unless an admin UI is added, which is discouraged for this plan.

## Scope exclusions

- No canonical event view yet.
- No posting, reversal, lock, fee, deposit, owner balance, statement, or backfill behavior change.
- No automatic repair.
- No production diagnostic execution without explicit authorization.
- No replacement of existing reports.

## Deliverables

- Append-only migration for read-only diagnostic SQL when needed.
- Feature-owned diagnostic types and loader.
- `finance:parity` command and artifact format.
- Production-shaped mismatch fixture.
- Focused Vitest and pgTAP coverage.
- Documentation of issue codes and interpretation.
- Draft PR with baseline SHA, evidence, and no merge request.

## Stop conditions

Stop and return findings without continuing if:

- source identity cannot be determined for a material class of rows;
- diagnostics require mutating records to calculate parity;
- the tool cannot distinguish duplicates from legitimate separate events;
- archived or reversed sources disappear from historical evidence;
- the result depends on an unbounded in-memory load; or
- the current database contains a new financial path not covered by Plan 00.
