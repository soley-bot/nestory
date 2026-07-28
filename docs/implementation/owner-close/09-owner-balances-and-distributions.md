# Plan 09 — Owner Balances and Distributions

> **Legacy broad design source — not current Plan 09.** The ratified sequence
> split this analysis into **sequence 13, owner authority/opening balances**,
> and **sequence 14, balance/reserve/distribution**. Current sequence 09 is rent
> occurrences and generation. Use `97-ratified-final-sequence.md`; do not paste
> this file directly into Codex.

**Mode:** Standard  
**Effort:** High  
**Reason:** IPS may hold collected money for an owner across months; a period statement and the accumulated amount owed to the owner must be distinct but reconciled.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin after the canonical event contract, deposits, and management-fee assessment plans are merged.

Current Owner Statement calculates a net owner cash movement from selected period activity. It does not carry opening balance, closing balance, reserve, amount payable, contribution liability, or a controlled owner distribution. `owner_payout` exists as a generic expense type even though the ledger posting RPC rejects it and instructs callers to use an owner distribution workflow that is not implemented.

## Objective

Add an auditable owner-property balance and distribution model that derives closing liability from immutable events, distinguishes property performance from cash held by IPS, and replaces generic owner-payout expenses with an approved payout workflow.

## Required business decisions

Before implementation, IPS must confirm:

- balance scope: owner-property-currency or one owner-wide balance across properties;
- whether a minimum reserve is required and how it is funded/released;
- whether distributions may create a negative owner balance;
- payout approval roles and thresholds;
- how owner-funded deficits and reimbursements are recorded;
- whether management fees reduce owner payable at approval or settlement;
- treatment of transferred ownership and inherited opening balances;
- whether owner contributions are restricted to a property or can be allocated later.

Proposed initial scope is owner-property-USD with negative distributions blocked by default.

## Required changes

### 1. Add an immutable owner cash-event model

Create `owner_cash_events` or an equivalent approved model containing:

- organization, property, owner, and currency;
- event date and period;
- event type: opening balance, contribution, distribution, reserve hold, reserve release, approved adjustment, management-fee settlement where required, or reversal;
- exact positive amount plus explicit signed owner-balance effect;
- reference, reason, and reconciliation evidence;
- optional links to management-fee assessment, property expense, deposit disposition, or source import;
- reversal relationship and idempotency key;
- approval/posted actor and timestamps;
- source-linked ledger/journal projection IDs when required;
- immutable history after posting.

Do not store a manually editable current balance as authority. Balance is derived from immutable events and canonical period activity; cached totals may be maintained only as verified projections.

### 2. Add controlled owner distributions

Create `owner_distributions` as the operational payout workflow with:

- owner, property, requested amount, currency, requested payment date;
- available-balance and reserve snapshot;
- status such as draft, approved, paid, cancelled, reversed;
- payment method/reference and recipient/payment-instruction snapshot;
- requested/approved/paid/cancelled/reversed actor and timestamps;
- approval, cancellation, and reversal reason;
- linked owner cash event and projections;
- idempotency key.

The paid transition atomically creates the owner cash event and any required ledger/journal projections. A draft or approved distribution has no cash effect until the approved policy says it is paid.

### 3. Replace owner payout as generic expense

After the distribution workflow is usable:

- remove owner payout from new Bills & Expenses choices;
- reject new `owner_payout` expense creation/payment at checked RPC boundaries;
- preserve existing owner-payout compatibility rows for Plan 12 classification;
- prevent those rows and new distribution events from both reducing owner balance.

Owner distribution is a liability settlement, not a property operating expense.

### 4. Calculate owner opening and closing balance

Create a reusable owner-balance service over:

- prior closed-period balance or approved opening-balance event;
- owner-allocated operating cash;
- owner-allocated property expenses;
- approved management-fee effects;
- owner contributions;
- owner distributions;
- reserve movements;
- approved adjustments;
- any approved deposit disposition that becomes an owner effect.

The service must allocate shared property activity using effective ownership on each source date and must block ambiguous or non-100% ownership.

Return distinct facts:

- opening owner balance;
- period operating cash received;
- period property expenses paid;
- fees;
- contributions;
- distributions;
- reserve held/released;
- adjustments;
- closing owner balance;
- available-to-distribute amount;
- unresolved exceptions.

### 5. Model reserves narrowly

If IPS uses reserves, add either owner cash event types plus a simple effective reserve policy or a small owner-property reserve record. Do not create a generic treasury module.

Rules must prove:

- reserve target and effective dates;
- opening reserve already held;
- hold/release events;
- whether reserve reduces available-to-distribute but remains part of total owner liability;
- reason and approval for overrides.

If IPS does not use reserves for the October scope, record that decision and omit reserve writes while retaining zero-valued statement fields only if useful.

### 6. Add opening-balance and adjustment controls

Opening balances are required for migrated owners. They must be:

- imported or entered through a checked admin workflow;
- scoped to owner/property/currency and effective date;
- immutable after the first affected period is closed;
- supported by source reference/evidence;
- reversible or corrected through a new approved adjustment, not edited silently.

Adjustments require reason, approval, exact source link, and close visibility.

### 7. Add operational UI

Provide a table-first Owner Balance workspace or a property/owner finance section showing:

- opening, period movement, closing, reserve, and available balance;
- pending/approved/paid distributions;
- contribution and adjustment history;
- exact links to period close, statements, and source events;
- exceptions such as missing opening balance, ambiguous ownership, insufficient available balance, or missing payment reference.

Do not combine this with the owner contact directory or generic company accounting.

## Invariants to preserve

- Owner balance is a liability, not property revenue or expense.
- Owner distribution is not an operating expense.
- Balance is derived from immutable events and closed-period activity.
- One owner cash event appears once in the canonical contract.
- Paid distributions are atomic, idempotent, source-linked, and reversible.
- Original events remain immutable.
- Ownership allocation uses effective dates and exact shares.
- Reserve and available-to-distribute are distinct from total closing liability.
- Cross-organization/property/owner/currency scope is enforced.
- Historical statements remain stable after later distributions.

## Acceptance criteria

1. An approved opening balance plus one complete period produces the expected closing balance equation.
2. Owner contribution increases balance without increasing operating income.
3. Owner distribution reduces balance without increasing property operating expense.
4. Distribution cannot exceed available balance/reserve policy unless an explicitly approved override is supported.
5. Paid distribution creates one owner cash event and projections atomically.
6. Reversal creates an exact opposite event and preserves the original.
7. Multi-owner activity allocates by effective ownership and blocks ambiguous shares.
8. Existing generic owner-payout rows cannot double count after the new workflow is enabled.
9. Closed-period or immutable opening-balance edits are rejected.
10. Cross-organization, non-admin, invalid recipient, mixed currency, duplicate idempotency, insufficient balance, direct-RPC bypass, and duplicate reversal attempts fail.
11. Owner Close can obtain opening, movement, reserve, available, and closing facts without querying generic ledger totals.

## Verification

- RED regression proving current net movement cannot represent money left with IPS across months and that owner payout is exposed without a workflow.
- Pure balance-calculation tests for single owner, split ownership, ownership change, contribution, expense, fee, reserve, distribution, adjustment, and reversal.
- pgTAP for event immutability, idempotency, distribution lifecycle, available-balance enforcement, RLS, scope, period locks, journal balance, and bypass.
- Vitest for loaders, actions, balance tables, payout consequence copy, and source links.
- Full application tests, lint, TypeScript, and build.
- Database reset, lint, generated types, and full pgTAP.
- Authenticated browser flow: opening balance → period activity → contribution → approve/pay distribution → reverse → inspect closing balance.
- Parity artifact and `git diff --check`.

## Scope exclusions

- No owner banking integration or automated payment rail.
- No company-wide treasury or general accounts payable.
- No multi-currency unless IPS production data requires it.
- No owner portal.
- No generic reserve investment/interest accounting.
- No statement publication yet.
- No production opening-balance import; Plan 12 owns cutover.

## Deliverables

- IPS owner-balance, reserve, and payout decision record.
- Append-only owner cash-event and distribution migrations.
- Deterministic balance service and checked workflows.
- Removal/guarding of new generic owner-payout writes.
- Operational balance/distribution UI and exact source links.
- Full tests, generated types, and parity output.
- Draft PR; do not merge without review.

## Stop conditions

Stop if:

- IPS balance scope or reserve/payout rule remains necessary but undocumented;
- closing balance depends on mutable ledger totals;
- distribution is still recorded as an operating expense;
- a paid distribution can commit without its owner cash event/projections;
- ownership ambiguity is silently resolved;
- opening balances can be edited after close; or
- new and compatibility payout paths can both remain effective.
