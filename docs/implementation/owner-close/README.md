# Owner Close Financial Unification

**Status:** Plans 00 through 03 are merged and complete. Plan 04 authoritative lease terms and rent-policy contract is implemented on its review branch and remains unmerged pending draft-PR review.
**Current merged baseline:** `64d72fcb545fa2feedebb05a2a261af23cc49bd6`, merge commit for PR #37 (`Add shared financial authority kernel`).
**Historical planning baseline:** merged `main` at `823deb4735b8124edefd1e68e451c21f1962b075`.
**External review:** `98-ultra-review-response.md` — `APPROVE WITH CHANGES`.  
**Final Nestory decision:** `97-ratified-final-sequence.md`.  
**Current implementation authorization:** `04-authoritative-lease-terms-and-rent-policy.md` only.

## Authority order

Use these files in this order:

1. `97-ratified-final-sequence.md` — final architecture, decisions, sequence, pilot boundary, and no-review-loop rule.
2. `04-authoritative-lease-terms-and-rent-policy.md` — the current implementation-ready slice.
3. `00-architecture-and-decision-gates.md` and the completed Plan 01-03 evidence.
4. `98-ultra-review-response.md` — retained external review evidence and detailed hazards.
5. Legacy broad Plans 02-12 — design source material only. Their filename numbers and broad boundaries were superseded by file 97 and must not be pasted directly into Codex.
6. `99-ultra-review-request.md` — retained historical review request; do not run it again.

The Ultra response is the single external architecture review. Do not create a loop by asking Ultra to review the correction pass. ChatGPT owns the final synthesis, and Codex Standard + High owns narrow implementation work.

No further Ultra architecture review is required for Plan 02 or Plan 03.

## Legacy plan mapping

The broad source files remain useful analysis, but only the ratified sequence
row and a current implementation-ready file authorize work.

| Legacy source file | Ratified sequence slice |
| --- | --- |
| `02-canonical-property-cash-contract.md` | 02 — shadow canonical read contract (complete) |
| `03-income-settlement-and-reversal.md` | 05 — atomic income settlement |
| `04-expense-settlement-and-reversal.md` | 06 — atomic expense settlement |
| `05-maintenance-and-petty-cash-handoffs.md` | 07 maintenance handoff and 08 petty cash |
| `06-rent-schedules-and-charge-completeness.md` | 04 authoritative terms/policy and 09 rent occurrences/generation |
| `07-security-deposit-custody.md` | 10 — security-deposit custody |
| `08-management-fee-agreements-and-assessments.md` | 11 agreements/calculation and 12 assessment lifecycle |
| `09-owner-balances-and-distributions.md` | 13 owner authority/opening balances and 14 balance/reserve/distribution |
| `10-property-period-close-and-readiness.md` | 15 reconciliation/readiness and 16 close lifecycle |
| `11-immutable-owner-statement-publication.md` | 17 statement data, 18 artifacts, and 19 delivery/history |
| `12-backfill-pilot-and-production-cutover.md` | 20 migration manifest, 21 backfill, 22 pilot/cutover, and 23 retirement |

Charge occurrence generation remains Plan 09. Expense settlement remains Plan
06. The file prefix on a legacy source is not current implementation authority.

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

Review the Plan 04 draft PR from
`04-authoritative-lease-terms-and-rent-policy.md` without merging or deploying
it from this implementation run. Keep charge generation, settlement, close,
and report workflows unchanged. Unknown IPS policy remains explicitly blocked
or unconfirmed.
