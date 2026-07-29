# Owner Close and Tenant Billing

**Status:** Plans 00 through 05 are implemented. Plan 06 onward remains
unauthorized and requires a separate approved implementation prompt.
**Current reconciliation baseline:**
`5210ae1c94fa5a854f9c484b79e9dbd214c99053` after the documentation-only
Track B PR #42 merge.
**Original Track A runtime-audit baseline:**
`2dea9fb71a539e01ee81b4601f8965fb62a681d5` after PR #40.
**Plan 04 merge:** PR #39 at
`b592557f3d2919ab5bd7932426fc218a1bea5d4d`.
**Historical planning baseline:** merged `main` at
`823deb4735b8124edefd1e68e451c21f1962b075`.
**Historical external review:** [98-ultra-review-response.md](98-ultra-review-response.md)
— `APPROVE WITH CHANGES`.
**Current sequence authority:** [97-ratified-final-sequence.md](97-ratified-final-sequence.md).
**Current tenant-billing decision authority:**
[96-tenant-billing-reconciliation.md](96-tenant-billing-reconciliation.md).
**Merged Track B amendment source:**
[92-required-cross-plan-amendments.md](../lease-occupancy-history/92-required-cross-plan-amendments.md).

## Authority order

Use this package in the following order:

1. [97-ratified-final-sequence.md](97-ratified-final-sequence.md) — current
   architecture, sequence, statuses, prerequisites, consumers, and IPS gates.
2. [96-tenant-billing-reconciliation.md](96-tenant-billing-reconciliation.md)
   — current charge, obligation, invoice, receipt, projection, route,
   configuration, cardinality, migration, and Track A/Track B decisions.
3. Track B
   [92-required-cross-plan-amendments.md](../lease-occupancy-history/92-required-cross-plan-amendments.md)
   — accepted relationship/date evidence inputs and cross-track requirements;
   it does not authorize Track A financial implementation.
4. The narrow ratified plan or unnumbered coordination slice being prepared:
   [Plan 05](05-atomic-income-settlement.md),
   [tenant invoice](10-tenant-invoice-issuance-and-delivery.md), or
   [formal receipt](11-formal-tenant-receipt-publication.md). The latter two
   filenames are local coordination aliases, not ratified Plan 10/11 numbers.
5. Accepted [Plan 00](00-architecture-and-decision-gates.md),
   [Plan 01](01-parity-diagnostics-and-safety-rails.md),
   [Plan 02](02-canonical-property-cash-contract.md), the merged Plan 03
   financial-authority kernel evidence, and accepted
   [Plan 04](04-authoritative-lease-terms-and-rent-policy.md).
6. Legacy broad Plans 03 through 12 only as design source material under the
   mapping below.
7. Files [98](98-ultra-review-response.md) and
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
- **Original audit input:** PR #40 is part of the original runtime-evidence
  baseline; this branch does not reproduce or alter its deterministic demo
  work.
- **Merged planning input:** PR #42 is present at the reconciliation baseline
  and contributes Track B planning only—no runtime, schema, migration, type,
  test, seed, configuration, hosted, or deployment behavior.

No current document may infer implementation authority from a legacy filename.

## Legacy plan mapping

| Legacy source file | Current sequence slice |
|---|---|
| [02-canonical-property-cash-contract.md](02-canonical-property-cash-contract.md) | 02 — shadow canonical read contract (merged) |
| [03-income-settlement-and-reversal.md](03-income-settlement-and-reversal.md) | 05 — atomic income settlement |
| [04-expense-settlement-and-reversal.md](04-expense-settlement-and-reversal.md) | 06 — atomic expense settlement |
| [05-maintenance-and-petty-cash-handoffs.md](05-maintenance-and-petty-cash-handoffs.md) | 07 — maintenance handoff; 08 — petty cash |
| [06-rent-schedules-and-charge-completeness.md](06-rent-schedules-and-charge-completeness.md) | 04 — authoritative terms/policy; 09 — rent occurrences and obligations |
| [07-security-deposit-custody.md](07-security-deposit-custody.md) | 10 — security-deposit custody |
| [08-management-fee-agreements-and-assessments.md](08-management-fee-agreements-and-assessments.md) | 11 — agreements/calculation; 12 — assessment lifecycle |
| [09-owner-balances-and-distributions.md](09-owner-balances-and-distributions.md) | 13 — owner authority/opening; 14 — owner balance/reserve/distribution |
| [10-property-period-close-and-readiness.md](10-property-period-close-and-readiness.md) | 15 — reconciliation/readiness; 16 — close lifecycle |
| [11-immutable-owner-statement-publication.md](11-immutable-owner-statement-publication.md) | 17 — statement data/approval; 18 — artifacts; 19 — history/delivery |
| [12-backfill-pilot-and-production-cutover.md](12-backfill-pilot-and-production-cutover.md) | 20 — migration manifest; 21 — backfill; 22 — pilot/cutover; 23 — retirement |

The ratified sequence remains `00` through `23`: Plan 10 is security-deposit
custody, Plan 11 is management-fee agreements/calculation, and Plan 12 is
management-fee assessment. The tenant-invoice and formal-receipt filenames are
prominent unnumbered coordination slices retained for stable links. Track B
file 92 uses the same local aliases only for coordination; it creates no
translation and does not renumber any ratified Owner Close plan.

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

Track B owns accepted, versioned Lease-party, occupancy, participant,
relationship-date, notice, boundary/confidence/resolution, and transition
evidence. Its checked relationship-evidence envelope returns exact source
IDs/versions, reasons, and a material hash. Track A owns the financial use of
that evidence: Plan 04/09 term-policy interpretation, debtor/recipient
selection, calculation dates, due date, proration/notice, blockers, approved
calculation snapshot/hash, and every downstream financial state/action.
`billing_contact` is recipient/contact evidence only and never automatic
debtor authority.

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
- Every Track A financial owner exposes a versioned read-only adapter for exact
  source identities, owner-classified states/actions, material hash, and all
  affected property/currency/period scopes. A composed executor acquires every
  source/destination property-period lock in deterministic order inside the
  same transaction before invoking the selected owner action.
- Generic Documents owns operational-document versioning/supersession. Track A
  owns tenant invoice, formal tenant receipt, close, and Owner Statement
  versions/artifacts and freezes exact generic-document version/checksum
  references used by close.

## Current sequence summary

The full consistency matrix is in
[97-ratified-final-sequence.md](97-ratified-final-sequence.md).

1. Plans 00-04 — architecture, inventory, shadow cash contract, authority
   kernel, and lease/rent policy: complete and merged.
2. Plan 05 — atomic income settlement: implemented; hosted release remains
   separately authorized.
3. Plans 06-09 — expense, maintenance, petty cash, and rent occurrence
   authority.
4. Plan 10 — security-deposit custody and limited disposition.
5. Plans 11-12 — management-fee agreement/calculation and assessment.
6. Plans 13-14 — owner authority, balance, reserve, and distribution.
7. Plans 15-16 — reconciliation/readiness and append-only close.
8. Plans 17-19 — Owner Statement data, artifacts, and owner delivery.
9. Plans 20-23 — exact migration, backfill, bounded pilot, and compatibility
   retirement.

Two planned tenant-document coordination slices remain outside the numeric
sequence: tenant invoice follows Plan 09, and formal receipt consumes Plan 05
cash plus issued tenant-invoice identity.

Plan 05 is implemented independently from Track B. Plan 09 later waits for
merged TB-05 relationship evidence; Plan 05 does not.

Implementation order is not event chronology. Plan 05 can make current
obligation settlement safe before Plan 09 or tenant invoicing exists. The
unnumbered tenant-invoice slice follows Plan 09 because normal new-business
invoice lines require exact occurrence and obligation links; ratified Plan 20
owns the narrow reviewed legacy-migration exception. The unnumbered
formal-receipt slice is separate because rendering/delivery failure must not
roll back cash.

Plan 09 may merge first only in shadow/readiness mode. Plan 09 and the
tenant-invoice coordination slice share one versioned activation gate. Before
that gate, current manual obligations retain Plan 05's existing path without a
future Plan 20 manifest. After the gate, Plan 09 is the sole normal creator of
rent obligations and a new obligation is not collectable through Plan 05 until
its exact issued tenant-invoice line exists. Plan 20 independently freezes each
legacy obligation's future `legacy_obligation_only` or
`migration_invoice_required` remaining-balance disposition and each historical
allocation's settlement/publication class. Earlier
`legacy_cash_non_publishable` cash may coexist with a migration-invoice
requirement for the remaining balance; only a later allocation that freezes the
issued invoice becomes publishable, and no prior cash is retargeted. Manual
labels, caller flags, backdated dates, and current relationship joins cannot
create those statuses; the action, checked/legacy RPCs, and direct DML reject
post-cutover manual rent. Plan 22 fails closed if either the locked
obligation/disposition set or the receipt/allocation/reversal classification
set, versions, signed net, or material hash drifts from the reviewed Plan 20
manifest.

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

- accepted relationship/date evidence semantics owned by Track B, or the
  debtor/recipient, calculation, and financial-action decisions owned by
  Track A;
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

No later Track A implementation slice is authorized by this package. Plan 06
remains planned and requires its own approved implementation prompt. Hosted
Plan 05 migration, backfill, deployment, and release verification also remain
separate activities.

## Required Cross-Plan Amendments

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track B — Lease and Occupancy History | Versioned relationship/date evidence envelope | Current Lease-party/contact/occupancy rows do not by themselves define debtor, recipient, or financial date precedence | TB-05 returns exact accepted candidates, source IDs/versions, boundary/confidence/resolution/reasons, and material hash. It does not select debtor/recipient or calculate rent; `billing_contact` is not automatic debtor authority | Plan 09 and the unnumbered tenant-invoice slice need reproducible evidence without authority transfer | Yes for Plan 09 and tenant invoicing; no for Plan 05 | No before Plan 09 |
| Track A Plan 09 | Historical term/policy calculation and approved snapshot | Plan 04 owns terms while Track B supplies actual/scheduled/notice evidence | Track A selects term/policy, debtor/recipient, calculation/due/proration outcomes and blockers, then stores the approved snapshot/hash naming selected/ignored evidence | Occurrences and invoices need one financial calculation authority | Yes for Plan 09 | No |
| Track A domain owners | Typed impact adapters/actions and deterministic locks | Relationship corrections can affect occurrences, drafts, settlements, close, and artifacts | Each owner returns exact identities/states/actions/scopes/hash; composed execution locks every source/destination property-period in deterministic order before owner action. Track B only transports the opaque result | Financial history stays append-only without Track B mutation | Yes before affected execution | No |
| Generic Documents and Track A document owners | Operational versions versus billing/close/statement artifacts | Operational evidence may be cited by a close but is not a Track A document authority | Generic Documents owns operational versioning; Track A owns invoice, receipt, close, and Owner Statement evidence and freezes exact document version/checksum references | Prevents competing publication lifecycles | Yes before official adoption | No |
| Configuration registry / PR #38 | Billing-policy, series, and delivery ownership | PR #38 remains open and catalogue-only | Keep non-authoritative; future entries point to the owning versioned/persisted authority | Catalogue defaults cannot drive financial behavior | Yes before the unnumbered tenant-document slices use configuration | Yes |
