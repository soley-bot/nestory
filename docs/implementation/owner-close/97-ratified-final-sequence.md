# Ratified Owner Close Architecture and Current Sequence

**Status:** Current Track A architecture and sequence authority after the
tenant-billing reconciliation.
**Repository reconciliation baseline:** merged `origin/main` at
`5210ae1c94fa5a854f9c484b79e9dbd214c99053`, containing the accepted Track B
planning package.
**Original Track A runtime-evidence baseline:**
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`.
**Implementation status:** Plans 00 through 04 are merged. Plan 05 is the
recommended next implementation-ready slice but requires a separate approved
prompt. Plans 06 onward remain unauthorized.
**Historical external review:** `98-ultra-review-response.md` returned
`APPROVE WITH CHANGES` against an older plan set. It remains historical and did
not review tenant invoice or formal receipt plans.
**Tenant-billing decisions:** `96-tenant-billing-reconciliation.md`.
**Track B amendment source:**
`../lease-occupancy-history/92-required-cross-plan-amendments.md`.
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

Track B supplies accepted, versioned relationship/date evidence and typed
affected source identities. Track A alone interprets Plan 04 term/policy,
selects debtor/recipient, calculates service/due/proration/notice outcomes and
blockers, stores the approved calculation snapshot, classifies financial owner
state/action, and writes occurrences, obligations, invoices, receipts,
projections, close, and statements. `billing_contact` is never automatic
debtor authority.

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
- The unnumbered tenant-invoice coordination slice presents exactly one
  safe-MVP obligation as one reviewed and issued tenant invoice line. It does
  not create another receivable.
- Before activation, Plan 05 receipt/allocation is actual cash and can operate
  on current manual obligations without a future Plan 20 manifest. After
  activation, future remaining-balance settlement before invoice identity is
  limited to exact obligations whose immutable provenance and reviewed Plan 20
  manifest, frozen into the named Plan 22 cutover, prove
  `legacy_obligation_only`. Plan 20 assigns every candidate obligation exactly
  one immutable remaining-balance disposition: `legacy_obligation_only` or
  `migration_invoice_required`; the latter never falls back to obligation-only
  settlement and returns `migration_invoice_issuance_required` until issuance.
  Separately, each allocation freezes its own `settlement_basis` and
  `publication_source_class` from exact invoice or Plan 20 cash-manifest
  evidence. Earlier `legacy_cash_non_publishable` allocations may coexist with
  a `migration_invoice_required` remaining balance, while only a later
  `invoice_bound` allocation can be formal-receipt eligible. A manual label,
  caller-selected class, or business date cannot establish either authority.
- The unnumbered formal-receipt coordination slice publishes only from the
  exact Plan 05 source and issued tenant-invoice header/version/line frozen on
  its allocation.
- Invoice approval, issuance, delivery, and derived settlement are independent
  axes.
- Formal receipt publication and delivery are independent from cash commit.
- Invoice and receipt numbers use separate organization-scoped audited series
  and are never reused.
- Issued/published economics, snapshots, numbers, checksums, and retained bytes
  are immutable.

### Coordination aliases do not change ratified numbering

The ratified Owner Close sequence remains `00` through `23`. In particular,
Plan 10 remains security-deposit custody, Plan 11 remains management-fee
agreements/calculation, and Plan 12 remains management-fee assessment. The
filenames `10-tenant-invoice-issuance-and-delivery.md` and
`11-formal-tenant-receipt-publication.md` are retained for stable links only.
They are prominent unnumbered local coordination slices, not ratified Plan 10
or Plan 11, and they grant no implementation authority.

Track B file 92 uses those same local aliases only for cross-track
coordination. Read every numbered reference in that file literally against the
unchanged `00`-`23` matrix below; there is no translation or renumbering.

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
- versioned read-only financial owner adapters returning exact source
  identities, material states, available checked actions, hashes, and every
  affected organization/property/currency/period scope.

Property close is the business lock for one property/period. Organization
Ledger locks and accounting book-period locks remain broader independent
blockers.

For a composed relationship/financial change, the executor resolves every
source and destination scope, acquires all property-period locks in one
owner-defined deterministic order inside the same transaction, rechecks the
owner adapter and impact material while locks are held, and only then invokes
the selected action. Preview/adapter reads write no activity. Track B may
transport the opaque adapter result but never updates Track A tables.

Standalone and composed financial actions use the same complete Plan 03 order:
resolve scopes read-only; acquire property-period/header, broader Ledger, and
accounting-book locks in deterministic order; then claim the operation key;
then lock domain sources and any document series. No action may hold an
operation key while waiting for an earlier-order Plan 03 lock. Captured
lifecycle/book status gates only a new mutation; a completed same-payload replay
still returns after a later period closure.

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

Track A owns tenant invoice artifacts, formal tenant receipt artifacts, close
manifests, Owner Statement versions/artifacts, and their immutable evidence
snapshots. Generic Documents owns versioning, metadata correction, and
supersession for signed lease amendments, inspections, and other operational
documents. A close freezes exact
generic-document version/checksum references; neither domain replaces the
other's lifecycle.

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

Use typed allocation IDs conditionally. Every allocation must retain an
immutable classification/scope snapshot after settlement; relevant obligation
fields may additionally freeze but never replace allocation-level evidence.
Add exact allocation-to-allocation reversal identity and header/allocation
balance enforcement.

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

Track B supplies accepted actual/scheduled/notice and relationship evidence,
boundary/confidence/resolution states, exact source versions, and a material
hash. Track A Plan 09 alone applies Plan 04 term/policy precedence, selects the
debtor/recipient, decides calculation start/end, due date, proration/notice
basis and blockers, and stores the approved calculation snapshot/hash.

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
- one receipt -> one allocation to one obligation; each allocation freezes an
  immutable `settlement_basis` and `publication_source_class`. Activated Plan 09
  cash also freezes exactly one current active issued invoice
  header/version/line. Exact Plan 20-classified pre-cutover cash and later cash
  on a `legacy_obligation_only` obligation remain non-publishable, while
  invoice-bound cash is independently eligible; old and later classes may
  coexist on one obligation; and
- multiple sequential partial receipts -> separate receipt events and, when
  formal-receipt eligible, separate documents.

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
`sent/delivered` is a separate delivery axis. Obligation outstanding derives
from all valid signed allocations/reversals, while invoice
`unpaid/partially_paid/paid` status derives only from `invoice_bound`
allocations/reversals freezing that exact header/version/line. Unpaid issued
invoices may be linked-cancelled/replaced. Paid/partial correction blocks
without approved credit/refund policy. Issuance acquires the complete
applicable Plan 03 lock
hierarchy, then locks and resolves its operation/idempotency key before
domain-source and series locks, so same-key replay returns the stored identity
and a changed payload fails before consuming a number. Settlement, exact reversal,
and cancellation share the obligation/invoice/property-period locks.
Settlement freezes only the current active `issued` header/version/line.
Cancellation requires no `invoice_bound` allocation against that exact line or
exact committed reversal of every such positive allocation with a zero
invoice-linked net unreversed signed effect; any nonzero, unmatched, duplicate,
or in-flight invoice-linked effect blocks. Historical
`legacy_cash_non_publishable` obligation cash neither settles nor blocks
cancellation of the later migration invoice. Its post-issuance reversal changes
obligation outstanding and returns `migration_invoice_replacement_required`;
close blocks on that stale-invoice condition until checked
cancellation/replacement. Cancellation committing first blocks new settlement
until an issued replacement. Original and reversing cash history never deletes
or retargets.

### Gate L — Formal receipt publication

A formal receipt can only publish from committed Plan 05 cash whose allocation
freezes `settlement_basis = invoice_bound`,
`publication_source_class = eligible_invoice_linked`, and the exact issued
tenant-invoice header/version/line. Exact Plan 20 allocation-manifest evidence
or the frozen grandfathered-obligation evidence types other cash as
`legacy_cash_non_publishable` with
`invoice_identity_not_historically_available` and
`artifact_not_historically_created`, independent of the obligation's current
remaining-balance disposition. Close accepts those exact absence reasons as
complete historical evidence rather than `artifact_required_missing`. Cash
lacking both exact invoice-bound and Plan 20 allocation evidence returns
`allocation_publication_classification_required`; dates, labels, and current
relationships cannot repair it. Any future contemporary acknowledgment is a
separate, currently unapproved document type and is not a formal receipt.

An automatic policy may insert a durable outbox row in the settlement
transaction, but publication work processes it only after commit; the row is a
post-commit trigger, not an artifact or uncommitted-cash authority. Formal
publication acquires the complete applicable Plan 03 lock hierarchy, then locks
and resolves its operation/idempotency key before domain-source and receipt
series locks. Same-key/same-payload races return one stored number/artifact;
changed payload fails before number allocation.

Publication and delivery remain retriable outside the cash transaction. For an
original allocation that is formal-receipt eligible or already has a
formal-publication chain, reversal/void evidence is separately numbered and
retains the original. Generic document mutation cannot alter official bytes.
Cash reversal never waits for rendering. If that original is not published,
the reversal document records `blocked_dependency` until the original or an
approved linked replacement for the same committed source and frozen economic
snapshot publishes. A `publication_abandoned` row and number remain retained;
its approved replacement uses a new number/artifact. Publication of the
original or linked replacement satisfies the dependency, while that artifact
and the reversal artifact remain explicit close evidence. Reversal of
`legacy_cash_non_publishable` remains Plan 05 cash/reconciliation evidence and
creates neither an original nor reversal formal receipt. Abandonment is never a
cash void. Later invoice cancellation/replacement after complete exact reversal
never waits for publication and never deletes, retargets, or rewrites the
original/reversal receipt artifacts or close dependencies.

### Gate M — Routes, configuration, and migration

- `/tenant-invoices` is canonical tenant billing; `/bills-expenses` remains
  vendor bills.
- `/invoices` and `/payments` require explicit compatibility/disambiguation
  before any semantic change.
- Plan 09 and the unnumbered tenant-invoice coordination slice share one
  activation gate: Plan 09 may run in shadow/readiness mode, but generated
  obligations are not collectable until the invoice slice can issue the
  required invoice and Plan 05 enforces that link.
- A Plan 20 migration invoice supports only a later payment after real issuance
  and exact header/version/line freeze; it never retroactively attaches to
  already settled legacy cash or makes that cash formal-receipt eligible. It
  freezes the locked net open obligation balance after every valid signed
  historical allocation/reversal; later invoice-bound cash is independently
  publishable. A historical-cash reversal inherits the original allocation's
  class. If issuance commits first, a later such reversal preserves the issued
  invoice and returns `migration_invoice_replacement_required` until checked
  cancellation/replacement.
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
| 02 | Shadow `property_cash_events_v1` contract and parity manifest | Merged (PR #36) | 01 | Read-only typed canonical cash-event contract; future event-time relationship scope and exact source -> Ledger -> journal navigation remain owner extensions | 03, 05-16, migration | No report/write cutover; current-primary-Person attribution remains a named defect |
| 03 | Shared financial-authority kernel | Merged (PR #37) | 02 | Locks, reconciliation sources, idempotency, reserved projections, bypass guards, close skeleton | All later source writes/close | Reconciliation topology matters when adopted |
| 04 | Authoritative lease terms and effective rent-policy contract | Merged (PR #39) | 03 | Normalized terms, approved policy versions, deterministic current readiness; historical service-date resolver remains Plan 09-owned | 09 and Track B evidence integration | IPS monthly/due-day/proration examples for generation |
| 05 | Atomic income settlement, allocation, projection, and reversal | Recommended next; separate prompt required | 02-03; active reconciliation source | Receipt/allocation cash authority with atomic Ledger/journal projections, exact reversal, immutable source scope, and read-only owner adapter | 09, unnumbered tenant-document slices, fees, reconciliation, close, statement; Track B impact transport only | Unapplied/advance/overpayment excluded; reversal/restatement rule accepted |
| 06 | Atomic expense settlement, allocation, projection, and reversal | Planned; unauthorized | 02-03 | Vendor payment/allocation cash authority and projections | 07, 11-16, statement | Owner payout excluded; unpaid-bill treatment later |
| 07 | Maintenance task-to-bill handoff | Planned; unauthorized | 06; optional TB-07 exact tenancy context when tenant-specific | Exact task/bill/actual-cost handoff and duplicate/void controls; finance owner retains charge/bill authority | 15-19 | Task-to-bill cardinality and variance |
| 08 | Petty-cash posting, reversal, and register reconciliation | Planned; unauthorized | 03 | Canonical petty-cash event/register authority | 15-19 | Cash date, economic scope, physical-count variance |
| 09 | Idempotent rent charge occurrences and obligation generation | Planned; unauthorized | 04-05; merged TB-05 evidence envelope; Gate F; joint Plan 09/tenant-invoice activation gate | Occurrence outcome plus one obligation, selected debtor/recipient, exact term/policy and consumed relationship sources/versions/hash, and Track A-approved calculation snapshot; shadow until invoice-ready cutover, then sole normal rent-obligation creator | 05, unnumbered tenant-document slices, 11-19 | Due day, proration, frequency, concession, Track A obligor/recipient policy, and typed conflicts for post-cutover manual rent attempts |
| 10 | Security-deposit custody and limited disposition | Planned; unauthorized | 03; event-time Lease/Unit/party scope and checked owner actions | Deposit custody event/liability authority; no Track B reassignment or implicit successor transfer | 15-19 | Application, retention, refund, and successor custody rules |
| 11 | Management-fee agreements and deterministic calculation | Planned; unauthorized | Stable 05/09/10 source classes as enabled | Effective fee agreement/calculation authority | 12 | Complete Gate E policy and examples |
| 12 | Management-fee assessment, approval, waiver, reversal, and projection | Planned; unauthorized | 11 | Assessed fee liability/effects | 13-19 | Recognition, approval, waiver, reversal |
| 13 | Owner contribution authority, controlled adjustments, roster correction, and opening balances | Planned; unauthorized | 03; complete source/ownership evidence | Single owner-contribution and opening-liability authority | 14-19 | Ownership date/transfer and opening evidence |
| 14 | Owner balance, reserve, and distribution lifecycle | Planned; unauthorized | 13; applicable source effects | Owner-liability balance, reserve, distribution authority | 15-19 | Reserve, negative balance, approval, transfer |
| 15 | Reconciliation records and deterministic close-check engine | Planned; unauthorized | 05-14 for enabled classes; owner adapters; document-availability rules | Reconciliation facts, readiness checks, blockers, and exact owner-action availability | 16, 20-22 | Source topology, zero variance, unpaid/unapplied treatment, required documents |
| 16 | Append-only close, reopen/reclose, dependency invalidation, and readiness UI | Planned; unauthorized | 15 | Property-period close revision/restatement chain freezing exact financial sources, consumed relationship evidence, and generic-document version/checksum references | 17-22 | Enabled-class completeness and reopen approvals |
| 17 | Owner Statement schema, itemized lines, snapshots, and approval | Planned; unauthorized | 16; exact tenant-invoice/formal-receipt evidence availability | Statement version for one close revision with exact relationship/source/document evidence snapshots | 18-19, 22 | Disclosure, recipient, approval |
| 18 | Immutable official PDF/CSV artifacts, append-only Storage, checked download, and recovery | Planned; unauthorized | 17 | Official Owner Statement artifact/checksum owned by Track A, separate from Generic Documents | 19, 22 | Format, retention, failure recovery |
| 19 | Statement history, cancel/reissue, and owner delivery | Deferred beyond manual retained pilot unless required | 18 | Separate owner delivery/history authority preserving prior close/evidence versions | 22-23 | Channel, cancellation/reissue, retention |
| 20 | Migration-run schema, exact resolution workflow, and dry-run manifest | Planned; unauthorized | Complete source/document taxonomy through 19 | Exact legacy classification; immutable pre-cutover obligation identities/provenance and one `legacy_obligation_only` or `migration_invoice_required` remaining-balance disposition per candidate; exact receipt/allocation/reversal identities, signed effects, settlement/publication classes, artifact availability, and version/material hashes | 21-22 | No fuzzy evidence; open legacy invoice selection |
| 21 | Resumable backfill, interruption recovery, and backup/restore rehearsal | Planned; unauthorized | Reviewed 20 manifest | Canonical identity/evidence backfill with recovery proof | 22 | Reviewed exceptions and rollback |
| 22 | Named IPS pilot and explicit report/write/document cutover | Planned; unauthorized | 21 plus complete bounded cycle | Evidence-backed go/no-go plus named/versioned creation, collection, report, and document cutover that atomically compares both the locked obligation/disposition set and the locked receipt/allocation/reversal classification set, versions, and material hashes with Plan 20 | 23 | Named scope, operators, reviewers, policy approvals |
| 23 | Compatibility retirement | Deferred | 22 observation window, merged Track B normalized-history/read parity, exact Track A event-time consumers, and explicit acceptance | Removal of proven-obsolete compatibility writes/fallbacks only after cross-track parity | Final operating model | Acceptance and rollback window |

The tenant-invoice and formal-receipt documents are tracked outside the
numbered matrix:

| Unnumbered coordination slice | Status | Prerequisites | Authority created |
|---|---|---|---|
| `10-tenant-invoice-issuance-and-delivery.md` | Planned; gated; separate prompt required | Plan 05, Plan 09, TB-05, invoice policy/series | Tenant invoice lifecycle, approved issue-time contact snapshot, immutable issued artifact, owner adapter, and delivery history |
| `11-formal-tenant-receipt-publication.md` | Planned; gated; separate prompt required | Plan 05 committed cash and exact issued tenant-invoice header/version/line frozen on its allocation | Formal tenant receipt publication/reversal artifact, owner adapter, and delivery history |

## Sequence decisions

### Track A Plan 05 and Track B TB-01 stay independent

Plan 05 remains Track A's next implementation-ready slice. TB-01 is Track B's
independent next slice from the same merged planning baseline. They use
separate branches and PRs; neither is a prerequisite for the other and they
must not be combined. Plan 09, unlike Plan 05, waits for merged TB-05
relationship evidence before relationship-aware occurrence generation.

### Why Plan 05 remains before Plan 09

Current obligations and cash already exist. Plan 05 can make their settlement
atomic using obligation identity, eliminating immediate projection drift
without waiting for charge generation or invoices. Plan 09-generated
obligations later enter the same checked settlement boundary.

### Why the tenant-invoice coordination slice follows Plan 09

A normal new-business issued invoice line must cite the exact occurrence,
obligation, term, policy, period, calculation, and due date. Creating that line
before Plan 09 would either duplicate obligation generation or infer from
compatibility rent. The only exception is a Plan 20-reviewed migration line
bound to an exact legacy obligation and manifest item, with typed absence for
historical occurrence, term, or policy authority that cannot be proven.

Plan 09 may merge first only in shadow/readiness mode. It and the unnumbered
tenant-invoice slice activate new-business generation/collection together:
Plan 09 becomes the sole normal creator of rent obligations, and a generated
obligation cannot accept cash until its exact issued tenant-invoice line
exists. Only exact IDs whose immutable creation provenance and reviewed
Plan 20 manifest, frozen into the named Plan 22 cutover, prove they predate
activation with `legacy_obligation_only` remaining-balance disposition retain
Plan 05's obligation-only path. A `migration_invoice_required` remaining
balance needs issuance and returns `migration_invoice_issuance_required` until
then; that future policy never reclassifies cash already committed. A normal
generated obligation without its current issued invoice returns
`current_issued_invoice_required`. `manual`, `other`, caller flags, backdated
business dates, or present-day joins cannot confer any disposition or
allocation class. The action, checked creation RPC, legacy wrappers, direct
authenticated DML, and Rent & Income deep links must reject post-cutover manual
rent with `rent_occurrence_generation_required` and point to Plan 09
generate/catch-up/repair. Only an economic class explicitly designated
non-invoiceable by its ratified owner/policy may keep a manual path.

### Why the formal-receipt coordination slice follows tenant invoicing

The unnumbered formal-receipt slice publishes separately from cash so
artifact/delivery failure cannot affect settlement. Every formal receipt needs
the exact issued tenant-invoice header/version/line frozen on its Plan 05
allocation. Exact manifest-backed pre-cutover uninvoiced cash and later
grandfathered obligation-only cash remain typed
`legacy_cash_non_publishable`, readable cash evidence but cannot enter
formal-receipt publication and are never fabricated into historical receipt
documents.

### Which later slices consume document identity

- Plan 15 checks required invoice/receipt artifact availability and
  reconciliation evidence.
- Plan 16 closes one exact evidence set.
- Plans 17-19 link tenant artifacts as supporting evidence but calculate money
  from canonical sources.
- Plans 20-22 classify legacy absence, forbid fabrication, and pilot the
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
- Plan 20 owns both the exact immutable pre-cutover obligation manifest with
  each remaining-balance disposition and the exact receipt/allocation/reversal
  manifest with signed effects, immutable allocation settlement/publication
  classes, versions, and material hashes. Plan 22 owns the named/versioned
  activation boundary. Caller labels, mutable business/received/created dates,
  or current relationship joins never prove grandfather or publication status.
- Plan 22 locks both complete current candidate sets under the shared
  creation/cutover policy lock and compares their identities, dispositions,
  classifications, versions, signed nets, and material hashes with the reviewed
  Plan 20 manifest. Drift returns `legacy_manifest_refresh_required`; a manual
  create, settlement, or reversal winning before activation invalidates
  readiness and requires Plan 20 refresh/re-review, while activation winning
  first makes creation fail with `rent_occurrence_generation_required` and
  makes settlement/reversal recheck the frozen authority.
- A deliberately selected open legacy obligation may receive a newly issued
  migration invoice only with its real issue date, original service/due
  context, migration disclosure, exact obligation and Plan 20 manifest item,
  review/approval, and new number. Under the shared
  obligation/property-period lock, issuance reads the exact signed
  allocation/reversal set and freezes the net open balance as the line amount.
  It records
  `occurrence_not_historically_created`,
  `term_authority_not_historically_available`, or
  `rent_policy_not_historically_available` as applicable and never fabricates
  those historical authorities.
- Prior allocations remain obligation cash and count exactly once toward
  obligation outstanding and close, but never settle the later migration
  invoice. That invoice's settlement derives only from allocations freezing its
  exact header/version/line; obligation outstanding derives from every valid
  signed allocation. A later payment is eligible only when issuance commits
  first and that new allocation is `invoice_bound`.
- Reversal before migration-invoice issuance changes the locked net line amount.
  Issuance first keeps the invoice immutable; a later exact historical-cash
  reversal inherits the original allocation class and makes the invoice owner
  return `migration_invoice_replacement_required` until checked
  cancellation/replacement. No prior allocation is retargeted.
- Settled legacy receipts remain cash evidence without a claimed historical or
  formal receipt and retain `invoice_identity_not_historically_available` plus
  `artifact_not_historically_created`, even when the same obligation's remaining
  balance is `migration_invoice_required`. Close accepts those exact absences;
  later invoice-linked cash on the same obligation has its own artifact
  requirement. Any future contemporary acknowledgment requires a separate
  approved document type.
- Required-missing, ambiguous source/recipient, unsupported cardinality, or cash
  lacking exact invoice-bound or Plan 20 allocation evidence blocks pilot/close
  according to Plan 15. The last case returns
  `allocation_publication_classification_required`.
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
- Track B supplies relationship/date evidence and typed affected identities;
  each Track A owner alone supplies financial state/action/scope through its
  merged adapter and the same-transaction deterministic property-period lock
  contract.
- Generic Documents retains operational-document versioning; Track A owns only
  its tenant billing, close, and Owner Statement document families and exact
  evidence snapshots.
- All finance migrations merge sequentially with rebase, reset, generated-type
  comparison, and full verification.
- Codex does not merge unless explicitly requested.

## Required Cross-Plan Amendments

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track B — Lease and Occupancy History | Versioned relationship/date evidence envelope | Current party/contact/occupancy records do not by themselves define invoice liability, recipient, or financial date precedence | TB-05 supplies exact accepted candidates, source IDs/versions, boundary/confidence/resolution/reasons, and material hash. Plan 09 selects debtor/recipient identity and calculation; `billing_contact` is not automatic debtor authority | Plan 09 and the unnumbered tenant-invoice slice need reproducible evidence without transferring financial authority | Yes for Plan 09 and the invoice slice; no for Plan 05 | No before Plan 09 |
| Track A Plan 09 | Term/policy calculation and approved snapshot | Plan 04 term authority and Track B occupancy/notice facts can differ | Track A applies precedence, selects service/due/proration/notice outcomes and blockers, records selected/ignored evidence reasons, and stores the approved calculation snapshot/hash | Occurrence/invoice calculation must have one financial owner | Yes for Plan 09 | No |
| Track A domain owners | Typed impact adapter/actions and deterministic locks | Later term/party/occupancy changes can affect occurrences and downstream drafts | Each owner returns exact identities/states/actions/scopes/hash; execution acquires every source/destination property-period lock in deterministic order before owner action. Track B only transports the result | Track A owns append-only financial consequences without Track B table mutation | Yes before each affected TB-03/TB-06 execution | No for enabled paths |
| Generic Documents and Track A document owners | Operational versions versus billing/close/statement evidence | A signed operational document may support a close but is not a tenant invoice, formal receipt, or Owner Statement artifact | Generic Documents owns operational versioning; Track A owns its document families and freezes exact generic-document version/checksum references in close evidence | Avoids a second or ambiguous publication authority | Yes before official evidence adoption | No |
| Track A — Plan 05 plus the two unnumbered tenant-document slices | Settlement and document identity contract | Current obligations/receipts have no invoice/formal-document identity, and the current manual rent action can create a fresh obligation without occurrence/invoice authority | Plan 05 creates exact cash source; after the named Plan 22 cutover Plan 09 alone normally creates rent obligations and the action/RPC/DML boundaries reject manual rent. Plan 20 independently freezes each obligation's future remaining-balance disposition and each historical allocation's settlement/publication class. The tenant-invoice slice binds a normal line to one occurrence/obligation or freezes a Plan 20 migration line to one exact legacy obligation's locked net open balance; prior cash is never retargeted, while later invoice-bound cash is eligible. The formal-receipt slice publishes only from committed cash and the exact issued tenant-invoice header/version/line frozen on its allocation | Prevent circular or competing authority, loss of mixed historical cash evidence, and a post-cutover manual-rent escape hatch | No, fixed by this authority chain | No |
| Configuration registry / PR #38 | Billing rules and roles | PR #38 is catalogue-only and proposes non-runtime defaults/role labels | Future catalogue maps to versioned billing policy, actual capability, separate document series, delivery config, org settings, and Plan 04 policy | Generic configuration cannot replace effective financial authority | Yes before the unnumbered tenant-document slices use it | Yes |
