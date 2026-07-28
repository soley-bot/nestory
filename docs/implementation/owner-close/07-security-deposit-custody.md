# Plan 07 — Security-Deposit Custody

> **Legacy broad design source — not current Plan 07.** The ratified sequence
> moved this work to **sequence 10, security-deposit custody**. Use
> `97-ratified-final-sequence.md`; do not paste this file directly into Codex.

**Mode:** Standard  
**Effort:** High  
**Reason:** Security deposits currently exist as both an income category and a separate deposit-custody event chain, creating contradictory balances and statement treatment.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin after Plans 00-04 and the canonical contract are merged.

Current schema includes `finance_income_items.income_type = security_deposit`, normalized `lease_deposits`, and immutable `lease_deposit_events`. Owner Statement excludes deposit-income receipts from operating cash and calculates held balance from deposit events. No enforced one-to-one relationship guarantees that the income-looking receipt and custody event describe the same money.

## Objective

Make `lease_deposits` plus immutable deposit events the only supported write model for security-deposit custody, with atomic cash/journal projections, controlled application/refund/retention, exact held-balance reconciliation, and clear Owner Statement disclosure outside operating income.

## Verified current behavior

- Lease deposit records hold expected deposit terms.
- Deposit events support received, applied, retained, refunded, reversed, and reversal linkage.
- Deposit events are already excluded from operating income in property cash logic.
- Deposit income items can still be created through Rent & Income compatibility paths.
- Deposit held balance is a liability/custody fact, not rent revenue.
- Existing historical deposit-income rows may be the only record of actual cash in some data.

## Required changes

### 1. Ratify deposit event semantics

Document exact meaning and signed effect:

- `received`: cash received and deposit liability increased.
- `refunded`: cash paid out and deposit liability decreased.
- `applied`: deposit liability decreased and transferred to a specific tenant obligation or owner/property claim.
- `retained`: deposit liability decreased and recognized through an explicit approved damage/expense/revenue settlement according to IPS policy.
- reversal: exact opposite dated event preserving the original.

`applied` and `retained` must link to the obligation, expense, maintenance damage claim, or approved adjustment that receives the value. A text reference alone is insufficient for new events.

### 2. Strengthen the deposit event model

Append fields or related link tables required for:

- optional tenant receipt/payment evidence;
- target obligation/expense/adjustment identity for applied or retained events;
- payment method/cash account or reconciliation reference when required by Plan 10;
- mandatory reason for refund, application, retention, and reversal;
- source document links;
- source-linked ledger and journal projection identity;
- approval actor/state for retention or disputed application;
- stable event idempotency key.

Preserve the current immutable event chain and append-only migration strategy.

### 3. Make event writes atomic and period-aware

Checked RPCs for receive, refund, apply, retain, and reverse must atomically:

- validate organization-admin authority and lease/property scope;
- lock the deposit record;
- calculate current held balance from effective events;
- reject an outflow greater than held balance;
- validate event date against the approved property-period policy;
- insert the deposit event;
- create the required ledger projection in a non-operating deposit/custody classification;
- create balanced, idempotent journal projection;
- link target obligation/adjustment where required;
- write activity history;
- return all source/projection identities.

No deposit event may be represented as property operating income or an ordinary property expense merely to make the ledger balance.

### 4. Retire new deposit-income writes

After the replacement workflow is available:

- remove `security_deposit` from new Rent & Income creation choices;
- make checked income RPCs reject new deposit-income obligations/receipts with a clear redirect to the lease deposit workflow;
- preserve historical compatibility rows as read-only until Plan 12 classifies or migrates them;
- prevent the same cash from appearing as both deposit event and receipt-allocation event in `property_cash_events_v1`.

Do not drop the check-constraint value or historical column in this plan if existing rows require it.

### 5. Reconcile held balance

Add a deposit reconciliation loader and close check that compares:

- expected deposit terms;
- net immutable deposit events;
- linked cash/journal projections;
- applications/retentions and their target sources;
- refunds;
- historical compatibility deposit-income rows;
- unresolved duplicate or missing evidence.

The output must distinguish:

- expected but not received;
- partially received;
- held;
- partially applied/retained/refunded;
- fully released;
- overdrawn or ambiguous.

### 6. Update lease and finance UX

Lease quick view/detail becomes the primary deposit workflow and shows:

- expected amount and currency;
- held balance;
- chronological immutable events;
- source documents and target links;
- receive/refund/apply/retain/reverse actions according to state;
- reconciliation exceptions.

Rent & Income may show a read-only deposit-custody link or filter, but must not imply deposit receipt is operating income.

Owner Statement later shows opening held deposit, period movements, and closing held deposit as a disclosure section, not part of owner operating net unless a retained/applied event has an approved owner effect.

## Invariants to preserve

- Deposit liability never counts as operating income.
- Held balance is derived from immutable events, not a manually editable total.
- Outflows cannot exceed effective held balance.
- Application/retention has an exact target source.
- Original events remain immutable; reversal is a separate exact opposite event.
- Writes and projections are atomic, idempotent, and period-aware.
- One deposit cash movement appears exactly once in the canonical contract.
- Historical compatibility rows are preserved and flagged until migrated.
- Cross-organization/lease/property scope is enforced.

## Acceptance criteria

1. Recording a deposit receipt creates one custody event and required projections, with zero operating-income effect.
2. Refund, application, and retention cannot exceed held balance.
3. Application and retention require valid target links and reason.
4. Reversal creates an exact opposite event and projections without mutating the original.
5. New Rent & Income deposit writes are rejected after the replacement workflow ships.
6. Existing compatibility rows remain visible to parity diagnostics and do not double count when linked to a deposit event.
7. Lease deposit history calculates exact opening, movement, and closing held balances.
8. Locked-period, non-admin, cross-organization, duplicate-idempotency, overdraw, invalid-target, and direct-write bypass attempts fail.
9. Close diagnostics can distinguish expected-not-received from a true zero deposit.
10. Owner Statement disclosure input can be produced entirely from the canonical deposit chain.

## Verification

- RED regression for a deposit-income row that does not affect held balance and for duplicate deposit representation.
- pgTAP for balance calculation, event types, target links, idempotency, reversal, locks, RLS, bypass, journal balance, and operating-income exclusion.
- Vitest for lease deposit actions, history, error mapping, source links, and Rent & Income transition.
- Full application tests, lint, TypeScript, and build.
- Database reset, lint, generated types, and full pgTAP.
- Authenticated browser flow: receive → partially apply/retain → refund → reverse → inspect lease history and canonical totals.
- Parity artifact and `git diff --check`.

## Scope exclusions

- No tenant portal or automated refund payment integration.
- No jurisdiction-specific trust-account product.
- No interest-on-deposit or tax treatment.
- No destructive removal of historical `security_deposit` income values.
- No production migration; Plan 12 owns classification/backfill.
- No Owner Statement publication yet.

## Deliverables

- Deposit semantics decision record.
- Append-only migration for target links, idempotency, projections, and controls.
- Atomic checked deposit RPCs and compatibility guards.
- Updated lease deposit workflow and read-only finance transition.
- Reconciliation loader and close-ready facts.
- Full tests, generated types, and parity output.
- Draft PR; do not merge without review.

## Stop conditions

Stop if:

- `applied` or `retained` cannot be tied to an accountable target;
- the design counts deposit cash as rent/property income;
- deposit events and deposit-income receipts can both remain effective for the same cash;
- held balance can become negative without an explicit approved correction;
- reversals mutate original events; or
- IPS deposit disposition policy is required but undocumented.
