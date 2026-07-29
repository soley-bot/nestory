# Plan 05 Operator Notes

## What changed

Rent & Income now treats one supported receipt or reversal as a single checked
financial transaction. A successful receipt commits all of the following
together:

- one receipt header and one exact allocation to one obligation;
- the obligation compatibility balance and status;
- one allocation-linked Ledger projection;
- one balanced journal per applicable client accounting book;
- activity evidence; and
- a payload-bound idempotency result.

A reversal appends a new receipt, allocation, Ledger projection, and journal
set directly linked to the original allocation. It never edits or deletes the
original evidence.

## Operator workflow

1. Create the income obligation without recording initial cash.
2. Open the obligation's receipt action.
3. Choose the exact active cash or bank reconciliation source, enter the
   received amount and date, and optionally add a reference.
4. Submit once. A retry of the same attempt returns the original result.
5. Inspect the receipt row for its reconciliation source, Ledger evidence, and
   journal count.
6. If correction is required, use the receipt's Reverse action, select the
   reconciliation source and reversal date, and enter a reason.

There is no separate Post to Ledger action. Operators must not edit or archive
the derived Ledger or journal rows.

## Expected blockers

- The amount must be positive and cannot exceed the exact remaining balance.
- Unapplied cash, overpayments, advances, and multi-obligation allocation are
  outside this workflow.
- The selected reconciliation source must be active, match the organization,
  property, and USD scope, and remain available when the transaction locks it.
- Receipt and reversal dates must fall in an open property, organization
  Ledger, and applicable client-book period.
- Security deposits and owner contributions do not enter operating-income
  settlement through this command.
- Reversing an already reversed receipt is rejected.
- Reusing an idempotency key with changed input is rejected as a conflict.

## Legacy and future boundaries

Legacy receipt and obligation records remain readable. New canonical
allocations carry `plan05.v1` snapshots and are protected from direct
mutation. Pre-cutover rent cash is explicitly
`legacy_cash_non_publishable`; this implementation does not create tenant
invoices or formal receipt artifacts.

Plan 05 installs dormant creation and settlement policy hooks for the future
Plan 09 and tenant-invoice cutover. Those hooks are not activated by this
change, and no production classification or backfill is performed. Until the
joint cutover installs an evidence-verifying Plan 09 creator, the dormant
activation hook rejects every new rent insert after activation and never trusts
caller-supplied provenance.

## Local verification

Use an isolated Supabase stack:

```powershell
npm run finance:inventory:stack -- stop
npm run finance:inventory:stack -- prepare
npm run finance:inventory:stack -- start
npm run finance:inventory:stack -- reset
Get-Content -Raw supabase/seed.sql |
  docker exec -i supabase_db_nestory-finance-inventory `
    psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres
npx supabase db lint --local --schema public,app_private `
  --fail-on warning --workdir artifacts/finance-inventory-stack
npm run finance:inventory:stack -- test
npm run finance:test-income-settlement -- --container supabase_db_nestory-finance-inventory
npm run finance:test-ledger-authority -- --container supabase_db_nestory-finance-inventory
npm run finance:test-accounting-authority -- --container supabase_db_nestory-finance-inventory
```

Then run the repository TypeScript, lint, test, and production-build checks.
Applying the migration to hosted Supabase, backfilling production data, and
deploying the application require separate release authorization.

## Rollback boundary

Do not attempt a down migration after canonical Plan 05 settlements exist.
The migration adds append-only financial evidence and revokes legacy operator
authorities. Before hosted activation, use the release backup and restore
procedure and verify database, application SHA, and route parity together.
