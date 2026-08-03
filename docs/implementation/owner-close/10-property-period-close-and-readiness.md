# Plan 10 — Property-Period Close and Readiness

> **Legacy broad design source — not current Plan 10.** The ratified sequence
> split this analysis into **sequence 15, reconciliation/readiness**, and
> **sequence 16, append-only close lifecycle**. Use
> `97-ratified-final-sequence.md`; do not paste this file directly into Codex.
>
> The current Finance simplification removes controls that imply close
> authority is ready. Its table/modal redesign does not implement sequence
> 15-16 reconciliation or close.

**Mode:** Standard  
**Effort:** High  
**Reason:** Owner Statement readiness must prove a complete, reconciled property month rather than only valid ownership or zero technical posting queues.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin only after Plans 03-09 are merged and their canonical events pass parity diagnostics.

Current `getFinanceCloseSummary` counts four technical queues: received income ready to post, approved bills ready to post, cleared petty cash ready to post, and accounting rows missing journal links. Owner Statement rows become Ready when ownership allocation succeeds, even if expected charges, payments, fees, deposits, owner balances, and reconciliation are incomplete.

## Objective

Introduce a property-month close that computes explicit business blockers, requires reconciliation evidence and review, locks every owner-relevant source, and becomes the only gateway to an approved Owner Statement.

## Verified current behavior

- `ledger_period_locks` are organization-month locks that protect ledger and financial timeline updates.
- Accounting periods separately protect journal posting.
- Receipt, payment, and deposit event dates currently require broader lock coverage.
- Existing close UI is a technical ledger queue, not a property-by-property owner close.
- Ownership allocation code can identify ambiguous effective shares.
- Reports and statements are live and can change after archive, reversal, ownership, or contact edits.

## Required changes

### 1. Add property reporting periods

Create `property_reporting_periods` with:

- organization, property, period start, and currency;
- status: open, in review, closed, reopened, or an equivalent explicit lifecycle;
- readiness/calculation version;
- opened/review-started/closed/reopened actors and timestamps;
- close and reopen reason;
- approved owner roster snapshot/hash;
- reconciliation status and evidence identity;
- source manifest/hash at close;
- latest statement generation state;
- unique property-period-currency row.

Do not use an organization-wide technical lock as the business close record.

### 2. Build a deterministic close-check engine

Create a checked SQL/TypeScript service that returns stable blocker/warning codes, counts, amounts, exact record links, and repair actions.

Minimum close blockers:

#### Lease and rent

- every eligible lease has a generated, waived, cancelled, or explicitly blocked charge occurrence;
- no duplicate or conflicting occurrence/obligation;
- unsupported frequency or unresolved proration is blocked;
- outstanding rent is known from obligations and allocations, not missing rows.

Outstanding tenant balances may be allowed when correctly recorded; missing or ambiguous obligations are not.

#### Receipts

- every receipt amount is fully allocated or explicitly classified as unapplied cash under an approved workflow;
- all allocations have canonical ledger/journal projections;
- no unresolved receipt reversal or period mismatch;
- no duplicate or orphan receipt representation.

If unapplied cash is not implemented for October, any unallocated receipt is a blocker.

#### Expenses and operational handoffs

- all owner-relevant bills have valid approval/payment state;
- every paid allocation has projections;
- maintenance actual-cost records have an explicit no-cost or valid finance handoff outcome;
- petty-cash entries are posted/reconciled or explicitly excluded with reason;
- no possible duplicate maintenance/bill/petty-cash effect;
- no unresolved payment reversal or orphan ledger row.

Unpaid approved bills may be disclosed rather than block cash close if IPS confirms that policy; missing/ambiguous handoffs remain blockers.

#### Deposits

- held balance is non-negative and reconciles to immutable events;
- expected-but-not-received and released deposits are distinguishable;
- applications/retentions have valid targets;
- no duplicate deposit-income representation;
- deposit cash/journal projections are complete.

#### Management fees

- every required agreement has one approved or explicitly waived assessment;
- calculation source hash is current;
- unsupported or overlapping agreement is blocked;
- assessment/settlement projections are complete.

#### Owner balances

- ownership shares are valid for every relevant source date;
- opening owner balance exists for the first managed period or prior closed balance exists;
- owner contributions, distributions, reserves, and adjustments are reconciled;
- distributions do not violate available-balance policy;
- no unresolved compatibility owner-payout row.

#### Reconciliation and evidence

- receipts, payments, petty cash, owner distributions, and deposit movements have a reviewed reconciliation result against the approved cash/bank evidence for the period;
- required invoices/receipts or approved missing-evidence exceptions are present;
- no Critical parity diagnostic remains;
- no unclassified legacy manual ledger row affects the property-period.

#### System controls

- canonical event totals equal derived Ledger projection totals by economic class;
- required journals are present, balanced, and source-linked;
- no conflicting ledger/accounting period state;
- all source dates are in the selected period and currency.

Warnings may remain for non-material or explicitly accepted exceptions, but close must store who accepted them and why.

### 3. Add a minimal reconciliation entity

Implement the smallest approved reconciliation record, for example `property_cash_reconciliations`, containing:

- property, period, currency, account/source label;
- expected system inflow/outflow/closing facts;
- imported or entered evidence totals;
- variance;
- status: draft, matched, accepted variance, rejected;
- evidence document/file link;
- reviewed actor/date and variance reason;
- source manifest/hash.

This is not a full bank-reconciliation product. It exists to prove that recorded cash activity was reviewed against external evidence.

If IPS operates several bank/cash accounts per property, the entity must support account-level rows without building a general ledger UI.

### 4. Implement close lifecycle

#### Open → In review

- generate/catch up expected charges;
- calculate close checks;
- freeze no data yet;
- allow repairs through source workflows.

#### In review → Closed

One checked transaction must:

- re-run all blockers under row locks;
- reject stale readiness calculations;
- require accepted reconciliation;
- snapshot owner roster and source manifest/hash;
- set the property period closed;
- establish source-write lock coverage for all canonical event tables;
- align or validate compatibility ledger/accounting locks;
- create statement-generation work state;
- log actor and close reason.

#### Closed → Reopened

- admin only;
- mandatory reason;
- preserve prior close record and published statement versions;
- unlock the approved scope according to policy;
- mark new source changes as requiring a new close and statement version;
- never modify an already published statement artifact.

### 5. Enforce source locks

Add database-level checks to every owner-relevant write path:

- lease charge occurrence/obligation changes;
- receipt/payment/allocation creation and reversal;
- deposit events;
- maintenance finance handoffs;
- petty-cash posting/reversal;
- management-fee assessments;
- owner cash events/distributions;
- explicit adjustments;
- source-linked ledger/journal projection creation.

Do not rely on disabled UI controls. Direct RPC/API bypass must fail.

The approved policy must distinguish:

- posting a current-period reversal of an older event; and
- reopening/restating the older property period.

### 6. Replace current readiness presentation

Create an Owner Close workspace, preferably property-month table-first, showing:

- property and owner context;
- open/in review/closed/reopened state;
- blocker/warning counts;
- charge completeness;
- receipts/outstanding/unapplied cash;
- expense/handoff state;
- deposits;
- fee assessment;
- owner opening/closing/available balance;
- reconciliation variance;
- last reviewer and next action;
- drill-down links to exact records.

The existing Ledger close strip may become a projection-health subsection or link to Owner Close. It must no longer label a month Ready solely because four technical queues are zero.

The generic Owner Statement report must not show Ready for an open or incomplete property period.

## Invariants to preserve

- Readiness is deterministic and source-backed.
- Outstanding balances can exist without making data incomplete.
- Missing charges, orphan cash, duplicate effects, ambiguous ownership, and unresolved reconciliation cannot be treated as zero.
- Close is property-period-currency scoped and organization isolated.
- Close validation and lock transition are atomic.
- Database writes, not only UI, enforce locks.
- Published statements remain immutable after reopen.
- Reopen is audited and requires a new close/version.
- Ledger and journal are controls/projections, not independent close sources.
- Reconciliation evidence is durable and private.

## Acceptance criteria

1. A property with no generated expected rent cannot be marked Ready merely because totals are zero.
2. A property with valid recorded arrears can close when all data is complete and IPS policy allows outstanding balances.
3. Every blocker returns an exact repair link and stable code.
4. Closing with any Critical blocker or unmatched reconciliation fails at the database boundary.
5. A successful close snapshots owner roster and source manifest/hash and locks all canonical source writes.
6. Direct receipt/payment/deposit/fee/owner event writes into a closed property-period fail.
7. Approved open-period reversal behavior follows the ratified policy and does not mutate the published prior statement.
8. Reopen requires reason, preserves prior close/audit, and marks a new version required.
9. Canonical, Ledger, and journal totals match at close by economic class.
10. Cross-organization, non-admin, stale-check, lock-bypass, duplicate-close, and invalid-reopen attempts fail.
11. Owner Statement generation is blocked until the property-period is closed.

## Verification

- RED regressions for false Ready with zero charges, payment/ledger mismatch, maintenance expense omission, and mutable closed-period source events.
- pgTAP for every blocker family, close transaction, stale-check rejection, RLS, bypass, source locks, reopen, reconciliation, owner roster snapshot, source hash, and journal/ledger parity.
- Vitest for close loader, deterministic codes, table states, repair links, and error mapping.
- Full application tests, lint, TypeScript, and build.
- Database reset, lint, generated types, and full pgTAP.
- Authenticated browser flow on one complete property month plus each representative blocker and reopen path.
- Production-shaped performance test for a realistic IPS portfolio/month.
- `git diff --check`.

## Scope exclusions

- No general bank-reconciliation module, check printing, or treasury platform.
- No company-wide accounting close.
- No tax close, payroll, or corporate P&L.
- No Owner Statement PDF implementation; Plan 11 owns publication.
- No production cutover/backfill; Plan 12 owns it.
- No silent auto-resolution of ambiguous legacy data.

## Deliverables

- Append-only property-period and reconciliation migrations.
- Deterministic blocker/warning engine and exact repair links.
- Atomic close/reopen RPCs and source-lock enforcement.
- Owner Close workspace and replacement of false readiness messaging.
- Full tests, generated types, performance evidence, and parity report.
- Draft PR; do not merge without review.

## Stop conditions

Stop if:

- close can succeed without charge completeness or reconciliation;
- lock enforcement does not cover every canonical source table;
- a warning can hide a material unresolved financial mismatch;
- close totals depend on generic live Ledger aggregation;
- reopening overwrites prior close or statement history;
- the reconciliation design expands into generic accounting; or
- IPS policy for unpaid bills, unapplied cash, accepted variance, or reversal timing is required but unresolved.
