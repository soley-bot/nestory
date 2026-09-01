# Historical Rent Correction Authority Design

**Status:** Approved for implementation on 2026-09-01
**Base:** `origin/main` at `cf4925c625993ee9580f1e954a0c8e9dd54d9a66`
**Scope:** Super Admin correction of one already-issued historical rent billing period. No hosted database, production, Vercel, merge, or deployment mutation.

## Outcome

Nestory gains a distinct **Correct historical rent** workflow. It corrects the rent amount and due day shown for one issued historical invoice without changing the issued invoice header, deleting evidence, or using the future-facing **Change rent** scheduler.

The correction is an append-only accounting occurrence. It links the original rent obligation to a signed reversal and a positive replacement obligation, rebuilds management-fee and owner effects, and, when settlement exists, reverses and reapplies the settlement allocation chain at the correction business date. Prior receipts, Ledger entries, owner balance movements, Owner Close revisions, and published Owner Statements remain immutable.

## Evidence from the current system

- `PROJECT.md` makes `lease_terms` the rent schedule authority, while tenant invoices and finance income items are obligations and Ledger is a projection. Material schedule changes supersede rather than rewrite history.
- `schedule_authoritative_lease_term` rejects past-effective changes. That remains the only **Change rent** authority.
- `correct_tenant_invoice` already proves the signed-evidence model: issued invoice headers stay intact while reversal lines adjust presentation and management-fee/owner evidence is reversed.
- `tenant_invoice_balances` already derives adjusted totals from signed invoice lines and settlement allocations; it can be extended to include a positive replacement and adjusted due-date evidence.
- `reverse_tenant_invoice_payment` and `reverse_owner_collection_confirmation` already append receipt, allocation, Ledger, and owner-event reversals. Their matching record commands already create the replacement settlement projection.
- Owner Close reopen creates a new revision while retaining the prior closed revision and publication. The correction must require that explicit reopen; it must not reopen or overwrite statements itself.

## Authority boundary

Only an authenticated organization member whose protected role is `super_admin` may preview or execute this workflow. `leases.change_terms` and `finance.correct_records` alone are insufficient.

The database RPC is the final authority. The Server Action repeats the Super Admin check for early rejection, validates untrusted form input, and maps fail-closed codes to operator-readable messages.

## Selected correction unit

One correction targets one issued tenant invoice and its one active rent obligation lineage for one billing period. The selected invoice supplies the effective period (`billing_period_start` through `billing_period_end`), lease, property, unit, currency, original billing term identity, issue date, and collection route.

This workflow intentionally does **not** mutate or supersede `lease_terms`. An issued-period correction is an accounting evidence overlay tied to the original `billing_term_id`. This preserves every lease-term identity and all date coverage exactly, while future invoice generation and **Change rent** continue to use the forward schedule.

The database fails closed if the invoice has no active rent line, more than one active rent line, a non-monthly/unsupported generated lineage, mismatched currency or lease scope, a prior historical-rent successor, or a billing period that is not historical as of the organization rent business date.

## Append-only occurrence and obligation lineage

`tenant_invoice_corrections` is extended with the `historical_rent` action and immutable snapshots:

- original and corrected rent amounts;
- original and corrected due day/date;
- correction business date;
- original billing-term and rent-line identities;
- preview/payload hash, reason, actor, and idempotency key;
- settlement, fee, owner, and tenant-credit result counts.

`tenant_invoice_lines` gains `supersedes_line_id`. A successful correction appends:

1. a negative line with `reversal_of_id = original_line_id`;
2. a positive rent line with `supersedes_line_id = original_line_id`, a new finance income item, and the same correction occurrence;
3. no update to the original line or invoice header.

`finance_income_items` gains `supersedes_income_item_id` and `correction_occurrence_id`. The original amount, due date, received state, and source identity remain. The replacement item owns the corrected amount/due date and all reapplied settlement allocations.

At most one successor is permitted for an original line/item. The existing rent-month uniqueness is changed only enough to allow one historical successor while still preventing a second root rent obligation for the lease/month.

## Adjusted invoice presentation

`tenant_invoice_balances` computes `total_amount` from the immutable invoice snapshot plus signed correction lines and tenant adjustments. Its displayed `due_date` and payment state use the latest active historical replacement evidence. The original `tenant_invoices.total_amount` and `tenant_invoices.due_date` remain unchanged and queryable as issued evidence.

The corrected due date is the selected due day clamped to the billing month and floored at the immutable invoice issue date, matching invoice generation semantics.

## Settlement reversal and reallocation

The correction takes locks in this order:

1. organization/lease/invoice correction advisory key;
2. invoice row and active rent-line lineage;
3. correction-date financial month and property/currency month;
4. affected settlement rows in stable identity order;
5. affected owner-close rows in stable owner/month order;
6. idempotency claim.

For every active IPS payment, the authority calls the checked payment-reversal command at the correction business date, appending a reversal payment, finance receipt, finance-receipt allocations, tenant allocations, Ledger entries, and owner-event effects. It then records a replacement payment at that same date and reapplies the original allocation plan, mapping the original rent-line allocation to the replacement rent line and retaining unaffected line allocations.

Direct-to-owner confirmations follow the equivalent checked reverse/confirm path. Immutable link rows record original settlement, reversal settlement, and replacement settlement identities under the correction occurrence.

Reversal and replacement entries occur on the same correction date, so cash projection is net zero when the corrected obligation is unchanged. A rent increase leaves an ordinary invoice balance due. A rent decrease creates an immutable tenant-credit occurrence for the excess rather than consuming it as income:

- IPS-collected excess is `ips_held` tenant cash liability;
- direct-to-owner excess is `owner_held` and snapshots the owner person;
- the original receipt remains, its full allocation is reversed, only the corrected amount is reapplied, and the credit occurrence accounts for the remainder;
- no refund, cross-invoice application, or cash movement is invented by this workflow.

Tenant credits are read-only evidence in this slice. Any future refund/application command must be a separate reviewed authority.

If a mixed payment cannot be replayed exactly, if an original owner allocation is missing, if the correction-date month is locked, or if a checked reversal/re-record command rejects the chain, the entire transaction rolls back.

## Fee and owner effects

The original management-fee occurrence, owner invoice line, allocation set, and owner component movements receive their existing signed reversals. A positive replacement management-fee occurrence is calculated from the corrected rent using the immutable fee mode/value snapshot. Its owner invoice charge and owner allocation/component movements are appended through the checked owner authority.

For percentage fees, the corrected fee is rounded once to exact `numeric(14,2)` money. Flat fees retain the original configured flat amount. A zero calculated fee is represented by reversal without a positive replacement and is explicit in the correction occurrence.

Tenant rent receipt owner effects are fully reversed and recreated for only the reapplied rent amount. Tenant-credit excess has no owner-rent income effect. This makes owner liability and distributable balances agree with the corrected obligation.

## Owner Close and statements

The preview reports all affected Owner Close series from the original recognition month forward and from the correction-date settlement month forward.

Execution fails with `historical_rent_owner_close_reopen_required` when any affected series is `closed` or `stale` with a current closed revision. A Super Admin must explicitly use the existing reopen authority first. A reopened `preparing` series is allowed. The correction then marks derived owner balance periods/series stale through checked contexts so the operator can rebuild and close revision N+1.

No Owner Statement row or publication is updated or deleted. Previously published revisions remain downloadable and immutable; a later close publishes only a new revision.

## Preview and confirmation

`preview_historical_rent_correction` returns a deterministic JSON object containing:

- invoice/lease/period/source identities;
- original and corrected rent, due day/date, and delta;
- active IPS/direct-owner settlement totals and projected tenant credit;
- original and replacement fee amounts;
- affected owner identities and close states;
- immutable-evidence counts;
- blockers and a canonical preview hash.

The UI first submits **Preview correction**. Only a blocker-free preview renders **Apply correction**. Execution recomputes the preview under locks and requires the submitted preview hash to match, preventing stale confirmation.

## Idempotency, concurrency, and immutability

- The canonical payload includes organization, invoice, corrected amount/due day, reason, and correction date.
- Same actor/key/payload replays the same result.
- Same key with a changed payload fails.
- The invoice advisory lock plus unique successor constraints ensure two concurrent keys cannot create two corrections.
- Correction, lineage, settlement-link, and tenant-credit rows reject update/delete.
- Direct DML remains revoked from authenticated roles. RLS permits Super Admin reads but mutations only through the RPC.
- SECURITY DEFINER functions use `SET search_path TO ''`, fully qualified objects, explicit grants, and checked role/capability gates.

## Fail-closed matrix

| Condition | Result |
|---|---|
| Non-Super Admin or cross-organization target | `historical_rent_correction_forbidden` |
| Draft/void/future invoice or unsupported rent lineage | explicit validation failure |
| Prior successor/correction exists | `historical_rent_already_corrected` |
| Preview hash changed under lock | `historical_rent_preview_stale` |
| Correction-date financial month locked | `financial_month_locked` |
| Closed/stale Owner Close revision | `historical_rent_owner_close_reopen_required` |
| Missing settlement reversal/reallocation evidence | explicit settlement-chain failure |
| Active owner invoice payment against the fee being replaced | `owner_invoice_settlement_active` |
| Unsafe direct DML or update/delete | `42501` |

## UI

The active lease record shows **Correct historical rent** only to Super Admin. It remains visually and semantically separate from **Change rent**. The modal requires:

- historical invoice period;
- corrected rent amount;
- corrected due day;
- reason of 8–500 characters.

Preview shows old → new rent/due date, settlement reversal/reapplication, tenant credit if any, fee delta, affected owner/close state, and immutable evidence retained. Confirmation uses explicit destructive-copy language without implying deletion.

## Verification

- pgTAP: authority, preview, append-only lineage, exact money, due-date clamp, idempotency, stale preview, settlement replay for IPS and direct owner, tenant credits on decreases, fee/owner effects, close/reopen, statement immutability, locked month, direct DML, and concurrent correction attempts.
- Vitest: input parsing, Server Action RPC payload/error mapping, Super Admin visibility, preview/confirm modal, and continued **Change rent** behavior.
- Local Supabase reset/lint/type generation and focused tests first; broader repository gates afterward.
