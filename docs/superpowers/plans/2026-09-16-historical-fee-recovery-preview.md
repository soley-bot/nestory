# Historical fee and owner distribution recovery preview

Status: local fixture verified; no hosted data changed. Saving a Pilot financial correction requires approval of the concrete live preview.

## Proposed changes for the reported history

| Record | Amount USD | Current date | Proposed date |
| --- | ---: | --- | --- |
| September management-fee cash settlement (fee recognized 1 September 2026) | 40.00 | 6 August 2026 | 4 September 2026 |
| Owner distribution | 454.40 | 15 September 2026 | 31 August 2026 |

The August fee remains 40.00, utilities remain 5.60, and the two rent receipts remain 500.00 each. Fee recognition dates and issued invoice amounts do not change. The August fee cash settlement remains dated 6 August; correcting it to another actual payment date would require separate evidence and approval.

Expected corrected owner cash:

- August: 500.00 rent - 40.00 August fee - 5.60 utilities - 454.40 distribution = **0.00**.
- September: 500.00 rent - 40.00 September fee = **460.00**.
- Current owner cash stays **460.00**. No receipt, contribution, balancing entry, or additional funds are created.

4 September is the proposed September settlement date because this is when the reported September rent arrived. Recognition on 1 September does not establish receipt of cash on that date. Confirm the actual payment evidence before approval.

## Why a single date correction did not work

The original payout reserves 414.40 from the August receipt and 40.00 from the September receipt. Correcting only the September fee date releases its original August cash reservation, then the unchanged first-in-first-out allocator immediately reserves that same August 40.00 again. Therefore moving the payout still fails `insufficient_authoritative_held_cash`.

The dedicated recovery performs one atomic transaction:

1. Reverse the September fee's original cash settlement, retaining its original record.
2. Invoke the existing payout date correction: reverse the original payout and replace it on 31 August, using the now-available August 454.40.
3. Replace the September fee cash settlement on 4 September. The remaining real source is the September receipt.
4. Record fee correction history and linked payout correction audit details.

Any failure rolls back the entire operation. The cash allocator, financial-period locks, owner authority, privilege checks, and dated cash safeguards remain in force. Other transactions retain their reservations. Preview executes the same path inside a subtransaction that always rolls back. Confirmation requires the returned preview hash and an idempotency key; changed financial state invalidates the preview.

## Binding exact live records without changing them

The task specification contains dates and amounts but does not contain the Pilot organization/property/allocation/withdrawal IDs. Never guess those IDs. Under the authenticated authorized Pilot scope, select the existing lease's fee candidates with `list_fee_payment_date_candidates`; match the 40.00 allocation dated 6 August whose `feeDate` is 1 September. Match the original active 454.40 payout dated 15 September in the same property and owner.

After deployment, request the non-persisting preview with those verified IDs:

```sql
select public.preview_owner_distribution_fee_recovery(
  p_organization_id := :verified_organization_id,
  p_allocation_id := :verified_september_fee_allocation_id,
  p_payment_date := date '2026-09-04',
  p_withdrawal_id := :verified_original_withdrawal_id,
  p_distribution_date := date '2026-08-31'
);
```

This is a rollback-based preview RPC, not a PostgreSQL READ ONLY transaction: it exercises posting checks and deliberately rolls back every trial write. Present `canApply`, `blockers`, both original/new dates, both amounts, and `currentBalanceChange` to staff. Do not call confirmation as part of live acceptance.

## Local evidence

`supabase/tests/owner_distribution_historical_fee_recovery.sql` uses isolated organizations and real rent/payment, fee, expense, cash allocation and payout sources, wrapped in BEGIN/ROLLBACK. It offsets the two fixture months into the past so the test remains valid throughout the year; day-of-month and monetary chronology match the August/September example.

28 assertions passed: original 414.40/40.00 payout reservations, original rejection without partial writes, standalone-fee limitation, successful combined preview, complete preview rollback, closed-period/stale-hash/unauthorized rejection, September 1 funding rejection, zero August closing cash, September 460 cash, unchanged totals, retained originals, idempotent confirmation, and September receipt funding of the corrected fee.

Existing regression suites also passed: fee payment correction 26; owner payout date correction 26; payout transaction correction 34; payout reconciliation 39. Local owner contribution void tests passed 12 assertions.

No published migration was edited. New forward migration: `20260916035020_recover_owner_distribution_fee_dates.sql`. Local function application did not alter migration history. No hosted write or database reset was performed.
