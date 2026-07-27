# Plan 03 — Income Settlement and Reversal

**Mode:** Standard  
**Effort:** High  
**Reason:** Receipt allocation, ledger projection, journal projection, compatibility totals, reversal, and period checks must become one atomic financial operation.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin only after Plans 00-02 are approved and merged.

Current income behavior includes obligations in `finance_income_items`, dated receipts in `finance_receipts`, allocations in `finance_receipt_allocations`, compatibility status/amount fields on the obligation, optional ledger links, and accounting journals. The current reversal path can require a separate ledger reversal before a receipt reversal, which exposes internal projection order to the operator.

## Objective

Make one checked receipt operation atomically create the settlement allocation and every required derived projection, and make one checked reversal operation atomically create the exact opposite dated effect. Remove the possibility that receipt cash exists in Owner Statement sources but not in Ledger/journal controls, or vice versa.

## Verified current behavior

- `record_finance_receipt` records one receipt and allocation against an income item.
- Receipt amount cannot exceed the open obligation balance.
- Compatibility fields on the income item are refreshed from allocations.
- Receipt reversal preserves the original receipt and creates a reversing receipt/allocation.
- Posted income can currently block receipt reversal until a separate ledger posting is reversed.
- Owner Statement cash input uses receipt allocation dates and amounts.
- Security deposit and owner contribution compatibility income types must not become operating income.

## Required changes

### 1. Replace the split posting contract with one atomic RPC

Create a versioned checked RPC, or replace the existing checked implementation compatibly, so a successful receipt transaction performs all of the following in one database transaction:

1. authenticate and verify organization-admin authority;
2. lock and validate the target income obligation;
3. reject void/archived obligations and invalid property/unit/lease scope;
4. verify the received date is open under the approved property-period policy;
5. calculate the exact remaining allocable balance from immutable allocations and reversals;
6. insert the receipt header and allocation;
7. create the source-linked ledger projection for the allocation when the economic class requires one;
8. create the balanced, idempotent accounting journal projection for the same allocation source identity;
9. refresh compatibility amount/date/status fields;
10. write one coherent activity-log payload containing the settlement and projection identities;
11. return the receipt, allocation, ledger, and journal IDs needed by the server action.

A transaction must either complete every required step or leave no receipt/allocation/projection behind.

### 2. Use allocation identity for cash projection

New cash-basis ledger and journal projections must use `finance_receipt_allocation` plus allocation ID as the source identity, not only the income obligation ID.

This is required for:

- partial receipts;
- multiple receipts across months;
- future multi-allocation receipts;
- exact reversal pairing;
- correct cash date;
- de-duplication in `property_cash_events_v1`.

The obligation remains the source of what was due. The allocation is the source of what cash was received.

### 3. Make receipt posting idempotent

Add an explicit idempotency key or equivalent stable request identity at the RPC boundary. A retried browser/server request with the same key and payload must return the original result. Reusing the key with different material payload must fail closed.

Do not rely on description, reference, timestamp proximity, or amount/date coincidence for idempotency.

### 4. Make reversal symmetric and atomic

`reverse_finance_receipt` must:

- validate authority, original event, and reversal date;
- prevent reversal chains and duplicate reversal;
- create a reversing receipt and allocation with exact original amount/effect;
- create reversing ledger and balanced journal projections in the same transaction;
- refresh obligation compatibility fields;
- retain both original and reversal source links;
- record a mandatory reason/reference according to the approved policy;
- never require the user to reverse a derived ledger row first.

If the original period is closed, apply the approved Plan 00 policy: normally post the reversing event into an open period while leaving the published original statement immutable; reopen only when the historical statement itself must be restated.

### 5. Protect source-linked projections

Update generic ledger update/archive RPCs so source-linked receipt-allocation projections cannot be edited, archived, re-dated, or reclassified directly. The error must direct the operator to the income settlement or reversal workflow.

Manual legacy rows remain unchanged until Plan 12.

### 6. Preserve special economic classes during transition

Until Plans 07 and 09 remove the compatibility paths:

- `security_deposit` receipts must classify as deposit custody compatibility, not operating income;
- `owner_contribution` receipts must classify as owner liability compatibility, not operating income;
- management-fee compatibility income must remain distinguishable from owner operating income;
- unsupported or ambiguous classifications must create a parity exception rather than default to rent.

Do not remove these input choices in this plan unless the replacement workflow already exists on the merged baseline.

### 7. Update the operator workflow

The Rent & Income action should remain operationally simple: record received money against the selected obligation and show one success result. Do not expose separate ledger or journal actions.

The quick view/detail must show:

- receipt history and reversals;
- amount due, received, and outstanding;
- exact received date and reference;
- source-linked Ledger activity as read-only evidence;
- controlled reversal action with consequence copy.

## Invariants to preserve

- Obligation and settlement remain separate.
- Receipt allocation amount is exact and cannot exceed open balance.
- All business scope remains organization/property consistent.
- Cash date is `received_date`.
- Ledger and journal projections are derived and idempotent.
- Journals remain balanced.
- Reversal preserves the original and creates an exact opposite effect.
- Closed-period policy is enforced at the source event, not only the ledger.
- Deposits and owner contributions remain outside operating income.
- Source-linked projections cannot be generically changed.

## Acceptance criteria

1. A new receipt cannot commit without its required ledger and journal projections.
2. A repeated request with the same idempotency key returns the same IDs and creates no duplicate.
3. A partial receipt produces one allocation-based cash event on the receipt date.
4. Multiple receipts across months produce separate events and correct remaining balance.
5. A reversal creates one exact opposite event and projections without a separate ledger step.
6. Reversal and original net correctly in the canonical event contract while remaining individually traceable.
7. Direct ledger edit/archive of a receipt projection is rejected.
8. Cross-organization, non-admin, direct-RPC, locked-period, over-allocation, duplicate-reversal, and altered-idempotency-payload attempts fail.
9. Existing historical receipt rows remain readable and are not destructively rewritten.
10. Shadow parity for newly created receipt flows reports no missing or duplicate projection.

## Verification

Required RED/GREEN evidence:

- regression proving the pre-change split or missing projection behavior;
- pgTAP for atomic rollback, idempotency, balance enforcement, locks, RLS, bypass, projection identity, journal balance, and reversal symmetry;
- Vitest for server action validation, error mapping, route revalidation, and source-link rendering;
- full application tests, lint, TypeScript, and production build;
- database reset, lint, generated types, and full pgTAP;
- authenticated browser flow: obligation → partial receipt → final receipt → reversal → Ledger/source evidence;
- canonical event and journal parity output;
- `git diff --check`.

## Scope exclusions

- No rent schedule generation change.
- No generic receipt spanning several obligations unless already supported and necessary for the atomic contract.
- No deposit workflow replacement, owner balance, management-fee agreement, close, or statement cutover.
- No deletion of legacy posting functions or columns; compatibility wrappers may remain.
- No production backfill.

## Deliverables

- Append-only migration for atomic/idempotent receipt and reversal behavior.
- Compatibility wrapper or deprecation path for old public RPCs.
- Protected source-linked ledger mutation rules.
- Updated Rent & Income action and focused UI evidence.
- Generated types and full test coverage.
- Updated parity artifact proving new receipts are complete.
- Draft PR; do not merge without review.

## Stop conditions

Stop if:

- the transaction can leave a receipt without projections or projections without a receipt;
- partial receipts still map to one obligation-level ledger row;
- reversal requires mutating or deleting the original;
- period locks apply only to derived rows;
- special income types are silently treated as rent;
- idempotency relies on approximate matching; or
- fixing receipts requires a broad chart-of-accounts or general-ledger product expansion.
