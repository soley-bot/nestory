# Ratified Owner Close Architecture and Current Sequence

**Status:** Current Track A architecture and sequence authority after the
tenant-billing reconciliation.
**Repository baseline:** merged `origin/main` at
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`.
**Implementation status:** Plans 00 through 04 are merged. Plan 05 is the
recommended next implementation-ready slice but requires a separate approved
prompt. Plans 06 onward remain unauthorized.
**Historical external review:** `98-ultra-review-response.md` returned
`APPROVE WITH CHANGES` against an older plan set. It remains historical and did
not review tenant invoice or formal receipt plans.
**Tenant-billing decisions:** `96-tenant-billing-reconciliation.md`.
**Further architecture-review loop:** No. This document records Nestory's
current synthesis; files 98 and 99 remain unchanged historical evidence.

## Final decision

Nestory remains an operational property-management and property-accounting
product. It does not become the management company's corporate accounting,
payroll, tax, or general ERP system.

The current authority graph is:

```text
Authoritative lease term + effective rent policy
                    |
                    v
       charge occurrence + obligation
                    |
                    +----------------------> issued tenant invoice
                    |
actual money ------> receipt + allocation --> published formal receipt
                    |
                    v
       deterministic Ledger/journal projections
                    |
                    v
       append-only property close revision
                    |
                    v
       immutable Owner Statement + owner delivery
```

Tenant invoice and formal receipt publication are source-linked document
authorities. They do not replace obligation or cash authority. Owner Statement
is a separate owner-facing closed-period authority.

### Canonical authority

- Existing domain tables remain canonical writes until a named slice adds a
  specific source.
- Do not introduce a writable generic `financial_events` or persisted live
  reporting table.
- `property_cash_events_v1` remains a read-only, versioned, security-invoker
  view or checked paginated set-returning RPC.
- Canonical event identity is
  `(organization_id, source_type, source_id)`.
- Allocation IDs become canonical cash identities after material
  classification/scope is immutable or snapshotted and direct reversal
  identity is enforced.
- Receipt/payment headers are parent transactions. Their totals equal
  allocations unless a separately approved unapplied-cash identity/workflow
  exists.
- Charge occurrence, obligation, tenant invoice, receipt event, formal receipt,
  Ledger, journal, close, and Owner Statement remain distinct.

### Tenant billing authority

- Plan 09 proves an expected charge and creates one obligation.
- Plan 10 presents exactly one safe-MVP obligation as one reviewed and issued
  tenant invoice line. It does not create another receivable.
- Plan 05 receipt/allocation is actual cash and can operate before invoice
  identity for classified current/legacy obligations.
- For new invoice-era cash, Plan 11 publishes a formal receipt from the exact
  Plan 05 source and Plan 10 invoice line.
- Invoice approval, issuance, delivery, and derived settlement are independent
  axes.
- Formal receipt publication and delivery are independent from cash commit.
- Invoice and receipt numbers use separate organization-scoped audited series
  and are never reused.
- Issued/published economics, snapshots, numbers, checksums, and retained bytes
  are immutable.

### Authority kernel

Before source write changes, each plan adopts the merged shared kernel:

- stable property-period headers;
- append-only close revision skeletons;
- shared property-period serialization and lock order;
- stable organization-scoped reconciliation/cash-source identities;
- payload-bound idempotency requests and canonical payload hashes;
- unique typed Ledger projection identities;
- reserved journal source namespaces;
- trigger/grant guards preventing direct Data API or generic RPC bypass; and
- compatibility-wrapper protection against duplicate obligation-level and
  allocation-level projections.

Property close is the business lock for one property/period. Organization
Ledger locks and accounting book-period locks remain broader independent
blockers.

### Corrections and reversals

- Original economic and published-document evidence is never mutated or
  deleted to correct history.
- Normal cash correction creates an exact linked reversal in an open period
  and cannot predate the original event.
- Receipt reversal produces an exact reversing receipt/allocation/projections;
  formal reversal evidence is a separately numbered document.
- Unpaid invoice correction uses linked cancellation and a new reviewed,
  numbered replacement. Issued bytes remain retained.
- Credit and partially/fully paid invoice correction are deferred and blocking
  until IPS approves the economic policy. Receipt reversal is not used when
  cash did not reverse.
- Historical period correction requires authorized reopen, a new append-only
  close revision, dated reversal/adjustment, reclose, and replacement
  publication.
- Reopening withdraws the prior statement version's current-authority status.
  It becomes superseded when its replacement publishes.
- Reopening an earlier period marks dependent later periods, opening balances,
  and statements stale until restated in order.

### Ledger and accounting role

- `ledger_entries` and accounting journals are deterministic projections and
  controls, not competing product truth.
- Source-linked projections cannot be generically edited, archived, restored,
  re-dated, reclassified, posted, or reversed.
- Journals remain balanced/idempotent and hidden from ordinary operator
  workflow.
- Invoice and formal receipt workflows never use Ledger/journals as document
  authority.
- Retain the accounting kernel until report/write parity, migration, rollback,
  and observation evidence is complete.
- Do not build a product-facing general-ledger or chart-of-accounts feature.

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

Reserve hold/release normally moves money between available and reserved
buckets without changing total owner liability. Security deposits remain
custody liabilities until approved disposition creates a separately classified
effect.

## Ratified gates

### Gate A — Reporting contract

Use a read-only view or checked paginated RPC. Persist only immutable close,
statement, document, artifact, delivery, and migration-resolution evidence.

### Gate B — Cash event identity

Use typed allocation IDs conditionally. Add immutable
classification/scope snapshots or freeze relevant obligation fields after
first settlement. Add exact allocation-to-allocation reversal identity and
header/allocation balance enforcement.

### Gate C — Reversal policy

Use immutable dated reversal in an open period by default. Historical
correction uses authorized reopen and ordered restatement. Prior versions
remain retained and correctly labeled.

### Gate D — Lock scope

Use property-period serialization for business close and writes. Preserve
organization Ledger locks and accounting book locks as broader independent
controls. Competing writes and close acquire the same documented lock order.

### Gate E — Management fees

No fee implementation starts until IPS confirms agreement grain, basis,
included/excluded categories, assessment versus settlement recognition,
rounding, tax, minimum/maximum, waiver, reversal, and worked examples. Do not
double-allocate an owner-specific agreement through ownership percentages.

### Gate F — Rent policy

The controlled pilot may be monthly-only if IPS accepts it. Unsupported
frequencies and undefined proration block generation and close. IPS confirms
due-day/short-month behavior, timezone, start/end/notice proration, rent
changes, concessions, and rent-free periods before Plan 09.

### Gate G — Owner balance and reserves

Pilot default is owner-property-USD, one clean 100% owner per effective period,
evidenced opening balance, no reserve writes, no ownership transfer, and no
distribution that makes available balance negative. No override exists until
IPS approves policy.

### Gate H — Reconciliation

Every cash-bearing event references a stable reconciliation source. Pilot
variance is zero. A pooled source may be reconciled once externally and
referenced through a complete property-subledger manifest; the same evidence
cannot be independently reconciled for each property.

### Gate I — Legacy Ledger rows

Classify only through:

1. exact existing FK or source identity;
2. explicit immutable adjustment source;
3. evidenced exclusion; or
4. blocking `legacy_unclassified` resolution.

Never fuzzy-match amount, date, description, payer, vendor, or reference.

### Gate J — Tenant billing cardinality

The October safe model is:

- one charge occurrence -> one obligation;
- one obligation -> at most one active/current invoice with one source-bound
  line, while cancelled/superseded replacements remain retained;
- one receipt -> one allocation to one obligation/invoice line; and
- multiple sequential partial receipts -> separate receipt events/documents.

Combined invoices, multi-allocation receipts, unapplied cash, overpayments,
advance payments, deposits on ordinary invoices, and credit notes are deferred
or blocking. Schema capability alone does not authorize broader product
cardinality.

### Gate K — Invoice lifecycle

Manual capability-based review/approval is mandatory for the pilot.
`generated` is the event that creates a `draft`; the economic lifecycle is
`draft`, `pending_review`, `reviewed`, `approved`, `issuing`, and `issued`.
An unrecoverable reserved issuance uses terminal `issuance_abandoned` without
claiming an issued artifact or reusing its number.
`sent/delivered` is a separate delivery axis;
`unpaid/partially_paid/paid` is allocation-derived. Unpaid issued invoices may
be linked-cancelled/replaced. Paid/partial correction blocks without approved
credit/refund policy.

### Gate L — Formal receipt publication

A formal receipt can only publish from committed Plan 05 cash. Publication and
delivery are retriable outside the cash transaction. Reversal/void evidence is
separately numbered and retains the original. Generic document mutation cannot
alter official bytes. Cash reversal never waits for rendering: if the original
receipt document is not yet published, the reversal document records a blocked
dependency until the original snapshot is retained, and missing artifacts
remain explicit close blockers. A reserved but unpublished terminal record is
`publication_abandoned`, never a cash void.

### Gate M — Routes, configuration, and migration

- `/tenant-invoices` is canonical tenant billing; `/bills-expenses` remains
  vendor bills.
- `/invoices` and `/payments` require explicit compatibility/disambiguation
  before any semantic change.
- Plan 09 and Plan 10 share one activation gate: Plan 09 may run in
  shadow/readiness mode, but generated obligations are not collectable until
  Plan 10 can issue the required invoice and Plan 05 enforces that link.
- PR #38 remains catalogue-only. Billing policy, document series, delivery
  configuration, organization settings, and Plan 04 rent policy retain separate
  authority.
- Migration never fabricates historical invoice/receipt issue, number,
  artifact, or delivery evidence.

## Current implementation sequence and consistency matrix

All financial migrations merge sequentially. Parallel planning uses the
Track A/Track B amendment contract, but implementation consumes only merged
prerequisites.

| Seq. | Implementation slice | Status | Prerequisites | Authority created | Downstream consumers | Unresolved IPS blockers |
|---:|---|---|---|---|---|---|
| 00 | Ratified architecture and decision gates | Complete in documentation | None | Product boundary, authority graph, gates | Every later slice | None |
| 01 | Read-only inventory, parity diagnostics, and safety rails | Merged (PR #35) | 00 | Reproducible current-state/parity evidence | 02, migration, verification | None; ambiguity stays explicit |
| 02 | Shadow `property_cash_events_v1` contract and parity manifest | Merged (PR #36) | 01 | Read-only typed canonical cash-event contract | 03, 05-18, migration | None; no report/write cutover |
| 03 | Shared financial-authority kernel | Merged (PR #37) | 02 | Locks, reconciliation sources, idempotency, reserved projections, bypass guards, close skeleton | All later source writes/close | Reconciliation topology matters when adopted |
| 04 | Authoritative lease terms and effective rent-policy contract | Merged (PR #39) | 03 | Normalized terms, approved policy versions, deterministic readiness | 09 and Track B reconciliation | IPS monthly/due-day/proration examples for generation |
| 05 | Atomic income settlement, allocation, projection, and reversal | Recommended next; separate prompt required | 02-03; active reconciliation source | Receipt/allocation cash authority with atomic Ledger/journal projections and exact reversal | 09-11, fees, reconciliation, close, statement | Unapplied/advance/overpayment excluded; reversal/restatement rule accepted |
| 06 | Atomic expense settlement, allocation, projection, and reversal | Planned; unauthorized | 02-03 | Vendor payment/allocation cash authority and projections | 07, 13-18, statement | Owner payout excluded; unpaid-bill treatment later |
| 07 | Maintenance task-to-bill handoff | Planned; unauthorized | 06 | Exact task/bill/actual-cost handoff and duplicate/void controls | 17-21 | Task-to-bill cardinality and variance |
| 08 | Petty-cash posting, reversal, and register reconciliation | Planned; unauthorized | 03 | Canonical petty-cash event/register authority | 17-21 | Cash date, economic scope, physical-count variance |
| 09 | Idempotent rent charge occurrences and obligation generation | Planned; unauthorized | 04-05; Track B resolvers; Gate F; joint Plan 09/10 activation gate | Occurrence outcomes and one linked obligation with exact term/policy snapshot; shadow until invoice-ready cutover | 05, 10, 13-21 | Due day, proration, frequency, concession, occupancy/obligor rules |
| 10 | Tenant invoice review, approval, issuance, artifact, and delivery | Planned; gated | 05, 09; Track B recipient; billing policy and invoice series | Immutable tenant invoice/version/line/number/artifact and separate delivery history | 11, 17, 19-24 | Recipient, series, capability, delivery, tax/legal boundary |
| 11 | Formal tenant receipt publication, artifact, reversal document, and delivery | Planned; gated | 05, 10; receipt series; balance-after snapshot | Numbered immutable formal receipt/reversal artifacts and separate delivery history | 17, 19-24 | Series, method vocabulary, delivery/retention, legal boundary |
| 12 | Security-deposit custody and limited disposition | Planned; unauthorized | 03 | Deposit custody event/liability authority | 17-21 | Application, retention, refund rules |
| 13 | Management-fee agreements and deterministic calculation | Planned; unauthorized | Stable 05/09/12 source classes as enabled | Effective fee agreement/calculation authority | 14 | Complete Gate E policy and examples |
| 14 | Management-fee assessment, approval, waiver, reversal, and projection | Planned; unauthorized | 13 | Assessed fee liability/effects | 15-21 | Recognition, approval, waiver, reversal |
| 15 | Owner contribution authority, controlled adjustments, roster correction, and opening balances | Planned; unauthorized | 03; complete source/ownership evidence | Single owner-contribution and opening-liability authority | 16-21 | Ownership date/transfer and opening evidence |
| 16 | Owner balance, reserve, and distribution lifecycle | Planned; unauthorized | 15; applicable source effects | Owner-liability balance, reserve, distribution authority | 17-21 | Reserve, negative balance, approval, transfer |
| 17 | Reconciliation records and deterministic close-check engine | Planned; unauthorized | 05-16 for enabled classes; document-availability rules | Reconciliation facts, readiness checks, blockers | 18, 22-24 | Source topology, zero variance, unpaid/unapplied treatment, required documents |
| 18 | Append-only close, reopen/reclose, dependency invalidation, and readiness UI | Planned; unauthorized | 17 | Property-period close revision and restatement chain | 19-24 | Enabled-class completeness and reopen approvals |
| 19 | Owner Statement schema, itemized lines, snapshots, and approval | Planned; unauthorized | 18; exact 10/11 evidence availability | Statement version for one close revision | 20-21, 24 | Disclosure, recipient, approval |
| 20 | Immutable official PDF/CSV artifacts, append-only Storage, checked download, and recovery | Planned; unauthorized | 19 | Official Owner Statement artifact/checksum | 21, 24 | Format, retention, failure recovery |
| 21 | Statement history, cancel/reissue, and owner delivery | Deferred beyond manual retained pilot unless required | 20 | Separate owner delivery/history authority | 24-25 | Channel, cancellation/reissue, retention |
| 22 | Migration-run schema, exact resolution workflow, and dry-run manifest | Planned; unauthorized | Complete source/document taxonomy through 21 | Exact legacy classification and artifact-availability manifest | 23-24 | No fuzzy evidence; open legacy invoice selection |
| 23 | Resumable backfill, interruption recovery, and backup/restore rehearsal | Planned; unauthorized | Reviewed 22 manifest | Canonical identity/evidence backfill with recovery proof | 24 | Reviewed exceptions and rollback |
| 24 | Named IPS pilot and explicit report/write/document cutover | Planned; unauthorized | 23 plus complete bounded cycle | Evidence-backed go/no-go and named cutover | 25 | Named scope, operators, reviewers, policy approvals |
| 25 | Compatibility retirement | Deferred | 24 observation window and explicit acceptance | Removal of proven-obsolete compatibility paths | Final operating model | Acceptance and rollback window |

## Sequence decisions

### Why Plan 05 remains before Plan 09

Current obligations and cash already exist. Plan 05 can make their settlement
atomic using obligation identity, eliminating immediate projection drift
without waiting for charge generation or invoices. Plan 09-generated
obligations later enter the same checked settlement boundary.

### Why Plan 10 follows Plan 09

A normal new-business issued invoice line must cite the exact occurrence,
obligation, term, policy, period, calculation, and due date. Creating that line
before Plan 09 would either duplicate obligation generation or infer from
compatibility rent. The only exception is a Plan 22-reviewed migration line
bound to an exact legacy obligation and manifest item, with typed absence for
historical occurrence, term, or policy authority that cannot be proven.

Plan 09 may merge first only in shadow/readiness mode. It and Plan 10 activate
new-business generation/collection together: classified legacy/manual
obligations retain Plan 05's obligation-only path, while a Plan 09-generated
obligation cannot accept cash until its exact Plan 10 invoice line is issued.

### Why Plan 11 follows Plan 10

Plan 11 publishes separately from cash so artifact/delivery failure cannot
affect settlement. New-business receipts need exact invoice-line references.
Classified legacy obligation-only cash remains readable but is never fabricated
into a historical receipt document.

### Which later slices consume document identity

- Plan 17 checks required invoice/receipt artifact availability and
  reconciliation evidence.
- Plan 18 closes one exact evidence set.
- Plans 19-21 link tenant artifacts as supporting evidence but calculate money
  from canonical sources.
- Plans 22-24 classify legacy absence, forbid fabrication, and pilot the
  complete chain.

## Controlled October pilot boundary

A pilot remains feasible only as a narrow complete cycle:

- one or two named USD properties;
- one closed month;
- monthly leases only;
- one clean 100% owner for each effective period;
- one confirmed reconciliation source per property unless IPS proves a pooled
  topology;
- one occurrence/obligation/invoice line per charge;
- one allocation per receipt, with multiple sequential partial receipts
  allowed;
- mandatory manual invoice review/approval;
- separate invoice and receipt document series;
- retained immutable PDF/print and recorded manual tenant delivery;
- evidenced opening owner balance;
- zero accepted reconciliation variance;
- no combined invoice, multi-allocation receipt, unapplied cash, overpayment,
  advance payment, credit note, ownership change, reserve override, or negative
  distribution override; and
- manual retained Owner Statement PDF/official CSV delivery.

The pilot still exercises partial receipt/payment, arrears, invoice delivery,
formal partial/final receipts, one open-period receipt reversal and reversal
document, maintenance bill, petty-cash property expense, deposit
receipt/refund, one IPS-confirmed fee assessment, owner
contribution/distribution, carried owner balance, close, and Owner Statement.

## Migration and evidence boundary

- Never synthesize historical issued invoice/receipt numbers, versions,
  artifacts, or delivery attempts.
- Classify legacy artifact availability from exact evidence.
- A deliberately selected open legacy obligation may receive a newly issued
  migration invoice only with its real issue date, original service/due
  context, migration disclosure, exact obligation and Plan 22 manifest item,
  review/approval, and new number. It records
  `occurrence_not_historically_created`,
  `term_authority_not_historically_available`, or
  `rent_policy_not_historically_available` as applicable and never fabricates
  those historical authorities.
- Settled legacy receipts remain cash evidence without a claimed historical
  formal receipt.
- Required-missing, unresolved cash, ambiguous source/recipient, or unsupported
  cardinality blocks pilot/close according to Plan 17.
- Owner Statement evidence names `artifact_available`,
  `artifact_not_historically_created`, `artifact_required_missing`, and
  `artifact_publication_failed` rather than implying all supporting documents
  exist.

## Plan authorization

- Plans 00 through 04 are complete/merged.
- Plan 05 is the exact recommended next implementation-ready slice. This
  planning PR does not itself authorize implementation, hosted execution,
  deployment, or merge.
- Every implementation prompt starts from latest merged `main`, confirms the
  corresponding row and prerequisites, and stops on material drift.
- Legacy broad files do not authorize implementation by filename.
- Plan 09 and later financial slices consume merged Track B contracts; neither
  track reads authority from the other's unmerged branch.
- All finance migrations merge sequentially with rebase, reset, generated-type
  comparison, and full verification.
- Codex does not merge unless explicitly requested.

## Required Cross-Plan Amendments

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track B — Lease and Occupancy History | Effective charge obligor and billing recipient | Current party roles/contact records do not define invoice liability or period-effective recipient | Supply checked period-effective identities/snapshots; billing contact is not automatically debtor | Plans 09-10 cannot infer financial party authority | Yes for Plans 09-10; no for Plan 05 | Yes |
| Track B — Lease and Occupancy History | Occupancy/notice/proration precedence | Plan 04 term authority and occupancy facts can differ | Resolve approved effective dates/reason codes before Plan 09; Track A never recalculates Track B history | Occurrence/invoice calculation must have one source | Yes for Plan 09 | Yes |
| Track B — Lease and Occupancy History | Correction/renewal impact contract | Later term/party/occupancy changes can affect occurrences and drafts | Emit typed affected identities; do not rewrite obligations, invoices, receipts, or statements | Track A owns append-only financial consequences | Yes for Plans 09-10 and 19/22 | Yes |
| Track A — Plans 05/10/11 | Settlement and document identity contract | Current obligations/receipts have no invoice/formal-document identity | Plan 05 creates exact cash source; Plan 10 binds a normal line to one occurrence/obligation or a Plan 22 migration line to one exact legacy obligation/manifest item with typed authority absences; Plan 11 publishes from committed receipt and the applicable invoice line | Prevent circular or competing authority | No, fixed by this sequence | No |
| Configuration registry / PR #38 | Billing rules and roles | PR #38 is catalogue-only and proposes non-runtime defaults/role labels | Future catalogue maps to versioned billing policy, actual capability, separate document series, delivery config, org settings, and Plan 04 policy | Generic configuration cannot replace effective financial authority | Yes before Plans 10-11 use it | Yes |
