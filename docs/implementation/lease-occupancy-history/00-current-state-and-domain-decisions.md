# Current State and Domain Decisions

## Audit baseline and method

This audit uses merged `main` at
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`.

Repository evidence reviewed includes:

- relationship schema, repair migrations, Plan 04 migration, grants, RLS,
  triggers, checked and legacy lease RPCs, imports, seed, and pgTAP;
- Lease, Unit, People, Reports, Timeline, Documents, Maintenance, Overview,
  Rent Income, Property Setup, Property Detail, and workspace-search loaders;
- finance obligations, receipts, allocations, deposits,
  `property_cash_events_v1`, Ledger and report adapters;
- the Owner Close README, ratified sequence, Plan 04, retained broad plans,
  review artifacts, finance inventory, cash-event contract, and financial
  authority kernel; and
- current-state, engineering, and verification rules.

Open pull requests were treated as non-authoritative evidence only.

## Plain-language terms

| Term | Meaning |
| --- | --- |
| Source of truth | The record Nestory trusts to decide a business fact. |
| Lease | The stable identity of one agreement. Economics can have multiple authoritative term versions without changing that identity. |
| Lease party | A person or company connected to a lease in a named role and date range. |
| Tenant | A person or company contractually responsible under the lease. In the initial model, `primary_tenant` and `co_tenant` are tenant roles. |
| Occupant | An individual whose accepted occupancy-participant version has a `present`/`ended` lifecycle and confirmed boundaries establishing presence during accepted actual occupancy. Planned, cancelled, or unknown-boundary participation is not confirmed residence. A tenant or authorized-occupant role alone is association or authorization, not proof of physical presence. |
| Occupancy period | The dated reservation and physical-use lifecycle for one lease and unit. |
| Historical record | A relationship, event, or correction that remains visible after it ends or is superseded. |
| Snapshot | Display facts retained by an issued or published artifact so later master-data changes do not rewrite it. |
| Dependency-aware change | A workflow that identifies downstream records and their states before deciding whether to edit, regenerate, reopen, reverse, replace, or block. |
| Compatibility projection | A field retained for old readers but derived from a more reliable source and not independently editable. |

Use "authority" only for technical write/security boundaries. Business-facing
language should say "source of truth", "official record", or "owns this fact".

## Current schema and write behavior

### Existing normalized records

The repository has:

- `people`, including `individual` and `company` party types;
- `person_roles`, which identifies a person's current operational role but is
  not tenancy history;
- `leases.primary_tenant_person_id` and compatibility `tenant_name`;
- `lease_parties` with `primary_tenant`, `co_tenant`, `guarantor`,
  `billing_contact`, and `authorized_occupant`;
- `lease_terms`, now protected by Plan 04 authority and non-overlap rules;
- `lease_occupancies` with `reserved`, `occupied`, `notice_given`, `vacated`,
  and `cancelled` states; and
- `lease_deposits` and append-linked deposit events.

`lease_parties` has nullable `started_on` and `ended_on`, a valid-range check,
and unique indexes for one open primary tenant and one open person/role. It has
no exclusion constraint preventing historical interval overlap, no correction
lineage, and no source/confidence marker.

`lease_occupancies` has scheduled and actual dates and one unique index that
prevents two non-archived, not-moved-out rows for the same unit in
`reserved`, `occupied`, or `notice_given`. It has no historical range
exclusion, correction lineage, or date-source/confidence marker.

The current schema has no person-level occupancy-participant record. A
`lease_parties` row can prove responsibility or authorization, and a
`lease_occupancies` row can prove a Lease/Unit physical-use period, but their
date overlap alone does not prove that a particular individual was physically
present.

### Confirmed overwrite and bypass paths

The latest definition of `sync_lease_backbone_records()` in
`20260728120841_authoritative_lease_terms_and_rent_policy.sql`:

1. selects the first non-archived primary-party row for the lease;
2. overwrites that row's person, start date, and end date;
3. selects the first non-archived occupancy row for the lease; and
4. overwrites that row's property, unit, status, scheduled dates, and actual
   dates.

The trigger treats lease start as actual move-in and some inactive lease end
states as actual move-out. That is an inference, not evidence of a physical
event.

The normal Lease action calls `update_lease_with_authoritative_term(...)`.
That checked wrapper:

- requires an organization admin;
- preserves property/unit scope through that path;
- applies Plan 04 term checks and idempotency; but
- still passes a changed primary tenant to `update_lease(...)`, which fires
  the in-place compatibility trigger.

The older `update_lease(...)` remains granted to `authenticated`. It permits a
unit and primary-tenant change after admin checks. Plan 04's projection guard
blocks direct date/rent changes when authoritative terms exist but does not
block party, unit, deposit, or status changes.

Authenticated admins also retain direct `INSERT` and `UPDATE` grants on the
party and occupancy tables under broad admin RLS. Therefore the safe
application path is not a complete write boundary.

### Imports and tests

Plan 04 routes lease creation imports through the checked authoritative-term
wrapper and requires explicit due day, frequency, and term status. It still
creates compatibility party and occupancy rows through the trigger. Imports
do not provide explicit physical move evidence or multiple historical
relationships.

Current tests verify term authority, organization/admin checks, open-unit
conflicts, payer integrity, and current fixture consistency. No focused test
proves that:

- changing a primary tenant retains the prior relationship;
- changing or correcting occupancy dates retains the prior fact;
- direct party/occupancy DML is rejected;
- the legacy lease RPC cannot rewrite relationship history; or
- a former renter can be queried reliably by unit and date.

## Current read behavior

### Lease

The lease detail loader reads all party, term, and occupancy rows. The summary
then filters parties to non-archived rows with no `ended_on`, so former parties
are not presented. Non-archived occupancies are carried in the summary model,
but the current Lease inspector does not render the occupancy collection.
There is no canonical continuity or correction resolution.

Lease form values prefer authoritative Plan 04 term dates and rent where
available. Current table/detail labels, end-risk logic, reports, and other
material readers still use compatibility header dates, while tenant identity
still uses `leases.primary_tenant_person_id` and `tenant_name`.

### Unit

The Unit detail loader first selects an active compatibility lease. It starts
with `primary_tenant_person_id`, adds people from all non-archived party rows,
and then loads current `people` names and contacts. It does not produce a dated
former-renter list, distinguish tenant responsibility from occupancy, or
derive vacancy gaps.

### People

People search and filters use active lease IDs and active, non-archived
lease-party rows. Person detail can load related records, but there is no
canonical, paginated tenancy-history model that resolves party dates,
occupancy, unit, terms, or correction provenance.

### Reports, Timeline, Documents, and search

Reports, trusted reports, property/unit summaries, Rent Income, Property
Setup, Property Detail, Timeline, Documents, Overview, and workspace search
still read compatibility `tenant_name`, header dates, or
`primary_tenant_person_id` in material paths.

Timeline and documents can link a lease and unit, but not a specific party or
occupancy. Activity logs are generic JSON records without enforced source
links. Maintenance tasks link property/unit/request/vendor and may link
Ledger, Timeline, and Documents, but not a lease or occupancy. Inspection is a
request/task type, not a separate lease-history source.

Lease and Person navigation still contains mutable-name searches into People,
Timeline, Ledger, Documents, and Leases. Person document aggregation can also
collect broad property/unit documents from historical Lease relationships;
those are contextual records, not person-specific evidence. The Lease-import
occupancy-conflict action currently places a Lease UUID in the text `query`
parameter even though Lease search does not search IDs.

### Finance

Current obligations can link property, unit, lease, payer person, and a payer
label. They do not yet retain a lease-term or expected-occurrence identity.
Receipts allocate to obligations but the receipt header has a payer label, not
a direct payer person or lease.

The current `property_cash_events_v1` contract may derive tenant context from
the exact lease on an income or deposit row. Its implementation joins
`leases.primary_tenant_person_id`, so a later compatibility tenant edit can
change the person presented for an older financial event. Track A must replace
that inference with source-stored or effective-dated evidence.

No implemented tenant-invoice or formal-receipt-document lifecycle currently
provides the required recipient and payer snapshots. Owner Statement
publication remains Track A-owned.

## Sources of truth by business fact

| Business fact | Source of truth | Compatibility or display use |
| --- | --- | --- |
| Agreement identity | `leases.id` | Lease label can use a current display name but must not define identity. |
| Unit during a tenancy | Current, non-voided `lease_occupancies.unit_id` and effective interval | `leases.unit_id` becomes a protected current projection during migration. |
| Tenant responsibility | Current, non-voided `lease_parties` rows in tenant roles and their effective intervals | `primary_tenant_person_id` and `tenant_name` become protected projections. |
| Track B relationship evidence | Accepted party, occupancy, and occupancy-participant candidates plus actual/scheduled/notice facts, boundary kinds, confidence, reasons, exact versions, and material hash | This envelope is evidence for Track A; it is not a rent calculation or billing decision. |
| Charge obligor | Track A's approved occurrence/obligation decision using the Track B relationship-evidence envelope and Track A term/policy rules | A billing contact, candidate party, or current primary-person header is not sufficient. |
| Billing recipient | Track A's invoice/communication selection from eligible relationship/contact evidence | The issuing artifact owner persists the approved recipient snapshot. |
| Lease/Unit physical use | Accepted `lease_occupancies` with confirmed actual boundaries | Lease header dates and scheduled dates are not proof. |
| Person-level physical occupancy | An accepted occupancy-participant version linking an individual/party to accepted actual occupancy, with `present`/`ended` lifecycle and confirmed boundaries for the queried interval | Planned, cancelled, or unknown-boundary participants and overlapping tenant/authorized-occupant roles are returned as scheduled, associated, authorized, or unknown—not confirmed physical residence. |
| Planned move | Scheduled occupancy dates | Must be labelled scheduled, not actual. |
| Rent economics | Plan 04 authoritative `lease_terms` and approved rent policy | Lease date/rent header remains a projection only. |
| Current contact profile | `people` and current contact records | Can refresh directory displays. |
| Issued/published display fact | Snapshot stored by the artifact owner | Never rebuilt from a current person or lease label. |
| Vacancy | Derived gap between confirmed actual occupancy periods | Unit status may summarize current operations but is not history. |
| Renewal/replacement relationship | Append-only lease continuity link | Never inferred solely from equal people, unit, dates, or rent. |
| Effective charge dates, due date, proration, blockers, and stored calculation snapshot | Track A Plan 04/09 calculation and persistence contracts | Track B supplies relationship/date evidence only; it does not select term/policy calculation outcomes or store the approved calculation snapshot. |

## Date semantics

### Lease terms

Plan 04 owns contractual economics and its effective ranges. Track B does not
change that behavior.

### Lease-party relationships

- `started_on` is the first inclusive business date for the role.
- `ended_on` is the last inclusive business date for the role.
- Raw `NULL` is not itself a business meaning. The checked record also carries
  an explicit boundary kind.
- `known` means the inclusive boundary date is established by the accepted
  evidence.
- `open_current` is valid only for an accepted end boundary that is
  intentionally still open as of a supplied `as_of_date`; it is not an
  unknown historical end.
- `unknown` means the boundary is not established. It must not be replaced by
  a Lease date or treated as infinity.
- Two current versions of the same person/role or two primary-tenant
  responsibility periods must not overlap.

### Occupancy

- Scheduled move-in/out are planned dates and can change through a checked
  planning workflow before the corresponding actual event.
- Actual move-in/out are observed event dates.
- Scheduled and actual boundaries independently use `known`, `open_current`,
  or `unknown`; raw NULL/status combinations are never enough to choose the
  boundary kind.
- A confirmed actual interval is inclusive at both boundaries in the first
  IPS model.
- A successor occupancy begins after the prior actual end. Same-day turnover
  is explicitly unsupported until IPS defines the business meaning.
- Recording an actual move-in or move-out completes a fact on the same
  occupancy lifecycle. Correcting a completed fact preserves linked prior
  evidence.
- Contract termination and physical move-out can occur on different dates.

### Query overlap

Every checked date query returns an `overlap_state`:

- `definite_overlap` when known boundaries, or a known start plus an
  `open_current` end resolved only through the supplied `as_of_date`, prove an
  intersection with `[from_date, to_date]`;
- `non_overlap` when known facts prove the intervals do not intersect; and
- `possible_overlap` when an `unknown` boundary prevents either conclusion.

Only `definite_overlap` contributes to confirmed renter, physical-occupancy,
vacancy, or financial evidence. `possible_overlap` remains visible in
unresolved history with its known boundary, confidence, reason, and exact
source link. `open_current` makes no claim after `as_of_date`.

## Supported and unsupported relationships

| Question | Initial decision |
| --- | --- |
| Can one lease have several independent occupancy spells? | No. One agreement has one business occupancy lifecycle. A later return uses a new lease unless IPS approves a different model. |
| Can one lease cover several units? | No. Multi-unit lease scope is unsupported. |
| Can a unit have overlapping occupancy? | No for scheduled or actual intervals. |
| Can a future reservation follow a scheduled move-out? | Yes only when ranges do not overlap. Actual move-in remains blocked until the prior actual move-out is recorded. |
| Can contract and occupancy dates differ? | Yes; they are separate facts. |
| Is vacancy stored? | No. Confirmed and scheduled gaps are derived separately. |
| Does a cancelled reservation prove occupancy? | No. It remains agreement/reservation history only. |
| Does a tenant/authorized-occupant role plus Lease occupancy prove that Person physically lived there? | No. It proves association or authorization during the Lease/Unit occupancy. Confirmed person-level physical occupancy requires an accepted participant version whose lifecycle and confirmed boundaries prove presence during accepted actual occupancy. |
| Can a company be an authorized physical occupant? | No. A company can be a tenant, guarantor, or billing contact, but physical-occupant roles require an individual. |
| Can a unitless legacy lease remain? | Yes as compatibility evidence, but it cannot appear as confirmed Unit history until an operator resolves its scope. New unit-tenancy workflows require one unit. |

## Compatibility deprecation decision

`leases.primary_tenant_person_id`, `tenant_name`, `unit_id`, header dates, and
header rent fields cannot be removed while current application and Track A
consumers depend on them.

The migration contract is:

1. stop independent writes and make the fields checked projections;
2. preserve read compatibility while normalized history is classified;
3. migrate Track B readers to checked historical read models;
4. require Track A consumers to adopt exact lease/term/person/snapshot links;
5. measure that no authoritative reader depends on the fallback; and
6. retire compatibility only through the Owner Close compatibility-retirement
   gate.

No phase may reconstruct former renters from `tenant_name`.
