# Historical Lease Parties and Occupancy

## Objective

Preserve the people, roles, units, and dates that were true for a lease while
keeping current contact information useful. Routine lifecycle transitions
should be easy, but they must not rewrite prior responsibility or physical
occupancy.

## Core relationship model

```text
people (current master identity)
  |
  +-- lease_parties (role and responsibility by date)
          |          |
leases ---+--- lease_occupancies (unit physical-use lifecycle)
                     |
                     +-- lease_occupancy_participants
                         (person-level physical participation)
  |
  +-- lease_terms (Plan 04 economics by date)
```

The records answer different questions:

- `people`: who is the current person or company record?
- `lease_parties`: what role did that person/company have under this lease,
  and when?
- `lease_occupancies`: which unit did this lease reserve or occupy, and when?
- `lease_occupancy_participants`: which individual was recorded as physically
  participating in that occupancy, for what interval, and from what evidence?
- `lease_terms`: what contractual rent rules applied, and when?

No current Unit field, Person role, lease label, activity-log display string,
or document search result is tenancy history.

## Party-role rules

| Role | Contractually responsible | Physical occupant by itself | Can be a company | Replacement lease required when it changes |
| --- | --- | --- | --- | --- |
| `primary_tenant` | Yes | No; physical presence also needs an explicit occupancy-participant fact | Yes | After commencement, yes |
| `co_tenant` | Yes | No; physical presence also needs an explicit occupancy-participant fact | Yes | Adding/ending one after commencement is a responsibility change and uses the dependency-aware decision below |
| `guarantor` | Conditional support only | No | Yes | No, but use dated end/add rows |
| `billing_contact` | No | No | Yes | No, but use dated end/add rows |
| `authorized_occupant` | No | Authorization alone is not proof of presence; physical history also needs an occupancy-participant fact | No | No, but use dated end/add rows |

Tenant responsibility, physical occupancy, billing contact, and current master
data must be returned as separate fields. The read model may provide convenient
labels, but it must not collapse them into a single `tenant`.

## Person-level occupancy participation

`lease_occupancies` proves the Unit lifecycle for a Lease. It does not identify
which individual physically participated in that lifecycle.

The initial implementation therefore adds an organization-scoped
`lease_occupancy_participants` fact. Each accepted row links:

- one exact `lease_occupancy_id`;
- one exact individual `lease_party_id` and, through that row, its stable
  Person identity and role;
- a participant start and end boundary with explicit boundary kind,
  confidence, source, actor, and recorded time; and
- evidence-state, business-lifecycle, and correction lineage described below.

A tenant who also lives in the Unit has both a responsibility role and an
occupancy-participant fact. An authorized-occupant role proves authorization;
it becomes physical-history evidence only when an accepted participant in
`present` or `ended` lifecycle links it to accepted actual occupancy, the
actual occupancy contains the participant interval, and every query-material
participant and occupancy boundary is `known` or an end is resolved
`open_current` through `as_of_date`. Company parties cannot be occupancy
participants.

Do not infer participant rows from the primary tenant, all active Lease
parties, matching dates, a Unit status, or the existence of an occupied Lease.
When no participant evidence exists, the read model may say that the Unit has
confirmed Lease-level occupancy, but it must report the participating people
as unknown.

## Required row lifecycle

### Evidence/version states

New implementation should give party, occupancy, and occupancy-participant
evidence a typed version state:

- `accepted`: the record is the accepted version used by current reads;
- `superseded`: a later accepted correction replaces this version;
- `voided`: the row was entered in error and must not be reported as a true
  relationship or physical event; and
- `legacy_unresolved`: the row is retained but its truth cannot yet be
  confirmed.

The exact database representation may use checked text constraints rather than
PostgreSQL enums, following repository conventions. These state values and
their meaning are not optional.

Evidence/version state is separate from the business lifecycle. `accepted`
means "accepted evidence version"; it does not mean that a party remains
responsible, that a Unit remains occupied, or that a participant remains
present.

### Business lifecycle states

Checked operations must represent business lifecycle separately:

- party responsibility/role: `planned`, `effective`, `ended`, or
  `cancelled_before_effective`;
- occupancy: `reserved`, `occupied`, `notice_given`, `vacated`, or
  `cancelled_before_effective`; and
- occupancy participation: `planned`, `present`, `ended`, or
  `cancelled_before_effective`.

The implementation may map existing checked status names to these values, but
it must preserve these meanings. `cancelled_before_effective` means a genuine
planned relationship or reservation was cancelled before its first effective
or actual date. It is neither a true historical end nor a false-entry
`voided` correction, and it is excluded from effective responsibility,
physical-presence, vacancy-boundary, and open-role checks.

### Provenance and confidence

Every migrated or newly written party, occupancy, or participant record needs:

- `record_source`: `operator_confirmed`, `imported_explicit`,
  `system_transition`, or `legacy_inferred`;
- actor and recorded timestamp;
- optional source import row or correction request;
- start/end confidence for party dates: `confirmed`, `inferred`, or `unknown`;
- actual move-in/out confidence: `confirmed`, `inferred`, or `unknown`; and
- linked supersession/void reason when the accepted fact changes.

Do not store provenance only in free-text notes. Do not upgrade an inferred
date to confirmed because it happens to equal a lease date.

### Boundary kinds

A nullable date alone is not enough to distinguish an open relationship from
missing evidence. Every relevant party, scheduled occupancy, actual
occupancy, and participant boundary has a typed kind:

- `known`: the date is present, with its own source and confidence;
- `open_current`: an end boundary is intentionally open because the accepted
  business relationship is still current; and
- `unknown`: the boundary has not been established.

Start boundaries use `known` or `unknown`; `open_current` applies only to an
end boundary. `unknown` must not be converted to the Lease or term date and
must not be represented as an unbounded PostgreSQL range. A legacy date may
have boundary kind `known` and confidence `inferred`; that still does not make
it confirmed evidence.

New effective party relationships, confirmed actual occupancies, and confirmed
participant intervals require a known start boundary. An intentionally open
current end can participate in overlap protection as an unbounded end.
Unknown legacy boundaries remain unresolved and cannot establish confirmed
vacancy or a complete non-overlap claim.

### Correction lineage

A corrected row must retain:

- the prior row ID;
- the replacement row ID;
- correction reason;
- actor and time;
- impact decision or no-dependency evidence; and
- the stable lease and organization identity.

The default history read resolves to the accepted version and exposes
`has_correction_history`. An audit expansion can show superseded or voided
versions. A voided row is never counted as a renter or occupant, and a
`cancelled_before_effective` row is presented as cancelled intent rather than
effective responsibility or physical presence.

## Brand-new Lease creation and import

Brand-new writes must not repeat the current compatibility inference.

- Plan 04 Lease-term dates remain contract/economic facts only.
- A selected primary Person establishes identity, not a silently confirmed
  party start boundary. A new checked create/import must receive an explicit
  party boundary and source or store that boundary as `unknown`.
- Scheduled occupancy dates may be written only when explicitly supplied.
- Actual move-in/out dates and participant dates remain null/unknown unless
  the caller supplies explicit evidence accepted by the corresponding checked
  operation.
- Creating an active or ended Lease must not copy term dates into actual
  occupancy or silently mark every Lease party physically present.
- An import marks only supplied facts as `imported_explicit`; absent fields
  remain unknown. Equality with a term date is not confirmation.
- The normalized create transaction creates each initial party, occupancy, and
  participant fact exactly once. If a compatibility trigger has already
  created an exact child row, the checked workflow must return, adopt,
  validate, and normalize that row inside the same transaction rather than
  insert a duplicate. Any trigger-copied actual or party boundary is cleared
  or marked unknown unless the new payload supplied explicit evidence.

Until the checked create/import payload can express these facts, it may create
the Lease and authoritative term but must leave physical and party boundaries
unknown or return a specific missing-evidence prerequisite. It must not fall
back to inference for convenience.

## Party operations

### Add a co-tenant

1. Validate organization, lease, person, party type, role, and effective date.
2. Reject an overlapping current row for the same person and role.
3. Run the dependency-impact check.
4. Insert a new dated row; never change a different person's row.
5. Record an activity event with exact person, lease, role, and date IDs.

If the lease has commenced and a co-tenant becomes financially responsible,
the impact result decides whether the current agreement can be amended or a
successor lease is required. The first IPS implementation defaults to a
successor lease unless the operator identifies a signed amendment that keeps
the same agreement identity.

### End a co-tenant or authorized occupant

1. Record the real last inclusive date.
2. Preserve the row and person link.
3. Do not archive or delete it.
4. Reject an end before the start or after an already conflicting successor.
5. Preserve issued/published artifacts; apply downstream action from the
   impact contract.

Ending an authorized occupant does not change tenant responsibility.

### Change a billing contact

End the former billing-contact relationship and insert a new dated row.
Directories may immediately show the new current contact. Draft communications
may regenerate. Issued invoices, formal receipts, signed lease documents, and
published statements keep their artifact-owned snapshots.

### Change a primary tenant

There are two cases:

- **Draft correction:** before commencement, with no dependent record and no
  signed/published artifact, a checked operation may correct the current
  primary row in place and retain an audit log.
- **Business change:** after commencement, or when dependencies exist, the
  responsible-person set must not be replaced on the existing lease. Create a
  successor lease and continuity link as defined in
  `02-renewals-transfers-and-corrections.md`.

The compatibility lease header must follow only after the normalized
transition succeeds. It never initiates the transition.

“No dependent record” must be proven by a merged checked dependency contract
or by a narrowly defined schema-enforced creation transaction in which no
dependent identity could yet exist. Lease status or date alone is not proof.
Until that proof is available, return `impact_contract_required`; do not add a
partial or client-trusted dependency scan merely to permit the correction.

### Correct a wrongly selected person

Do not end-date a false relationship as though it really occurred.

- If the record is an unstarted draft with no dependencies, use the checked
  draft correction.
- Otherwise mark the erroneous row `voided`, retain its source evidence, and
  add the accepted replacement with explicit correction lineage.
- If the supposed correction is actually a change in responsibility, use a
  successor lease.

### Merge duplicate people

The current repository has no safe person-merge workflow. Until one exists:

- do not bulk rewrite historical `lease_parties.person_id`;
- do not delete a referenced person;
- block archiving a person who remains an open lease party; and
- flag suspected duplicates for operator review.

A later checked merge must preserve an immutable
`source_person_id -> surviving_person_id` identity redirect with reason,
actor, and time. Historical relationship rows retain the source person ID;
read models may additionally return the resolved current profile ID. New
relationships use the survivor. Artifact snapshots never change.

## Occupancy operations

### Schedule move-in

Create or update the scheduled fields only through a checked operation.
Scheduling is allowed only when:

- the lease and unit scope are valid;
- no scheduled or actual occupancy interval overlaps;
- the unit belongs to the lease property;
- the record is not already physically completed; and
- the previous actual occupancy is already ended before activation.

A future reservation may follow a prior scheduled move-out. It must not be
reported as actual occupancy or confirmed vacancy.

### Record move-in

Recording actual move-in changes a reservation into observed occupancy for the
same lifecycle. It:

- writes the actual date as confirmed;
- retains the scheduled date even when different;
- verifies the preceding actual occupancy is closed;
- records actor/time and exact source links; and
- does not change lease-term dates or party-role dates automatically; and
- creates or activates participant facts only for individuals explicitly
  supplied with accepted evidence. It never adds every Lease party
  automatically.

### Give notice

Notice is a workflow event and planned move-out. It does not prove an actual
move-out, terminate the term automatically, or end every party. Its effects on
rent charging are owned by the approved Plan 04 policy and later Track A rent
occurrence logic.

### Record move-out

Move-out:

- writes the confirmed actual date;
- changes the occupancy lifecycle to vacated;
- preserves the scheduled date and any notice date;
- does not infer the date from lease end;
- does not silently end tenant responsibility if the contract remains in
  force; and
- invokes impact information for deposits, open obligations, issued records,
  maintenance, close state, and published artifacts.

Open participant rows must be reported by the workflow. They are ended on the
same date only when the operator explicitly confirms that fact; otherwise the
move-out remains incomplete or the participant boundary remains visibly
unknown according to the accepted operation. Do not silently copy the
Lease-level move-out to every person.

The move-out workflow may orchestrate downstream actions only through their
own checked contracts. Track B does not mutate financial records directly.

### Cancel before move-in

Retain the reservation, planned parties, participants, and scheduled evidence
with business lifecycle `cancelled_before_effective`. Leave actual move dates
null and confidence `unknown`. These records do not count as effective tenant
responsibility, confirmed physical occupancy, an open role, or a confirmed
vacancy boundary.

### Correct actual dates

An unobserved draft scheduled date can be edited through a checked planning
operation. A completed actual date is historical:

- no dependencies: create linked corrected evidence and supersede the prior
  version;
- draft calculation/workflow dependencies: correct and deterministically
  regenerate those drafts;
- issued, settled, closed, or published dependencies: preserve prior records
  and use the action returned by the impact contract.

Do not update a completed actual date directly through the Data API.

## Overlap and scope invariants

### Party intervals

- One current primary-tenant responsibility interval per lease/date.
- The same person/role cannot have overlapping current intervals on one lease.
- A person can hold different roles when the combination is meaningful, but a
  checked workflow must reject contradictory active roles.
- Physical-occupant roles require an individual person.
- Date checks operate on accepted versions; superseded and voided
  evidence does not block a valid successor.
- `cancelled_before_effective` rows retain planned evidence but do not overlap
  effective responsibility.
- A known/open-current interval participates in exclusion checks. An unknown
  boundary remains an explicit unresolved condition rather than an infinite
  range.

### Occupancy intervals

- One unit per occupancy row.
- One business occupancy lifecycle per lease.
- No overlapping current scheduled intervals for one unit.
- No overlapping current actual intervals for one unit.
- An actual interval takes precedence over scheduled dates for confirmed
  history.
- Unknown actual boundaries do not become vacancy.
- A successor begins after the prior inclusive end date.
- A unit transfer is not an occupancy-row unit update.

### Occupancy-participant intervals

- Every participant is an individual linked through an exact Lease party and
  exact occupancy.
- Confirmed residence requires an `accepted` participant in `present` or
  `ended` lifecycle and an `accepted` actual occupancy. Every participant and
  occupancy boundary material to the claim must be `known`, or an end may be
  `open_current` only when resolved through `as_of_date`. The participant
  interval must be contained within the accepted actual-occupancy interval.
- The same Person cannot have overlapping accepted participant intervals for
  contradictory Units.
- A tenant or authorized-occupant role does not create a participant interval
  by implication.
- If any query-material participant or occupancy boundary is `unknown`,
  physical presence is `possible_overlap`/unresolved, never confirmed.

Database exclusions should use generated effective ranges and organization/unit
scope where possible. Checked RPCs must also return business-readable errors
and test the same rule under concurrency.

### Legacy bootstrap for constraints

Before accepted-version exclusion constraints are validated, every pre-Track B
party/occupancy row is mechanically marked `legacy_unresolved` with unknown
boundary confidence unless stronger explicit source evidence already exists.
There is no existing participant row to derive: overlapping party/occupancy
facts must not create one, and absence of explicit Person-presence evidence
remains absence/unknown. This bootstrap is not operator confirmation and must
not rewrite IDs or dates.

Exclusion constraints apply to accepted effective/planned rows with usable
known/open-current boundaries. They do not convert unresolved nulls to
infinite ranges. Later classification may promote a legacy row only through a
checked validation that proves the promoted row does not conflict with an
accepted interval.

## Archive and restore semantics

Archiving is not a shortcut for ending a relationship.

- An operationally active lease cannot be archived.
- The operator must first cancel an unstarted reservation or complete
  termination/move-out and party endings through checked workflows.
- Archiving a lease retains all history and must not hold an invisible active
  occupancy claim.
- Restoring a lease re-runs organization, unit, interval, party, term, and
  dependency checks; it never silently reactivates old history.
- A person with an open tenant, authorized-occupant, guarantor,
  billing-contact, or occupancy-participant relationship cannot be archived
  until it is ended/cancelled or a safe identity merge is completed.

This closes a current repository gap: `archive_lease` changes only the parent
archive fields, and `archive_person` does not check active lease
relationships.

Until the checked restore executor and dependency/overlap recheck are merged,
the legacy restore RPC must be revoked, safely wrapped to fail closed, or
return a named restore-prerequisite response. Clearing `archived_at` and
marking a Unit occupied is not an acceptable interim restore.

## Compatibility projection rules

During migration:

- `leases.primary_tenant_person_id` projects the currently effective primary
  party only;
- `leases.tenant_name` projects that person's current display name for legacy
  readers and is never historical evidence;
- `leases.unit_id` projects the current accepted occupancy unit;
- projection updates occur inside checked transitions;
- direct compatibility updates are rejected; and
- no compatibility update may rewrite a prior normalized row.

A person-name edit may make an old `tenant_name` projection stale today.
Migration may refresh current projections, but historical and issued displays
must never rely on that refresh.

## Required security and audit boundary

Implementation must:

- revoke direct authenticated/service-role party and occupancy mutation where
  the Data API could bypass checked rules;
- protect occupancy-participant tables with explicit grants, RLS, and the same
  checked mutation boundary;
- retain only the minimum read grants required by RLS;
- revoke or safely wrap the legacy `update_lease(...)` mutation;
- context-guard compatibility projection writes;
- require organization-admin authorization for mutation;
- reject cross-organization property, unit, lease, and person links;
- bind idempotency to the exact payload;
- log exact old/new IDs and dates, not only display names; and
- test anonymous, member, manager, admin, cross-organization, direct-DML,
  direct-RPC, replay, stale-impact, and concurrency paths.

## Acceptance rules

The model is ready for read adoption only when:

1. primary-tenant replacement cannot overwrite the prior person;
2. unit transfer cannot overwrite the prior occupancy;
3. completed actual dates cannot be silently rewritten;
4. false entries can be voided without being presented as true history;
5. ended parties remain queryable;
6. compatibility fields are projections, not independent sources;
7. active lease/person archive paths cannot leave invisible open history;
8. overlap rules hold under concurrent writes;
9. exact IDs and correction lineage are auditable; and
10. person-level physical occupancy is returned only from an accepted
    `present`/`ended` participant contained by accepted actual occupancy, with
    every query-material participant and occupancy boundary `known` or an end
    resolved `open_current` through `as_of_date`; it is never inferred from
    tenant responsibility; and
11. no issued, settled, closed, or published dependency is changed by a
    relationship transition.
