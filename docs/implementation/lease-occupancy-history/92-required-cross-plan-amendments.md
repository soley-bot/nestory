# Required Cross-Plan Amendments

## Purpose and ownership

These amendments are requirements for Track A's financial and publication
owners to consume stable Track B evidence. They do not authorize Track B to
edit Owner Close files or implement finance lifecycles. Track B owns only its
relationship-evidence contracts; Track A owns authoritative term/policy
interpretation, calculation semantics and snapshots, financial states/actions,
and financial/Owner Statement publication records.

Track B remains independent of Track A's unmerged branch. The amendments may
be applied during final reconciliation or the named owner slice, subject to
each blocking decision.

For coordination only, the source thread communicated these local, unmerged
Track A labels:

```text
local Plan 05 income settlement
-> local Plan 09 rent occurrences
-> local Plan 10 tenant invoice
-> local Plan 11 formal receipt publication
```

These are coordination aliases, not ratified Owner Close sequence numbers.
They do not renumber Plan 10 (security deposits) or Plan 11 (management fees)
in `docs/implementation/owner-close/97-ratified-final-sequence.md`, and they
grant no implementation authority. Amendments 10 through 14 use the local
labels only in that limited sense.

### Received coordination requirements

The cross-track reconciliation request is recorded here without losing any
requested concept:

1. Define a checked, period-effective charge-obligor and billing-recipient
   resolver; `billing_contact` is not automatically the debtor; expose stable
   party/contact identities and snapshots for the local tenant-invoice
   consumer.
2. Define precedence among authoritative term dates and scheduled/actual
   occupancy or notice dates, and return approved effective calculation dates
   and reason codes to the occurrence owner.
3. Extend readiness/output with the exact approved calculation snapshot plus
   term/policy IDs; Track A consumes and never edits Track B relationship
   evidence semantics.
4. Any term/party/occupancy supersession after an occurrence exists returns
   typed affected occurrence/draft identities; Track B never rewrites
   obligations, invoices, receipts, projections, or statements.

The amendments below reconcile those requirements with ratified ownership:
Track B implements the relationship-evidence side of items 1-3; Track A
selects legal obligor/recipient, applies term/policy date precedence, and owns
the approved calculation snapshot. Item 4 flows through the merged Track A
owner-state adapter. The local invoice/receipt labels remain aliases only.

## Amendment 1 — Historical term/readiness resolution

- **Owning track:** Track A owns historical term/policy readiness and
  occurrence calculation; Track B owns the accepted relationship-evidence
  resolver it consumes.
- **Consuming track:** Track A Plan 09 and TB-06 when requesting a merged draft
  regeneration action.
- **Authorization status:** Plan 04 and ratified Plan 09 establish the owner;
  this integration amendment is unmerged and authorizes no implementation.
- **Merged prerequisite:** TB-05 relationship evidence, Plan 04 authoritative
  term/policy resolution, and the merged Track A historical occurrence action.
- **Target planning package:** Owner Close, Plan 04 authoritative lease terms
  and Plan 09 rent occurrences.
- **Target concept or file:**
  `docs/implementation/owner-close/04-authoritative-lease-terms-and-rent-policy.md`
  and the implementation-ready Plan 09 occurrence prompt/file when prepared.
- **Repository evidence:** Plan 04 makes `lease_terms` authoritative and
  non-overlapping, but `resolve_lease_rent_readiness(...)` reads the current
  Lease state and current active/upcoming terms. It does not read
  `lease_parties` or `lease_occupancies`; ended, cancelled, terminated, or
  archived current Lease state cannot safely drive a historical catch-up
  answer. See
  `supabase/migrations/20260728120841_authoritative_lease_terms_and_rent_policy.sql`
  term/readiness functions.
- **Required decision or wording:** Define a historical "as of service date"
  term resolver that does not depend on today's Lease status, and either
  narrow the current function name/copy to "rent-term readiness" or explicitly
  integrate Track B's accepted party/occupancy resolver when approved policy
  uses move-in, move-out, or notice facts. Never infer occupancy from term or
  header dates.
- **Reason:** Historical rent generation and correction must use the term and
  relationship facts that applied then, not today's compatibility row.
- **Blocks this track:** No for TB-01 through TB-05. Yes for any TB-06 action
  that must regenerate historical/future rent under an ended or replaced
  lease; that action must stop until the Track B relationship-evidence
  resolver and the Track A historical term/calculation action are both merged.
- **Can wait for final reconciliation:** Yes for the independent integrity,
  history, migration, and read slices. No before Plan 09 generation or a
  continuity workflow claims that rent dependencies were safely handled.

## Amendment 2 — Charge occurrence identity

- **Owning track:** Track A owns occurrence schema, calculation identity, and
  immutable financial scope; Track B owns only referenced relationship
  evidence.
- **Consuming track:** Track A obligations/invoices/receipts and Track B
  impact/continuity previews.
- **Authorization status:** Ratified Plan 09 requires occurrence work, but this
  identity amendment is unmerged and grants no schema authority to Track B.
- **Merged prerequisite:** Plan 04 authority, TB-05 relationship evidence, and
  a merged Track A occurrence schema/action.
- **Target planning package:** Owner Close Plan 09, idempotent rent occurrences
  and range generation.
- **Target concept or file:** Ratified sequence row 09 and the successor to
  legacy `06-rent-schedules-and-charge-completeness.md`.
- **Repository evidence:** No occurrence table is implemented. Current
  `finance_income_items` can link a Lease, Unit, and payer Person but has no
  exact lease-term, lease-party, or occupancy identity. Plan 04 intentionally
  deferred occurrences.
- **Required decision or wording:** Every rent occurrence must retain exact
  organization, property, unit, lease, authoritative `lease_term_id`, rent
  policy version, service interval, and Track A-owned approved calculation
  inputs/snapshot. It must retain the exact Track B relationship evidence
  consumed: applicable responsible party/person and, when move/notice policy
  is used, accepted occupancy ID/version as of the service interval. Track A
  applies the authoritative term/policy and owns the calculation outcome. It
  must not use `tenant_name`, current `primary_tenant_person_id`, or current
  Lease status as historical evidence.
- **Reason:** A later tenant, unit, occupancy, or status change must not
  reinterpret what an old occurrence charged or who it addressed.
- **Blocks this track:** No for Track B history. It blocks TB-06 from
  automatically regenerating rent drafts after extension/replacement when
  occurrences exist but lack this identity.
- **Can wait for final reconciliation:** Yes until Plan 09 or the first
  cross-track continuity case that touches rent drafts. It cannot wait past
  occurrence implementation.

## Amendment 3 — Obligation, invoice, and receipt scope/snapshots

- **Owning track:** Track A owns obligations, invoice/receipt scope, settlement
  allocation, publication snapshots, and corrections.
- **Consuming track:** Track B impact/continuity plus Track A financial and
  statement consumers.
- **Authorization status:** Ratified settlement/occurrence gates establish
  invariants; authoritative tenant-invoice/formal-receipt slices remain future
  and unmerged.
- **Merged prerequisite:** Amendment 2 occurrence identity, canonical Track A
  settlement/allocation protections, and the applicable merged
  invoice/receipt owner contract.
- **Target planning package:** Owner Close Plan 05 income settlement, Plan 09
  occurrence generation, and the separate tenant invoice/formal receipt
  planning package.
- **Target concept or file:** Ratified sequence rows 05 and 09; future
  tenant-invoice and receipt-artifact authority.
- **Repository evidence:** `finance_income_items` stores optional Lease, Unit,
  payer Person, and payer label but no term/occurrence/party/occupancy.
  Receipt allocations point to obligations, while receipt headers store a
  payer label rather than exact historical tenancy. No authoritative issued
  invoice/formal receipt snapshot lifecycle exists.
- **Required decision or wording:** A rent obligation inherits the
  occurrence's exact organization/property/Unit/Lease, occurrence, term,
  responsible-party/Person, and accepted occupancy identity, plus the Track
  A-owned approved calculation snapshot. That scope freezes at the earliest
  of approval/issuance or first settlement/allocation; a draft may regenerate
  only before that boundary. An invoice retains exact obligations and
  occurrences plus issue-time Lease/Unit, term, party/Person, occupancy,
  recipient, name, address, and contact snapshots. A receipt header retains a
  stable payer identity and payer display snapshot, and its `total_amount`
  must equal the exact sum of its allocation amounts in the same currency.
  Each allocation freezes its exact obligation/occurrence/term/party/occupancy
  scope and classification. A correction creates a reversal allocation that
  links directly to the original allocation; it never reclassifies or
  reassigns the original. A formal receipt retains the exact header,
  allocation set, payer, tenant context, and publication snapshot. Ledger
  entries and journals are derived projections only and never supply or
  rewrite any of these identities. Issued, settled, or published artifacts
  are cancelled, credited, directly reversed, or replaced through their
  owner; they are never silently rewritten.
- **Reason:** Current master-data edits and successor leases must not change
  who an issued invoice or receipt represented.
- **Blocks this track:** No for Track B source history. Yes for a TB-03/TB-06
  requested action that would reassign or regenerate an issued/settled
  financial record; Track B must report the unavailable Track A action.
- **Can wait for final reconciliation:** Yes for early Track B slices. No
  before invoice/formal-receipt implementation or before continuity execution
  claims those artifacts were handled.

## Amendment 4 — `property_cash_events_v1` tenant attribution

- **Owning track:** Track A owns canonical cash-event attribution and the
  `property_cash_events_v1` contract; Track B owns relationship evidence only.
- **Consuming track:** Ledger/property-cash/Owner Statement readers and Track B
  permission-gated navigation.
- **Authorization status:** The current view is implemented; this attribution
  amendment is unmerged and authorizes no Track B finance edit.
- **Merged prerequisite:** Exact occurrence/obligation/receipt/deposit
  event-time relationship scope and a merged Track A view migration.
- **Target planning package:** Owner Close Plan 02 canonical property-cash
  contract and its later consumer/cutover amendments.
- **Target concept or file:** `docs/property-cash-events-v1.md` and
  `supabase/migrations/20260727081219_property_cash_events_v1.sql` successor.
- **Repository evidence:** Receipt-allocation and deposit branches join their
  source Lease and then use current `leases.primary_tenant_person_id` for
  tenant context. The documentation permits tenant identity from the exact
  Lease, but exact Lease identity is not the same as event-time tenant
  identity.
- **Required decision or wording:** Historical cash/deposit event rows must
  emit tenant/person context only from source-stored or immutable
  effective-date relationship identity. If legacy evidence cannot resolve it,
  return null/unresolved rather than current primary tenant. Preserve the
  exact Lease/Unit/term/party/occupancy IDs where the source owns them.
- **Reason:** Replacing a current primary tenant can otherwise retroactively
  relabel an old receipt or deposit event without changing the cash source.
- **Blocks this track:** No for Track B's Unit/Person/Lease history, which will
  label finance as a separate context. Yes before any combined historical view
  presents cash-event tenant attribution as authoritative.
- **Can wait for final reconciliation:** Yes through TB-05 if finance context
  remains clearly unresolved/separate. No before Track A report cutover,
  statement publication, or TB-07 finance-linked display adoption.

## Amendment 5 — Deposit agreement and event-time relationship identity

- **Owning track:** Track A owns deposit agreement/custody events and checked
  mutation/transfer/refund/retention actions.
- **Consuming track:** TB-03/TB-06 impact and continuity plus Track A close and
  statement evidence.
- **Authorization status:** Ratified Plan 10 owns security-deposit custody;
  the parent-mutation guard and successor actions described here are unmerged.
- **Merged prerequisite:** A merged Track A custody-event-safe deposit parent
  guard and every checked action required by the proposed transition.
- **Target planning package:** Owner Close Plan 10 security-deposit custody and
  limited disposition.
- **Target concept or file:** Ratified sequence row 10 and legacy
  `07-security-deposit-custody.md`.
- **Repository evidence:** `lease_deposits` links a Lease and deposit events
  link the deposit parent, but the Lease compatibility trigger can rewrite the
  deposit agreement row from Lease form values. Deposit cash reporting can
  derive tenant from the Lease's current primary person. There is no checked
  successor-lease custody transfer, and no current invariant prevents a Lease
  form or compatibility write from rewriting the deposit agreement after a
  custody event exists.
- **Required decision or wording:** Freeze deposit agreement scope once an
  event exists; retain event-time Lease, Unit where displayed, named
  depositor/liable party only when explicitly stored, and exact reversal
  identity. A replacement/transfer Lease receives no deposit automatically.
  Refund, retention, application, or transfer uses a Track A checked custody
  event and never a Track B row reassignment. The freeze guard must cover the
  compatibility trigger and direct/form write paths, not only a future TB-06
  transfer flow.
- **Reason:** Deposit custody is a liability, not rent income, and cannot move
  merely because tenant or Unit projections change.
- **Blocks this track:** No for TB-01 through TB-05 when they do not write
  deposit-backed Lease form fields. Yes before any Track B execution may edit
  those fields after a custody event, and for TB-06 when an operator requests
  a deposit action during replacement or transfer and that Track A operation
  is unavailable.
- **Can wait for final reconciliation:** Yes until the first continuity case
  with a held deposit or Plan 10 implementation. It cannot be inferred or
  silently deferred during that execution.

## Amendment 6 — Dependency-state adapter and property-period action

- **Owning track:** Each Track A domain owner classifies its financial state,
  action, and property-period scope; Track B owns only impact transport and its
  own relationship executor.
- **Consuming track:** TB-03/TB-06 and every Track A owner participating in a
  composed correction.
- **Authorization status:** The financial authority kernel establishes the
  lock boundary; this adapter/action integration is unmerged.
- **Merged prerequisite:** Typed owner-state adapters, composable
  assert-open/property-period locks, and the selected checked owner action.
- **Target planning package:** Owner Close Plans 05 through 18, especially
  settlement, readiness, close/reopen, and statement publication.
- **Target concept or file:** Ratified sequence state machines and shared
  financial-authority kernel integration.
- **Repository evidence:** Track B can discover linked current obligations,
  receipts, deposits, Ledger/Timeline/Documents, and period/statement
  evidence, but only each domain owner can say whether a row is draft,
  approved, issued, settled, closed, or published and execute the permitted
  correction. The financial kernel already defines property-period
  serialization, typed source identity, and idempotency foundations.
- **Required decision or wording:** Expose a versioned, read-only Track A
  dependency adapter that returns exact source identity, material state,
  property/currency/period scope, and available action. Expose checked
  operations for draft regeneration, approval reset, financial reversal,
  authorized reopen/restatement, and artifact replacement as each Plan lands.
  Only this merged owner adapter may classify financial state or permissible
  action; if the relevant adapter/action is absent, Track B returns
  unresolved/unavailable and does not infer an answer. Track A must also
  expose a composable property-period lock/assert-open primitive. In the same
  transaction as the Track B write, the executor resolves every affected
  source and destination organization/property/currency/period scope,
  acquires all such locks in one documented deterministic order, rechecks the
  owner adapter and impact token while locks are held, and only then calls the
  selected checked action and writes. The lock/revision boundary also covers
  material relationship-parent edits referenced by close evidence. Preview
  and adapter reads write no activity or idempotency state; only execution
  attempts record successful or failed results. Track B never edits Track A
  tables directly.
- **Reason:** The impact UI needs more than "dependencies exist", while domain
  lifecycle ownership and financial locks must remain centralized.
- **Blocks this track:** No for a write-free preview that reports unresolved
  or unavailable actions. Yes for executing any change whose required Track A
  adapter/action is unavailable, or whose affected financial scopes cannot all
  be locked in the same transaction.
- **Can wait for final reconciliation:** Yes for dependency-free Track B
  operations. No for each cross-domain execution path before it is enabled.

## Amendment 7 — Close/statement evidence versus generic Documents

- **Owning track:** Generic Documents/source owners own operational-document
  versions; Track A owns close manifests, Owner Statements, and their evidence
  snapshots.
- **Consuming track:** TB-07 exact evidence links and Track A
  close/publication/replacement.
- **Authorization status:** Statement ownership is ratified; the generic
  Documents integration/version contract remains owner-defined and unmerged.
- **Merged prerequisite:** A merged generic Documents/source-owner
  version/publication contract plus the merged Track A close/statement
  evidence-snapshot contract.
- **Target planning package:** Owner Close Plans 16 through 19 and document
  publication authority.
- **Target concept or file:** Ratified close, statement schema, official
  artifact, and replacement-publication slices; legacy
  `11-immutable-owner-statement-publication.md`.
- **Repository evidence:** Current documents can link property, unit, Lease,
  task, Timeline, and Ledger, but not party/occupancy, and current update paths
  can replace file/link metadata. Current statement loaders rely on current
  records. Ratified planning requires immutable statement versions and
  artifacts.
- **Required decision or wording:** Split ownership explicitly:
  - The generic Documents domain owns versioning, immutability, metadata
    correction, and superseding/replacement of signed lease amendments,
    inspections, and other generic evidence. Track B may add exact
    Lease/party/occupancy links through that domain contract.
  - Track A owns close manifests, Owner Statement versions/artifacts, and the
    immutable evidence snapshot used by close/publication. That snapshot
    retains exact typed financial sources plus Lease, Unit, term, invoice,
    receipt/allocation, relationship IDs, and the generic-document
    version/checksum references actually used.
  Track A statement replacement does not replace or become the versioning
  authority for a generic document. A later relationship correction preserves
  prior statement and document versions/bytes and uses the owning domain's
  reopen/restatement/supersession/replacement rule.
- **Reason:** Exact historical source identity and displayed evidence must
  survive later Person, Lease, party, occupancy, and Unit changes.
- **Blocks this track:** No for Track B history and optional evidence links.
  Yes before TB-07 or Track A presents a published artifact as dynamically
  rebuilt historical truth.
- **Can wait for final reconciliation:** Yes until statement/document
  publication adoption. No before official artifact issuance.

## Amendment 8 — Maintenance/inspection financial handoff

- **Owning track:** Maintenance/inspection owns operational context; Track A
  owns charge/bill/cash attribution; the Timeline owner owns its typed source
  registry.
- **Consuming track:** TB-07 operational adoption and Track A Plan 07/statement
  consumers.
- **Authorization status:** Ratified Plan 07 defines the financial owner; this
  exact context/registry integration is unmerged.
- **Merged prerequisite:** TB-07 exact tenancy context, an allowlisted
  organization-aware Timeline source registry, and the applicable merged Track
  A charge/bill action.
- **Target planning package:** Owner Close Plan 07 maintenance task-to-bill
  handoff and related expense settlement.
- **Target concept or file:** Ratified sequence row 07 and the maintenance
  portion of legacy `05-maintenance-and-petty-cash-handoffs.md`.
- **Repository evidence:** Current requests/tasks have property/unit and
  requester/vendor context but no Lease/occupancy. Not every maintenance task
  is tenancy-specific. Finance expense items can link a task, and Tenant
  Requests include a requester Person.
- **Required decision or wording:** Preserve property/unit as the normal
  maintenance scope. When a task/inspection is explicitly tenancy-specific or
  supports a tenant charge, retain exact Lease, occupancy, party/person, and
  evidence-date context at the handoff. Do not infer the tenant from the
  Unit's current Lease when billing or reporting later. Any Timeline
  projection from this or another dependency uses a typed, allowlisted source
  registry that binds source type to its owning domain, organization check,
  resolver, and route. Each domain writes its own projection through that
  registry; callers cannot choose an arbitrary `source_type`/`source_id` or
  write another domain's event.
- **Reason:** A repaired Unit can have many historical renters, and general
  property work must not be forced onto a Lease.
- **Blocks this track:** No for TB-07 adding optional operational context. Yes
  for any tenant chargeback or financial attribution built from that context.
- **Can wait for final reconciliation:** Yes until Plan 07 financial handoff.
  It cannot wait past chargeback or statement consumption.

## Amendment 9 — Compatibility retirement order

- **Owning track:** Track A owns retirement of financial compatibility
  consumers under Plan 23; Track B owns parity for relationship-history
  consumers and projections.
- **Consuming track:** All Lease/People/Unit/finance/report/search readers.
- **Authorization status:** Ratified Plan 23 owns the final retirement gate;
  this added Track B parity prerequisite is unmerged.
- **Merged prerequisite:** Merged Track B normalized history/read parity,
  merged Track A exact event-time consumers, and the Plan 23 observation gate.
- **Target planning package:** Owner Close Plan 23 compatibility retirement
  and all Track A readers of Lease compatibility fields.
- **Target concept or file:** Ratified sequence row 23 and the eventual
  retirement checklist.
- **Repository evidence:** Reports, Rent Income, property cash, Owner
  Statement inputs, search, and other current paths still consume
  `leases.primary_tenant_person_id`, `tenant_name`, Unit, dates, or status.
  Track B cannot safely drop those fields while Track A uses them.
- **Required decision or wording:** Add Track B normalized-history and
  event-time-attribution parity to the Plan 23 retirement prerequisites.
  Retire writes/fallbacks only after Track A uses exact Lease/term/person/
  relationship/snapshot sources and a bounded observation window proves no
  authoritative compatibility consumer remains.
- **Reason:** Removing a compatibility field too early breaks current reports;
  keeping it independently writable preserves the historical corruption risk.
- **Blocks this track:** No for all Track B implementation slices. It blocks
  physical compatibility column removal.
- **Can wait for final reconciliation:** Yes. This is intentionally a final
  reconciliation/retirement gate.

## Amendment 10 — Period-effective party and recipient-preference evidence

- **Owning track:** Track B owns accepted relationship evidence and explicitly
  recorded recipient preferences. Track A owns the financial obligor and
  invoice-recipient decisions and their snapshots.
- **Consuming track:** Track A ratified Plan 09 occurrence work and the local
  coordination Plan 10 tenant-invoice label.
- **Authorization status:** Coordination-only and unmerged. This amendment is
  not ratified Owner Close numbering and authorizes no implementation.
- **Merged prerequisite:** Track B's accepted-history/period-effective evidence
  resolver plus the applicable merged Track A occurrence/invoice owner
  contract.
- **Target planning package:** Ratified Plan 09 rent occurrences and the local
  coordination tenant-invoice slice.
- **Target concept or file:** Relationship-evidence input to occurrence
  generation and recipient-decision/snapshot input to invoice issue.
- **Repository evidence:** Current obligations can store one payer Person and
  label, while `lease_parties` distinguishes `primary_tenant`, `co_tenant`,
  `billing_contact`, and other roles. Current readers and
  `property_cash_events_v1` can fall back to the Lease's current primary
  Person. A `billing_contact` role does not establish contractual debt, and
  current `people`/contact values are mutable.
- **Required decision or wording:** Track B returns separately: (a) accepted
  effective tenant party/Person candidates; and (b) any explicitly recorded
  billing-recipient preference with exact party, Person, and contact source
  IDs. It also returns resolution/conflict states, source versions, current
  display/contact evidence candidates, repair links, and a material evidence
  hash. It does not decide legal debt, choose the invoice recipient, or
  approve a display/contact snapshot. A `billing_contact` is never
  automatically a debtor. Track A applies its authoritative term/policy and
  financial owner rules, selects the obligor and recipient, and freezes the
  approved issue-time snapshot. Missing/conflicting evidence blocks that Track
  A decision rather than falling back to a current header or name.
- **Reason:** Relationship evidence, calculation responsibility, and delivery
  recipient are distinct facts. An issued invoice must remain reproducible
  after role, Person, or contact edits.
- **Blocks this track:** No for TB-01 through TB-05. Yes before TB-06 can call
  a tenant-specific draft action or TB-07 can present an invoice recipient as
  historical fact without the merged consumer.
- **Can wait for final reconciliation:** Yes until the Track B evidence/Track
  A Plan 09 and local invoice integration boundary. It cannot wait past
  invoice issuance.

## Amendment 11 — Date evidence and Track A calculation precedence

- **Owning track:** Track B owns scheduled/actual occupancy and notice
  evidence. Track A owns term/policy interpretation, precedence, calculation
  window, due date, proration, and calculation blockers.
- **Consuming track:** Track A ratified Plan 09 occurrence generation.
- **Authorization status:** Coordination-only and unmerged. This amendment
  preserves a requested integration concept but authorizes no Track A or Track
  B implementation.
- **Merged prerequisite:** Track B's accepted occupancy/notice evidence
  resolver, merged Track A Plan 04 authoritative terms/rent policy, and the
  merged Plan 09 calculation owner.
- **Target planning package:** Track A Plan 04 and ratified Plan 09.
- **Target concept or file:** Relationship/date evidence input consumed by the
  owner of occurrence calculation.
- **Repository evidence:** Plan 04 owns authoritative term dates and rent
  policy. Track B owns scheduled/actual occupancy and notice facts. The current
  compatibility trigger makes Lease start look like actual move-in, while the
  implemented readiness resolver does not inspect occupancy or notice.
- **Required decision or wording:** Track B returns exact actual, scheduled,
  notice, missing, conflicting, and legacy-unconfirmed facts with source
  IDs/versions, confirmation/confidence, evidence dates, stable reason codes,
  and a material evidence hash. It labels those facts but never selects a
  calculation boundary. Track A applies the approved Plan 04 policy,
  authoritative term bounds, forecast/realized rules, notice rules, missing
  evidence blockers, and every due/proration/window decision. Track A records
  which Track B facts it selected or ignored and why. There is no fallback to
  Lease header dates or current occupancy.
- **Reason:** Lease contract, planned move, actual move, and notice dates are
  separate facts. Only the authoritative financial policy may decide which
  affects a charge.
- **Blocks this track:** No for historical storage/read slices. Yes for any
  TB-06 action that requests occurrence regeneration under a
  move/notice-aware policy before both evidence and calculation owners are
  merged.
- **Can wait for final reconciliation:** Yes until Plan 09 integration. No
  before Plan 09 generates a move/notice-dependent occurrence.

## Amendment 12 — Relationship evidence input and approved calculation snapshot

- **Owning track:** Track B owns the versioned relationship-evidence envelope
  and its material hash. Track A owns the approved calculation snapshot.
- **Consuming track:** Track A ratified Plan 09 occurrence work and the local
  coordination Plan 10 tenant-invoice label.
- **Authorization status:** Coordination-only and unmerged. The local invoice
  label is not a ratified sequence number and grants no implementation
  authority.
- **Merged prerequisite:** Amendments 10 and 11's merged Track B evidence
  contracts, merged Track A Plan 04 authority, and a merged occurrence/invoice
  snapshot owner.
- **Target planning package:** Track A Plans 04 and 09 plus the local
  coordination invoice slice.
- **Target concept or file:** Track B evidence envelope, occurrence-owned
  calculation snapshot, and invoice calculation context.
- **Repository evidence:** Current readiness returns term/policy IDs and rent
  values but does not include accepted party/occupancy identities, exact
  move/notice evidence versions, period-effective party/recipient evidence, or
  one immutable owner-approved calculation snapshot.
- **Required decision or wording:** Track B emits a versioned evidence
  envelope containing organization/property/Unit/Lease, the term identity
  supplied or bound by the Track A consumer, the requested evidence/service
  period supplied by that consumer, exact
  occupancy/party/Person/notice/contact source IDs and versions, resolution
  states, evidence reason codes, resolver version, and material relationship
  hash. Track A combines that input with the authoritative term/rent-policy
  versions and owns the approved calculation snapshot: selected effective
  start/end, due date, proration/notice basis, obligor/recipient decision,
  calculation/blocker reason codes, and calculation hash. Plan 09 stores that
  owner-approved snapshot on the occurrence; the local invoice consumer uses
  it without recomputing from current rows. Track B never approves or stores
  the calculation decision.
- **Reason:** Occurrence generation, invoice issue, correction preview, and
  later audit need reproducible evidence and a separately owned financial
  decision.
- **Blocks this track:** No for TB-01 through TB-05. Yes before TB-06 can claim
  deterministic draft regeneration or a Track A occurrence/invoice consumes
  these facts.
- **Can wait for final reconciliation:** Yes until Plan 09 implementation. No
  once an occurrence or tenant invoice is created from these facts.

## Amendment 13 — Typed affected occurrence identities on supersession

- **Owning track:** Track A's merged owner-state adapter owns occurrence/draft
  identities, financial states, scopes, and permissible actions. Track B owns
  only transport of that result in its impact token and checked invocation of
  a selected merged action.
- **Consuming track:** Track B TB-03/TB-06 and Track A ratified Plan 09 plus
  the local coordination invoice/receipt labels.
- **Authorization status:** Coordination-only and unmerged. The local Plan
  10/11 labels are not ratified sequence numbers and authorize no financial
  implementation.
- **Merged prerequisite:** Track A occurrence identity, Amendment 6's
  owner-state adapter/property-period primitive, the applicable checked Track
  A action, and Track B TB-03 impact execution.
- **Target planning package:** Track A occurrence/downstream owners and Track B
  TB-03/TB-06 integration.
- **Target concept or file:** Dependency-impact adapter for occurrence/draft
  identity and the supersession execution contract.
- **Repository evidence:** Current obligations have no exact occurrence or
  term identity, and no occurrence table is implemented. A later term, party,
  or occupancy supersession could otherwise leave downstream drafts
  inconsistent or tempt a caller to rewrite existing obligations/receipts.
- **Required decision or wording:** After any occurrence exists, every
  proposed term, party, or occupancy supersession asks the merged Track A
  adapter for typed affected occurrence/downstream draft identities, material
  states, source hashes, financial scopes, and available actions. Track B
  includes those opaque owner results in its paginated/material-hashed impact
  response and may call only an explicitly merged checked action selected by
  the operator. Without the adapter/action, preview returns
  unresolved/unavailable and execution stops. Track B never rewrites an
  obligation, invoice, receipt, allocation, Ledger/journal projection, close
  evidence, or statement. Issued, settled, closed, and published sources
  remain preserved under Track A cancellation/reversal/reopen/replacement
  rules.
- **Reason:** A relationship correction must be dependency-visible and stale
  safe without transferring financial lifecycle ownership to Track B.
- **Blocks this track:** No for write-free preview or dependency-free
  supersession. Yes for execution when affected occurrences/drafts exist but
  the adapter, deterministic locks, or selected Track A action is unavailable.
- **Can wait for final reconciliation:** Yes until the first occurrence-aware
  supersession. No once Plan 09 occurrences exist.

## Amendment 14 — Exact Ledger/journal navigation without authority transfer

- **Owning track:** Track A owns canonical financial source-to-Ledger/journal
  projection identity and reverse navigation. Track B owns only presentation
  of exact links from its historical surfaces.
- **Consuming track:** Track B TB-05/TB-07 and any Track A financial-detail
  surface that links back to Lease history.
- **Authorization status:** Coordination-only and unmerged. This amendment
  authorizes neither projection rewrites nor a new finance lifecycle.
- **Merged prerequisite:** A merged Track A typed-source/projection registry
  and exact canonical source links, plus merged Track B historical
  Lease/term/party/occupancy identities.
- **Target planning package:** Track A accounting/Ledger projection contracts
  and Track B history navigation.
- **Target concept or file:** Canonical source -> Ledger entry -> accounting
  journal entry/line navigation and the exact reverse route.
- **Repository evidence:** `ledger_entries` has `source_type`/`source_id`, but
  `ledger_entries_org_source_idx` is non-unique. Accounting journals use
  typed source identity plus posting key. Current Lease loading in
  `src/features/leases/data/leases.ts` reaches Ledger by property/unit scope,
  which is useful for browsing but cannot prove tenancy attribution.
- **Required decision or wording:** Track A exposes allowlisted typed canonical
  source identities and exact projection links, including the projection ID,
  journal identity/posting key, organization validation, and permission-aware
  reverse route. Track B may show Ledger/journal navigation only through an
  exact canonical source that itself stores the applicable
  Lease/term/party/occupancy identity. It must never link or attribute a
  financial row by property, Unit, date, amount, display name, or current
  tenant alone. A non-unique source index is not treated as one-to-one;
  projection identity follows the Track A uniqueness contract. Legacy rows
  without exact source scope remain null/unresolved. Ledger entries and
  journals are derived evidence only: Track B cannot relink, reverse, or use
  them as relationship authority.
- **Reason:** Operators need precise cross-navigation without turning a
  property/unit browse result or derived accounting row into tenancy truth.
- **Blocks this track:** No for core Track B history. Yes before TB-05/TB-07
  advertises exact finance navigation or historical financial attribution.
- **Can wait for final reconciliation:** Yes until finance-linked navigation
  adoption. No once that navigation is presented as exact.
