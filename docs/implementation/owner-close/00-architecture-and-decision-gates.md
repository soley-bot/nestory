# Plan 00 — Architecture and Decision Gates

**Mode:** Standard  
**Effort:** High  
**Reason:** Financial authority, reversals, period locking, owner liability, and historical reporting must be settled before implementation can be safely divided.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`.

Repository-verified current behavior:

- `finance_income_items` and `finance_expense_items` model obligations.
- `finance_receipts`, `finance_receipt_allocations`, `finance_payments`, and `finance_payment_allocations` model dated settlement activity.
- `lease_deposit_events` separately models deposit custody activity.
- `ledger_entries` remains independently editable and is used by property records, Unit Performance, Property Performance, Income & Expense, maintenance cost, petty cash, and the Ledger screen.
- Accounting books, accounts, periods, journals, and lines form a separate compatibility kernel.
- Owner Statement currently reads selected obligations and settlement allocations, not the operational ledger.
- Source-linked financial flows do not share one atomic posting, reversal, and period-lock contract.
- Owner Statement is a live report, not a persisted period close or immutable statement version.

The product boundary remains property operations and property accounting. The architecture must not turn Nestory into the property management company's corporate accounting, payroll, tax, or general ERP system.

## Objective

Ratify one financial authority model and the minimum business rules required by Plans 01-12. This plan produces an approved architecture decision, not product code.

## Proposed architecture

### 1. Canonical write model

Do not introduce a second generic `financial_events` table as another independently writable source unless Ultra proves it is necessary.

The canonical write model is a closed set of domain-owned records:

- Obligations: income items, expense items, lease charge occurrences, and management-fee assessments.
- Settlements: receipt allocations and payment allocations.
- Custody: lease deposit events.
- Owner liability: owner cash events and owner distributions.
- Operational expense sources: petty-cash entries and finance expense items linked from maintenance.
- Explicit corrections: reversals and narrowly controlled adjustment events.

Each reportable effect must have one stable source identity. For allocation-based cash activity, the allocation row is the reportable identity because it carries the obligation classification and amount. A receipt or payment header may support multiple allocations later without changing statement identity.

### 2. Canonical reporting read model

Add one normalized, versioned property-cash event contract, provisionally named `property_cash_events_v1`.

Preferred implementation is a security-invoker SQL view or checked RPC plus a feature-owned TypeScript adapter. It must produce one row per owner-relevant effect with at least:

- `organization_id`
- `property_id`
- optional `unit_id`, `lease_id`, `task_id`, owner, tenant, and vendor identities
- `event_date`
- `period_start`
- `currency`
- exact positive amount plus an explicit signed owner-cash effect
- economic class: operating income, operating expense, management fee, owner contribution, owner distribution, reserve movement, deposit custody, or adjustment
- statement section and stable category code
- `source_type` and `source_id`
- original source identity for reversals
- reversal flag and signed effect
- projection state for ledger and journal controls
- archive/void semantics that cannot silently remove a historical effect

The contract is the only live source used by Owner Close, Owner Statement drafts, Property Performance, Unit Performance cash facts, Income & Expense cash reporting, and the financial summary shown on property records after cutover.

### 3. Ledger and journal role

`ledger_entries` and accounting journals become deterministic projections and controls, not competing sources of business truth.

- A source-linked ledger row cannot be generically edited, archived, or re-dated.
- Corrections occur through the source workflow, reversal, or an explicit adjustment event.
- New projections use the canonical event source identity, not an obligation ID when the actual cash event is an allocation.
- Journal posting remains balanced, idempotent, and hidden from ordinary operator workflow.
- Existing manual ledger rows remain readable and are classified during backfill. New manual money entry is eventually replaced by an explicit adjustment workflow.
- Compatibility columns such as one `ledger_entry_id` on an obligation may remain temporarily but cannot define the new authority.

### 4. Close and statement role

A property reporting period is the operational close object.

- Readiness is computed from business completeness, not merely ownership validity or technical posting queues.
- Closing locks every source date used by the canonical event contract.
- A close stores the approved owner roster, reconciliation state, exception resolution, and source manifest/hash.
- Owner Statements are immutable versions generated from a closed property period.
- Reopening requires a reason. Published versions remain immutable; any corrected statement is a new version that supersedes the prior version.

### 5. Owner liability model

The Owner Statement and Owner Balance are related but distinct:

- Owner Statement explains one property's period activity for one owner.
- Owner Balance is the amount the property management company holds for or owes to that owner after prior balance, period activity, fees, reserves, contributions, and distributions.

Proposed equation:

```text
Opening owner balance
+ Allocated owner operating cash received
- Allocated property expenses paid
- Approved management fees
+ Owner contributions
- Owner distributions
+/- Reserve movements and approved adjustments
= Closing owner balance
```

Security deposits remain a separate custody liability and disclosure unless IPS explicitly treats a released or retained deposit as an owner operating effect.

## Decision gates Ultra must resolve

Ultra must return an explicit decision for each item.

### Gate A — View/RPC versus persisted event table

Proposed decision: use existing domain records as the write model and a normalized view/RPC as the live read model. Persist only close/statement snapshots.

Reject this only if the current schema cannot guarantee performance, source identity, lock behavior, or historical reproducibility without a persisted event table.

### Gate B — Cash event identity

Proposed decision: receipt allocation and payment allocation IDs are canonical cash event identities. Receipt/payment headers are transaction containers. Deposit events, petty-cash entries, owner cash events, fee assessments, and adjustment events retain their own IDs.

### Gate C — Reversal policy

Proposed decision:

- Never mutate or delete the original event.
- A reversal is a new event with its own date and exact original amount/effect.
- An open period may receive a reversal of a prior closed-period event, but the already published prior statement remains unchanged.
- Correcting the historical statement itself requires reopening the property period and publishing a new version.

Ultra must confirm whether any source must instead require reopening before reversal.

### Gate D — Period-lock scope

Proposed decision: one property reporting-period lock governs all owner-relevant source event dates; compatibility ledger and accounting periods may remain but must agree mechanically.

Ultra must identify whether the current organization-wide `ledger_period_locks` can be safely evolved or whether a property-scoped lock must coexist during migration.

### Gate E — Management-fee recognition

IPS must confirm whether initial fees are:

- fixed monthly;
- percentage of collected rent;
- percentage of charged rent; or
- a supported combination.

The implementation must also distinguish fee assessment from actual internal transfer/collection where IPS requires that distinction. No generic rule engine should be built before the real contracts are documented.

### Gate F — Rent proration

IPS must confirm the initial proration convention and whether current production scope is monthly leases only. Unsupported payment frequencies must become explicit close blockers rather than silently receiving monthly full charges.

### Gate G — Owner reserves and negative balances

IPS must confirm:

- whether minimum owner reserves exist;
- whether distributions may exceed available owner balance;
- how owner-funded deficits are recorded; and
- whether balance is tracked by owner-property or owner across the whole portfolio.

Proposed initial scope is owner-property-currency, with negative distributions blocked unless an authorized override and reason are recorded.

### Gate H — Reconciliation evidence

Proposed October scope is not a bank-reconciliation product. Close must still require evidence that recorded receipts, payments, petty cash, distributions, and deposit movements agree with an imported statement, cash register, or reviewed reconciliation record.

Ultra must recommend the smallest durable reconciliation entity that proves this without expanding into general accounting.

### Gate I — Legacy manual ledger entries

Each legacy row must become one of:

- linked to an existing canonical source;
- converted to an explicit adjustment event;
- preserved as a frozen legacy event with a documented classification; or
- blocked as ambiguous for operator resolution.

Unknown rows must never be silently included or excluded.

## Invariants to preserve

- Organization isolation and admin-only finance writes.
- Exact money and USD compatibility.
- Append-only migrations and backward-compatible reads.
- Balanced journals and idempotent posting.
- Existing operational links, documents, timeline, and activity history.
- Property and unit context on every reportable event.
- No generic accounting UI or corporate P&L expansion.
- No removal of current tables during the migration sequence.

## Acceptance criteria

Plan 00 is approved only when:

1. Ultra returns `APPROVE` or `APPROVE WITH CHANGES` for the authority model.
2. Every decision gate has an explicit answer, owner, or implementation stop condition.
3. The final sequence has no circular dependency.
4. Each later plan can be implemented and merged without relying on an unspecified future repair.
5. The architecture explains how partial payments, reversals, archived records, historical ownership, deposits, fees, owner payouts, and manual legacy rows appear exactly once.
6. The chosen model can produce identical cash totals across property records, Ledger projection, performance reports, Owner Close, Owner Statement, and journal controls.

## Verification

Architecture review must inspect the latest versions of:

- finance obligation, settlement, and reversal migrations;
- ledger and accounting migrations and tests;
- Owner Statement data loaders and allocation logic;
- property cash helpers and finance close summary;
- maintenance and petty-cash posting paths;
- current RLS and checked RPC boundaries;
- current-state, engineering, and verification documentation.

No implementation checks are required because this plan changes no code. The review response must cite exact repository paths and current commit evidence.

## Scope exclusions

- No database migration.
- No code changes.
- No production data access or mutation.
- No replacement of Supabase, Next.js, the accounting kernel, or existing modules.
- No generic workflow engine, multi-currency, payroll, tax, or company accounting.

## Deliverables

- Approved or amended architecture decision.
- Explicit answers to Gates A-I.
- Revised dependency sequence if needed.
- List of missing invariants or repository facts.
- Clear authorization to begin Plan 01 only.

## Stop conditions

Stop before implementation if:

- financial authority remains ambiguous;
- Ultra finds a current merged change that invalidates the baseline;
- the plan would require destructive replacement of production tables;
- IPS fee, proration, reserve, or payout rules are necessary for an immediate plan but still unknown;
- one event can still reach the Owner Statement through more than one un-deduplicated source; or
- the proposal expands into corporate/general accounting rather than property Owner Close.
