# Lease and Occupancy History

**Status:** Track B architecture and implementation handoff plan.
**Planning baseline:** `2dea9fb71a539e01ee81b4601f8965fb62a681d5`.
**Branch:** `codex/lease-occupancy-history-planning`.
**Implementation status:** Planning only. No application, database, migration,
RPC, UI, seed, generated-type, hosted, or deployment change is authorized by
this package.

## Purpose

This package defines how Nestory can answer, without relying on a current
tenant label:

- who was contractually responsible for a unit during a date range;
- who physically occupied the unit;
- which lease and rent term applied;
- whether the unit was vacant between confirmed occupancy periods;
- how renewals, replacements, transfers, and factual corrections preserve
  history; and
- how a proposed change reports downstream effects before any mutation.

The official relationship is:

```text
Property
-> Unit
-> Lease
-> dated lease parties
-> dated occupancy
-> dated person-to-occupancy participation evidence
-> authoritative lease terms
-> linked operational and financial records
-> move-out, vacancy, and retained history
```

A unit does not permanently belong to one tenant. A lease party is not
automatically a physical occupant. Contract dates, party dates, scheduled
occupancy dates, and actual occupancy dates are separate facts.

## Authority and ownership

Use this package in this order:

1. [Current state and domain decisions](00-current-state-and-domain-decisions.md)
2. [Historical lease parties and occupancy](01-historical-lease-parties-and-occupancy.md)
3. [Renewals, transfers, and corrections](02-renewals-transfers-and-corrections.md)
4. [Dependency-aware change contract](03-dependency-aware-change-contract.md)
5. [Read models and historical views](04-read-models-and-historical-views.md)
6. [Migration and pilot](05-migration-and-pilot.md)
7. [Implementation sequence](90-implementation-sequence.md)
8. [Codex handoff prompts](91-codex-handoff-prompts.md)
9. [Required cross-plan amendments](92-required-cross-plan-amendments.md)

This package owns lease identity, dated lease-party roles, lease-level
occupancy periods, person-to-occupancy participation evidence, lease
continuity, and the dependency information those changes must expose.

The Owner Close package owns charges, obligations, invoices, receipts,
allocations, Ledger and journal projections, deposit financial lifecycle,
property close, Owner Statements, immutable statement artifacts and the
snapshots/checksums of evidence used by a close, and the financial action taken
after an impact is found. Generic signed lease, amendment, inspection, and
other operational-document version/publication rules remain with Documents or
the operational source owner; Track B consumes that merged contract and does
not invent it. This package may state what those consumers require, but it
does not redefine their lifecycle.

The ratified Owner Close sequence and Plan 04 remain authoritative for lease
economics. In particular:

- `lease_terms` owns rent amount, currency, due day, frequency, and effective
  term dates;
- authoritative term versions must not overlap;
- rent changes use Plan 04's checked term workflow; and
- Track B must not turn party or occupancy changes into an alternate rent
  authority.

Open pull requests are evidence only. Track B does not depend on an unmerged
Track A branch.

## Repository-verified finding

The historical-overwrite risk is confirmed in repository behavior at the
planning baseline:

- `sync_lease_backbone_records()` selects the first non-archived primary
  `lease_parties` row and updates its `person_id`, `started_on`, and `ended_on`
  in place;
- the same trigger selects the first non-archived `lease_occupancies` row and
  updates its property, unit, status, scheduled dates, and actual dates in
  place;
- it writes `actual_move_in_date` from the lease start date and, for an ended,
  terminated, or cancelled lease, writes `actual_move_out_date` from the lease
  end date;
- authenticated admins retain direct `INSERT` and `UPDATE` grants on
  `lease_parties` and `lease_occupancies`; and
- the older public `update_lease(...)` RPC remains executable by
  `authenticated`. Plan 04 blocks direct changes to authoritative economic
  projections, but it does not protect primary-tenant identity, unit identity,
  party dates, or occupancy history.

The current application uses
`update_lease_with_authoritative_term(...)`, and that wrapper prevents a
property or unit change through its normal edit path. It still accepts a
different primary tenant and invokes the compatibility update, which invokes
the in-place trigger. Direct table and legacy-RPC paths are additional bypass
surfaces. Existing tests protect term authority and unit-open-state behavior;
they do not prove that prior party or occupancy rows survive these changes.

This is a repository-confirmed integrity defect and bypass gap. This package
does not claim that a specific hosted production row has already been damaged.

## Final domain decisions

### One official history

Nestory will not add a separately writable "unit tenant history" table.

The official answer to "Who rented Unit A-101 between two dates?" is a checked,
organization-scoped read model over:

- `lease_occupancies` for the unit and occupancy interval;
- accepted `lease_occupancy_participants` evidence for a specific individual's
  observed physical residence;
- `lease_parties` for tenant, co-tenant, guarantor, billing-contact, and
  authorized-occupant roles and their intervals;
- `leases` for stable agreement identity and compatibility scope; and
- `lease_terms` for authoritative economics during the interval.

The read model is a projection. These normalized records remain the source of
truth.

### Separate business facts

- **Tenant responsibility** comes from effective-dated
  `primary_tenant` and `co_tenant` lease-party rows.
- **Physical occupancy of a named Person** comes only from the accepted,
  dated person-to-occupancy participation version whose lifecycle and
  confirmed boundaries establish presence inside accepted actual lease-level
  occupancy. Planned, cancelled, or unknown-boundary participation is not
  confirmed residence. A tenant or `authorized_occupant` role alone proves
  contractual responsibility or authorization, not observed residence.
- **Billing contact** comes from an effective-dated `billing_contact` row and
  does not imply responsibility or occupancy.
- **Current master data** comes from `people`; it can refresh directories and
  profile links.
- **Historical or published display facts** come from a snapshot owned by the
  issued or published artifact. A later people edit must not rewrite it.

Track B also exposes a checked, period-effective relationship-evidence
contract for Track A:

- responsible tenant parties and the billing recipient are resolved
  separately; a `billing_contact` is not automatically a debtor;
- accepted party, occupancy, and participant versions plus actual, scheduled,
  and notice evidence candidates are returned with boundary kind, confidence,
  reason codes, and a material hash; and
- Track B does not choose rent policy, due date, proration, a charge
  calculation window, or the approved occurrence calculation snapshot.

Track A combines that evidence with Plan 04's authoritative term/policy
contract. Track A owns approved calculation dates and reasons, due date,
proration/notice policy selection, blockers, and the immutable calculation
snapshot stored on an occurrence. The local Track A labels for future tenant
invoice and formal-receipt work are coordination-only until ratified; they do
not renumber the merged Owner Close sequence. After an occurrence exists,
Track B supersession previews return typed affected occurrence/draft IDs
through a merged owner adapter but never rewrite an obligation, invoice,
receipt, projection, close record, or statement.

### Smallest safe IPS model

- One lease represents one agreement and, for unit tenancy, one unit.
- Multi-unit leases are unsupported in the first implementation.
- One lease has one business occupancy lifecycle. Correction versions do not
  count as additional stays.
- A unit cannot have overlapping scheduled or actual occupancy periods.
- Dates are whole business days and end dates are inclusive. A successor
  period starts after the prior end date. Same-day turnover remains
  unsupported until IPS explicitly approves its meaning.
- Scheduled dates describe intent. Actual dates describe observed events.
  Neither is inferred from the other in new writes.
- New Lease creation and import may create a scheduled compatibility fact with
  explicit inferred/unknown confidence, but actual move dates remain `NULL`
  without independent evidence. Term dates never silently confirm party
  boundaries.
- Every boundary resolves as `known`, `open_current`, or `unknown`; an open
  current relationship is not the same as an unknown end.
- Vacancy is derived from gaps between confirmed actual occupancy periods.
  It is not a writable vacancy row. If either boundary is unconfirmed, the
  interval is "unknown", not confirmed vacancy.
- A cancelled pre-move-in lease retains a cancelled reservation and lease
  history but does not become confirmed physical occupancy.
- A terminated lease retains the agreement, party periods, actual occupancy,
  terms, and linked records.

### Continuity

- An amendment or extension stays on the same lease only when the agreement
  identity, unit, and financially responsible tenant set remain the same.
  Changed economics use a new Plan 04 term version.
- A newly executed agreement creates a successor lease even when the unit and
  people are unchanged.
- A different primary tenant after commencement creates a replacement lease.
- A unit transfer creates a successor lease and a new occupancy; it never
  rewrites the old lease's unit.
- Adding or ending an authorized occupant or changing a billing contact does
  not by itself require a replacement lease.
- Month-to-month continuation, holdover, and same-day transfer are blocked
  until IPS policy and compatible term rules are approved.

### Corrections

- A draft, not-yet-effective relationship with no dependent record may be
  corrected in place only through a checked, audited operation.
- A true end is recorded by ending the existing relationship; it is not
  archived or deleted.
- An incorrectly selected historical person is voided with a reason and linked
  replacement. It is not end-dated as though the false relationship really
  occurred.
- A completed actual occupancy fact is corrected through linked,
  append-preserving evidence.
- Changes with issued, settled, closed, or published dependencies use the
  downstream workflow reported by the impact contract. Track B never silently
  carries those records to a successor lease.

## Risk-ordered implementation sequence

The accepted Track B sequence is:

1. **TB-01 — Historical-integrity guards**
2. **TB-02 — Relationship model, legacy bootstrap, and safe creation**
3. **TB-03 — Dependency impact and existing-history transitions**
4. **TB-04 — Legacy classification, repair manifest, and bounded pilot**
5. **TB-05 — Historical read models and relationship-evidence resolver**
6. **TB-06 — Extension, replacement, renewal, and unit-transfer workflows**
7. **TB-07 — Track B operational links and historical-surface adoption**

Finance consumers adopt the required lease, term, party, occupancy,
participant, person, and owner-defined snapshot links through Track A's
ratified sequence, not through TB-07.

## Recommended next slice

**Mode:** Standard
**Effort:** High
**Reason:** The first slice must close multiple write bypasses and preserve
Plan 04 compatibility without expanding into new lifecycle or UI behavior.

Implement TB-01 only after this planning pull request is merged and the
implementer records the then-current merged `origin/main` SHA. The complete
copy-paste prompt is in `91-codex-handoff-prompts.md`.
