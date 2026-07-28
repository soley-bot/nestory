# Ratified Owner Close Architecture and Final Sequence

**Status:** Final planning decision after one Codex Ultra review.  
**External review verdict:** `APPROVE WITH CHANGES`.  
**Planning baseline:** merged `main` at `823deb4735b8124edefd1e68e451c21f1962b075`.  
**Implementation status:** Plans 00 through 03 are merged. Plan 04 authoritative lease terms and rent-policy contract is the current authorized slice.
**Further architecture-review loop:** No. The Ultra response in `98-ultra-review-response.md` is the single external review. This document records the final Nestory decision.

## Final decision

Nestory will remain an operational property-management and property-accounting product. It will not become the property management company's corporate accounting, payroll, tax, or general ERP system.

The ratified architecture is:

```text
Domain-owned operational write records
                ↓
Read-only property_cash_events_v1 contract
                ↓
Deterministic Ledger and journal projections
                ↓
Property-period close revision
                ↓
Immutable Owner Statement version and artifacts
```

### Canonical authority

- Existing domain tables remain the canonical writes.
- Do not introduce a second writable generic `financial_events` or persisted live reporting table.
- `property_cash_events_v1` is a read-only, versioned, security-invoker view or checked paginated set-returning RPC.
- Canonical event identity is typed: `(organization_id, source_type, source_id)`.
- Receipt and payment allocation IDs may be canonical settlement identities only after material classification/scope is immutable or snapshotted and direct allocation reversal identity is enforced.
- Receipt/payment headers are parent transactions. Their totals must equal allocations, unless an explicit unapplied-cash identity and workflow exists.

### Authority kernel

Before changing settlement writes, Nestory must add one shared financial-authority kernel containing:

- stable property-period headers;
- append-only close revision skeletons;
- a shared property-period serialization and lock order;
- stable organization-scoped reconciliation/cash-source identities;
- payload-bound idempotency requests and canonical payload hashes;
- unique typed Ledger projection identities;
- reserved journal source namespaces;
- trigger/grant guards preventing direct Data API or generic RPC bypass;
- compatibility-wrapper protection against duplicate obligation-level and allocation-level projections.

Property close is the business lock for one property and period. Current organization-month Ledger locks and accounting book-period locks remain broader additional blockers. Closing or reopening one property must not automatically toggle those broader locks.

### Corrections and reversals

- Original economic events are never mutated or deleted to correct history.
- A normal correction creates an exact linked reversal in an open period and cannot predate the original event.
- A published prior statement remains retained evidence.
- Correcting the historical period requires authorized reopen, a new append-only close revision, dated reversal or adjustment, reclose, and replacement publication.
- Reopening withdraws the prior version's current-authority status immediately. It becomes superseded only when the replacement is published.
- Reopening an earlier period marks dependent later periods, opening balances, and statements stale until restated in order.

### Ledger and accounting role

- `ledger_entries` and accounting journals are deterministic projections and controls, not competing product truth.
- Source-linked projections cannot be generically edited, archived, re-dated, posted, or reversed.
- Journals remain balanced and idempotent and stay hidden from ordinary operator workflow.
- Retain the accounting kernel until report/write parity, migration, rollback, and observation evidence is complete.
- Do not build a product-facing general-ledger or chart-of-accounts administration feature.

### Owner liability

Owner Statement activity and Owner Balance are related but distinct.

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

Reserve hold/release normally moves money between available and reserved buckets. It does not change total owner liability.

Security deposits remain custody liabilities until an approved disposition creates a separately classified owner or operating effect.

## Ratified Gate A-I decisions

### Gate A — Reporting contract

Use a read-only view or checked paginated RPC. Persist only immutable close, statement, artifact, and migration-resolution evidence.

### Gate B — Settlement identity

Use typed allocation IDs conditionally. Add immutable classification/scope snapshots or freeze relevant obligation fields after first settlement. Add exact allocation-to-allocation reversal identity and header/allocation balance enforcement.

### Gate C — Reversal policy

Use immutable dated reversals. Normal corrections post in an open period. Historical correction requires reopen and ordered restatement. Generic Ledger/journal reversal of domain projections is forbidden.

### Gate D — Lock hierarchy

Use property-period serialization for business close and writes. Preserve organization Ledger locks and accounting book locks as broader independent controls. All competing writes and close operations acquire the same property-period lock in one documented order.

### Gate E — Management fees

No fee implementation begins until IPS confirms agreement grain, basis, included/excluded categories, assessment versus settlement recognition, rounding, tax, minimum/maximum, waiver, reversal, and worked examples. Do not double-allocate an owner-specific agreement through ownership percentages.

### Gate F — Rent policy

The controlled pilot may be monthly-only if IPS accepts it. Unsupported frequencies and undefined proration cases block generation and close. IPS must confirm due-day/short-month behavior, timezone, start/end/notice proration, rent changes, concessions, and rent-free periods before rent occurrence implementation.

### Gate G — Owner balance and reserves

Pilot default is owner-property-USD, one clean 100% owner per effective period, evidenced opening balance, no reserve writes, no ownership transfer, and no distribution that makes available balance negative. No override exists until IPS defines and approves the policy.

### Gate H — Reconciliation

Every cash-bearing event must reference a stable reconciliation source before new settlement, deposit, petty-cash, owner-cash, or distribution writes are introduced. Pilot variance is zero. A pooled source may be reconciled once externally and referenced through a complete property-subledger manifest; the same evidence cannot be independently treated as reconciled for each property.

### Gate I — Legacy Ledger rows

Classify only through exact evidence:

1. exact existing FK or source identity;
2. explicit immutable adjustment source;
3. evidenced exclusion; or
4. blocking `legacy_unclassified` resolution.

Never fuzzy-match by amount, date, description, or vendor. Existing `BACKFILL-INCOME-*` and `BACKFILL-EXPENSE-*` rows with fallback dates remain inferred and non-authoritative until evidence resolves them.

## Final sequential implementation order

All finance migrations merge sequentially. Parallel development is allowed only after shared contracts stabilize, with rebase, full reset, generated-type comparison, and sequential merge.

| Sequence | Implementation slice | Authorization or stop condition |
|---:|---|---|
| 00 | Ratified architecture and decision gates | Complete in documentation |
| 01 | Read-only current-state inventory, parity diagnostics, and safety rails | First and only implementation slice currently authorized for prompt preparation |
| 02 | Shadow `property_cash_events_v1` read contract and parity manifest | Requires Plan 01 findings; no write or report cutover |
| 03 | Shared financial-authority kernel | Required before any settlement-write change |
| 04 | Authoritative lease terms and IPS rent-policy contract | Requires IPS monthly/due-day/proration examples |
| 05 | Atomic income settlement, allocation, projection, and reversal | Requires Plans 02-03 and reconciliation-source identity |
| 06 | Atomic expense settlement, allocation, projection, and reversal | Requires Plans 02-03; owner payout excluded |
| 07 | Maintenance task-to-bill handoff | Requires IPS cardinality and variance rules |
| 08 | Petty-cash canonical posting, reversal, and register reconciliation | Requires cash date, economic-scope, and variance policy |
| 09 | Idempotent rent occurrences and range generation | Requires Plan 04 policy and authoritative terms |
| 10 | Security-deposit custody and limited disposition | Pilot defaults to receipt/refund until retention/application rules exist |
| 11 | Management-fee agreements and deterministic calculation | Requires all Gate E rules and worked IPS examples |
| 12 | Management-fee assessment, approval, waiver, reversal, and projection | Requires Plan 11 |
| 13 | Owner contribution authority, controlled adjustments, roster correction, and evidenced opening balances | Must remove dual owner-contribution authority |
| 14 | Owner balance, reserve, and distribution lifecycle | Requires IPS reserve/negative/approval policy; pilot may omit reserves |
| 15 | Reconciliation records and deterministic close-check engine | Requires complete source roster and zero-variance evidence |
| 16 | Append-only close, reopen, reclose, dependency invalidation, and readiness UI | Requires Plans 05-15 for enabled event classes |
| 17 | Statement schema, itemized lines, ownership/recipient snapshots, and approval | Every statement references one exact close revision |
| 18 | Immutable official PDF/CSV artifacts, append-only Storage, checked download, and failure recovery | Diagnostic CSV remains separate |
| 19 | Statement history, cancel/reissue, and delivery automation | Deferred beyond manual retained pilot delivery unless needed |
| 20 | Migration run schema, exact resolution workflow, and dry-run manifest | No fuzzy matching; no data mutation |
| 21 | Resumable backfill, interruption recovery, and backup/restore rehearsal | Requires reviewed Plan 20 manifest |
| 22 | Named IPS pilot and explicit report/write cutover | One or two named USD properties and one closed month |
| 23 | Compatibility retirement | Deferred until observation window and explicit acceptance |

## Controlled October pilot boundary

A pilot remains feasible only as a narrow, complete operating cycle:

- one or two named USD properties;
- one closed month;
- monthly leases only;
- one clean 100% owner for each effective period;
- one confirmed reconciliation source per property unless IPS proves a pooled topology;
- evidenced opening owner balance;
- zero accepted variance;
- no ownership change, reserve override, or negative distribution override;
- manual retained PDF and official CSV delivery.

The pilot should still exercise partial receipt/payment, arrears, one maintenance bill, petty-cash property expense, deposit receipt/refund, one IPS-confirmed fee assessment, owner contribution/distribution, carried owner balance, and an open-period reversal.

## Plan authorization

- The architecture is settled. Do not request another Ultra architecture review.
- Plan 01 may be prepared for Codex implementation after the ratified README, Plan 00, and Plan 01 edits are committed.
- Plan 01 is read-only. It may expose ambiguity but may not repair, classify as authoritative, backfill, cut over a report, deploy, or authorize later plans.
- Each later implementation prompt must use the latest merged `main`, the corresponding sequence row above, relevant repository evidence, and only the unresolved IPS rules that actually block that slice.
- Codex must not merge unless explicitly requested.
