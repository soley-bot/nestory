# Owner Close Financial Unification

**Status:** Architecture ratified after one Codex Ultra review; implementation has not started.  
**Planning baseline:** merged `main` at `823deb4735b8124edefd1e68e451c21f1962b075`.  
**External review:** `98-ultra-review-response.md` — `APPROVE WITH CHANGES`.  
**Final Nestory decision:** `97-ratified-final-sequence.md`.  
**Current implementation authorization:** Plan 01 only, after this documentation correction commit is complete.

## Authority order

Use these files in this order:

1. `97-ratified-final-sequence.md` — final architecture, decisions, sequence, pilot boundary, and no-review-loop rule.
2. `00-architecture-and-decision-gates.md` — ratified technical architecture and Gates A-I.
3. `01-parity-diagnostics-and-safety-rails.md` — the first implementation-ready slice.
4. `98-ultra-review-response.md` — retained external review evidence and detailed hazards.
5. Plans 02-12 — reviewed design source material. Their broad boundaries are superseded by the final split sequence in file 97 and must not be handed directly to Codex as one implementation task.
6. `99-ultra-review-request.md` — retained historical review request; do not run it again.

The Ultra response is the single external architecture review. Do not create a loop by asking Ultra to review the correction pass. ChatGPT owns the final synthesis, and Codex Standard + High owns narrow implementation work.

## Product objective

Nestory must support one trustworthy operating chain:

```text
Lease and authoritative rent terms
→ expected charge occurrence
→ income obligation and tenant outstanding balance
→ receipt and allocation
→ property expenses from bills, maintenance, and petty cash
→ management-fee assessment
→ owner liability and distribution
→ reconciliation and property-period close
→ immutable, itemized Owner Statement
```

A property/month must not have one result in Ledger, another in Property Performance, and another in Owner Statement.

## Ratified architecture

```text
Domain-owned operational write records
                ↓
read-only property_cash_events_v1
                ↓
atomic deterministic Ledger/journal projections
                ↓
append-only property close revision
                ↓
immutable Owner Statement version and artifacts
```

- Existing domain tables remain canonical writes.
- Do not add a writable generic financial-event table.
- Canonical identity is typed by organization, source type, and source ID.
- Allocation IDs become settlement identities only after immutable classification and direct reversal constraints exist.
- Ledger and journals are derived controls, not competing product truth.
- Property close is the business lock; organization Ledger and book-period locks remain broader independent controls.
- Published statement evidence and bytes are immutable.
- Owner Balance is a liability chain distinct from property-period operating performance.

## Final implementation sequence

The detailed final order is in `97-ratified-final-sequence.md`. In summary:

1. read-only financial inventory and parity;
2. shadow canonical read contract;
3. shared authority, lock, reconciliation-source, idempotency, projection, and bypass kernel;
4. authoritative lease-term policy;
5. atomic income and expense settlement paths;
6. maintenance, petty cash, rent occurrence, deposit, fee, and owner-balance integrations;
7. reconciliation and append-only close lifecycle;
8. immutable statement data and artifacts;
9. exact migration/backfill and bounded IPS pilot;
10. compatibility retirement only after an observation window.

All financial migrations merge sequentially. Parallel development is allowed only where the final sequence explicitly permits it, and still requires rebase, full reset, generated-type comparison, and sequential merge.

## Shared invariants

Every implementation slice must preserve:

- organization, property, role, and workspace isolation;
- exact money and currency values;
- distinct obligation/service dates and actual cash dates;
- stable typed source identity and exact source links;
- append-only corrections and directly linked reversals;
- payload-bound idempotency;
- one canonical effect and zero or one projection per required projection type;
- balanced journals and source-transaction atomicity;
- property-period serialization against close and material parent edits;
- historical ownership, recipient, and evidence preservation;
- no direct Data API or generic RPC bypass of source authority;
- no payroll, corporate overhead, tax, generic ERP, or product-facing general-ledger expansion.

## Verification depth

Financial, migration, close, and statement work requires:

- failing regression evidence before the fix when practical;
- focused and full application tests;
- lint, TypeScript, production build, and `git diff --check`;
- database reset, schema lint, generated-type drift check, and full pgTAP;
- actual privilege, RLS, private-helper, direct-DML, and direct-RPC bypass tests;
- two-session close-versus-write and retry/projection races;
- forced atomic-failure tests;
- stateful authenticated browser verification;
- pagination and production-shaped performance evidence;
- exact branch, commit, schema, environment, and deployment evidence for any authorized release.

## Business-rule stops

Read-only Plan 01 is not blocked by unresolved IPS policy. Later plans stop at the named boundary in file 97 when IPS rules are still unknown, particularly:

- reconciliation account/source topology;
- rent due-day, proration, concessions, and non-monthly frequency;
- maintenance task-to-bill cardinality;
- petty-cash economic scope and variance;
- deposit application or retention;
- management-fee calculation and recognition;
- owner reserves, deficits, distributions, and ownership transfer;
- unpaid bill close treatment;
- statement disclosure, approval, retention, and delivery.

Do not invent policy to keep implementation moving. Unsupported cases must block clearly.

## Current next step

Prepare one Codex implementation prompt for Plan 01 only. Plan 01 must remain read-only, deterministic, paginated, fail-closed, environment guarded, and limited to local/test fixtures unless production diagnostic access is separately authorized. It must not repair data, backfill, cut over reports, deploy, or authorize Plan 02.
