# Owner Close and Tenant Billing

**Status:** Plans 00 through 04 are merged. Plan 05 is the recommended next
implementation-ready slice; it still requires a separate approved
implementation prompt. Plans 06 onward remain unauthorized.
**Current merged baseline:** `2dea9fb71a539e01ee81b4601f8965fb62a681d5`
after PR #40.
**Plan 04 merge:** PR #39 at
`b592557f3d2919ab5bd7932426fc218a1bea5d4d`.
**Historical planning baseline:** merged `main` at
`823deb4735b8124edefd1e68e451c21f1962b075`.
**Historical external review:** [98-ultra-review-response.md](98-ultra-review-response.md)
— `APPROVE WITH CHANGES`.
**Current sequence authority:** [97-ratified-final-sequence.md](97-ratified-final-sequence.md).
**Current tenant-billing decision authority:**
[96-tenant-billing-reconciliation.md](96-tenant-billing-reconciliation.md).

## Authority order

Use this package in the following order:

1. [97-ratified-final-sequence.md](97-ratified-final-sequence.md) — current
   architecture, sequence, statuses, prerequisites, consumers, and IPS gates.
2. [96-tenant-billing-reconciliation.md](96-tenant-billing-reconciliation.md)
   — current charge, obligation, invoice, receipt, projection, route,
   configuration, cardinality, migration, and Track A/Track B decisions.
3. The narrow current-sequence plan for the slice being prepared:
   [Plan 05](05-atomic-income-settlement.md),
   [Plan 10](10-tenant-invoice-issuance-and-delivery.md), or
   [Plan 11](11-formal-tenant-receipt-publication.md).
4. Accepted [Plan 00](00-architecture-and-decision-gates.md),
   [Plan 01](01-parity-diagnostics-and-safety-rails.md),
   [Plan 02](02-canonical-property-cash-contract.md), the merged Plan 03
   financial-authority kernel evidence, and accepted
   [Plan 04](04-authoritative-lease-terms-and-rent-policy.md).
5. Legacy broad Plans 03 through 12 only as design source material under the
   mapping below.
6. Files [98](98-ultra-review-response.md) and
   [99](99-ultra-review-request.md) as unchanged historical evidence only.

Files 98 and 99 did not review the tenant-billing reconciliation. Do not edit
their conclusions or run another review loop to make them appear current.

## Status and planning classes

- **Merged implementation:** Plans 01 through 04 have repository evidence and
  merged PRs.
- **Current authoritative planning:** this README, files 96 and 97, and a
  narrow current-sequence plan.
- **Legacy/superseded planning:** broad source files whose filename numbers no
  longer equal current sequence numbers.
- **Historical evidence:** files 98 and 99 and older execution plans outside
  this directory.
- **Open proposal:** PR #38 remains catalogue-only, open, and non-authoritative.
- **Outside this change:** PR #40 is already part of the exact baseline; this
  documentation branch does not reproduce or alter its deterministic demo work.

No current document may infer implementation authority from a legacy filename.

## Legacy plan mapping

| Legacy source file | Current sequence slice |
|---|---|
| [02-canonical-property-cash-contract.md](02-canonical-property-cash-contract.md) | 02 — shadow canonical read contract (merged) |
| [03-income-settlement-and-reversal.md](03-income-settlement-and-reversal.md) | 05 — atomic income settlement |
| [04-expense-settlement-and-reversal.md](04-expense-settlement-and-reversal.md) | 06 — atomic expense settlement |
| [05-maintenance-and-petty-cash-handoffs.md](05-maintenance-and-petty-cash-handoffs.md) | 07 — maintenance handoff; 08 — petty cash |
| [06-rent-schedules-and-charge-completeness.md](06-rent-schedules-and-charge-completeness.md) | 04 — authoritative terms/policy; 09 — rent occurrences and obligations |
| [07-security-deposit-custody.md](07-security-deposit-custody.md) | 12 — security-deposit custody |
| [08-management-fee-agreements-and-assessments.md](08-management-fee-agreements-and-assessments.md) | 13 — agreements/calculation; 14 — assessment lifecycle |
| [09-owner-balances-and-distributions.md](09-owner-balances-and-distributions.md) | 15 — owner authority/opening; 16 — owner balance/reserve/distribution |
| [10-property-period-close-and-readiness.md](10-property-period-close-and-readiness.md) | 17 — reconciliation/readiness; 18 — close lifecycle |
| [11-immutable-owner-statement-publication.md](11-immutable-owner-statement-publication.md) | 19 — statement data/approval; 20 — artifacts; 21 — history/delivery |
| [12-backfill-pilot-and-production-cutover.md](12-backfill-pilot-and-production-cutover.md) | 22 — migration manifest; 23 — backfill; 24 — pilot/cutover; 25 — retirement |

Current Plan 10 and Plan 11 are new tenant-document slices; they do not map to
an old broad file. Number references inside frozen legacy sources describe
their historical context and are not current authorization.

## Product objective

Nestory must support one trustworthy operating chain:

```text
Authoritative lease and rent terms
-> expected charge occurrence
-> income obligation
-> tenant invoice draft, review, approval, issuance, and delivery
                 |
                 v
        tenant outstanding balance
                 |
actual money ---> receipt event and allocation
                   |                      |
                   |                      +--> later formal tenant receipt
                   |                           publication and delivery
                   v
        atomic deterministic Ledger/journal projections
                   |
                   v
        owner liability and distribution
        -> reconciliation and property-period close
        -> immutable Owner Statement and separate owner delivery
```

Property/month totals cannot disagree between cash sources, Ledger, journals,
Property Performance, close, and Owner Statement. Agreement does not collapse
their distinct authority.

## Domain boundaries

- A **charge occurrence** proves one term/policy expected a charge for a
  period. It is not a tenant document or payment.
- An **income obligation** is the amount owed. Outstanding derives from the
  obligation minus valid signed allocations.
- A **tenant invoice** is an approved and issued tenant-facing demand with
  immutable economics, source/recipient snapshots, number, artifact, and
  separate delivery history.
- A **receipt event** is actual money received plus its allocation.
- A **formal receipt document** is separately published tenant-facing evidence
  sourced from committed cash.
- **Ledger and journals** are deterministic projections and controls.
- A **property close** fixes one append-only property-period evidence revision.
- An **Owner Statement** is an owner-facing version/artifact for one exact close
  revision. It does not create or deliver tenant documents.

The October safe model is one occurrence to one obligation, at most one
active/current invoice with one obligation-bound line, and one receipt
allocated to one obligation. Cancelled/superseded replacements remain as a
linked historical chain. Multiple sequential partial receipts are supported. Combined invoices,
multi-allocation receipts, unapplied cash, overpayments, advance payments, and
credit notes remain explicit deferred/blocking capabilities.

## Ratified architecture

```text
Domain-owned operational source records
                |
                v
read-only property_cash_events_v1
                |
                v
atomic deterministic Ledger/journal projections
                |
                v
append-only property close revision
                |
                v
immutable Owner Statement version and artifacts
```

Tenant invoices and formal receipt publications are domain-owned document
authorities beside, not inside, the cash projection chain:

```text
occurrence + obligation -> issued tenant invoice
receipt + allocation    -> published formal receipt
```

- Existing domain tables remain canonical writes until a named slice adds a
  specific authority.
- Do not add a writable generic financial-event table.
- Canonical identity is typed by organization, source type, and source ID.
- Allocation IDs become cash-settlement identities after immutable
  classification/scope and direct reversal constraints exist.
- Ledger and journals never become invoice or receipt-document authority.
- Property close is the business lock; broader Ledger/book locks remain
  independent additional controls.
- Issued invoice, published receipt, and Owner Statement bytes/evidence are
  immutable within their separate document families.
- Owner Balance is a liability chain distinct from operating performance.

## Current sequence summary

The full consistency matrix is in
[97-ratified-final-sequence.md](97-ratified-final-sequence.md).

1. Plans 00-04 — architecture, inventory, shadow cash contract, authority
   kernel, and lease/rent policy: complete and merged.
2. Plan 05 — atomic income settlement: recommended next implementation slice.
3. Plans 06-09 — expense, maintenance, petty cash, and rent occurrence
   authority.
4. Plan 10 — tenant invoice issuance and delivery, immediately after Plan 09.
5. Plan 11 — formal tenant receipt publication, sourced from Plan 05 cash and
   Plan 10 invoice identity.
6. Plans 12-16 — deposit, management fee, and owner-liability authority.
7. Plans 17-18 — reconciliation/readiness and append-only close.
8. Plans 19-21 — Owner Statement data, artifacts, and owner delivery.
9. Plans 22-25 — exact migration, backfill, bounded pilot, and compatibility
   retirement.

Implementation order is not event chronology. Plan 05 can make current
obligation settlement safe before Plan 09/10 exist. Plan 10 follows Plan 09
because normal new-business invoice lines require exact occurrence and
obligation links; Plan 22 owns the narrow reviewed legacy-migration exception.
Plan 11 is separate because rendering/delivery failure must not roll back cash.

Plan 09 may merge first only in shadow/readiness mode. Plan 09 and Plan 10
share one activation gate: classified pre-invoice/manual/legacy obligations
may continue to settle by obligation identity, but a newly generated Plan 09
obligation is not collectable through Plan 05 until its exact Plan 10 invoice
line is issued.

## Route and terminology boundary

- Tenant invoice means money requested from a tenant.
- Vendor bill means money the property owes to a vendor.
- Receipt means evidence of incoming money.
- Payment means outgoing money against a vendor bill.
- Income obligation/receivable means an amount owed before settlement.

The future canonical tenant route is `/tenant-invoices`; vendor bills remain
`/bills-expenses`. At cutover, `/invoices` changes from its current direct
vendor redirect to an explicit compatibility/disambiguation page. It must not
silently become a tenant route or remain an unexplained vendor alias.

The existing `/payments` incoming-cash alias also requires an explicit
compatibility/disambiguation step before the term is reused for outgoing
payment. Existing bookmark meaning and query context must remain understandable
through the migration.

## Configuration boundary

PR #38 is catalogue-only. It does not implement or authorize tenant billing.

- Approval mode belongs to a versioned tenant-billing policy; authorization
  belongs to a real role/capability and immutable action record.
- Invoice and receipt formats belong to separate document-series
  configurations.
- Tenant invoice, tenant receipt, and Owner Statement delivery belong to
  separate versioned delivery-channel configurations.
- Timezone and currency belong to controlled organization settings but are
  explicitly snapshotted on each source/document.
- Proration remains Plan 04 effective-dated rent-policy authority.

The pilot requires manual review/approval, retained PDF/print, and recorded
manual delivery unless IPS approves and implementation verifies a narrower
provider-backed policy.

## Shared invariants

Every implementation slice preserves:

- organization, workspace, property, unit, lease, tenant, and role isolation;
- exact numeric money and currency;
- distinct service, due, issue, received, paid, posting, and delivery dates;
- authoritative lease terms and approved effective rent policy;
- stable typed source identity and exact source links;
- immutable issued invoices, receipt events, formal receipt artifacts, and
  Owner Statement versions;
- append-only cancellation, replacement, credit, reversal, and restatement;
- payload-bound idempotency;
- one canonical effect and deterministic required projections;
- balanced journals and source-transaction atomicity;
- property-period serialization and reconciliation-source identity;
- no generic mutation of source-linked projections;
- cash-basis property reporting;
- deposits outside operating income until approved disposition;
- Owner Balance separate from operating performance; and
- no payroll, tax accounting, corporate P&L, general ERP, or product-facing
  general ledger.

## Verification depth

Implementation plans require their named application, database, concurrency,
authorization, browser, failure-recovery, parity, and build evidence.

For this planning-only reconciliation:

- verify terminology and every old/new sequence mapping repository-wide;
- resolve every Markdown link and referenced repository path;
- prove historical files 98 and 99 are unchanged;
- prove only authorized Track A documents changed;
- run available static/document checks and `git diff --check`; and
- inspect the final diff against the exact baseline.

The application/database/browser suites are not run solely for prose changes
unless a repository rule requires them.

## Business-rule stops

Do not invent:

- obligor/recipient and occupancy/term correction semantics owned by Track B;
- invoice/receipt series formats;
- approval exceptions or capabilities;
- delivery channel, consent, reminders, retry, and retention;
- payment-method vocabulary;
- unapplied cash, overpayment, advance payment, refund, or credit treatment;
- deposit application/retention;
- fee calculation/recognition;
- owner reserve/deficit/distribution;
- unpaid bill close treatment;
- statement disclosure/approval/retention/delivery; or
- tax-invoice/statutory requirements.

Unsupported cases block the relevant slice or pilot; they are never coerced
into a supported model.

## Current next step

Prepare a separately approved implementation prompt from
[05-atomic-income-settlement.md](05-atomic-income-settlement.md).

**Mode:** Standard
**Effort:** High
**Reason:** It removes the current split between receipt/allocation truth and
separate mutable obligation-level Ledger/journal posting, while remaining safe
on obligation identity before rent occurrences and invoices are implemented.

This documentation branch does not implement Plan 05 and authorizes no hosted
mutation, deployment, merge, or work from another unmerged branch.

## Required Cross-Plan Amendments

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track B — Lease and Occupancy History | Period-effective obligor and billing recipient | Current lease-party/contact data has no invoice liability/recipient resolver | Define stable checked identities and snapshots; billing contact is not automatically debtor | Plan 10 cannot guess invoice party authority | Yes for Plan 10; no for Plan 05 | Yes |
| Track B — Lease and Occupancy History | Term/party/occupancy correction impact | Plan 04 owns terms while later history/corrections are Track B-owned | Return typed affected occurrence/draft identities; never rewrite issued financial records | Track A must regenerate drafts or append correction evidence safely | Yes for Plans 09-10 | Yes |
| Track B — Lease and Occupancy History | Historical period resolver | Close, statements, and migration need past lease/tenant truth | Preserve predecessor/successor identities and period-effective reads | Current rows cannot rewrite historical document evidence | Yes for Plans 19 and 22 | Yes |
| Configuration registry / PR #38 | Billing-policy, series, and delivery ownership | PR #38 remains open and catalogue-only | Keep non-authoritative; future entries point to the owning versioned/persisted authority | Catalogue defaults cannot drive financial behavior | Yes before Plans 10-11 use configuration | Yes |
