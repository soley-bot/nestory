# Plan 04 — Expense Settlement and Reversal

**Mode:** Standard  
**Effort:** High  
**Reason:** The current payment action can affect Owner Statement settlement sources without atomically producing the same Ledger and journal truth.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin only after Plans 00-03 are approved and merged.

Current behavior separates `record_finance_payment` from `post_finance_expense_item`. The UI action labeled Record payment calls the settlement RPC, while the separate posting RPC creates the ledger and accounting journal. Payment reversal creates reversing payment/allocation rows but does not symmetrically reverse a separately posted expense projection.

## Objective

Make one checked expense-payment operation atomically create the payment allocation and every required derived projection, and make one checked reversal operation atomically create the exact opposite effect. Remove the operator-visible distinction between paying an expense and posting its cash effect.

## Verified current behavior

- Expense obligations use draft, approved, posted, paid, and void compatibility states.
- A payment may be partial and may occur in a different month from the invoice.
- Cash reporting should use `paid_date`.
- `post_finance_expense_item` currently requires approval, rejects owner payout, and can use invoice date when a paid date is omitted.
- `record_finance_payment` currently creates payment/allocation rows and refreshes compatibility state.
- Owner Statement expenses are based on payment allocations.
- Payment reversal currently preserves the original payment but does not enforce projection symmetry.

## Required changes

### 1. Make payment settlement one atomic RPC

Create a versioned checked RPC, or compatibly replace the current implementation, so one successful payment transaction performs:

1. authentication and organization-admin authorization;
2. target expense lock and scope validation;
3. rejection of draft, void, archived, owner-payout, or unsupported obligations;
4. open-period validation on `paid_date`;
5. exact remaining payable calculation from allocations and reversals;
6. payment header and allocation insertion;
7. allocation-sourced ledger projection on `paid_date`;
8. balanced, idempotent journal projection for the same source identity;
9. compatibility field/status refresh;
10. coherent activity logging with all source and projection IDs;
11. return of payment, allocation, ledger, and journal identities.

No payment may commit without every required projection, and no projection may commit without the payment allocation.

### 2. Use payment-allocation identity

New cash-basis expense projections use `finance_payment_allocation` plus allocation ID as source identity.

Do not use one obligation-level `ledger_entry_id` as the authority because one bill can have:

- partial payments;
- payments across multiple months;
- a later reversal;
- a future payment containing several allocations.

The bill remains the obligation. Each allocation is a dated cash effect.

### 3. Eliminate the separate operator posting step

Update Bills & Expenses actions and UI so:

- approving a bill authorizes it for payment but creates no cash event;
- recording a payment atomically posts its cash projections;
- the operator never chooses a separate Post to Ledger action for new finance expenses;
- ledger/journal status is shown as read-only evidence or exception state;
- existing legacy posted-but-unpaid items remain visible and are classified by parity diagnostics.

Keep compatibility RPCs only where required for existing callers or backfill. They must not create a second projection for an already settled allocation.

### 4. Define compatibility status behavior

Do not let stored obligation status become a competing source. Derive payment facts from allocations.

The implementation must document and test how existing status values are preserved during transition. Prefer:

- `draft` before approval;
- `approved` while an approved balance remains;
- `paid` when net allocated payments equal the amount;
- `void` only when no effective settlement remains or after a controlled reversal process;
- legacy `posted` retained only for historical compatibility and diagnostics.

If a new `partially_paid` status is introduced, update every selector, filter, check constraint, report, seed, generated type, and test in the same PR. Do not add it casually.

### 5. Make payment reversal symmetric

`reverse_finance_payment` must:

- validate authority, original payment, source allocations, and reversal date;
- prevent duplicate reversal and reversal chains;
- create reversing payment/allocation rows with exact original effect;
- create reversing ledger and balanced journal projections atomically;
- refresh obligation compatibility state;
- preserve exact links to original and reversal;
- require a reason/reference;
- never leave a paid allocation reversed while its ledger/journal cash expense remains effective.

Apply the approved closed-period policy consistently with receipts.

### 6. Protect derived projections

Generic ledger update/archive RPCs must reject direct mutation of payment-allocation projections. Corrections occur through payment reversal or a later explicit adjustment event.

### 7. Preserve owner-payout boundary

The generic expense/payment flow must reject `owner_payout` for new records or settlement. Owner distributions are implemented in Plan 09 and must not be disguised as property operating expenses.

Existing owner-payout compatibility data remains visible to diagnostics and the canonical contract until migrated.

### 8. Preserve invoice evidence and operational context

Payment projection and canonical event rows retain:

- property and optional unit;
- vendor person/label;
- task link where the bill came from maintenance;
- invoice date, paid date, due date, category, description, and reference;
- source documents and activity history.

Do not collapse invoice and payment dates into one field.

## Invariants to preserve

- Obligation and settlement remain separate.
- Cash expense date is `paid_date`.
- Payment allocation cannot exceed the remaining bill balance.
- Draft/void/owner-payout obligations cannot use the generic payment path.
- Derived ledger and journal projections are atomic, balanced, idempotent, and source-linked.
- Reversal preserves original records and posts an exact opposite effect.
- Closed-period policy is enforced at the payment event.
- Source-linked projections cannot be generically edited or archived.
- Owner payouts do not reduce operating expense totals.

## Acceptance criteria

1. Recording an approved bill payment creates payment, allocation, ledger, and journal records in one transaction.
2. A forced failure in any projection rolls back the entire payment.
3. Partial payments create distinct cash events on their actual dates.
4. Multiple payments across months do not overwrite or re-date earlier cash effects.
5. Repeated idempotent requests create no duplicate.
6. Reversal produces one exact opposite cash event and projections without a separate ledger step.
7. Direct source-linked ledger mutation is rejected.
8. Owner payout is rejected from the generic bill/payment flow.
9. Cross-organization, non-admin, bypass, locked-period, overpayment, draft-payment, altered-idempotency-payload, and duplicate-reversal attempts fail.
10. New payment flows produce no parity diagnostics for missing or duplicate projections.
11. Existing historical rows remain readable and are not destructively changed.

## Verification

Required evidence:

- RED test proving payment and posting can diverge before the change.
- pgTAP for transaction rollback, authorization, scope consistency, approval requirement, exact balance, idempotency, period locks, ledger identity, journal balance, reversal symmetry, owner-payout rejection, and generic-ledger mutation rejection.
- Vitest for Bills & Expenses actions, UI state, filters, partial-payment history, source links, and errors.
- Full application tests, lint, TypeScript, and production build.
- Database reset, lint, generated types, and full pgTAP.
- Authenticated browser flow: create bill → approve → partial pay → final pay → reverse → inspect Ledger and source evidence.
- Canonical event and parity output.
- `git diff --check`.

## Scope exclusions

- No vendor credit-note workflow beyond required reversal behavior.
- No maintenance or petty-cash handoff; Plan 05 owns those.
- No owner distribution, management-fee, reconciliation, close, or statement cutover.
- No deletion of compatibility columns or historical posting functions.
- No production backfill.

## Deliverables

- Append-only migration for atomic/idempotent payment and reversal behavior.
- Compatibility/deprecation handling for `post_finance_expense_item` and legacy callers.
- Protected source-linked ledger rules.
- Updated Bills & Expenses actions and focused UI.
- Full tests and generated types.
- Updated parity artifact proving new payments are complete.
- Draft PR; do not merge without review.

## Stop conditions

Stop if:

- payment and projection can still commit independently;
- a partial payment still maps to one obligation-level cash row;
- reversing a payment leaves the original ledger/journal effect active;
- invoice date is used as cash date;
- owner payout remains available as an ordinary expense settlement;
- period locking protects only derived records; or
- compatibility cleanup requires destructive historical rewrites.
