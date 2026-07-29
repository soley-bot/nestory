# Read Models and Historical Views

## Objective

Provide one trustworthy, paginated answer for Unit, Person, and Lease history
without creating a second writable history store.

The read layer is a projection over accepted party, occupancy, lease, and term
records. It must preserve uncertainty, correction lineage, exact links, and
organization isolation.

## Canonical Unit renter query

The official question:

> Who rented Unit A-101 between two dates?

is answered by:

1. resolving the organization-scoped Unit ID;
2. selecting current accepted `lease_occupancies` candidates for the unit and
   classifying each effective interval against the query;
3. joining their lease IDs to current accepted `lease_parties` in tenant roles
   and independently classifying each role interval against the query and
   occupancy interval;
4. separately selecting accepted occupancy-participant versions, then
   classifying physical presence only when `present`/`ended` lifecycle and
   confirmed boundaries overlap accepted actual occupancy;
5. joining `people` for the current profile link/display;
6. joining authoritative `lease_terms` whose intervals overlap the result; and
7. returning boundary kind, overlap state, source/confidence/correction
   metadata, and exact record links.

It does not use:

- `units.status` as historical evidence;
- `leases.tenant_name` as person identity;
- `person_roles.role = 'tenant'` as a tenancy;
- a current active lease selected by status;
- activity-log strings as reconstructed truth; or
- name matching; or
- party-role overlap as proof that a Person physically occupied the Unit.

## Responsibility and occupancy are separate result sets

The Unit response has at least:

- `tenant_responsibility_periods`: primary/co-tenant role periods;
- `lease_unit_physical_use_periods`: accepted Lease/Unit occupancy intervals;
- `confirmed_occupancy_participants`: individuals whose accepted participant
  version has `present`/`ended` lifecycle and confirmed boundaries proving
  presence during accepted actual occupancy;
- `associated_or_authorized_people`: overlapping tenant or
  authorized-occupant roles without person-level physical-presence proof;
- `other_lease_party_periods`: guarantor and billing-contact periods;
- `rent_term_periods`: Plan 04 term versions;
- `confirmed_vacancy_periods`;
- `scheduled_vacancy_forecast`; and
- `unresolved_history`.

A person can appear in tenant responsibility without confirmed person-level
physical occupancy. An authorized-occupant role proves authorization, not
presence. An accepted participant that is planned, cancelled, or has an
unknown required boundary also does not prove presence. Without an accepted
participant version whose lifecycle and boundaries prove residence, the read
model returns the Person as `scheduled`, `associated`, `authorized`, or
`unknown`, never as a confirmed physical occupant.

## Interval resolution

### Accepted version

Default reads include `accepted` versions and exclude `voided` and
`superseded` versions from business totals. They return:

- `has_correction_history`;
- accepted row ID;
- prior version count; and
- exact audit expansion link.

An audit mode may include every version with state/reason but must clearly mark
which rows are not business truth.

### Boundary precedence

For occupancy:

1. confirmed actual dates;
2. inferred actual dates, labelled inferred;
3. scheduled dates, labelled scheduled; and
4. unknown when no supported boundary exists.

Scheduled dates never replace actual dates in confirmed history. Lease header
dates may be shown as legacy contract context but do not fill actual occupancy.

For party responsibility, use explicit `started_on`/`ended_on` and their
confidence. Do not silently default them to lease dates in the read query.

Every resolved start/end also has one explicit boundary kind:

- `known`: the accepted evidence establishes the inclusive date;
- `open_current`: an accepted end boundary is intentionally still open as of
  the caller's `as_of_date`; and
- `unknown`: the evidence does not establish that boundary.

Raw NULL is never sufficient to choose between `open_current` and `unknown`.
`open_current` is resolved only through `as_of_date` and never asserts a future
period after that date.

### Incomplete intervals

If a start or end is unknown:

- return the known boundary and `history_confidence = 'unknown'`;
- exclude the interval from confirmed vacancy calculation;
- do not claim exact overlap outside the known boundary; and
- include a repair reason and exact source link.

Date-range matching is tri-state:

- `definite_overlap` when accepted known/open-current facts prove the
  intersection;
- `non_overlap` when accepted known facts disprove it; and
- `possible_overlap` when an unknown boundary prevents either conclusion.

Confirmed result sets and totals use only `definite_overlap`.
`possible_overlap` rows remain visible in `unresolved_history`; SQL NULL
comparisons must not silently discard them.

## Vacancy derivation

### Confirmed vacancy

For one Unit:

1. take accepted confirmed actual occupancy intervals with
   `definite_overlap`;
2. sort by actual start and stable ID;
3. verify there is no overlap;
4. derive a gap only when the next start is later than the prior inclusive end
   plus one day; and
5. return the IDs of both boundary occupancies.

The gap is derived, not persisted. A Unit before its first known occupancy can
be confirmed vacant only from the bounded query start through the day before a
confirmed first actual move-in. A Unit after its last occupancy can be
confirmed vacant only from the day after a confirmed actual move-out through
the bounded query end. An `open_current` or `unknown` actual boundary blocks
the corresponding edge gap.

### Scheduled vacancy

Scheduled gaps are a forecast returned separately. They can change and must
never be counted as historical vacancy.

### Unknown

An inferred/unknown actual boundary makes the gap unknown. The UI can ask for
operator review; it must not display "vacant for 45 days" as fact.

## Proposed checked read contracts

Names are provisional until implementation migration naming is selected, but
the contracts are required.

### Shared paging envelope

Every history page uses keyset pagination and the same checked envelope:

- `MAX_HISTORY_PAGE_SIZE = 100`; requests outside `1..100` are rejected;
- the first request supplies organization, target ID, normalized filters,
  bounded date range where applicable, `as_of_date`, include-corrections flag,
  authorization context, and page size;
- the first response returns `filter_token`, `material_token`, rows, and an
  optional next cursor;
- `filter_token` binds the contract version, organization, target, normalized
  filters/date range, `as_of_date`, include-corrections flag, and effective
  authorization scope;
- `material_token` binds the accepted source IDs, versions, classifications,
  and correction state material to the result; and
- every later-page cursor binds the contract version, stable final sort tuple,
  `filter_token`, and `material_token`.

A changed organization, target, filter, date range, `as_of_date`, correction
mode, or authorization scope is a different first-page query. A mismatched
filter token or stale material token is rejected explicitly; the server must
not silently restart the scan or combine pages from different accepted
versions.

### `get_unit_occupancy_history_page`

Inputs:

- organization ID;
- unit ID;
- from/to dates;
- required `as_of_date`;
- party-role filter;
- confidence filter;
- include-corrections flag;
- page size;
- stable cursor for later pages; and
- the cursor-bound filter/material tokens for later pages.

Returns one ordered row per accepted occupancy/lease segment with:

- exact organization/property/unit/lease/occupancy IDs;
- effective boundary values and their `known`, `open_current`, or `unknown`
  kinds;
- `definite_overlap`, `possible_overlap`, or `non_overlap`;
- separately identified tenant-responsibility and Lease/Unit physical-use
  periods;
- the exact accepted occupancy-participant version when its lifecycle and
  confirmed boundaries prove a Person's physical presence;
- scheduled/associated/authorized/unknown people separately when participant
  evidence is absent, planned, cancelled, or has an unknown required boundary;
- nested or separately keyed bounded party/term summaries;
- confidence, provenance, dependency counts, filter/material tokens; and
- next cursor.

Stable order:

```text
effective_start DESC NULLS LAST,
effective_start_kind ASC,
lease_id DESC,
occupancy_id DESC
```

Large nested party/term collections must use their own bounded child pages or
pre-aggregated, size-capped summaries. Party child pages order by
`role_effective_start ASC NULLS LAST, party_role ASC, party_id ASC`; term child
pages order by `start_date ASC, term_sequence ASC, term_id ASC`. Each child
page has its own envelope and cursor and reports truncation explicitly.

### `get_person_lease_history_page`

Inputs:

- organization ID;
- person ID or resolved survivor ID;
- from/to dates;
- required `as_of_date`;
- role/status filters;
- include-corrections flag;
- page size;
- cursor; and
- the cursor-bound filter/material tokens for later pages.

Returns:

- source person ID and resolved current profile ID;
- lease/party IDs and exact role period;
- property/unit/occupancy context;
- tenant responsibility separately from physical occupancy;
- confirmed physical occupancy only when an accepted occupancy-participant
  version's lifecycle and confirmed boundaries prove presence during accepted
  actual occupancy;
- scheduled/associated/authorized/unknown state when the person has party or
  occupancy context but no presence-proving accepted participant version;
- current/former/scheduled status derived as of a supplied business date;
- term summary;
- permitted financial context link, not unrestricted financial data; and
- boundary kinds, overlap state, provenance/confidence/repair state, paging
  tokens, and next cursor.

The supplied business date is exactly `as_of_date`; it is not server "today."
`current`, `former`, and `scheduled` require definite date evidence.
`possible_overlap` or an unknown required boundary produces `unresolved`, not a
current/former guess.

Stable order:

```text
role_effective_start DESC NULLS LAST,
lease_id DESC,
party_id DESC
```

The security contract must not expose financial detail merely because a caller
can view a Person.

### `get_lease_history`

Inputs:

- organization ID;
- lease ID;
- required `as_of_date`;
- include-corrections flag;
- exactly one selected collection;
- page size and cursor; and
- the cursor-bound filter/material tokens for later pages.

Returns the stable Lease identity and one independently paginated collection at
a time:

- all party-role periods;
- occupancy lifecycle and corrections;
- explicit occupancy-participant evidence;
- authoritative term versions;
- predecessor/successor continuity;
- deposit agreement/event links;
- charges, obligations, invoices, receipts, and statements through exact
  Track A read links;
- documents, inspections, maintenance, and Timeline sources;
- activity/correction evidence; and
- unresolved migration issues.

TB-05 implements the party, occupancy, participant, term, and unresolved/
correction collections. The continuity collection/order above is a reserved
extension that TB-06 implements only after it creates the normalized continuity
model; TB-05 must return that collection as unavailable rather than inventing
links from adjacent leases.

Stable collection orders are:

| Collection | Stable keyset order |
| --- | --- |
| Parties | `started_on ASC NULLS LAST, party_role ASC, party_id ASC` |
| Occupancies | `effective_start ASC NULLS LAST, occupancy_id ASC` |
| Occupancy participants | `effective_start ASC NULLS LAST, occupancy_id ASC, participant_id ASC` |
| Terms | `start_date ASC, term_sequence ASC, term_id ASC` |
| Continuity | `relationship_date ASC NULLS LAST, relationship_kind ASC, relationship_id ASC` |
| Operational sources | `source_date DESC NULLS LAST, source_kind ASC, source_id ASC` |
| Unresolved/corrections | `issue_kind ASC, source_id ASC, issue_id ASC` |

Each collection returns its own explicit next cursor and truncation state. A
response must not embed an unbounded child collection or reuse another
collection's cursor.

Financial navigation is an exact, permission-gated link into Track A reads.
The Track B result does not embed financial facts or fall back to a fuzzy
search when the Track A target is unavailable.

The read model does not calculate or own financial effects.

### Resolver/detail contracts

Exact detail RPCs or RLS-safe queries should resolve:

- one party/correction chain;
- one occupancy/correction chain;
- one migration-review item.

TB-06 adds the continuity-chain detail resolver with cycle protection after
the continuity schema exists.

They must reject cross-organization IDs rather than returning partial data.
Any paginated evidence/correction chain uses the same page maximum, token
binding, deterministic cursor, and stale-material rejection as the history
pages.

### Track B relationship-evidence envelope for Track A

Ratified Track A Plan 09 and the local, coordination-only tenant-invoice and
formal-receipt consumers—only after their authority is ratified and merged—
consume, but never edit, a Track B resolver whose output is limited to
relationship and date evidence. This does not refer to or renumber ratified
Owner Close Plans 10 and 11:

- accepted party/Person role candidates and their typed effective boundaries;
- eligible current contact or billing-contact references as candidates, not a
  selected recipient or debtor;
- accepted Lease/Unit occupancy candidates;
- explicit accepted occupancy-participant candidates;
- actual, scheduled, and notice facts with boundary kind, confidence,
  provenance, and reason codes;
- exact organization/property/unit/lease/party/occupancy/participant source IDs
  and versions; and
- resolver contract version and material hash.

Track B does not select or calculate the authoritative term/policy outcome,
effective calculation window, due date, proration or notice application,
calculation blockers/readiness outcome, or stored approved calculation
snapshot. Track A applies the Plan 04 term authority and its own policy,
calculation, blocker, due-date, proration, and snapshot contracts. A billing
contact is not automatically an obligor. Scheduled dates are forecast-only.
Unknown evidence remains unknown; Track B does not insert a compatibility
fallback to make a Track A calculation proceed. The complete dependency
contract is in `03-dependency-aware-change-contract.md`.

## Pagination, scale, and consistency

Current Lease pages use 25/50/100 row pagination, People relationships batch
at 100 IDs, Reports stop above 5,000 source rows, and global workspace search
returns only a small capped result set. A historical read must not fetch the
whole organization and filter in application memory.

Required behavior:

- checked server-side date and organization filters;
- indexes on accepted party person/lease/effective range;
- indexes on accepted occupancy unit/lease/effective ranges;
- keyset rather than growing-offset pagination;
- the shared maximum page size of 100 on every parent and child page;
- deterministic stable ordering;
- explicit truncation/cursors for child collections;
- contract/filter/material-token binding on every cursor;
- explicit stale-material and filter-mismatch errors rather than mixed or
  silently restarted pages; and
- production-shaped query-plan evidence before broad rollout.

Do not persist a live reporting table merely to avoid a correct indexed join.
If a view cannot paginate/security-filter predictably, use a checked
security-definer RPC with explicit authorization and a locked search path.

## Current versus historical person data

| Use | Current `people` values | Historical snapshot |
| --- | --- | --- |
| Tenant directory | Yes | No |
| Person profile link from old lease | Yes, alongside original role/date | No duplicate contact fields required |
| Historical occupancy list | Current display may be shown and labelled current | Optional recorded-name evidence only when it came from an explicit source |
| Draft invoice/communication | Yes until approved/issued, subject to regeneration | Draft snapshot may be replaced |
| Issued invoice | No rebuild from current person | Required recipient/name/address/contact snapshot |
| Published receipt | No rebuild from current person/lease header | Required payer and allocation-context snapshot |
| Signed lease document | No mutation | Signed bytes and associated execution/party snapshot retained |
| Published Owner Statement | No rebuild | Required recipient and exact line/source snapshots |

Do not copy every contact field to `lease_parties`. The relationship needs
identity, role, dates, and provenance. Artifact owners snapshot only the facts
needed to reproduce that artifact.

Generic Documents consumes the owning domain's merged
publication/version/freeze contract before it presents signed, issued, or
published evidence as immutable. Track B may provide exact relationship/date
source references, but it does not invent a generic-document publication
lifecycle. Track A ownership at this boundary is limited to close manifests,
Owner Statement versions/artifacts, and their immutable close/publication
evidence snapshots; it does not become the versioning authority for generic
documents.

## Unit history behavior

The eventual Unit history can show, chronologically:

- lease and continuity links;
- primary/co-tenant responsibility periods;
- Lease/Unit physical-use periods;
- confirmed Person-level physical occupancy only from accepted explicit
  occupancy-participant evidence;
- associated or authorized people separately when physical presence is not
  evidenced;
- scheduled and actual occupancy dates;
- confirmed, scheduled, and unknown vacancy gaps;
- authoritative rent terms for overlapping periods;
- deposit agreement/events through exact links;
- move-in/move-out/inspection context;
- tenancy-specific maintenance and documents;
- current versus historical state; and
- unresolved/legacy confidence.

General Unit maintenance remains visible by Unit but is not attributed to a
tenant unless an exact lease/occupancy link exists.

## Person history behavior

The eventual Person history can show:

- every accepted and, in audit mode, corrected lease-party record;
- exact role and dates;
- property/unit/lease and occupancy context;
- tenant responsibility versus confirmed participant-based physical
  occupancy, excluding planned/cancelled/unknown-boundary participants;
- associated/authorized/unknown state when a party role or Lease/Unit occupancy
  exists without explicit Person-level participant evidence;
- current, former, scheduled, voided, or unresolved state;
- successor/predecessor lease links; and
- permitted outstanding/settled financial navigation.

Current People screens filter toward active relationships and cannot serve as
this history.

## Lease history behavior

The eventual Lease history can show:

- all party-role periods, not only unended rows;
- occupancy lifecycle and scheduled/actual divergence;
- Plan 04 term versions;
- continuity links;
- exact operational/financial sources;
- documents, inspections, maintenance, and Timeline;
- correction and migration provenance; and
- current display values separately from artifact snapshots.

## Exact-link adoption

Current mutable-name and context searches are compatibility behavior, not
historical identity. Adoption is owned per source and target surface:

| Source -> target surface | Current problem | Required exact contract | Adoption owner/slice |
| --- | --- | --- | --- |
| Lease -> Person | Uses `query=tenant_name` | `personId` or exact party-detail target | TB-05 read target; TB-07 source adoption |
| Person -> Lease | Uses `query=<display name>` | `leaseId` or person-history target | TB-05 read target; TB-07 source adoption |
| Lease -> Timeline | Uses tenant-name query | `leaseId` filter accepted by the Timeline loader | TB-07 with Timeline owner |
| Person -> Timeline | Uses display-name query | Exact `personId` and, where material, party/occupancy/participant context | TB-07 with Timeline owner |
| Timeline -> Documents | Uses event-title query | `timelineEventId` accepted by the Documents loader | TB-07 plus Documents owner contract |
| Person -> Documents | Uses display-name query and also aggregates documents from historical property/unit context, which does not prove Person-specific evidence | Exact `personId`, `partyId`, `occupancyId`, or `participantId` only when the document cites that evidence; broad property/unit context remains visibly contextual | TB-07 plus generic Documents publication/version owner |
| Lease/Person -> Ledger | Uses tenant/person display-name query | Exact permission-gated Track A source/link ID; if the owner read is unavailable, render unavailable rather than fuzzy fallback | Track A amendment in file 92; TB-07 source adoption after merge |
| Unit history -> Maintenance | Unit context alone can over-attribute a tenancy | `unitId` plus optional exact `leaseId`, `occupancyId`, `partyId`, or `participantId` | TB-07 with Maintenance owner |
| Lease import conflict -> Lease | Current link puts a Lease UUID in `query`, but Lease search does not search IDs | Exact archived-capable Lease target such as `leaseId=<uuid>` | TB-07 import and Lease surface adoption |
| Reports/search -> normalized history | Current labels and small search results can imply current-header truth | Exact history target IDs; focused compatibility labels only where explicitly retained | TB-07 focused adoption |
| Correction/repair -> detail | A generic query can resolve the wrong record | Exact accepted record/correction/review-item ID | TB-03/TB-04 target; TB-05 detail read |

No exact link is rendered until the target parser/loader accepts and
organization-validates the parameter and a source-to-target test proves it.
Workspace search may discover a current record, but it is never the historical
query engine.

## Read-model security

Every read contract must:

- require a current organization membership;
- preserve existing workspace/property visibility rules;
- validate every supplied ID inside the organization;
- expose financial summaries only when the caller has permission;
- avoid broad `SECURITY DEFINER` table access without explicit checks;
- lock `search_path`;
- cap pages and reject abusive ranges;
- test anonymous, member, manager, admin, and cross-organization access; and
- retain exact authorization behavior for archived records.

## Acceptance criteria

1. Unit history answers renter responsibility by date without `tenant_name`.
2. Person-level physical occupancy is confirmed only by an accepted
   occupancy-participant version whose lifecycle and confirmed boundaries
   prove presence during accepted actual occupancy; planned/cancelled/
   associated/authorized/unknown remains separate.
3. Every returned boundary is `known`, `open_current`, or `unknown`, and every
   range comparison is `definite_overlap`, `possible_overlap`, or
   `non_overlap`.
4. Former and ended parties remain visible.
5. Vacancy is confirmed only from confirmed actual boundaries.
6. Unknown/inferred history remains visibly uncertain.
7. Plan 04 term versions supply economics; Track B supplies relationship/date
   evidence and does not own Track A calculation, due-date, proration, blocker,
   or snapshot decisions.
8. Unit, Person, Lease, and child collections enforce the 100-row maximum,
   stable keyset orders, explicit cursors, and filter/material-token binding.
9. Person history requires `as_of_date` and is role/date aware.
10. TB-05 Lease history resolves corrections without hiding evidence; TB-06
    adds exact continuity only from its normalized accepted links.
11. The owner/surface matrix replaces mutable-name navigation, including
    Ledger, Person Documents, and import-conflict links.
12. Cross-organization and unauthorized financial access are denied.
13. Production-shaped query plans and stable pagination are evidenced.
14. No second writable history table or fuzzy reconstruction is introduced.
