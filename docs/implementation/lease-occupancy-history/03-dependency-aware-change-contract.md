# Dependency-Aware Change Contract

## Objective

Before changing a lease party, occupancy, or lease continuity fact, Nestory
must explain:

- what depends on the fact;
- which dependency states permit recalculation;
- which require reopen, reversal, replacement, or preservation;
- which closed periods or published artifacts are involved; and
- the exact action the operator can take next.

This contract prevents silent history changes without reducing every difficult
correction to "editing is blocked".

## Ownership boundary

Track B owns:

- the proposed lease/party/occupancy change;
- exact target IDs and effective date;
- discovery of linked records;
- classification of relationship-evidence impact, without classifying a
  financial owner's state or permissible action;
- a stable impact response and stale-response protection; and
- execution of Track B relationship/occupancy/continuity writes.

Track A owns:

- authoritative term/rent-policy interpretation;
- calculation windows, due dates, proration, and approved calculation
  snapshots;
- financial record states and permissible financial actions;
- draft regeneration and approval reset;
- invoice/receipt cancellation, credit, replacement, and publication;
- receipt/deposit reversal or adjustment;
- property-period close/reopen/reclose;
- Ledger/journal projection and Owner Statement invalidation; and
- immutable artifact replacement.

If a Track A action is required but not implemented, the impact response
returns that action as unavailable and explains the prerequisite. Track B does
not imitate it.

## Finite change kinds and slice ownership

The impact preview accepts only typed change kinds.

TB-03 preview and execution kinds are:

- `correct_draft_primary_tenant`;
- `add_lease_party`;
- `end_lease_party`;
- `void_and_replace_lease_party`;
- `change_billing_contact`;
- `add_occupancy_participant`;
- `end_occupancy_participant`;
- `record_scheduled_move`;
- `record_actual_move_in`;
- `record_actual_move_out`;
- `correct_actual_occupancy`;
- `cancel_unstarted_lease`;
- `archive_lease`; and
- `restore_lease`.

TB-03 may preview but must return `deferred_to_tb06` for:

- `extend_same_agreement`;
- `replace_lease`;
- `transfer_unit`;
- `terminate_lease`; and
- `cancel_successor_plan`.

`resolve_duplicate_person` is preview-only and returns
`identity_resolution_unavailable` until a separately approved Person-identity
slice owns safe merge/redirect semantics. It is not required for Track B
completion.

Each later executor still reuses the same impact/token contract. Do not accept
arbitrary table/column names or generic JSON patches from the client, and do
not mistake preview support for execution authority.

## Period-effective relationship evidence

Track B exposes only versioned, checked relationship/date evidence for a
Track A owner to consume. It does not decide legal debt, choose an invoice
recipient, interpret a rent policy, or calculate a service window, due date,
proration result, or approved calculation snapshot.

### Responsible-party and recipient evidence

For one Lease and evidence/service period, Track B returns separately:

- accepted effective `primary_tenant`/`co_tenant` party and Person candidates;
- party-resolution state: `resolved_single`, `resolved_multiple`, `missing`,
  or `conflicting`;
- any explicitly recorded billing-recipient preference, including exact
  party, Person, and contact source identity;
- recipient-preference resolution state/reason;
- current display/contact values as evidence candidates, never as an approved
  finance snapshot;
- source versions/material hash; and
- exact repair links for missing or conflicting relationship evidence.

A `billing_contact` is not automatically a debtor. Track A applies the
authoritative term/policy and its own approved obligor/recipient rules, then
owns the selected result and the frozen issue-time snapshot.

### Date evidence

Track B returns facts, not calculation precedence:

- authoritative term ID/version supplied or bound by the Track A consumer,
  without Track B interpreting the term or policy;
- exact actual and scheduled occupancy boundaries with occupancy IDs,
  versions, confirmation state, and evidence dates;
- exact notice facts with their source IDs/versions;
- explicit missing, conflicting, or legacy-unconfirmed states;
- evidence confidence and stable relationship reason codes; and
- resolver contract version and material source hash.

Track B labels actual, scheduled, notice, missing, and conflicting facts. It
does not decide which fact affects a charge. Track A combines this evidence
with the authoritative term and approved policy, owns all precedence and
bounding rules, and decides the calculation window, due date, proration, and
blockers.

### Evidence envelope and approved calculation snapshot

The Track B evidence envelope may contain:

- organization, property, Unit, and Lease;
- the supplied/bound authoritative term identity;
- requested evidence/service period supplied by the Track A consumer;
- exact party, occupancy, Person, notice, and recipient-contact source
  IDs/versions;
- relationship and recipient-preference resolution;
- resolver contract version; and
- full material relationship-evidence hash.

Track A combines that envelope with its authoritative term/policy inputs.
Track A alone stores and approves the calculation snapshot on the occurrence
or other financial owner, including effective calculation start/end, due
date, proration/notice basis, obligor/recipient decision, policy version, and
calculation reason codes. Track B never stores or approves that financial
snapshot.

## Two-step contract

### 1. Read-only impact

A checked, paginated RPC or equivalent read service receives:

- organization;
- change kind;
- target lease and, where relevant, party, occupancy, person, source unit, and
  destination unit;
- proposed effective date and proposed IDs/dates;
- caller identity; and
- optional requested downstream action.

It returns:

- contract version;
- normalized proposed change;
- exact target revision token;
- impact token bound to the normalized payload and observed dependencies;
- dependency counts by class and state;
- a bounded first page of exact dependency records plus cursors;
- typed affected occurrence and downstream draft identities returned by a
  merged Track A owner-state adapter after any term, party, or occupancy
  supersession;
- affected source and destination property/currency/period scopes returned by
  that owner adapter;
- owner-classified permitted actions and unavailable actions with
  prerequisites;
- blocking reason codes and business-readable explanations;
- whether a new lease is required;
- whether current data, historical data, or an artifact snapshot is affected;
  and
- links to the exact Lease, Unit, Person, dependency, and repair routes.

The response is read-only. It does not reserve a unit, write activity or
idempotency records, reset an approval, or change financial state. If the
required Track A owner-state adapter is not merged, its dependencies, states,
and actions are returned as unresolved/unavailable; Track B does not infer
them from columns, labels, or UI state.

### 2. Checked execution

The executor receives:

- the same normalized payload;
- impact token;
- chosen permitted action;
- correction/transition reason;
- supporting document where required; and
- payload-bound idempotency key.

Inside one transaction it:

1. reauthorizes the caller;
2. locks the target lease/party/occupancy and affected unit interval;
3. invokes the merged Track A owner-state adapter to resolve every affected
   source and destination financial scope;
4. acquires the Track A property-period serialization locks for every affected
   organization/property/currency/period scope, including all source and
   destination scopes, in one documented deterministic sort order;
5. reloads dependencies, rechecks owner-classified states/actions while those
   locks are held, and recomputes the token;
6. rejects a stale token with a fresh-preview instruction;
7. invokes only explicit downstream checked operations selected by the
   operator;
8. writes Track B history append-preservingly;
9. records exact execution activity and idempotency result; and
10. commits all owned changes or none.

A server executor must not trust client-provided counts, states, labels, or
links. Property-period serialization is mandatory whenever an affected
financial scope exists; it is not an optional capability check. Material
relationship-parent edits that can change close evidence use the same close
lock/revision contract. No Track B or Track A write may occur between scope
resolution and lock acquisition. Preview produces no activity; only an
execution attempt records its successful or failed result.

When occurrences exist, a supersession executor may call only an explicitly
merged Track A draft action selected by the operator. It never rewrites an
obligation, invoice, receipt/allocation, Ledger/journal projection, close
record, or statement.

## Stable tokens and pagination

An impact token must include:

- contract version;
- organization and actor;
- change kind and normalized payload hash;
- target row IDs and revision timestamps/version IDs;
- exact dependent source identities and material states, or a deterministic
  page-independent material hash;
- merged Track A owner-adapter contract version, state/action identities, and
  material hash for financial dependencies;
- relevant property-period close revision IDs/statuses; and
- artifact version/publication identities.

Pagination must use stable keyset cursors. The first page may be bounded, but
the material hash and totals cover the full dependency set. An executor may
not proceed from a truncated, unverified client list.

## Dependency classes

### Display

Examples:

- current tenant name in a directory;
- current phone/email;
- current Unit label; and
- current Person profile link.

Default: refresh from current master data. If the display appears in an issued,
signed, settled, closed, or published artifact, that artifact uses its stored
snapshot instead.

### Calculation

Examples:

- rent amount, due day, frequency, and proration;
- lease/term effective dates;
- charge occurrence;
- management fee basis;
- ownership share; and
- arrears derived from obligations and allocations.

Default: use effective-dated sources. Only drafts can be deterministically
recalculated. A party/occupancy change cannot become an alternate term or
financial calculation authority.

### Workflow

Examples:

- approved but unissued invoice;
- move-out;
- deposit disposition;
- inspection sign-off;
- close readiness; and
- statement approval/publication.

Default: follow the workflow owner's reset, reopen, cancel, or replacement
contract. Do not directly mutate its state.

### Financial

Examples:

- issued invoice;
- receipt allocation;
- deposit event;
- Ledger or journal projection;
- owner balance;
- closed period; and
- published Owner Statement.

Default: preserve originals. Use a linked cancellation, credit, reversal,
adjustment, reopen/reclose, or replacement artifact through Track A.

## State/action matrix

Financial states and actions in this matrix are outputs of the merged Track A
owner-state adapter. Track B may apply the relationship-only row when no
financial dependency exists; it never derives a finance state or action from
raw columns.

| Owner-classified downstream state | Required default response |
| --- | --- |
| No dependent record | Apply the checked Track B edit or transition. |
| Draft dependencies only | Apply the effective-dated change and deterministically regenerate/recalculate the named drafts through their owner. |
| Approved, not issued | Reset approval or reopen through the owning checked workflow, then apply/regenerate. |
| Issued document | Preserve the original; cancel/credit/correct and issue a replacement where the owner permits. |
| Settled financial event | Preserve the original; use an exact linked reversal or adjustment. |
| Closed property period | Block direct mutation; require authorized reopen, ordered restatement where needed, reclose, and replacement publication. |
| Published artifact | Preserve prior version/bytes; publish a linked replacement version after valid correction. |
| Unsupported or ambiguous source | Preserve it as unresolved and return the exact repair prerequisite. |

## Response example

```text
Proposed change
Change primary tenant from Person A to Person B
Effective date: October 1, 2026

Decision
New successor lease required: tenant responsibility changes after commencement

Affected
- September tenant invoice: issued; remains on predecessor lease
- September receipt allocation: settled; unchanged
- October rent occurrence: draft; regenerate on successor after Track A action
- October tenant invoice: draft; cancel/regenerate on successor
- Security deposit: held; no automatic transfer
- September property period: closed; no historical mutation permitted
- Owner Statement v1: published; preserved

Available
- Create successor lease effective October 1 and regenerate eligible October drafts

Unavailable until implemented
- Transfer held deposit; requires Track A custody-transfer operation
```

The UI can render this contract later. TB-03 implements the contract and
focused operator confirmation, not a broad dependency-management platform.

## Cross-module dependency matrix

The "required links" column describes the target contract. "Current evidence"
records what the baseline can already link and where a later Track A or Track B
slice must fill a gap.

| Record type | Required links | Source of truth and snapshots | Correction rule | Current evidence / owner |
| --- | --- | --- | --- | --- |
| Rent charge occurrence | organization, property, unit, lease, exact lease term, policy version, and exact responsible party/Person/occupancy evidence when tenant-addressed | Track B supplies relationship evidence; Track A owns term/policy interpretation, calculation window/due/proration, selected obligor/recipient, and the approved calculation snapshot | Draft occurrence regenerate through Track A; generated obligation follows Track A correction rules | Not yet implemented; Owner Close Plan 09 / Track A |
| Income obligation | property, unit where applicable, lease, exact occurrence and term, responsible party/Person and occupancy scope | Obligation owns amount/due state and freezes its exact calculation/relationship scope at approval/issuance or first settlement, whichever happens first | Draft edit/regenerate; settled obligation cannot be reassigned | `finance_income_items` has property/unit/lease/payer person/label but no term or occurrence; Track A |
| Tenant invoice | lease, unit, obligations/occurrences, recipient party/person, issue identity | Invoice owns issued recipient/name/address/contact snapshots | Draft regenerate; approved reset; issued cancel/credit/replace | No authoritative tenant-invoice lifecycle yet; Track A |
| Receipt header and allocation | stable payer identity plus display snapshot; allocation to exact obligation/occurrence/term/party/occupancy scope | Header `total_amount` equals the exact sum of its same-currency allocation amounts; allocation classification/scope is immutable; Ledger/journals are derived only | Settled correction uses a reversal allocation that links directly to the original allocation | Allocation exists; header has payer label but no payer person/lease; Track A |
| Formal receipt document | exact receipt and allocation set, payer, lease/unit context, document version | Published document owns payer, tenant, allocation, amount, and issue snapshots/bytes | Preserve and publish replacement | Not implemented as authoritative artifact; Track A |
| Deposit agreement | lease, property/unit, responsible party where contractually named | `lease_deposits` owns obligation; signed agreement document owns display snapshots | Do not rewrite after custody event without Track A action | Lease link exists, but no invariant prevents the compatibility trigger/form path from rewriting the agreement after an event; Track A gap |
| Deposit event | exact deposit parent and event/reversal identity; event-time lease/unit/party when displayed | Event is immutable custody movement; no current-tenant inference | Exact linked reversal/disposition | `lease_deposit_events` exists, but event-time tenant/unit identity and checked successor custody transfer remain gaps; Track A |
| Maintenance request/task | property and optional unit; optional lease, occupancy, requester person when tenancy-specific | Task/request owns work; lease/occupancy is context, not required for property work | Open task may relink with audit; completed task retains exact context | Tasks have property/unit/request/vendor but no lease/occupancy; Track B context adoption, Track A for bills/cash |
| Inspection | property/unit; optional lease/occupancy/person; exact document/report link | Request/task or future inspection record owns event; signed report owns snapshot | Preserve completed/signed evidence; add correction/superseding report | Current inspection is a request/task type; Track B context adoption |
| Generic document | property/unit and exact owning source; lease/party/occupancy only when relevant | Documents domain owns versioning and immutability for signed lease amendments, inspections, and other generic evidence | Metadata correction with audit; signed bytes are superseded/replaced, never overwritten | Documents link property/unit/lease/task/timeline/Ledger, not party/occupancy/person; Documents/Track B integration |
| Close/statement evidence snapshot | exact close manifest sources and generic-document version/checksum references | Track A owns close manifests, statement versions/artifacts, and the evidence snapshot used for publication; it does not own generic document versioning | Reopen/restatement/replacement publication preserves prior statement bytes and referenced evidence identity | Ratified Owner Close publication work; Track A |
| Activity log | exact entity type/ID, action, actor, old/new IDs/dates, request/idempotency | Activity is evidence, not tenancy source | Append only | Generic log exists; current lease audit omits some exact identity; Track B for its events |
| Timeline event | property/unit, allowlisted typed source type/ID; optional exact lease/party/occupancy | Underlying domain owns fact and writes through its registered source writer; Timeline is projection/context and callers cannot supply arbitrary source namespaces | Correct the domain source, then append/supersede its typed Timeline projection | Timeline has lease/unit/Ledger but no complete typed source registry or party/occupancy identity; Track B/domain owners |
| Owner Statement source | exact typed event, lease, unit, invoice, receipt/allocation, close revision | Event sources own facts; statement version owns recipient/line snapshots | Reopen/restatement/replacement publication | Ratified but later sequence; Track A |
| Arrears | exact obligation/occurrence/lease/term and allocations | Derived state, never an independently editable history bucket | Correct source obligations/settlements | Currently derived from obligations/allocations; Track A |
| Move-out | lease, occupancy, unit, relevant parties, actor; downstream exact dependency IDs | Occupancy owns physical event; term owns contract; deposit/finance owners own consequences | Correct with lineage and impact action | Only occupancy fields/status today; Track B |
| Unit vacancy | unit plus derived confirmed interval and boundary occupancy IDs | Derived from confirmed actual occupancy gaps | Correct boundary source; never edit a vacancy row | No canonical history read; Track B |
| Recurring work | property/unit; lease/occupancy only when intentionally tenancy-specific | Recurrence owns work schedule; must not follow a new tenant automatically | Future occurrence may relink explicitly; completed work retains context | Tasks store recurrence frequency, no lease/occupancy; Track B context adoption |
| Imported historical record | import run/row, exact target IDs, record source/confidence, unresolved issue | Explicit imported facts only; source file/row retained | Repair through reviewed resolution; never infer missing people/dates | Lease import supports one tenant and header dates only; Track B migration |

## Current read/link hazards to remove

- Unit detail chooses one active compatibility lease and does not use occupancy
  dates.
- Unit party loading does not filter `ended_on`, so an ended party can appear
  current.
- Lease and Person links often search by mutable display name instead of exact
  IDs.
- Timeline has exact event selection but no complete lease-history filter.
- Maintenance and inspection cannot attribute a record to a tenancy without
  inference.
- `property_cash_events_v1` can obtain historical tenant context from mutable
  `leases.primary_tenant_person_id`.
- No enforced invariant currently prevents a Lease compatibility/form update
  from rewriting a deposit agreement after a custody event.
- The lease activity log records display fields but does not reliably retain
  the prior primary-person identity needed to reverse an overwrite.

TB-05 and TB-07 replace Track B hazards. Track A amendments cover financial
hazards.

## Required reason codes

At minimum:

- `impact_clear`;
- `draft_regeneration_available`;
- `approval_reset_required`;
- `issued_replacement_required`;
- `settlement_reversal_required`;
- `closed_period_reopen_required`;
- `published_replacement_required`;
- `successor_lease_required`;
- `deposit_action_required`;
- `ambiguous_legacy_history`;
- `unsupported_same_day_turnover`;
- `unsupported_month_to_month`;
- `occupancy_overlap`;
- `stale_impact`;
- `cross_organization_scope`;
- `dependency_action_unavailable`; and
- `too_many_dependencies_for_interactive_execution`.

Reason codes are stable API values. Copy is business-readable and can evolve.

## Acceptance criteria

1. Impact preview is read-only, authorized, paginated, and deterministic.
2. Exact totals/hash cover all dependencies, not only the displayed page.
3. Execution rejects changed dependencies or target revisions.
4. Direct DML/RPC bypass cannot skip impact checks.
5. Every class/state returns a permitted action or named prerequisite.
6. Draft regeneration never changes issued/settled/published evidence.
7. Closed periods use Track A reopen rules.
8. Successor leases do not inherit dependencies implicitly.
9. Cross-module links are exact IDs, not names or fuzzy matching.
10. Track B never calculates due dates, proration, calculation windows, or an
    approved financial snapshot from its relationship evidence.
11. Financial state/action classification comes only from a merged Track A
    owner adapter; an absent adapter yields unresolved/unavailable output.
12. Execution acquires every affected source/destination property-period lock
    in deterministic order inside the same transaction before either track
    writes.
13. Preview writes no activity or idempotency state. Execution activity
    records proposed change, impact decision, chosen action, actor, and result.
14. Timeline sources are typed and allowlisted, and only the owning domain
    writes its source projection.
