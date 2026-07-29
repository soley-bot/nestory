# Track B Implementation Sequence

## Baseline rule

The planning evidence baseline is
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`.

That SHA is not permission to implement from a stale branch. At the start of
every slice:

1. fetch `origin` with pruning;
2. record the exact merged `origin/main` SHA;
3. require the planning package and named predecessor slice to be merged;
4. stop if the predecessor is only an open PR or local branch;
5. create a clean isolated worktree/branch from that exact SHA;
6. inspect intervening changes for lease, people, occupancy, finance, Owner
   Close, and generated-type conflicts; and
7. report the exact baseline before editing.

The implementation slices merge sequentially. Track A work remains a separate
dependency and merge stream. Track B does not cherry-pick, merge, or copy
unmerged Track A decisions.

The coordinating Track A thread currently uses local labels for Plan 05,
Plan 09, tenant-invoice work, and formal-receipt work. Those labels are
unmerged coordination evidence, not authority to renumber the ratified Owner
Close sequence. File 92 preserves the exact requested concepts and their
authorization status. TB-05 supplies Track B's period-effective relationship
evidence; Track A alone combines it with authoritative term/policy data and
owns occurrence calculation, invoice, receipt, and publication semantics.

## Why the tentative order changes

The original tentative sequence placed read models before the dependency
contract and combined broad cross-module adoption.

Repository evidence requires a different order:

- stop additional in-place history loss first;
- create safe dated write operations before trusting a read model;
- establish dependency preview/execution before historical corrections;
- classify legacy evidence before presenting it as history;
- add paginated read models only after accepted-version/confidence rules exist;
- build continuity workflows on those foundations; and
- adopt operational surfaces last, while finance adoption stays Track A-owned.

Migration and read adoption are separate slices because one mutates historical
classification and the other changes product queries. Cross-module adoption
does not combine finance, document publication, maintenance cash, and all UI
work into one PR.

## Sequence summary

| Slice | Goal | Merged prerequisite | Result |
| --- | --- | --- | --- |
| TB-01 | Close overwrite and write-bypass paths | This planning package; evidence baseline `2dea9fb...` | Review-ready safety PR |
| TB-02 | Add relationship lifecycle, person occupancy evidence, legacy bootstrap, and safe new-Lease composition | TB-01 | Review-ready model/bootstrap PR |
| TB-03 | Add read-only impact preview and guarded existing-history transitions | TB-02 plus merged owner adapters for any owner-state classification/action | Review-ready dependency-contract PR |
| TB-04 | Classify legacy evidence and run a bounded migration pilot | TB-03 | Review-ready migration/pilot PR; no broad production cutover |
| TB-05 | Add trustworthy history reads and the Track B relationship-evidence resolver | TB-04 | Review-ready read/evidence-contract PR |
| TB-06 | Add extension/replacement/renewal/transfer orchestration | TB-05 plus required Track A contracts | Review-ready continuity PR |
| TB-07 | Adopt exact Track B links and historical surfaces | TB-06 plus named Track A amendments where consumed | Review-ready operational-adoption PR |

## TB-01 — Historical-integrity guards

### Objective

Prevent all currently identified paths from replacing party identity, unit
identity, or completed occupancy dates in place while keeping Plan 04 term
authority intact.

### Required scope

- Add RED pgTAP evidence for primary-tenant overwrite, occupancy/unit
  overwrite, direct child DML, legacy RPC bypass, active lease archive, unsafe
  restore, active Person archive, and creation/import date inference.
- Revoke or safely wrap legacy `update_lease(...)`.
- Revoke or safely wrap legacy `restore_lease(...)`; restore fails closed until
  TB-03 can recheck conflicts, dependencies, and stale impact inside one
  transaction.
- Remove authenticated/service-role direct mutation capability for the
  existing party and occupancy history surfaces, with checked internal context
  for approved workflows. TB-02 owns grants/RLS for the participant table/API
  that it introduces; no participant mutation surface exists at the TB-01
  baseline.
- Change compatibility synchronization so an existing history row is never
  selected and repurposed for a different person, unit, or completed fact.
- Stop creation/import synchronization from copying Lease term dates into
  actual move dates or silently confirming party boundaries. Without explicit
  independent evidence, actual dates remain `NULL`; any compatibility
  scheduled fact is marked inferred/unknown.
- Guard generic Lease edits that require a not-yet-implemented transition.
- Guard active Lease/Person archive paths from leaving invisible open
  relationships.
- Preserve checked Plan 04 lease creation, term update, import, and generated
  type discipline while changing only the unsafe relationship projection.
- Log exact old/new identities for every permitted compatibility projection.

### Explicit temporary behavior

If a safe dated transition does not exist yet, return a specific
`relationship_transition_required` or `occupancy_transition_required` error.
Do not preserve convenience by rewriting history. TB-02 supplies the model and
safe new-Lease composition; TB-03 supplies existing-history operations after
impact review.

### Exclusions

No broad lifecycle UI, backfill, historical read model, finance rewrite,
renewal, transfer, or hosted mutation.

### Gate to TB-02

- old row IDs/person/unit/dates survive attempted replacement;
- direct DML and legacy-RPC bypass tests fail closed;
- create/import/cancel tests prove term dates never synthesize actual move
  dates or confirmed party boundaries;
- legacy restore is unavailable and cannot reactivate stale relationships;
- same-payload retries behave deterministically where applicable;
- Plan 04 term tests and focused Lease tests pass;
- normal read behavior remains compatible; and
- branch/remote parity and migration/type evidence are review-ready.

## TB-02 — Relationship model, legacy bootstrap, and safe creation

### Objective

Add typed lifecycle, provenance, person-level physical-occupancy evidence,
legacy bootstrap, overlap protection for accepted facts, and one safe
brand-new Lease relationship composition. Do not yet mutate existing Lease
relationships.

### Required scope

- Separate evidence state (`accepted`, `superseded`, `voided`,
  `legacy_unresolved`) from type-specific business lifecycle:
  - party: `planned`, `effective`, `ended`, or
    `cancelled_before_effective`;
  - occupancy: `reserved`, `occupied`, `notice_given`, `vacated`, or
    `cancelled_before_effective`; and
  - participant: `planned`, `present`, `ended`, or
    `cancelled_before_effective`.
- Add typed record source, explicit `known`/`open_current`/`unknown` boundary
  kind, and per-fact/per-boundary confidence.
- Add correction/supersession lineage.
- Add dated `lease_occupancy_participants` evidence so a named Person is
  reported as physically resident only from an accepted participant version
  in `present` or `ended` lifecycle whose interval is contained by accepted
  actual occupancy, with every query-material participant and occupancy
  boundary `known` or an end resolved `open_current` through `as_of_date`.
- Define the new participant surface's least-privilege grants, RLS, checked
  mutation context, and direct authenticated/service-role DML denial in TB-02.
- Mechanically mark every pre-TB-02 party/occupancy row
  `legacy_unresolved`; preserve deterministic identity separately from
  inferred/unknown boundaries. Do not derive a participant from overlapping
  party and occupancy rows; absent person-presence evidence remains absent/
  unknown.
- Add effective-range indexes/exclusions for accepted, sufficiently known
  party, occupancy, and participant intervals. Unresolved legacy facts do not
  enter accepted-version exclusions until TB-04 promotion validates them.
- Define one transactional new-Lease composition with Plan 04. It must either
  create and return the exact normalized party/occupancy rows once or
  adopt/promote the exact compatibility-trigger rows; it never inserts a
  duplicate set.
- Let checked creation/import accept explicit planned party, occupancy, and
  participant evidence. Omitted actual dates remain `NULL`; scheduled
  compatibility facts and party boundaries carry inferred/unknown confidence
  unless independently supplied.
- Maintain compatibility projections only after normalized writes succeed.
- Add exact activity entity types and IDs.
- Require an individual Person for occupancy participation; party roles alone,
  including `authorized_occupant`, do not prove residence.
- Enforce organization, property/unit, role, date, idempotency, RLS, and
  concurrency invariants.

### Dependency boundary

Every add/end/change/correct/record/cancel operation on an existing Lease
returns `impact_contract_required` (or a more specific transition-required
error). TB-02 has no authority to guess that an existing relationship is
dependency-free. TB-03 supplies the complete scanner and those operations.

### Exclusions

No existing-Lease party/occupancy/participant transition, restore, person
merge, successor lease, unit transfer, fact promotion, historical screen, or
finance action.

### Gate to TB-03

- brand-new checked creation/import produces exactly one primary party and one
  occupancy and never invents actual dates;
- every pre-existing row/fact is mechanically `legacy_unresolved`;
- evidence state and business lifecycle are independent;
- cancelled-before-effective party/participant facts remain auditable but do
  not count as responsibility or residence;
- overlap constraints hold under two sessions;
- scheduled and actual dates remain separate;
- cancelled-before-move-in has no actual dates;
- compatibility fields cannot initiate writes; and
- all authorization/bypass tests pass.

## TB-03 — Dependency impact and existing-history transitions

### Objective

Implement the versioned read-only impact response and stale-safe execution for
existing-Lease Track B transitions. Discover exact owner-linked source IDs,
but classify owner state and invoke actions only through merged owner
adapters. The period-effective relationship-evidence resolver belongs to
TB-05, after accepted legacy facts can be read safely.

### Required scope

- Versioned, authorized, paginated impact RPC/service.
- Finite preview vocabulary with an explicit TB-03 execution subset;
  continuity kinds return `deferred_to_tb06`, and duplicate-Person resolution
  returns `identity_resolution_unavailable` until separately approved.
- Stable target/dependency material token and keyset cursors.
- Display/calculation/workflow/financial classifications.
- State/action matrix from file 03, with `owner_state_unresolved` and action
  unavailable whenever the domain owner's adapter is absent.
- Checked existing-Lease operations for add/end/change/cancel/record,
  void/replace party, supersede occupancy/participant evidence, and checked
  archive/restore.
- Explicit unavailable-action responses where Track A workflows do not yet
  exist.
- Exact activity/idempotency evidence.
- Typed affected occurrence/draft identities after term, party, or occupancy
  supersession when the merged Track A source exists; otherwise an explicit
  unavailable adapter.
- Stale preview, high-cardinality, RLS, direct-RPC, replay, and concurrent
  dependency-change tests.
- Mandatory same-transaction Track A assert-open/property-period locks before
  any execution affecting a financial period. Cross-property cases acquire
  all source/destination property-period locks in deterministic order.
- Preview writes no activity or audit row. Execution records the selected
  action, exact sources, actor, and result only after revalidation.
- Focused confirmation UI only if needed to exercise the contract.

### Exclusions

No generic workflow engine, no automatic finance mutation, no close/reopen, no
invoice/receipt implementation, and no broad Unit Timeline.

### Gate to TB-04

- preview is read-only and deterministic;
- exact Track B source IDs and owner-adapter states are source-versioned and
  hash-bound;
- execution rechecks inside the transaction;
- existing-Lease routine transitions, checked restore, zero-dependency, and
  draft-only corrections succeed only through explicit available actions;
- issued/settled/closed/published cases preserve originals and return exact
  prerequisites; and
- an `approved_not_issued` owner state uses only the merged owner-declared
  checked `reset_approval` or `reopen` action followed by apply/regenerate
  through that owner; without it, the known state is preserved and the action
  is unavailable; and
- pagination covers the full material set without client-trusted counts.

## TB-04 — Legacy classification, repair manifest, and bounded pilot

### Objective

Classify existing compatibility rows, preserve uncertainty, and prove a
resumable local pilot before any broad historical read claims.

### Required scope

- Dry-run manifest and deterministic hashes bound to one immutable source
  snapshot captured under repeatable-read isolation; every page and apply
  reuses that snapshot identity. Apply locks/reloads the exact source set and
  re-hashes it inside the same transaction before mutation, rejecting changed
  source material.
- Typed review issues and resolutions.
- Deterministic/inferred/review/unresolved classification for each asserted
  identity, boundary, and participation fact; a row-level rollup is
  review-queue metadata only. Potential predecessor/successor evidence remains
  an unresolved review issue until TB-06 creates the normalized continuity
  model.
- Idempotent apply with stale-source rejection.
- Durable fact-level classification metadata for safe-inferred and unresolved
  evidence; only deterministic/operator-resolved facts may promote to
  `accepted`, and safe-inferred normalized facts remain provisional/
  `legacy_unresolved`.
- Exact import/run/source provenance where present.
- Current projection repair only from accepted normalized records.
- Local rollback/retry/interruption evidence.
- One explicitly named bounded organization/property pilot selected during
  implementation.
- Known-answer Unit/Person/Lease history fixture queries.

### Exclusions

No fuzzy matching, broad hosted backfill, compatibility column drop, Track A
financial reattribution, or automatic approval of inferred actual dates.

### Gate to TB-05

- every asserted non-continuity fact/boundary/source link has a classification
  and provenance; continuity candidates remain unresolved TB-06 review issues;
- each row rollup reflects its least-trusted material fact without elevating
  any inferred/unknown boundary;
- unresolved rows remain visible and excluded from confirmed history;
- safe-inferred facts remain durably labelled/provisional and excluded from
  confirmed history;
- reruns create no duplicates;
- every page and apply remains bound to the one run snapshot, and apply's
  same-transaction source lock/re-hash rejects stale or concurrently changed
  material before normalized mutation;
- no historical row is deleted/overwritten;
- pilot and rollback evidence are reviewed; and
- the read contract can distinguish confirmed/inferred/unknown.

## TB-05 — Historical read models and relationship evidence

### Objective

Add checked, paginated source-of-truth projections and focused consumers for
historical responsibility, evidenced physical occupancy, vacancy, and terms.
Add the checked relationship-evidence envelope that Track A can
combine with its authoritative term/policy calculation.

### Required scope

- Unit occupancy/renter history page.
- Person lease-role history page.
- Lease history detail contract.
- Person-level confirmed physical-residence results only from the accepted
  participant version in `present` or `ended` lifecycle and accepted actual
  occupancy. Every query-material participant and occupancy boundary must be
  `known`, or an end may be `open_current` only when resolved through
  `as_of_date`; the participant interval must be contained within the accepted
  actual-occupancy interval. Planned, cancelled, or unknown-boundary
  participant or occupancy evidence remains scheduled/unknown. Otherwise
  report contractual/authorized association or unknown residence.
- Accepted-version/correction resolution.
- Explicit `known`, `open_current`, and `unknown` boundary resolution with
  definite overlap, possible overlap, and non-overlap results.
- Confirmed/scheduled/unknown vacancy.
- Every confirmed leading/internal/trailing vacancy interval is clipped to the
  historical window `[from_date, min(to_date, as_of_date)]`; later dates are
  forecast only.
- Current profile versus owner-provided artifact-snapshot references.
- Exact ID links originating in focused TB-05 Unit/Person/Lease history
  surfaces; explicit `as_of_date`; stable per-collection keyset cursors, max
  page sizes, filter/query hash, and material token. Timeline, Documents,
  import, Reports/search, and Ledger source adoption remains with TB-07 or the
  named owner.
- Every first or continuation page reauthorizes current membership, property
  visibility, and financial permission. Cursor/filter authorization material
  binds caller identity, issued-at, expiry, and authorization revision;
  authorization context is server-derived, and cross-user replay or
  expired/revoked authorization or tokens fail closed.
- Tenant responsibility is classified against the requested period without
  requiring occupancy overlap, including responsibility before move-in, after
  move-out, or while occupancy is unresolved, after exact accepted
  Lease/Unit association is established.
- Checked period-effective relationship evidence separating charge obligor
  candidates from billing recipient candidates. `billing_contact` is never
  automatically the debtor.
- Evidence output includes accepted party/occupancy/participant IDs and
  versions, actual/scheduled/notice fact candidates, boundary
  kind/confidence/reason, and a material hash. It does not choose a due date,
  proration/notice policy, charge window, or approved calculation snapshot.
- Role/permission-filtered financial navigation only where an exact merged
  owner link already exists; otherwise unavailable/deferred, never fuzzy.
- Query indexes and production-shaped plans.
- Focused Unit/Person/Lease adoption sufficient to prove the contract.

### Exclusions

No full visual redesign, all-report cutover, name-search overhaul outside
affected links, finance-report change, or compatibility removal.

### Gate to TB-06

- known Unit query returns the expected former renters by date;
- evidenced physical occupants, authorized/associated people, and responsible
  tenants are separate;
- responsibility before move-in, after move-out, and during unresolved
  occupancy remains visible without becoming physical-residence evidence;
- former parties appear;
- vacancy confidence is correct;
- pages remain stable above current application page sizes, reject cross-user
  cursor replay, and fail when authorization is revoked between pages;
- exact links replace fuzzy navigation in TB-05's focused history surfaces,
  while the owner/surface handoff remains explicit; and
- Track A can consume a stable relationship-evidence envelope without Track B
  calculating rent; and
- continuity is explicitly unavailable until TB-06 creates accepted links; and
- security and query-plan evidence is complete.

## TB-06 — Extension, replacement, renewal, and unit transfer

### Objective

Implement explicit continuity choices without moving predecessor dependencies.

### Required scope

- Append-preserving lease continuity links with at most one accepted incoming
  and one accepted outgoing link per Lease, plus no branch/merge/cycle checks
  and void/supersede correction lineage.
- Extension under same agreement via Plan 04 term workflow.
- Successor lease for newly executed agreement.
- Successor lease for post-commencement primary-tenant change.
- Successor lease and new occupancy for unit transfer.
- One transactional successor composition that uses Plan 04 creation and
  adopts/returns the exact normalized party/occupancy rows once; it never
  inserts a second trigger-created set.
- Scheduled transfer validates planned source/destination intervals without
  fabricating actual source move-out. Actual destination move-in requires an
  explicit actual source move-out.
- Atomic, append-preserving `cancel_successor_plan` for a not-yet-effective
  successor. After dependency recheck, one transaction moves the planned
  continuity link, successor Lease, reservation, planned parties/participants,
  and occupancy to their `cancelled_before_effective` lifecycles and invokes
  the merged checked Plan 04 action to cancel the successor's authoritative
  planned term without rewriting term history. If that action is unavailable,
  fail before mutation. Delete nothing, create no actual/effective fact, and
  release accepted-link cardinality for one later checked plan.
- Early-termination orchestration with distinct contract and occupancy dates.
- Dependency preview/action confirmation.
- Atomic locks across predecessor/destination Unit intervals.
- Exact predecessor/successor navigation.
- TB-06 adoption of the reserved continuity collection/detail contracts in
  file 04.

### Track A prerequisites

Cancelling a not-yet-effective successor requires a separately merged checked
Plan 04 action that append-preservingly cancels the whole authoritative planned
term. Do not reuse the current `terminate_authoritative_lease_term`, which does
not provide that successor-term cancellation contract, and never update
`lease_terms` directly from TB-06.

The implementation must stop if it requires an unavailable financial action,
particularly:

- draft occurrence/obligation regeneration;
- deposit custody transfer/refund/retention;
- closed-period reopen/restatement;
- issued/published replacement; or
- immutable source-scope adoption.

It may still implement the continuity operation when the impact contract proves
none of those actions is needed, but `cancel_successor_plan` must stop before
mutation when the required checked Plan 04 cancellation action is unavailable.

### Exclusions

No month-to-month, holdover, same-day turnover, multi-unit lease, invented
proration, deposit disposition, invoice/receipt lifecycle, or automatic
dependency carry.

### Gate to TB-07

- continuity cannot cycle or overlap;
- concurrent branch and merge attempts leave only one accepted chain;
- predecessor records remain attached to predecessor;
- retries do not duplicate successor or links;
- cancelling a planned successor is dependency-aware, idempotent, cancels the
  successor Lease and authoritative planned term through their checked owners,
  leaves no actual/effective facts, and permits one later accepted successor
  plan;
- each successor has exactly one accepted primary party and one occupancy;
- Plan 04 scheduling/termination does not synthesize party ends or actual
  occupancy; its checked future-range adjustment remains allowed, while elapsed
  or financially referenced economics are not rewritten;
- source/destination races are serialized;
- unavailable Track A actions fail before mutation; and
- exact continuity/history reads are complete.

## TB-07 — Track B operational links and historical-surface adoption

### Objective

Adopt exact lease/party/occupancy context in Track B-owned operational records
and complete focused historical navigation.

### Required scope

- Optional tenancy context for maintenance requests/tasks and inspections
  without requiring every property/unit task to have a Lease.
- Exact party/occupancy/participant context for tenancy-specific Timeline
  events through an allowlisted, organization-validated typed source registry
  and domain-owned writers. Track B cannot impersonate receipt, allocation,
  deposit, Ledger, or journal sources.
- Exact Lease/Unit/Person/history links in affected surfaces.
- Document context links where a document is evidence for party, occupancy,
  move, or continuity. Track B freezes only Track B-owned source-link context.
  Generic Documents consumes its own merged version/publication contract;
  otherwise the link freezes/deferred behavior stops.
- Import template/mapping/preview/UX adoption of TB-02's merged normalized
  explicit party/occupancy/participant payload, exact-one commit semantics, and
  per-fact provenance; TB-07 does not redefine the write contract.
- Focused Reports/search adoption only where current compatibility labels would
  misstate history.
- Cross-module contract tests.

### Exclusions

No maintenance finance handoff, invoice/receipt/Owner Statement publication,
deposit lifecycle, generic document publication/version design, generic CRM,
tenant portal, navigation redesign, or full Unit Timeline.

### Completion gate

- general maintenance remains valid with property/unit only;
- tenancy-specific records retain exact IDs;
- completed/signed evidence is not relinked silently;
- every Timeline source kind is allowlisted, organization-valid, and written
  only by its owning domain;
- imported facts retain source/confidence;
- adopted historical surfaces use exact IDs and normalized history;
- Track A amendments are either merged or explicitly still pending; and
- compatibility retirement remains deferred to the ratified Owner Close gate.

## Verification depth by slice

| Slice | Minimum verification |
| --- | --- |
| TB-01 | RED-first pgTAP, full relevant database reset/tests, grants/RLS/direct bypass, focused Lease Vitest, lint, typecheck, build, generated types, diff check |
| TB-02 | All TB-01 checks plus legacy-bootstrap, exact-one creation composition, participant, boundary-kind, and two-session exclusion/idempotency tests |
| TB-03 | All relevant checks plus existing-transition/restore, pagination/material-token, `approved_not_issued` owner-action availability, owner-adapter absence, stale-preview, deterministic property-period locks, and forced atomic-failure tests |
| TB-04 | Dry-run/apply/retry/interruption/rollback, one sealed source snapshot, cross-run cursor rejection, mutation-between-pages and stale-apply atomic rollback, deterministic manifests, known-answer fixture, no hosted mutation |
| TB-05 | Query plans, high-cardinality per-collection pagination, cross-user cursor replay and between-page authorization revocation, relationship-evidence envelope, responsibility outside occupancy, vacancy bounded by `as_of_date`, authorization matrix, focused authenticated browser flows, exact-link tests |
| TB-06 | Two-unit concurrency, predecessor/successor atomicity, forced Plan 04 cancellation failure/total rollback, dependency-action stops, retry evidence, authenticated workflow |
| TB-07 | Cross-module exact-link/RLS tests, import provenance, focused operational browser flows, compatibility parity |

Every implementation PR states exactly what ran and what did not. No slice
merges itself.
