# Tenant Billing and Owner Close Reconciliation

**Status:** Authoritative Track A domain decision record.
**Mode:** Standard
**Effort:** Extra High
**Reason:** Tenant charge occurrences, obligations, invoices, cash receipts,
formal receipt documents, financial projections, close evidence, and Owner
Statements need one explicit authority chain and one implementation order.
**Repository reconciliation baseline:** merged `origin/main` at
`5210ae1c94fa5a854f9c484b79e9dbd214c99053`, containing the accepted
[Lease and Occupancy History](../lease-occupancy-history/README.md) planning
package.
**Original runtime-evidence baseline:**
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`; retain it for the repository
behavior audited by the original Track A package.
**Track boundary:** This record owns Track A term/policy interpretation,
calculation, charge, obligation, invoice, cash, receipt publication,
projection, close, and Owner Statement concepts. Track B owns accepted Lease
identity, party, occupancy, participant, relationship-date, transition, and
historical-read evidence. Track A consumes that evidence and never mutates or
redefines it.

## Context and authority

This record is the later reconciliation required because the historical review
in `98-ultra-review-response.md` and the source plans that predate Plan 04 did
not assign implementation ownership for tenant invoice issuance or formal
tenant receipt publication.

Use the current planning set in this order:

1. `97-ratified-final-sequence.md` for the current sequence, status, and
   prerequisites;
2. this record for the tenant-billing domain, cardinality, route,
   configuration, migration, and cross-track decisions;
3. the narrow current-sequence implementation plan for the slice being
   prepared;
4. accepted Plans 00 through 04 for completed architecture and implementation
   evidence; and
5. legacy broad Plans 03 through 12 only as source material under the current
   mapping.

Files 98 and 99 remain unchanged historical evidence. Neither is represented
as having reviewed this reconciliation.

The complete source cross-track requirements are in
`../lease-occupancy-history/92-required-cross-plan-amendments.md`. This record
adopts all fourteen at the ownership boundary below without renumbering the
ratified Owner Close sequence.

## Objective

Nestory's authoritative operating chain is:

```text
Authoritative lease and rent terms
-> expected charge occurrence
-> income obligation
-> draft tenant invoice
-> review
-> approval
-> issuance
-> delivery
                 |
                 v
        tenant outstanding balance
                 |
actual money ---> receipt event and allocation
                   |                      |
                   |                      +--> later formal tenant receipt
                   |                           publication and delivery
                   v
        atomic Ledger and journal projections
                   |
                   v
        owner liability and distribution
        -> reconciliation and property-period close
        -> immutable Owner Statement
```

The runtime chronology and implementation order are deliberately different:
Plan 05 first makes settlement safe for current obligations, and Plan 09 later
creates authoritative rent occurrences and obligations. The unnumbered
tenant-invoice coordination slice adds invoice authority, and the unnumbered
formal-receipt coordination slice adds receipt publication. Those stable
filenames are not ratified Plan 10/11 numbers: ratified Plan 10 remains
security-deposit custody, while ratified Plans 11-12 remain management-fee
authority. An invoice is not a prerequisite for accurately recording cash
against an existing obligation.

## Checked Track B evidence and Track A decision contract

Track B's checked relationship-evidence envelope contains only evidence:

- organization, property, Unit, Lease, and the authoritative term identity
  supplied or bound by the Track A caller;
- caller-supplied requested evidence/service period;
- exact accepted party, Person, occupancy, participant, notice, and
  recipient-contact candidate IDs and versions;
- typed boundary kind, confidence, overlap/resolution state, provenance,
  stable reason/repair codes, resolver version, and material evidence hash;
- explicit missing, conflicting, scheduled, actual, and legacy-unconfirmed
  states; and
- typed affected Track B source identities after a proposed relationship
  transition.

Track B never chooses a legal debtor or invoice recipient, treats
`billing_contact` as debtor authority, selects the applicable term/policy,
calculates a service window/due date/proration/notice result, resolves financial
blockers, approves a calculation snapshot, classifies a financial owner state,
or edits Track A history.

Track A combines the envelope with Plan 04 term/policy authority and owns:

- selected debtor and recipient;
- calculation start/end, due date, proration/notice basis, policy/version,
  blockers, selected/ignored evidence reasons, and calculation hash;
- the approved calculation snapshot persisted on the Plan 09 occurrence and
  inherited immutably by its obligation and invoice;
- invoice, receipt, projection, close, and statement owner states/actions; and
- the financial consequence of any later relationship correction.

Every affected Track A domain exposes a versioned read-only owner adapter that
returns exact typed source IDs, owner-classified material state, available
checked actions, source hash, and all affected organization/property/currency/
period scopes. Missing adapters/actions remain explicitly
unresolved/unavailable. A composed executor resolves all source and destination
scopes, acquires every Plan 03 property-period lock in one owner-defined
deterministic order inside the same transaction, rechecks the adapter and
impact material while locks are held, and only then calls the selected owner
action. Preview/adapter reads write no activity or idempotency state. Track B
may transport this opaque result but never writes Track A tables.

## Repository-verified audit

### Complete Owner Close corpus

| File | Classification at this baseline | Disposition |
|---|---|---|
| `00-architecture-and-decision-gates.md` | Accepted architecture | Complete; this record adds the missing tenant-document boundary without rewriting Plan 00 history |
| `01-parity-diagnostics-and-safety-rails.md` | Implemented and merged | Evidence for current-source contradictions and legacy classification |
| `02-canonical-property-cash-contract.md` | Implemented and merged | Read-only canonical cash contract; not invoice or receipt-document authority |
| `03-income-settlement-and-reversal.md` | Legacy broad source | Maps to current Plan 05 |
| `04-authoritative-lease-terms-and-rent-policy.md` | Implemented and merged in PR #39 | Current Plan 04 evidence; charge generation remains Plan 09 |
| `04-expense-settlement-and-reversal.md` | Legacy broad source | Maps to current Plan 06 |
| `05-maintenance-and-petty-cash-handoffs.md` | Legacy broad source | Maps to current Plans 07 and 08 |
| `06-rent-schedules-and-charge-completeness.md` | Legacy broad source | Maps to current Plans 04 and 09; it does not create an issued invoice |
| `07-security-deposit-custody.md` | Legacy broad source | Maps to current Plan 10 |
| `08-management-fee-agreements-and-assessments.md` | Legacy broad source | Maps to current Plans 11 and 12 |
| `09-owner-balances-and-distributions.md` | Legacy broad source | Maps to current Plans 13 and 14 |
| `10-property-period-close-and-readiness.md` | Legacy broad source | Maps to current Plans 15 and 16 |
| `11-immutable-owner-statement-publication.md` | Legacy broad source | Maps to current Plans 17 through 19; it consumes, but does not create, tenant documents |
| `12-backfill-pilot-and-production-cutover.md` | Legacy broad source | Maps to current Plans 20 through 23 |
| `97-ratified-final-sequence.md` | Current sequence authority | Revised by this reconciliation |
| `98-ultra-review-response.md` | Historical external review evidence | Preserved unchanged |
| `99-ultra-review-request.md` | Historical review request | Preserved unchanged; do not rerun |
| `README.md` | Current entry point | Revised by this reconciliation |

### Additional planning and specification evidence inspected

| File | Classification and use |
|---|---|
| `PROJECT_RULES.md` | Current repository boundary and documentation routing |
| `docs/current-state.md` | Current merged routes, modules, schema families, and Plan 09 generator blocker |
| `docs/engineering-rules.md` | Current auth, data, mutation, financial-authority, and UI rules |
| `docs/verification.md` | Current local/database/browser and handoff verification expectations |
| `docs/finance-inventory.md` | Merged Plan 01 evidence; documents current source/report contradictions without making proposed classifications authoritative |
| `docs/property-cash-events-v1.md` | Merged Plan 02 shadow cash-event contract |
| `docs/financial-authority-kernel.md` | Merged Plan 03 locking, reconciliation-source, idempotency, projection, and bypass authority |
| `docs/superpowers/plans/2026-07-06-finance-workspace-v1.md` | Historical Finance workspace execution plan; its older Ledger/route assumptions do not supersede current Owner Close authority |
| `docs/superpowers/plans/2026-07-10-property-finance-accounting-kernel.md` | Historical accounting-kernel execution plan; journals remain controls under the current sequence |
| `docs/superpowers/specs/2026-07-14-owner-statement-calculation-design.md` | Historical live Owner Statement calculation design; explicitly not immutable close/publication authority |
| `docs/superpowers/plans/2026-07-14-owner-statement-calculation.md` | Historical implementation record for the live report/PDF workflow |
| `docs/superpowers/plans/2026-07-28-plan-04-authoritative-lease-terms.md` | Historical Plan 04 execution record supporting the merged current plan |
| `docs/superpowers/plans/2026-07-28-fresh-demo-data-rebuild.md` | PR #40 scope evidence; fixture work is not an application billing write path |

### Merged implementation

| Evidence | Verified behavior | Planning consequence |
|---|---|---|
| `supabase/migrations/20260706113000_finance_income_expense_workflows.sql` | `finance_income_items` stores due and received compatibility totals and statuses for incoming-money obligations | It is an obligation/receivable source, not an invoice |
| `supabase/migrations/20260710065423_overview_property_cash_events.sql` | `finance_receipts` headers and `finance_receipt_allocations` represent actual incoming cash and its allocation | A database receipt is a cash event, not a formal receipt artifact |
| `supabase/migrations/20260723093124_finance_settlement_activity_logging.sql` | Current checked receipt and reversal RPCs preserve originals and enforce balance rules, but required Ledger and journal projections are not created atomically with settlement | Plan 05 remains the next safe implementation slice |
| `src/features/rent-income/actions.ts` and `src/features/rent-income/rent-income-workflow.ts` | Operators record partial or final receipts and can separately post to Ledger | Separate operator posting must disappear after Plan 05 |
| `src/features/rent-income/rent-income.types.ts` and the Rent & Income loaders | Current read models expose obligations, receipt history, and reversals, with no tenant invoice or formal receipt identity | Do not relabel current rows as invoices or formal receipts |
| `supabase/migrations/20260728120841_authoritative_lease_terms_and_rent_policy.sql` | The legacy monthly generator fails closed until Plan 09 consumes exact term and policy identities | Plan 09 owns charge occurrences and obligation generation |
| `src/features/reports/data/owner-statement-input.ts`, `src/features/reports/data/owner-statement.ts`, and `src/features/reports/data/owner-statement-report.ts` | The live Owner Statement reads current obligations and cash allocations | It is not a closed immutable statement version |
| `src/features/reports/data/pdf.ts` and `src/features/reports/data/report-documents.ts` | Report PDF/CSV bytes are generated on request | Generation is not retained statement, invoice, or receipt publication |
| `src/features/documents/actions.ts` and `src/features/documents/data/documents.ts` | Private document storage supports signed reads, replacement, archive, and file removal | The generic document workflow is not an immutable billing-artifact store |
| `src/app/(dashboard)/invoices/page.tsx` | `/invoices` redirects to `/bills-expenses` | It currently means vendor bills and cannot silently become tenant invoices |
| `src/app/(dashboard)/payments/page.tsx` | `/payments` redirects to `/rent-income` | It currently means incoming receipts despite the ratified terminology |
| `config/ui-route-coverage.json` and route coverage evidence | Both redirects are intentional compatibility routes today | Their later cutover requires explicit compatibility behavior and tests |

### Open and recently merged proposals

- PR #38 remains open, non-draft, changes-requested, and catalogue-only. Its
  invoice approval, delivery channel, workspace timezone/currency, and
  proration entries are proposals, not persisted or effective-dated runtime
  authority.
- PR #40 merged as
  `2dea9fb71a539e01ee81b4601f8965fb62a681d5`. It changed deterministic demo
  seed, current-state/verification prose, and test tooling. It added no tenant
  invoice, formal receipt, Owner Close plan, lease-authority, or finance
  settlement implementation. It remains the original runtime-audit baseline.
- PR #42 later merged the documentation-only Lease and Occupancy History
  package at reconciliation baseline
  `5210ae1c94fa5a854f9c484b79e9dbd214c99053`. This branch is rebased on that
  merge, adopts its cross-plan requirements, and does not treat the planning
  package as runtime implementation.

### Missing business logic

The merged product has no first-class:

- tenant invoice header, line, number, lifecycle, approval, issuance, artifact,
  or delivery history;
- formal tenant receipt number, immutable artifact, publication state, or
  delivery history;
- atomic receipt/allocation/Ledger/journal transaction;
- obligation-to-invoice and allocation-to-invoice-line identity;
- document-series authority for invoice and receipt numbers;
- delivery configuration with auditable version/snapshot identity; or
- migration classification for historical records that never had billing
  artifacts.

## Domain authority decisions

### Source-of-authority matrix

| Concept | Sole authority | What it proves | What it does not prove |
|---|---|---|---|
| Accepted relationship/date evidence | Track B checked relationship-evidence resolver | Exact accepted party/Person/occupancy/participant/notice candidates, versions, boundary/confidence/resolution states, reasons, and material hash | Debtor/recipient selection, term/policy interpretation, financial dates/calculation, owner state/action, or mutation |
| Authoritative lease/rent terms | Plan 04 normalized term plus effective rent-policy version | Which term and policy Track A applies | Accepted relationship history, that a charge was generated, billed, or paid |
| Charge occurrence and approved calculation snapshot | Plan 09 occurrence record and Track A calculation owner | A specific term/policy and exact consumed Track B evidence produced one approved service window, due/proration result, debtor/recipient decision, amount, and generation outcome | Tenant-facing issuance or payment |
| Income obligation | Domain obligation, currently `finance_income_items` | Amount owed and current balance from valid allocations/reversals | Invoice publication, cash, or Ledger posting |
| Tenant invoice | Unnumbered tenant-invoice coordination slice: header, lines, snapshots, lifecycle events, and issued artifact identity | What Nestory approved and issued to the Plan 09-selected debtor/recipient from the frozen occurrence/evidence snapshot | That it was delivered or paid |
| Receipt event | Plan 05 `finance_receipts` header plus allocation identities | Money actually received and how it was allocated | That a formal receipt document was published |
| Formal receipt document | Unnumbered formal-receipt coordination slice: publication, immutable artifact, and delivery records | What receipt evidence was published to the tenant | New cash or a change to settlement truth |
| Ledger projection | Source-linked deterministic `ledger_entries` row | Operational cash projection/control | Invoice, receipt-document, or journal authority |
| Journal projection | Source-linked balanced journal entry and lines | Accounting control projection | Product-facing billing authority |
| Property close | Append-only close revision | The approved property-period evidence set | A tenant or owner document by itself |
| Owner Statement | Plan 17 version plus Plans 18-19 artifact and delivery records | Owner-facing closed-period publication | Tenant billing or tenant delivery authority |

### Charge occurrence

A charge occurrence is immutable evidence that one exact lease term and
rent-policy version expected one charge for one period. It carries:

- organization, property, unit, lease, authoritative term, and policy-version
  identities;
- exact accepted Track B party/Person/occupancy/participant/notice source IDs
  and versions, resolver version, resolution/reason codes, requested evidence
  period, and material relationship-evidence hash consumed by Track A;
- charge type, service period, due date, exact amount, and currency;
- Track A-selected debtor and recipient, with `billing_contact` retained only
  as recipient/contact evidence unless independent debtor rules select that
  party;
- proration/notice inputs, selected versus ignored evidence reasons, blockers,
  method, and approved calculation snapshot/hash;
- idempotency/source key; and
- an append-only outcome: `generated`, `waived`, `cancelled`, or `blocked`,
  with the exact linked obligation when generated.

Correction creates a linked cancellation/replacement outcome; it does not
rewrite history. An occurrence is neither a tenant-facing invoice nor payment
evidence.

### Income obligation and outstanding balance

The obligation is the amount owed. Its authoritative balance is:

```text
obligation amount
- valid receipt allocations
- reversing allocations' signed effect
= outstanding balance
```

Invoice, delivery, Ledger, journal, and Owner Statement state never replace
this calculation. Compatibility `amount_received` and status fields may be
refreshed transactionally, but they remain derived.

### Tenant invoice

The safe invoice model has three independent axes:

| Axis | States | Authority |
|---|---|---|
| Economic lifecycle | `draft` -> `pending_review` -> `reviewed` -> `approved` -> `issuing` -> `issued`; technical terminal `issuance_abandoned`; issued terminal linked outcomes `cancelled` or `superseded` | Checked tenant-invoice owner commands and append-only events |
| Delivery | `not_requested`, `pending`, `sent`, `delivered`, `failed` | Delivery attempts/outcomes referencing one issued artifact |
| Settlement | `unpaid`, `partially_paid`, `paid` | Derived only from valid receipt allocations/reversals |

`sent`, `partially_paid`, and `paid` are therefore not approval states. A
display may combine the axes, but persistence and authorization must not.

`generated` is the append-only event that creates the initial `draft`; it is
not a second lifecycle state. Review and approval are distinct events with
separate actors/timestamps. They may use the same actor only if the approved
capability policy permits it; this plan does not invent a separation-of-duties
rule.

The invoice has a stable internal ID at draft creation. It receives a
human-readable number only when checked issuance starts. Issuance:

- requires the configured role/capability and, for the October pilot, a manual
  review and approval record;
- freezes organization, property, unit, lease, tenant/recipient, address/contact,
  issue/due/service dates, currency, line economics, source identities, and
  policy/configuration snapshots;
- binds each normal new-business line to its exact charge occurrence and
  obligation; the Plan 20 migration exception instead binds the exact legacy
  obligation and reviewed manifest item and records typed absence for historical
  occurrence, term, or policy authority that cannot be proven;
- creates or reserves the retained artifact identity;
- is payload-idempotent; and
- cannot be bypassed by direct Data API or generic document mutation.

The unnumbered tenant-invoice slice consumes the occurrence's Plan 09-approved
debtor/recipient identities, calculation, and relationship-evidence snapshot.
It may refresh current contact evidence while a draft remains regenerable, but
only to approve and freeze issue-time contact/address/delivery evidence for the
same Plan 09-selected recipient. It cannot change recipient identity, never
asks Track B to choose one, and never treats a `billing_contact` role alone as
debtor authority.

Drafts may be regenerated through a checked command while retaining audit
history. Issued economics and recipient snapshots are immutable.

For the safe MVP, an unpaid issued invoice may be cancelled through a linked
event and replaced by a newly reviewed invoice with a new number. The original
remains retained and becomes `superseded` only after the replacement is
issued. `credited` is not an MVP lifecycle state; a future display may derive
it only from an approved immutable credit-note relation. Credit notes and
economic corrections after partial or full payment are deferred; such cases
block automated correction and close until IPS approves a
credit/refund/carry-forward policy. Receipt reversal must never be used when
cash was not actually reversed.

Settlement, exact reversal, and cancellation acquire the shared obligation,
invoice, and property-period locks in the same deterministic order. Settlement
may freeze only the current active `issued` header/version/line, never a
`cancelled`, `superseded`, or `issuance_abandoned` identity. Cancellation is
eligible only when no allocation exists or every positive allocation against
that line has an exact directly linked committed Plan 05 reversal and the net
unreversed signed effect is zero. Any nonzero, unmatched, duplicate, or
in-flight effect blocks. Cancellation committing first blocks new settlement
until a reviewed replacement is issued. Original/reversing allocations,
projections, activity, and invoice links remain immutable and never retarget.

### Payment receipt event

The receipt event exists only after money is actually received. A checked Plan
05 transaction must atomically:

1. validate actor, organization/property/lease scope, reconciliation source,
   open period, currency, remaining balance, and idempotency payload;
2. resolve the immutable supported economic class and at least one applicable
   accounting-book mapping, failing before any source mutation when the class
   is unsupported or any book mapping is zero, missing, duplicate, or unmapped;
3. write one immutable receipt header and one allocation;
4. create exactly one allocation-linked Ledger projection plus exactly one
   balanced journal entry with complete lines for every applicable accounting
   book;
5. refresh obligation compatibility totals/status;
6. write linked activity evidence; and
7. return all source and projection identities.

Partial payment and multiple sequential receipts against one obligation are
supported. Reversal preserves the original and creates one exact linked
reversing receipt/allocation and the corresponding reversing projections in
the same transaction. Operators never separately post or edit a source-linked
projection.

For activated Plan 09 sources, the receipt/allocation freezes the exact
obligation/occurrence/term, Track A-approved calculation, selected
debtor/recipient identities, accepted relationship-evidence scope, and current
active issued tenant-invoice header/version/line under the shared
obligation/invoice/property-period locks. It never later resolves an
obligation-only allocation to an invoice line. Classified pre-invoice, manual,
or legacy cash may retain only its exact obligation identity, but is never
formal-receipt eligible. A formal receipt copies the allocation-frozen
tenant-invoice and Plan 05 settlement snapshots. Neither settlement nor
publication re-resolves a tenant, recipient, Unit, or occupancy from current
Lease/Person/party/contact rows. Legacy rows without event-time identity remain
typed `NULL`/unresolved rather than adopting today's primary Person.

### Formal receipt document

Formal receipt publication is an unnumbered coordination slice, separate from
Plan 05 settlement:

- cash commits even if rendering or delivery is unavailable;
- a failed publication cannot roll back or duplicate cash;
- publication retries are payload-idempotent; and
- automatic policy may insert a durable outbox row in the settlement
  transaction, but workers process it only after commit; the row is a
  post-commit trigger, not an artifact or authority for uncommitted cash.

Publication, delivery, and cash-reversal state are independent:

| Axis | States | Authority |
|---|---|---|
| Publication lifecycle | `pending_publication` or reversal-only `blocked_dependency` -> `publishing` -> `published`; recoverable `failed`; terminal `publication_abandoned`; linked `superseded` only for a non-economic reissue | Checked formal-receipt owner commands/events |
| Delivery | `not_requested`, `pending`, `sent`, `delivered`, `failed` | Append-only delivery attempts/outcomes |
| Cash reversal | `active` or `reversed` | Derived only from exact Plan 05 reversing receipt/allocation identity |

Formal publication requires the exact issued tenant-invoice
header/version/line frozen on the committed Plan 05 allocation. Classified
pre-invoice, manual, or legacy cash is typed
`legacy_cash_non_publishable` with
`invoice_identity_not_historically_available` and
`artifact_not_historically_created`; it cannot enter this lifecycle. A future
contemporary legacy-payment acknowledgment is a separate, currently unapproved
document type and is not a formal receipt.

The checked publication command locks its operation/idempotency key and
resolves same-payload replay before it touches the receipt-number series. Only
a new request reserves a stable number and snapshots the payer,
tenant/recipient, lease, property, unit, received date, exact amount/currency,
allocation, frozen invoice identity, and remaining balance immediately after
that payment. It explicitly labels partial payment. Payment method is included
only after IPS approves a controlled method set.

Published bytes, checksum, economic snapshot, and number are immutable.
Print/download uses the retained artifact. Delivery attempts append to a
separate history. When the original allocation is formal-receipt eligible or
already has a formal-publication chain, its receipt reversal requires a
separately numbered void/reversal receipt referencing the original; the
original is retained and never overwritten or deleted. If the original is
`publication_abandoned`, an approved linked replacement uses the same committed
source/frozen economic snapshot and a new number/artifact while retaining the
abandoned row and number. A published original or approved linked replacement
satisfies the reversal document's `blocked_dependency`; cash reversal never
waits for publication, while close waits for the required artifact chain.
Reversal of `legacy_cash_non_publishable` remains Plan 05
cash/reconciliation evidence and creates neither an original nor reversal
formal receipt. Later invoice cancellation/replacement after complete exact
reversal neither waits for publication nor deletes, retargets, or rewrites the
original/reversal publication chains or their close dependencies.

### Ledger and journals

Ledger and journals remain deterministic projections and controls. They are
not invoice authority, receipt-document authority, or operator-editable source
truth. Generic Ledger or journal actions must reject mutation, archiving,
re-dating, posting, or reversal of source-linked receipt projections and direct
the operator to the source workflow.

Track A exposes allowlisted exact canonical source -> Ledger projection ->
accounting journal/line identities and the permission-checked reverse route.
A non-unique source index is never treated as one-to-one. Track B history may
render only those exact links; it cannot attribute a financial row from
property, Unit, date, amount, display name, or current tenant, and projections
never become relationship authority.

### Owner Statement

The Owner Statement remains an owner-facing artifact for one exact close
revision. Plans 17 through 19 may consume tenant invoice and receipt artifact
links as supporting evidence, but they do not create or deliver tenant
documents.

Owner Statement data records whether each source document is:

- `artifact_available` with exact version/artifact identity;
- `artifact_not_historically_created` for classified legacy activity;
- `artifact_required_missing`, which blocks readiness under the approved pilot
  rule; or
- `artifact_publication_failed`, which retains the actionable failed attempt.

Tenant invoice delivery, tenant receipt delivery, and Owner Statement delivery
use separate policy/configuration snapshots and separate delivery histories.

Generic Documents retains versioning, immutability, metadata correction, and
supersession authority for signed lease amendments, inspections, and other
operational documents. Track A owns tenant
invoice artifacts, formal tenant receipt artifacts, close manifests, Owner
Statement versions/artifacts, and their immutable snapshots. A close/statement
freezes the exact generic-document version/checksum references actually used;
it does not become the generic document versioning authority.

## Safe MVP cardinality and deferred extensions

| Relationship or case | October safe model | Later extension or blocker |
|---|---|---|
| Charge occurrence to obligation | Exactly one generated obligation per occurrence | Split or aggregate obligations deferred |
| Obligation to invoice | At most one active/current invoice at a time for one obligation, with one source-bound line; cancelled/superseded replacements remain as a linked historical chain | Multi-obligation invoices deferred |
| Rent plus parking/utilities/fees | Separate typed occurrences, obligations, and invoices | Combined invoice requires multi-line/multi-obligation design |
| Receipt to obligation | Exactly one allocation to one obligation | Multi-allocation receipt deferred |
| Receipt to invoice | Activated Plan 09 cash freezes exactly one current active issued invoice header/version/line; classified pre-invoice/manual/legacy obligation-only cash remains allowed solely as non-publishable cash evidence | Cross-invoice allocation and retroactive invoice resolution deferred |
| Partial payment | Supported | None |
| Multiple receipts against one invoice | Supported sequentially | None |
| Unapplied cash | Not admitted to the pilot settlement flow; retain bank/reconciliation evidence without fabricated allocation and block close | Explicit unapplied-cash liability and allocation workflow required |
| Overpayment | Rejected by settlement; unresolved bank cash blocks close | Refund/advance-liability workflow required |
| Advance payment | Unsupported and blocking | Explicit tenant advance liability and later application workflow required |
| Deposits | Separate ratified Plan 10 custody source; never operating income or an ordinary rent invoice | Application/retention requires approved IPS policy |
| Credit note | Deferred and blocking | Dedicated immutable credit-note lifecycle and owner/close effects required |
| Invoice cancellation | Linked cancellation allowed only with no allocation or a zero net unreversed signed effect after every positive allocation is exactly reversed; all cash history remains retained | Nonzero, unmatched, duplicate, in-flight, paid, or partial cases block; credit/refund policy remains separate |
| Replacement invoice | New number and new artifact after linked cancellation; original retained | No in-place regeneration after issue |
| Receipt reversal | Exact linked reversing cash event plus separate reversal receipt publication | Never mutate the original |

Unsupported cardinalities are fail-closed capabilities, not hidden assumptions.

## Numbering, idempotency, and audit

Tenant invoices and formal receipts use separate organization-scoped document
series. Each series is an auditable configuration entity with immutable
format/version metadata. For both invoice issuance and formal receipt
publication, the checked transaction canonicalizes the payload and locks the
organization-scoped operation/idempotency key before it locks or allocates from
the relevant series. Same key/same hash returns the stored number/artifact
result; same key/changed payload fails before series allocation. Only a new
request locks the source and series, allocates one unique non-reusable number,
freezes the snapshot/artifact identity, and stores the result against that key
in the same transaction. Draft previews consume no number.

After reservation, render/finalization failure retains the same audited number
and artifact identity for retry. Explicit `issuance_abandoned` or
`publication_abandoned` records retain the reserved number, frozen payload,
actor, and reason without claiming an issued/published artifact. An approved
formal-receipt replacement uses the same committed source/frozen economic
snapshot and a new number/artifact, retains the abandoned row/number, and may
satisfy the related reversal-document dependency once published. Delivery
retries reuse the same published document and number.

Every material command has an organization-scoped request identity and
canonical payload hash. Same key and same payload returns the original result;
same key and different payload fails closed.

## Sequence reconciliation

The smallest coherent order is:

Track A Plan 05 and Track B TB-01 are independent next slices from the shared
merged planning baseline. Plan 05 remains Track A's next implementation-ready
slice; TB-01 remains Track B's next slice. They use separate branches/PRs and
must not be combined. Track A Plan 09 must wait for merged TB-05
relationship-evidence resolution before it generates relationship-aware
occurrences; no earlier Track B slice is copied into Plan 09.

1. Plan 05 first fixes current receipt/allocation authority and projections
   using obligation identity. It does not wait for invoices.
2. Plan 09 creates authoritative rent occurrences and obligations from Plan 04
   term/policy identities.
3. The unnumbered tenant-invoice coordination slice creates, reviews,
   approves, issues, retains, and delivers the tenant invoice. It follows
   Plan 09 because normal new-business invoice lines require exact occurrence
   and obligation links; only a Plan 20-reviewed migration line may use an
   exact legacy obligation/manifest item plus typed historical authority
   absences.
4. The unnumbered formal-receipt coordination slice publishes after Plan 05
   cash authority and the exact issued tenant-invoice header/version/line are
   frozen on its allocation. Legacy obligation-only cash remains explicitly
   classified and cannot enter formal-receipt publication.
5. Ratified Plans 17 through 19 consume, but never create, tenant billing
   evidence.
6. Ratified Plans 20 through 23 classify historical availability, backfill only
   canonical identities/evidence, run the pilot, and retire compatibility.

Plan 09 and the unnumbered tenant-invoice slice share one new-business cutover
gate. Plan 09 may merge and run in shadow/readiness mode first, but its
generated obligations do not become collectable through Plan 05 until the
invoice slice can create and issue the required invoice. At cutover:

- classified pre-invoice/manual/legacy obligations may continue to settle by
  obligation identity under Plan 05 but is not formal-receipt eligible;
- newly activated Plan 09 obligations require one current active issued
  tenant-invoice header/version/line before Plan 05 accepts cash; and
- every formal-receipt publication requires that exact allocation-frozen
  invoice identity.

This prevents cash received in the Plan 09-to-invoice implementation gap from
becoming neither normally invoiceable nor normally receipt-publishable.

Partial receipt and reversal update invoice settlement status by derivation.
They never mutate issued invoice economics. Formal receipt publication does not
alter either invoice or settlement truth.

## Terminology and route migration

Use these product meanings:

- **Tenant invoice:** money requested from a tenant.
- **Vendor bill:** money the managed property owes to a vendor.
- **Receipt:** evidence of money received.
- **Payment:** money paid out against a vendor bill.
- **Income obligation** or **receivable:** amount owed before settlement.

The future canonical tenant route is `/tenant-invoices`. Vendor records remain
at `/bills-expenses`.

At tenant-invoice cutover, `/invoices` must stop redirecting directly to
vendor Bills & Expenses, but it must not silently change meaning. Replace it
first with an explicit compatibility/disambiguation page that explains the old
alias and offers Tenant Invoices and Vendor Bills. Preserve relevant query
context when linking to the vendor destination. Only an explicit later
retirement decision after an observation window may assign or remove the
compatibility route.

Likewise, `/payments` must not silently change from its current incoming-cash
alias to outgoing vendor payments. During migration it becomes an explicit
compatibility/disambiguation surface; incoming cash remains Rent & Income or a
future `/tenant-receipts` surface, while outgoing settlement remains under
Bills & Expenses.

## Configuration boundary

| Rule | Authoritative home | Boundary |
|---|---|---|
| Approval required/optional | Effective/versioned tenant-billing policy | October pilot requires manual approval; a catalogue flag alone cannot activate behavior |
| Approval actor | Role/capability authorization plus immutable action record | Never a hard-coded staff name |
| Invoice number format | Invoice document-series configuration | Version/format snapshot retained at issuance |
| Receipt number format | Receipt document-series configuration | Separate sequence and snapshot retained at publication |
| Delivery channel and timing | Versioned delivery-channel configuration | Separate tenant invoice, tenant receipt, and Owner Statement policies |
| Automatic/manual sending | Delivery-channel configuration plus capability | Automatic mode remains disabled until approved and verified |
| Reminder timing | Delivery-channel configuration | No reminder rule is invented for the pilot |
| Automatic receipt delivery | Tenant-receipt delivery configuration | Publication can succeed independently of delivery |
| Workspace timezone | Controlled organization setting | Exact timezone snapshot retained on dates/artifacts |
| Currency | Controlled organization setting plus source/document snapshot | No silent currency conversion |
| Proration | Plan 04 effective-dated rent policy | Never replaced by generic configuration |

PR #38 may describe future catalogue entries but cannot become runtime
financial authority without the owning persisted/versioned entity, checked
commands, authorization, effective-date or snapshot semantics, and tests.

## Migration and pilot decisions

Use one canonical artifact-availability vocabulary across invoice, formal
receipt, and Owner Statement evidence:

- `artifact_available`;
- `artifact_not_historically_created`;
- `artifact_required_missing`; and
- `artifact_publication_failed`.

Document kind and reason codes distinguish invoice, original receipt,
reversal/void receipt, and Owner Statement cases without inventing synonymous
statuses.

- Never synthesize a historical issued invoice, invoice number, delivery event,
  formal receipt, receipt number, or artifact.
- Classify each legacy obligation and receipt as `artifact_available`,
  `artifact_not_historically_created`, `artifact_required_missing`, or
  `artifact_publication_failed`. Do not infer from
  amount/date/description.
- A selected open legacy obligation may receive a newly reviewed migration
  invoice only with the real current issue date, original service/due context,
  a migration disclosure, exact obligation link, and a new number. It is never
  backdated. Its line uses the exact Plan 20 manifest item and typed
  `occurrence_not_historically_created`,
  `term_authority_not_historically_available`, or
  `rent_policy_not_historically_available` classifications as applicable
  instead of fabricating a Plan 09 occurrence, term, or policy version.
- That Plan 20 migration invoice supports a later payment only if it is issued
  before the payment and the allocation freezes its exact
  header/version/line. It never attaches to already settled legacy cash.
- Historical settled receipts remain authoritative cash evidence without a
  claimed formal receipt artifact and retain
  `invoice_identity_not_historically_available` plus
  `artifact_not_historically_created`. A later contemporary acknowledgment, if
  IPS requires one, needs its own approved document type and is not planned as
  a historical or formal receipt.
- The pilot excludes unapplied cash, overpayments, advance payments, combined
  invoices, multi-allocation receipts, credit notes, and unresolved
  recipient/lease identity.
- The Plan 09/tenant-invoice cutover is atomic at the feature-policy level: no
  new-business generated obligation is exposed for settlement until invoice
  issuance is available and required.
- Missing required artifacts, unsupported cash, ambiguous legacy identity, or
  a configuration/policy version without evidence blocks close/cutover.

## Unresolved IPS decisions

These are business inputs, not facts to invent:

- whether approval can ever be optional and which capability may approve;
- allowed invoice and receipt series formats;
- tenant recipient/contact selection and fallback;
- approved delivery channels, timing, retry, reminders, and retention;
- supported payment-method codes;
- credit-note, refund, advance-payment, and unapplied-cash treatment;
- whether a contemporary legacy-payment acknowledgment is required;
- required invoice/receipt disclosures beyond operational content; and
- any Cambodian tax-invoice or legal requirements.

The October pilot uses manual approval, issuance confirmation, retained
download/print artifacts, and manual delivery evidence unless IPS approves a
narrower rule. This record does not claim tax-invoice compliance.

## Invariants

- Organization, workspace, property, unit, lease, tenant, and role isolation.
- Exact numeric money and explicit currency.
- Distinct service, due, issue, received, paid, posting, and delivery dates.
- Immutable issued invoice economics and recipient snapshots.
- Immutable receipt events and formal receipt artifacts.
- Append-only cancellation, replacement, credit, and reversal evidence.
- Stable typed source identities and exact links.
- Payload-bound idempotency and source-transaction atomicity.
- Every supported settlement has exactly one allocation-linked Ledger
  projection and exactly one balanced journal entry with complete lines for
  each of at least one applicable accounting book; zero, missing, duplicate,
  unsupported, or unmapped book mappings fail before source mutation.
- Every formal receipt consumes the exact issued invoice header/version/line
  frozen on its Plan 05 allocation; legacy obligation-only cash is
  non-publishable.
- Invoice and formal-receipt operation-key replay resolves before series
  allocation, and abandoned formal-receipt recovery retains the original
  row/number while linking a new number/artifact to the same source/snapshot.
- No generic mutation of source-linked projections.
- Track B evidence stays accepted/versioned relationship input; Track A owns
  debtor/recipient selection, term/policy calculation, owner states/actions,
  and immutable financial snapshots.
- Every composed financial consequence uses owner adapters and the complete
  deterministic source/destination property-period lock set in the same
  transaction.
- Property-period locking and reconciliation-source identity.
- Cash-basis property reporting.
- Deposits outside operating income until approved disposition.
- Owner Balance distinct from operating performance.
- No payroll, tax accounting, corporate P&L, general ERP, or product-facing
  general ledger.

## Acceptance criteria

This decision record is complete when:

1. all authority concepts in the source matrix remain distinct;
2. the safe cardinality is explicit and unsupported cases fail closed;
3. approval, issuance, delivery, settlement, and receipt publication are
   separate;
4. the implementation sequence gives invoice and receipt artifacts named
   owners;
5. Plan 05 can proceed for classified pre-invoice/manual/legacy cash without
   invoice identity, while activated Plan 09 cash requires the current issued
   identity and legacy cash cannot publish a formal receipt;
6. the two unnumbered tenant-document coordination slices consume exact
   Plan 09/05 sources, including the allocation-frozen invoice
   header/version/line;
7. Owner Statement plans only consume earlier tenant-document evidence;
8. route migration cannot silently change old bookmark meaning;
9. PR #38 remains non-authoritative and PR #40 remains outside the change;
10. migration never fabricates historical documents; and
11. Track B dependencies are explicit rather than copied into Track A;
12. Plan 09 owns term/policy interpretation, calculation dates, due/proration,
    blockers, debtor/recipient selection, and the approved snapshot while
    consuming exact Track B evidence; and
13. every affected financial action comes from the owning Track A adapter and
    executes only after all deterministic property-period locks are held;
14. invoice/formal-receipt operation-key locks resolve replay before their
    separate series allocate a number; and
15. abandonment recovery and reversal dependencies retain the abandoned formal
    receipt while accepting only a published original or approved linked
    same-source/same-snapshot replacement.

## Verification

For this documentation-only reconciliation:

- search the repository for invoice, receipt, charge, obligation, rent
  occurrence, Plan 05, Plan 09, every ratified sequence reference, and both
  unnumbered coordination aliases;
- verify every Markdown link and referenced repository path;
- verify files 98 and 99 are byte-unchanged;
- verify only authorized Track A documentation files changed;
- run available documentation/static checks plus `git diff --check`; and
- inspect the final diff against the exact baseline.

The application, database, browser, and hosted suites are not required because
this record changes no runtime, schema, configuration, generated type, seed, or
environment. Each implementation plan defines its own full verification.

## Scope exclusions

No application, UI, route, navigation, migration, RLS, RPC, generated type,
seed, delivery provider, portal, payment processor, tax logic, Owner Statement
calculation, hosted Supabase, Vercel deployment, PR merge, or ERP expansion is
authorized here.

## Deliverables

- this domain and cardinality decision record;
- the revised sequence and legacy mapping;
- narrow current Plan 05 plus the two unnumbered tenant-document coordination
  slices;
- updated current entry-point/status references; and
- a clean documentation-only draft PR.

## Recommended next implementation slice

**Plan:** 05 — Atomic income settlement, allocation, projection, and reversal
**Mode:** Standard
**Effort:** High
**Reason:** Current receipts can exist before the operator separately posts
Ledger activity. Plan 05 removes that split first, preserves accurate
obligation-based cash capture, and gives later invoice and receipt publication
one atomic settlement source without waiting for Plan 09 or tenant invoicing.

This recommendation does not implement, merge, deploy, or authorize hosted
execution.

## Stop conditions

Stop implementation planning or execution if any proposal:

- makes Ledger or journals invoice/receipt authority;
- permits a receipt event before money exists;
- permits silent issued-invoice or published-receipt mutation;
- conflates occurrence, obligation, invoice, cash receipt, or receipt document;
- silently repurposes tenant/vendor routes;
- invents IPS tax, credit, delivery, recipient, or payment-method policy;
- fabricates historical artifacts;
- confuses either unnumbered tenant-document alias with ratified Plan 10 or
  Plan 11; or
- requires Track A to edit Track B files.

## Reconciled Track B amendment dispositions

These dispositions adopt every requirement in Track B file 92 without copying
Track B semantics into Track A or authorizing implementation. “Pending” means
the named future slice must implement and verify the contract after its merged
prerequisites exist.

| # | Track B amendment | Track A adoption and owner | Implementation gate | Disposition |
|---:|---|---|---|---|
| 1 | Historical term/readiness resolution | Plan 04 remains term/policy authority. Plan 09 adds the checked historical as-of-service-date resolver and consumes TB-05 evidence without using today's Lease status. | TB-05 plus merged Plan 09 resolver before historical generation/correction. | Adopted; pending Plan 09. |
| 2 | Charge occurrence identity | Plan 09 freezes organization/property/Unit/Lease, exact term/policy, service interval, selected debtor/recipient, consumed Track B source IDs/versions/hash, and the Track A-approved calculation snapshot. | TB-05 and Plan 09 before occurrence generation. | Adopted; pending Plan 09. |
| 3 | Obligation, invoice, and receipt scope/snapshots | Plan 05 freezes settlement scope; the unnumbered tenant-invoice slice freezes occurrence/obligation/calculation/debtor/recipient and issued artifact; the unnumbered formal-receipt slice copies exact invoice/settlement scope and never re-resolves current rows. | Plan 05, Plan 09, and both unnumbered tenant-document slices in authority order. | Adopted across named owners. |
| 4 | `property_cash_events_v1` tenant attribution | Track A treats today's-primary-Person joins as a defect. New/replaced sources use source-stored/event-time identities; legacy ambiguity returns `NULL`/unresolved. | Exact source scope plus a future Track A view migration before authoritative historical cash display. | Adopted; pending source/view owner. |
| 5 | Deposit agreement and event-time relationship identity | Ratified Plan 10 owns deposit-parent freeze, custody events, depositor/liable-party snapshots, and checked successor actions. Track B never transfers custody. | Plan 10 action must be merged before any relationship transition requiring deposit mutation. | Adopted; pending Plan 10. |
| 6 | Dependency-state adapter and property-period action | Every Track A domain owner exposes a versioned read-only adapter and checked action. Composed execution acquires all source/destination scopes in deterministic order inside the same transaction. | Required adapter/action and Plan 03 lock primitive must be merged for each enabled cross-domain execution. | Adopted as mandatory shared contract. |
| 7 | Close/statement evidence versus generic Documents | Generic Documents owns operational-document versions/supersession. Track A owns tenant invoice/formal receipt/close/Owner Statement artifacts and freezes exact generic-document version/checksum references used by close. | Merged Documents contract plus Plans 16-18 before official evidence publication. | Adopted with explicit ownership split. |
| 8 | Maintenance/inspection financial handoff | Plan 07 preserves optional exact Lease/occupancy/party/Person context and hands finance to the owning Track A charge/bill source; general property/Unit work stays valid. | Track B TB-07 context and Plan 07 financial action before tenant-specific charging. | Adopted; pending Plan 07/TB-07 integration. |
| 9 | Compatibility retirement order | Plan 23 adds Track B normalized-history parity and Track A event-time attribution to its observation/retirement gate. | TB-05/TB-07 reads plus all exact Track A consumers and observation evidence. | Adopted; deferred to Plan 23. |
| 10 | Period-effective party and recipient-preference evidence | TB-05 returns separate responsibility and recipient candidates. Plan 09 selects debtor and recipient identity. The unnumbered tenant-invoice slice only approves/freezes issue-time contact evidence for that selected recipient. `billing_contact` never automatically becomes debtor. | TB-05 plus Plan 09 and the tenant-invoice slice before invoice generation/issue. | Adopted; pending consumers. |
| 11 | Date evidence and Track A calculation precedence | Track B labels actual/scheduled/notice/missing/conflicting facts. Plan 09 alone applies Plan 04 precedence, service bounds, due date, proration/notice rules, and blockers. | TB-05 and approved Gate F policy before Plan 09 generation. | Adopted; pending Plan 09. |
| 12 | Relationship evidence input and approved calculation snapshot | Track B owns the versioned evidence envelope/hash. Plan 09 owns and stores the selected calculation/debtor/recipient snapshot/hash; the unnumbered tenant-invoice slice consumes it without recomputation. | TB-05 plus Plan 09 snapshot contract. | Adopted; pending Plan 09/TB-05. |
| 13 | Typed affected occurrence identities on supersession | The merged Track A owner adapter returns occurrence/draft identities, material states, scopes, hashes, and actions. Track B transports opaque results and never rewrites financial history. | Adapter, selected owner action, and deterministic locks before TB-03/TB-06 execution with dependencies. | Adopted as mandatory adapter boundary. |
| 14 | Exact Ledger/journal navigation without authority transfer | Track A owns allowlisted canonical source -> Ledger -> journal/line identities and reverse routes. Track B may display exact permission-gated links only; legacy ambiguity remains unresolved. | Merged Track A projection registry before finance-linked Track B navigation. | Adopted; pending projection registry/adoption. |

The retained Track A internal decisions remain unchanged: use
`05-atomic-income-settlement.md` rather than the legacy Plan 03 filename;
Plan 09 and the two unnumbered tenant-document slices create tenant billing
evidence while ratified Plans 17-19 only consume it; and PR #38 remains
catalogue-only until every rule points to its owning
persisted/versioned authority.
