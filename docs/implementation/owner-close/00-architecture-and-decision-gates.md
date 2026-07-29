# Plan 00 — Ratified Architecture and Decision Gates

**Mode:** Standard  
**Effort:** High  
**Reason:** Financial authority, corrections, locking, owner liability, reconciliation, and historical evidence must be settled before implementation changes any write path.  
**Status:** Complete in documentation. Do not request another architecture
review. Current implementation status and the later tenant-billing
reconciliation are authoritative in `README.md`,
`96-tenant-billing-reconciliation.md`, and
`97-ratified-final-sequence.md`.

## Context and baseline

Planning and Ultra-review baseline is merged `main` at `823deb4735b8124edefd1e68e451c21f1962b075`.

Repository-verified current behavior:

- `finance_income_items` and `finance_expense_items` model obligations.
- receipts, receipt allocations, payments, and payment allocations model dated settlement activity.
- `lease_deposit_events` models custody activity separately.
- `ledger_entries` remains independently mutable and drives several property/reporting surfaces.
- accounting books, accounts, periods, journals, and lines form a separate compatibility/control kernel.
- Owner Statement reads selected obligations and settlement allocations rather than every operational financial source.
- maintenance and petty cash can create Ledger/journal effects outside the Owner Statement settlement inputs.
- source-linked writes do not yet share one atomic posting, reversal, period-lock, idempotency, or reconciliation-source contract.
- Owner Statement is a live calculation rather than an immutable close-backed publication.

## Ratified product boundary

Nestory is the operational property ledger, owner-liability, property-period close, and owner-reporting system.

Nestory is not the property management company's:

- corporate payroll system;
- overhead or company-wide P&L system;
- tax accounting product;
- product-facing general ledger;
- generic ERP.

A hidden double-entry projection may remain for integrity and compatibility, but ordinary operators must work through property operations and Owner Close.

## Ratified architecture

### 1. Canonical write model

Keep a closed set of domain-owned records as canonical writes:

- obligations and assessments;
- receipt/payment headers and allocations;
- lease charge occurrences;
- deposit custody events;
- petty-cash entries;
- management-fee agreements and assessments;
- owner contributions, distributions, and controlled adjustments;
- exact linked reversals.

Do not add another independently writable generic financial-event table.

Each reportable effect has a typed identity:

```text
(organization_id, source_type, source_id)
```

A bare UUID is not a complete financial identity.

### 2. Canonical reporting contract

Create a versioned `property_cash_events_v1` as either:

- a `security_invoker = true` read-only SQL view; or
- a checked, paginated set-returning RPC that enforces the same organization/role boundary.

It produces property-level rows, not one duplicated row per owner. Owner allocation is performed from the frozen close roster.

Required fields include:

- organization, property, optional unit/lease/task/person identities;
- typed source and parent transaction identities;
- event date and period start;
- obligation/service date when relevant;
- reconciliation source identity;
- currency and exact amount;
- explicit signed owner-liability effect;
- economic class, stable category, and statement section;
- reversal identity and signed reversal effect;
- archive/void/inferred/unsupported classification;
- projection state and calculation-contract version.

The contract has no DML surface and does not silently include unsupported or ambiguous sources.

### 3. Conditional allocation authority

Receipt and payment allocation IDs become canonical settlement-event IDs only after the database enforces:

- immutable or snapshotted organization/property/unit/lease/person/economic/category scope;
- direct allocation-to-allocation reversal identity or an equally strict bijection;
- same organization, property, currency, and obligation for reversal;
- exact opposite amount;
- one reversal per original and no reversal chains;
- header amount equals allocation total, unless an explicit unapplied-cash event owns the residual;
- payload-bound idempotency and unique canonical projection identities.

Do not use obligation-level `ledger_entry_id` compatibility columns as the new settlement authority.

### 4. Shared authority kernel

Before any settlement-write refactor, implement one shared kernel containing:

- stable property-period headers;
- append-only close-revision skeletons and one current revision pointer;
- shared property-period serialization and documented lock order;
- stable organization-scoped reconciliation-source records;
- payload-bound idempotency requests, canonical payload hashes, actor ownership, and result IDs;
- unique typed Ledger projection identity;
- reserved journal source namespaces;
- direct-DML, generic Ledger, generic journal, and compatibility-wrapper bypass guards;
- trigger-level source/period immutability where RLS or grants alone are insufficient.

Identical retry + identical payload returns the original result IDs. A changed payload or cross-actor key reuse fails without leaking prior result IDs.

### 5. Lock hierarchy

- Property close is the business lock for one property/currency/period.
- Current organization-month Ledger locks remain broader additional blockers.
- Accounting book-period locks remain broader additional blockers.
- Closing one property does not lock unrelated properties.
- Reopening one property does not reopen organization or accounting-book periods.
- Source writes, reversals, material parent edits, ownership edits, projection creation, and close use the same property-period serialization order in one transaction.

### 6. Corrections and reversals

- Never mutate/delete an original economic event to correct it.
- Normal correction creates an exact linked reversal in an open period and cannot predate the original.
- A prior published statement remains retained evidence.
- Historical restatement requires authorized reopen, reason, dated reversal or adjustment, new append-only close revision, ordered reclose, and replacement publication.
- Reopen immediately withdraws the prior version's current-authority status.
- The withdrawn version becomes superseded only after replacement publication.
- Reopening an earlier period marks all dependent later periods/opening balances/statements stale until restated sequentially.
- Generic Ledger/journal reversal cannot reverse domain projections independently.

### 7. Ledger and journal role

`ledger_entries` and accounting journals become atomic, idempotent projections and controls.

- Source-linked projections cannot be generically edited, archived, re-dated, posted, or reversed.
- Projections commit in the source transaction.
- A projection failure rolls back the source write; a source failure leaves no projection.
- Journals remain balanced and hidden from ordinary operator workflow.
- The accounting kernel remains until all source/report/write parity, migration, rollback, and observation evidence passes.
- New manual money entry is replaced by a controlled explicit adjustment workflow before generic manual Ledger writes are retired.

### 8. Property close and statement evidence

Use:

- a stable property-period header;
- append-only close revisions/runs;
- a frozen owner roster and recipient/payment-instruction snapshot;
- reconciliation evidence and a source manifest/hash;
- calculation-contract version;
- itemized immutable statement versions and lines;
- immutable per-format artifacts in a dedicated private append-only boundary.

Every statement version references one exact close revision. Current contacts, archive state, ownership edits, or source edits cannot rewrite published evidence.

### 9. Owner liability

```text
Opening total owner liability
+ allocated operating cash received
- allocated property expenses paid
- ratified management-fee liability effects
+ owner contributions
- owner distributions
+/- true owner/property adjustments
= closing total owner liability

available to distribute
= closing total owner liability
- reserved amount
- approved pending or committed deductions
```

Reserve hold/release normally changes available versus reserved buckets, not total liability.

Owner contributions are liability funding, not operating income. Owner distributions are liability reductions, not property expense. Deposits remain custody liabilities until approved disposition creates a separately classified effect.

## Ratified decision gates

### Gate A — Read contract

**Decision:** read-only security-invoker view or checked paginated RPC. No writable or persisted live event table. Persist only close/statement/artifact/migration-resolution evidence.

### Gate B — Cash event identity

**Decision:** allocation IDs conditionally, with typed identity, immutable classification/scope, direct reversal pairing, exact constraints, header/allocation balance, and explicit unapplied cash when needed.

### Gate C — Reversal policy

**Decision:** immutable dated reversal in an open period by default; historical correction uses authorized reopen and ordered restatement. Prior versions remain retained and correctly labeled.

### Gate D — Lock scope

**Decision:** property-period business lock plus existing organization and book locks as broader independent controls. Add the shared kernel before settlement changes.

### Gate E — Management fees

**Decision:** hard stop before fee implementation. IPS must provide agreement grain, basis, categories, recognition timing, rounding, tax, min/max, waiver/reversal, and worked examples. Do not calculate owner-specific and ownership-allocated fees twice.

### Gate F — Rent frequency and proration

**Decision:** monthly-only is the safe pilot default if IPS accepts it. Unsupported frequencies and undefined proration cases block. IPS must define due-day/short-month, timezone, start/end/notice, changes, concessions, and rent-free cases.

### Gate G — Owner balances and reserves

**Decision:** pilot defaults to owner-property-USD, evidenced opening balance, one clean 100% owner per effective period, no reserve writes, no ownership transfer, and no negative distribution or override.

### Gate H — Reconciliation

**Decision:** stable reconciliation-source identity exists before cash-bearing write changes. Pilot variance is zero. Dedicated sources reconcile per property/source/period. Pooled sources reconcile once externally and expose a complete property-subledger manifest referenced by each close.

### Gate I — Legacy Ledger classification

**Decision:** exact evidence only. Link through deterministic IDs/FKs, convert to a controlled immutable adjustment, exclude with explicit evidence, or block as `legacy_unclassified`. Never fuzzy-match. `BACKFILL-*` fallback-dated rows remain inferred until supported by evidence.

## Shared invariants

- One owner-relevant effect in the canonical contract and zero or one required projection of each type.
- Actual cash date is never replaced by due/invoice date and presented as known cash.
- Every cash-bearing event maps to a stable reconciliation source.
- Every close freezes ownership, reconciliation, source manifest, opening-balance dependency, and calculation version.
- Every published artifact is immutable and content-verified.
- Direct Data API, generic RPC, and cross-organization bypasses fail.
- Composite organization-aware constraints protect cross-domain links.
- Reports paginate beyond configured PostgREST/report caps without silent truncation.

## Implementation sequence

The final split order and business-rule stops are authoritative in `97-ratified-final-sequence.md`.

This sentence historically authorized Plan 01 first. Plans 01 through 04 are
now merged. Use `README.md` and `97-ratified-final-sequence.md` for current
status; Plan 00 alone never authorizes a later implementation slice.

## Acceptance criteria

Plan 00 is complete because:

1. the authority model is approved with the corrections above;
2. Gates A-I have explicit decisions or named later-plan stops;
3. the corrected sequence has no circular dependency;
4. the authority kernel precedes write-path refactors;
5. partial payments, reversals, archived history, ownership, deposits, fees, owner cash, legacy rows, close revisions, and artifacts have one defined authority;
6. no second Ultra architecture review is required.

## Scope exclusions

- No migration, code, test, deployment, or production mutation.
- No accounting-kernel retirement during the pilot path.
- No corporate accounting, payroll, tax, multi-currency, generic ERP, or product-facing GL.
- No invented IPS business policy.

## Required Cross-Plan Amendments

This completed plan adds no new implementation authority. Current amendment
detail is authoritative in `96-tenant-billing-reconciliation.md`.

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track B — Lease and Occupancy History | Period-effective lease/party/occupancy authority consumed by later financial plans | Plan 00 fixes append-only source and historical-evidence rules, while Track B owns lease/party history | Preserve stable identities and emit typed financial impact; never rewrite issued/settled Track A history | Later charge, invoice, receipt, and statement sources must remain historically stable | No; Plan 00 is complete | Yes |
