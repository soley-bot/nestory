# Migration and Pilot

## Objective

Move from one mutable compatibility party/occupancy projection per lease to
trusted effective-dated history without inventing people, occupants, dates, or
physical events.

Migration is evidence classification first, mutation second.

## Existing compatibility inputs

Existing records may depend on:

- `leases.primary_tenant_person_id`;
- `leases.tenant_name`;
- the first compatibility primary-party row;
- the first compatibility occupancy row;
- lease header dates copied into party/scheduled/actual dates;
- active, ended, terminated, cancelled, or archived lease status;
- imported one-tenant lease rows;
- missing or duplicate Person links;
- current names that no longer match `tenant_name`;
- unitless leases;
- incomplete or conflicting move dates; and
- broad direct-DML or legacy-RPC access.

The current activity log is supporting evidence only. It does not reliably
retain prior primary-person identity, and display names are not unique.

## Classification levels

Classification applies to each asserted fact, boundary, or relationship link,
not to a database row as a whole. One legacy row can therefore contain a
deterministic identity link, an inferred start, an unresolved end, and no
physical-participant evidence. At minimum, separately classify:

- organization/property/unit/Lease and Person identity links;
- party role, start, and end facts;
- scheduled start/end, actual start/end, and notice facts;
- only explicit source assertions that independently evidence an
  occupancy-participant link; overlapping party/occupancy rows do not create a
  fact, and absence remains absence/unknown;
- exact source/import/artifact references; and
- any predecessor/successor evidence only as an unresolved continuity
  candidate/review issue, not as an accepted link.

TB-04 does not create or classify accepted continuity links because the
normalized continuity target does not exist until TB-06. TB-06 may use these
review issues as evidence, but an operator must make the explicit continuity
decision under that slice's validation.

Each fact retains its own classification, boundary kind where applicable,
source type/ID/version, confidence, reason codes, source-material hash, and
correction lineage. A row-level rollup may be derived only to prioritize or
summarize the review queue. It uses the most restrictive required action and
must never upgrade, erase, or replace fact-level evidence or drive a historical
read result.

### Deterministic

An individual fact is safe without operator judgment when it is:

- stable organization/property/unit/lease/person foreign-key scope;
- an existing primary-party row whose person matches
  `primary_tenant_person_id`;
- a lease-term authority already established by Plan 04;
- a scheduled compatibility boundary copied from the lease header, when
  labelled `legacy_contract_projection`; and
- exact source import/run/row identity where stored.

Deterministic does not mean physically confirmed.

### Safe inferred

Retain the individual fact but label it inferred:

- compatibility party start/end copied from lease header;
- compatibility occupancy actual move-in equal to lease start with no
  independent move evidence;
- compatibility actual move-out equal to lease end for ended/terminated rows
  with no independent evidence; and
- compatibility current display name derived from a current Person.

Inferred values can support review and provisional display. They do not create
confirmed vacancy or overwrite explicit evidence.

### Operator review

Require a reviewed resolution for:

- `tenant_name` with no exact Person link;
- several plausible People records;
- `primary_tenant_person_id` and primary-party person mismatch;
- several current primary-party rows or several occupancy candidates;
- historical interval overlap;
- active lease with archived person;
- archived lease retaining an open occupancy/party;
- unit/property mismatch or unitless Unit tenancy;
- actual dates that conflict with explicit Timeline/Documents/import evidence;
- successor/renewal identity that cannot be proven;
- same-day turnover;
- missing/contradictory actual boundaries; and
- dependent issued/settled/closed/published records that would be reinterpreted.

### Legacy unresolved

Retain as unresolved when evidence is insufficient. Examples:

- old names with no exact identity;
- alleged co-tenants or occupants found only in free text;
- an exact physical move date not stored in a trusted source;
- whether an old agreement was extended or replaced; and
- which Person a historical payer label meant.

Unresolved records are not silently dropped, but they are not reported as
confirmed renters/occupants.

## Never infer

Do not:

- create a Person from a name without reviewed identity resolution;
- invent a co-tenant or authorized occupant;
- treat `person_roles.role = 'tenant'` as a lease relationship;
- mark lease start as confirmed move-in;
- mark lease end as confirmed move-out;
- infer a renewal link because unit/person/rent values are similar;
- attach maintenance or documents to an occupancy through date/name proximity;
- infer a historical financial tenant from the current lease primary person;
  or
- fuzzy-match by amount, date, label, description, or name.

## Ownership boundary during migration

TB-04 classifies and migrates relationship/date evidence only. It may preserve
exact Plan 04 term IDs/versions as source references, but it does not calculate
or choose the authoritative term/policy window, due date, proration or notice
application, calculation blockers/readiness outcome, or a stored approved
calculation snapshot. Those remain Track A responsibilities after it consumes
the Track B relationship-evidence envelope.

Track B migration may also retain exact generic-document references as cited
evidence. Generic Documents must apply its owning
publication/version/immutability contract; TB-04 does not create that
lifecycle. Track A owns only the close manifest, Owner Statement
versions/artifacts, and their immutable close/publication evidence snapshot at
this boundary.

## Migration records

The implementation needs a bounded, resumable migration/review contract,
provisionally:

- migration run header with baseline schema/version, organization, filter,
  status, actor, timestamps, counts, and source/material hashes;
- one item per atomic asserted fact or issue, with stable identity derived from
  source table/row, fact kind, and source material;
- typed issue and proposed resolution;
- exact source and target IDs;
- per-fact before/after value and boundary kind, classification, confidence,
  provenance, reason codes, and source-material hash;
- a derived row-level review rollup that never substitutes for fact records;
- operator resolution, reason, actor, and time;
- applied idempotency identity and result IDs; and
- retry/failure evidence.

The final table/RPC names are selected in TB-04. The semantics above are
required. A generic free-text review queue is not enough.

## Phased migration

### Phase 0 — Prevent new damage

TB-01:

- revokes or guards bypass writes;
- stops compatibility trigger replacement behavior;
- keeps normal Plan 04 lease creation and safe metadata/term paths working;
- makes unsupported primary/unit/history changes explicit; and
- adds red-first regression and authorization evidence.

No historical backfill begins before this is merged.

### Phase 1 — Add lifecycle/provenance

TB-02:

- adds separate evidence/business lifecycle, source, boundary confidence,
  occupancy-participant evidence, and correction lineage;
- adds the exact-one checked brand-new Lease relationship composition;
- defines accepted-version and accepted-fact overlap rules; and
- preserves compatibility projections inside the checked boundary.

Every pre-TB-02 fact starts mechanically as `legacy_unresolved`. TB-04 may
promote each fact independently only when its exact evidence supports a
different classification and accepted-version/overlap validation passes. A row
does not receive one blanket classification.

### Phase 2 — Dry-run inventory

TB-04 first runs without applying:

- counts leases, parties, occupancies, mismatches, conflicts, unitless rows,
  archive conflicts, person conflicts, inferred dates, and dependencies;
- classifies and emits every atomic fact/issue with deterministic item ID and
  hash;
- emits a row-level queue rollup separately;
- pages every fact/issue item;
- proves rerun equality; and
- separates auto-classifiable from operator-review/unresolved facts.

No dry run may claim that an inferred actual date is confirmed.

### Phase 3 — Fact classification and constrained promotion

Apply fact-level results without conflating confidence and acceptance:

- persist deterministic, safe-inferred, reviewed, and unresolved
  classification/provenance as durable migration fact items so TB-05 can label
  them consistently;
- promote only deterministic or operator-resolved normalized facts to
  `accepted`, after accepted-version and overlap validation;
- keep safe-inferred facts `legacy_unresolved`/provisional in normalized
  history, with explicit inferred confidence. They may support a labelled
  scheduled/provisional view but never confirmed actual occupancy,
  responsibility, participant presence, or vacancy;
- preserve the row rollup as queue metadata only;
- establish correction/accepted state without deleting evidence;
- repair current compatibility projections from accepted rows;
- preserve exact Plan 04 term links; and
- record per-item idempotent results.

The apply operation rechecks the source hash and refuses stale data.

### Phase 4 — Operator resolution

The operator can:

- select an exact existing Person;
- retain unresolved identity;
- confirm/correct a party date;
- confirm/correct actual occupancy from cited evidence;
- resolve unit scope;
- void a false compatibility row and add accepted evidence;
- identify amendment versus successor agreement; or
- defer when evidence is insufficient.

Every resolution names its evidence. Bulk "accept all inferred dates as
actual" is not permitted.

### Phase 5 — Read adoption

TB-05 moves Unit, Person, and Lease history to the checked read models. Current
operational lists may retain compatibility projections temporarily but must
label unresolved/legacy state.

Track A consumers migrate independently through the amendments in file 92.

### Phase 6 — Compatibility retirement

Only after:

- every authoritative Track B read uses normalized history;
- Track A no longer derives historical tenant context from mutable headers;
- imports use explicit provenance;
- no supported write path changes compatibility fields independently;
- observed parity/telemetry is clean through a bounded window; and
- the Owner Close compatibility-retirement gate authorizes it.

Retirement can mean removing writes/fallbacks before dropping columns. No
column drop is part of this planning package.

## Bounded pilot

The pilot is not an automatic production backfill.

Select:

- one explicitly named organization;
- one named property with a small, reviewed lease set;
- leases covering active, ended, cancelled-before-move-in, and at least one
  former-party case;
- one accepted explicit occupancy-participant case whose lifecycle/boundaries
  prove presence, one accepted planned/unknown-boundary negative case, and one
  party/occupancy association with no participant evidence;
- one inferred actual-date case;
- one ambiguity left unresolved; and
- no same-day turnover, multi-unit lease, holdover, or month-to-month case.

Required pilot evidence:

- before/after manifest and hashes;
- exact lease/party/occupancy/participant IDs;
- zero overwritten/deleted historical records;
- reviewed classification and provenance for every applied fact;
- row rollups reconcile to their fact records without replacing them;
- unresolved facts still visible and excluded from confirmed results;
- Unit renter query with known expected people/dates;
- Person and Lease history parity;
- compatibility projection parity for current operational screens;
- impact preview for at least one draft-only and one blocked financial case;
- rollback rehearsal on a local copy; and
- operator sign-off naming the scope.

Hosted execution, deployment, or broad cutover requires separate explicit
authorization. This planning PR performs none.

## Rollback and resumability

- Migrations are append-only and idempotent.
- Each apply item has a stable identity and payload hash.
- A retry returns the original result or rejects a different payload.
- Failed items do not mark the run complete.
- Classification/provenance changes can be superseded through a reviewed
  correction; do not erase the prior migration evidence.
- A local rollback rehearsal proves the pre-apply data remains recoverable.
- Compatibility readers remain available until read adoption is proven.

## Production truth boundary

The audit proves repository behavior at the planning baseline. It does not
prove:

- linked hosted schema matches the migration chain;
- a specific production row was overwritten;
- historical names/dates can be recovered from production artifacts;
- every deployed grant/function has parity; or
- the pilot is safe for all organizations.

Each implementation slice must verify its own local database behavior.
Production inspection and mutation require a separately authorized,
environment-specific run.

## Acceptance criteria

1. Every asserted fact/link/boundary is deterministic, inferred,
   operator-review, or unresolved, with its own provenance and source hash.
2. Row-level classification is a derived review-queue rollup only and cannot
   upgrade or replace fact-level classifications.
3. Actual move dates copied from lease dates remain inferred unless evidenced.
4. No historical people/occupants are fabricated.
5. Dry-run output is complete, paginated, deterministic, and hash-bound.
6. Apply is idempotent and rejects stale source data.
7. Ambiguous facts remain visible and do not become confirmed history.
8. Current compatibility screens retain bounded backward compatibility.
9. Track A consumers are not silently changed by Track B migration, and Track
   B does not take ownership of calculation or generic-document publication.
10. Pilot evidence includes rollback and exact known-answer queries, including
    participant-proven versus merely associated people.
11. No hosted mutation or compatibility drop occurs without later explicit
    authorization.
