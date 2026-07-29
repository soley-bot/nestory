# Codex Handoff Prompts

Each section below is a complete copy-paste prompt for one coherent
implementation slice. Do not combine the prompts. Each implementation agent
must re-establish merged-main truth and stop if its named predecessor is not
merged.

## TB-01 prompt — Historical-integrity guards

**Mode:** Standard
**Effort:** High
**Reason:** This slice must close several database write bypasses and preserve
Plan 04 compatibility without expanding into new lifecycle or historical UI.

Implement TB-01 only. Do not combine this prompt with another Track B slice or
with any Track A implementation.

### Context and exact merged-main prerequisite

Repository: `soley-bot/nestory`.

The repository evidence used to write this prompt was merged `main` at:

`2dea9fb71a539e01ee81b4601f8965fb62a681d5`

The implementation prerequisite is the merged planning package under:

`docs/implementation/lease-occupancy-history/`

At startup:

1. Read `PROJECT_RULES.md`, `docs/current-state.md`,
   `docs/engineering-rules.md`, `docs/verification.md`, and this planning
   package.
2. Fetch `origin` with pruning.
3. Record the exact latest merged `origin/main` SHA.
4. Require `origin/main` to contain this planning package. If it is still the
   evidence SHA above or otherwise lacks the package, STOP; do not implement
   from the planning branch.
5. Inspect all changes from `2dea9fb...` to the actual merged baseline for
   lease, people, occupancy, finance, Owner Close, grants, and tests.
6. Use a clean isolated worktree and branch
   `codex/lease-history-tb-01-guards`.
7. Do not absorb an unmerged PR, including Track A work.
8. Report the exact baseline and clean status before editing.

Target result: a review-ready draft PR. Do not merge or deploy.

### Objective

Prevent the current compatibility trigger, legacy RPC, direct Data API/DML,
archive, and restore paths from replacing or reactivating historical
primary-party or occupancy facts. Keep merged Plan 04 term authority and
Lease creation/import working while ending fabricated actual dates and silent
party-boundary confirmation.

### Verified current behavior

Reverify before changing:

- Latest `sync_lease_backbone_records()` is in
  `supabase/migrations/20260728120841_authoritative_lease_terms_and_rent_policy.sql`.
  It updates the first non-archived primary `lease_parties` row's person/dates
  and the first non-archived `lease_occupancies` row's unit/status/dates.
- It infers actual move-in from lease start and some actual move-out values
  from lease end.
- `update_lease_with_authoritative_term(...)` rejects property/unit change but
  accepts a different primary tenant and invokes the compatibility update.
- Legacy `public.update_lease(...)` remains executable by authenticated admins
  and can change tenant, unit, status, and deposit.
- Authenticated admins/service role retain direct `INSERT`/`UPDATE` on
  `lease_parties` and `lease_occupancies`.
- Plan 04 guards authoritative term economics, not party/occupancy identity.
- `archive_lease` does not close open party/occupancy rows, and
  `archive_person` does not guard open Lease roles.
- `restore_lease` clears archive state and marks the Unit occupied without
  rechecking party/occupancy conflicts or dependency impact.
- Existing tests do not prove history survives these paths.

Relevant current files include:

- `supabase/migrations/20260618040247_people_core_relationship_schema.sql`
- `supabase/migrations/20260630011451_people_lease_write_rpcs.sql`
- `supabase/migrations/20260707114500_strict_lease_import_validation.sql`
- `supabase/migrations/20260728120841_authoritative_lease_terms_and_rent_policy.sql`
- `supabase/tests/lease_term_authority_behavior_test.sql`
- `supabase/tests/income_payer_integrity_test.sql`
- `src/features/leases/actions.ts`
- `src/features/leases/components/lease-form.tsx`
- `src/types/database.generated.ts`

### Required changes

1. Start with RED regression evidence for:
   - a valid primary-person replacement rewriting the prior party row;
   - legacy RPC unit/tenant replacement rewriting occupancy/party;
   - direct party/occupancy update by an authenticated admin;
   - active Lease archive leaving open occupancy/party;
   - active primary Person archive;
   - unsafe Lease restore reactivating stale/conflicting history;
   - checked creation and import copying Lease dates into actual move dates or
     confirmed party boundaries;
   - cancelled creation/import producing actual occupancy; and
   - exact old primary-person identity missing from audit evidence where
     applicable.
2. Add one append-only migration with a name specific to Track B guards.
3. Revoke or safely replace legacy `update_lease(...)` execution so it cannot
   bypass the checked boundary. Revoke/wrap legacy `restore_lease(...)` and
   fail closed until TB-03 supplies checked restore.
4. Remove direct authenticated/service-role mutation capability on
   party/occupancy/participant history, while retaining the minimum RLS-safe
   reads and a context-guarded internal path for approved operations.
5. Change compatibility synchronization so an existing history row is never
   selected and repurposed for a different person, unit, or completed fact.
6. Stop creation/import compatibility synchronization from inferring
   `actual_move_in_date` from Lease start, `actual_move_out_date` from Lease
   end/status, or confirmed party boundaries from term dates. Without explicit
   independent evidence, actual dates remain `NULL`; scheduled compatibility
   facts and boundaries remain inferred/unknown.
7. Reject generic Lease changes that require a party/occupancy transition with
   stable reason codes such as `relationship_transition_required` and
   `occupancy_transition_required`.
8. Prevent direct archive of an operationally active Lease and archive of a
   Person with an open Lease role. Return a practical next action.
9. Preserve Plan 04 authoritative term behavior, checked creation/import,
   organization scope, current safe metadata updates, and generated-type
   discipline.
10. Improve permitted activity evidence to include exact old/new person, unit,
    and relevant date IDs. Do not rely on display names.
11. If current application controls offer an operation now rejected, disable
     or relabel only those controls with focused copy. Do not redesign the Lease
     screen.

When a safe transition is not yet implemented, fail clearly. TB-02 owns the
model and safe new-Lease composition; TB-03 owns existing-history operations
after impact review.

### Invariants

- Organization/workspace/property/unit isolation.
- Plan 04 `lease_terms` remains the rent source of truth.
- No historical party identity, occupancy unit, or completed actual date is
  overwritten.
- Compatibility fields cannot initiate normalized-history mutation.
- No direct DML/RPC bypass.
- Existing history is retained; do not delete or fabricate it. Term,
  scheduled occupancy, actual occupancy, and party boundaries remain separate
  facts.
- No silent deposit, receipt, invoice, Ledger, close, or statement change.
- Idempotency and audit use exact payload/IDs.
- Unsupported transition returns a named repair path.

### Acceptance criteria

1. The RED tests fail before and pass after the migration.
2. A primary-tenant edit cannot reuse the prior party row for another person.
3. A unit change cannot reuse the prior occupancy row.
4. Direct authenticated/admin party/occupancy writes fail.
5. Legacy `update_lease` cannot bypass the checked workflow.
6. Active Lease/Person archive fails with exact dependency guidance, and
   legacy restore cannot reactivate stale relationships.
7. Checked Plan 04 creation, term update, import, and focused Lease reads still
   pass.
8. Create/import/cancel regressions prove omitted actual dates stay `NULL` and
   term dates do not confirm party boundaries.
9. Cross-organization and non-admin mutations fail.
10. Activity evidence includes exact prior/current IDs.
11. No finance lifecycle or historical read model is added.

### Verification

At minimum:

- capture the RED pgTAP output before the fix;
- `npm run supabase:start`;
- `npm run db:reset`;
- `npm run db:lint`;
- `supabase test db`;
- add/run any two-session bypass/transition race script required;
- `npm run leases:test-term-authority`;
- `npm run test -- src/features/leases`;
- `npm run test:all`;
- `npm run lint`;
- `npx tsc --noEmit`;
- `npm run db:types` and inspect/include only expected generated-type changes;
- `npm run build`;
- `git diff --check`; and
- manually inspect the final diff for scope and migration ordering.

If an application control changes, run a focused authenticated browser flow
showing the blocked operation and an unaffected Plan 04 edit. State exactly
what was not run.

### Scope exclusions

Do not:

- implement TB-02 relationship/participant model or creation composition
  beyond the minimum guard context;
- backfill/reclassify history;
- build Unit/Person/Lease history views;
- implement renewal, replacement, transfer, invoices, receipts, deposit
  disposition, close, or statement behavior;
- modify Owner Close planning files;
- mutate hosted Supabase;
- deploy; or
- merge.

### Deliverables

- exact merged-main baseline;
- RED and GREEN evidence;
- append-only migration;
- focused pgTAP/application tests;
- minimal action/control changes if required;
- regenerated types if changed;
- updated implementation evidence inside the Track B package only if a
  factual handoff note is necessary;
- clean commit;
- pushed branch with local/remote parity; and
- review-ready draft PR with exact checks and no merge instruction.

Before TB-02 can begin, provide exact evidence that all overwrite/bypass paths
are closed, restore fails safely, and Plan 04 term/create/import behavior still
passes without creating false actual or confirmed relationship facts.

### Stop conditions

Stop and report if:

- the planning package or exact merged baseline cannot be established;
- Track A's unmerged branch would be required;
- closing a bypass would require inventing a renewal, transfer, occupancy, or
  deposit policy;
- the only proposed fix deletes/reconstructs historical rows;
- normal Plan 04 term authority cannot be preserved;
- hosted mutation/deployment is required; or
- the diff expands beyond a coherent guard PR.

Do not stop merely because current UI must return a more specific transition
required message.

## TB-02 prompt — Relationship model, legacy bootstrap, and safe creation

**Mode:** Standard
**Effort:** Extra High
**Reason:** Effective-dated relationships need explicit evidence and business
lifecycle, person-level residence evidence, a safe legacy bootstrap, and one
non-duplicating new-Lease composition before existing history can change.

Implement TB-02 only. Do not combine this prompt with another Track B slice or
with any Track A implementation.

### Context and exact merged-main prerequisite

Repository: `soley-bot/nestory`.

Planning evidence SHA:

`2dea9fb71a539e01ee81b4601f8965fb62a681d5`

Merged predecessor: TB-01 Historical-integrity guards.

At startup, read repo rules and the complete Track B package, fetch/prune
origin, and record the exact `origin/main` SHA containing TB-01. Inspect the
TB-01 merge and all later changes. STOP if TB-01 exists only in an open PR or
if current `main` reopens a write bypass. Use a clean worktree/branch
`codex/lease-history-tb-02-model-bootstrap`. Do not absorb unmerged Track A
work.

Target result: a review-ready draft PR. Do not merge or deploy.

### Objective

Add typed evidence/business lifecycle, provenance, boundary confidence,
person-level physical-occupancy participation, accepted-fact interval
protection, a mechanical `legacy_unresolved` bootstrap, and one checked
brand-new Lease relationship composition. All existing-Lease transitions
remain blocked for TB-03.

### Verified current behavior

Reverify:

- current party roles and nullable start/end dates;
- current occupancy statuses and scheduled/actual dates;
- active-only unique indexes but lack of historical exclusion/correction
  lineage;
- existing trigger-created rows that mix deterministic identity with
  inferred/unknown party and occupancy boundaries;
- TB-01's final grants/guards/context contract;
- Plan 04 term authority and compatibility projections;
- Lease/Unit/People loaders that currently use active/header data; and
- current activity/RLS/idempotency conventions.

Relevant files:

- Track B files 00, 01, 02, 03, and 90;
- latest Track B/Plan 04 migrations;
- `src/features/leases/actions.ts`
- `src/features/leases/data/leases.ts`
- `src/features/leases/data/lease-summary.ts`
- `src/features/leases/components/lease-form.tsx`
- `src/features/people/actions.ts`
- `src/types/database.generated.ts`
- focused Lease/People tests.

### Required changes

1. Write RED tests first for:
   - every pre-existing relationship row becoming `legacy_unresolved` without
     identity/date rewriting;
   - exact-one primary party and exact-one occupancy after checked new-Lease
     creation and import;
   - omitted actual dates remaining `NULL`;
   - term dates not silently confirming party boundaries;
   - accepted overlapping primary/person-role ranges;
   - scheduled and actual occupancy overlap;
   - cancelled-before-effective party/participant facts not counting as
     responsibility/residence;
   - company as occupancy participant rejection;
   - party or `authorized_occupant` role alone not proving residence;
   - cross-organization links;
   - direct DML/RPC bypass;
   - idempotent replay and different-payload rejection; and
   - concurrent attempts to occupy the same unit.
2. Add typed checked columns/constraints for:
   - evidence state:
     `accepted`/`superseded`/`voided`/`legacy_unresolved`;
   - party lifecycle:
     `planned`/`effective`/`ended`/`cancelled_before_effective`;
   - occupancy lifecycle:
     `reserved`/`occupied`/`notice_given`/`vacated`/
     `cancelled_before_effective`;
   - occupancy-participant lifecycle:
     `planned`/`present`/`ended`/`cancelled_before_effective`;
   - record source;
   - per-fact/per-boundary `known`/`open_current`/`unknown` kind and
     confidence;
   - correction/supersession lineage; and
   - actor/time/reason evidence.
3. Add normalized `lease_occupancy_participants` (final naming may follow repo
   conventions) linking exact `lease_occupancy_id` and exact individual
   `lease_party_id`; derive Person identity and role through that party so
   provenance is unambiguous. Retain dated observed-residence evidence,
   lifecycle, provenance, confidence, and correction lineage.
4. Mechanically bootstrap every pre-TB-02 party/occupancy row as
   `legacy_unresolved`. Preserve deterministic identity separately from
   inferred/unknown boundaries. Do not derive a participant from overlapping
   party and occupancy rows; absence of explicit Person-presence evidence
   remains absence/unknown. Do not promote any legacy fact.
5. Add generated effective ranges and exclusions/indexes only for accepted,
   sufficiently known party, occupancy, and participant intervals using the
   inclusive/no-same-day semantics. Unresolved facts are excluded until TB-04
   promotion validates them.
6. Define one transactional composition with Plan 04 checked new-Lease
   creation/import. It either creates and returns the exact normalized
   relationship rows once or adopts/promotes the exact rows created by the
   compatibility trigger; it never inserts a second party/occupancy set.
7. Accept explicit planned party, occupancy, and participant facts on new
   creation/import. Omitted actual dates stay `NULL`; scheduled compatibility
   facts and party boundaries are inferred/unknown unless separately evidenced.
8. Keep contract, party, scheduled occupancy, actual occupancy, authorization,
   and observed Person residence as distinct facts.
9. Maintain compatibility projections only after the normalized write
   succeeds and only within the guarded context.
10. Add exact activity entity/action records for party, occupancy, and
    participant creation/bootstrap.
11. Own the normalized RPC/row payload and exact-one commit semantics for
    checked creation/import, with a minimal test adapter only. Do not change
    import templates, saved mappings, preview UX, or broad operational import
    surfaces; TB-07 adopts this contract there.
12. Every add/end/change/correct/record/cancel operation against an existing
    Lease returns `impact_contract_required` or the specific transition error.
    Do not build or guess a dependency-free predicate in this slice.
13. Update generated types and relevant current-state implementation docs only
     if repo rules require it. Historical docs stay historical.

### Invariants

- Evidence state and business lifecycle are independent.
- One accepted primary-tenant interval per Lease/date.
- Same person/role intervals do not overlap.
- A named physical occupant is an individual with accepted participant
  evidence; party/authorization alone is not residence.
- Scheduled and actual occupancy remain separate.
- Accepted unit occupancy intervals do not overlap.
- `open_current` is not `unknown`; constraints and reads preserve the
  distinction.
- Cancelled-before-effective relationships remain auditable and are excluded
  from effective responsibility/residence.
- End relationships; do not archive/delete them.
- Wrong-person historical correction is not represented as a true end.
- Plan 04 owns economics.
- Compatibility columns are projections.
- Cross-organization and direct bypass fail.
- No financial/published history mutation.

### Acceptance criteria

1. Every pre-existing relationship fact remains queryable and starts
   `legacy_unresolved`; no migration fact is promoted here.
2. Checked creation/import returns exactly one accepted primary party and one
   accepted occupancy and does not duplicate trigger-created rows.
3. Omitted actual dates stay `NULL`; term dates do not confirm party
   boundaries.
4. Participant evidence, party role, and Lease-level occupancy remain separate.
5. Accepted overlap constraints hold under concurrent sessions without
   treating unresolved legacy facts as confirmed.
6. Same-day successor is rejected with the planned reason.
7. Cancelled reservation and related parties/participants have no confirmed
   actual occupancy or effective responsibility.
8. Current projection follows accepted history without initiating it.
9. Every existing-Lease transition returns `impact_contract_required`.
10. Anonymous/member/manager/admin/cross-org matrix is explicit.
11. Retries are payload-bound and TB-01 guards remain closed.

### Verification

- RED then GREEN pgTAP;
- database reset, lint, full pgTAP;
- a two-session accepted occupancy/party/participant race script;
- focused Lease/People/Unit Vitest;
- `npm run test:all`;
- lint, typecheck, generated types, build;
- focused authenticated new-Lease flow plus direct checked-import contract
  evidence with explicit planned facts and omitted actual dates;
- `git diff --check`; and
- final grant/RLS/function ACL inspection.

Run the repository's full relevant checks from `docs/verification.md`. State
what was not run.

### Scope exclusions

No:

- dependency-impact implementation;
- existing-Lease add/end/change/correct/record/cancel or restore operations;
- historical correction with dependencies;
- person merge;
- successor Lease, renewal, transfer, or holdover;
- legacy fact promotion/backfill/pilot beyond mechanical
  `legacy_unresolved` bootstrap;
- historical read-model cutover;
- finance/deposit/close/statement mutation;
- hosted change, deploy, or merge.

### Deliverables

- exact predecessor merge SHA;
- RED/GREEN, bootstrap, and concurrency evidence;
- append-only relationship/participant migration and checked creation
  composition;
- focused new-Lease action/tests and normalized import RPC/row payload tests,
  with import UX adoption deferred to TB-07;
- generated types;
- clean commit, pushed parity, review-ready draft PR; and
- exact gate evidence for TB-03.

TB-03 cannot begin until evidence/business lifecycle, participant provenance,
legacy bootstrap, accepted-fact overlap, exact-one creation composition,
authorization, and bypass behavior are merged and proven.

### Stop conditions

Stop if:

- TB-01 is not merged;
- inclusive/no-same-day semantics conflict with a newer ratified IPS decision;
- a new-Lease creation path cannot avoid duplicate relationship rows;
- accepted overlap cannot be enforced without rewriting existing rows or
  falsely promoting unresolved legacy facts;
- exact Person/Lease/Unit scope cannot be validated; or
- the slice would need existing-history transitions, fact promotion,
  continuity, or broad UI work.

## TB-03 prompt — Dependency impact and existing-history transitions

**Mode:** Standard
**Effort:** Extra High
**Reason:** Existing relationships may change only after a complete,
paginated, stale-safe impact preview, owner-state adapters, and composable
financial-period locks prove the selected action is available.

Implement TB-03 only. Do not combine this prompt with another Track B slice or
with any Track A implementation.

### Context and exact merged-main prerequisite

Repository: `soley-bot/nestory`.

Planning evidence SHA:

`2dea9fb71a539e01ee81b4601f8965fb62a681d5`

Merged predecessor: TB-02 Relationship model, legacy bootstrap, and safe
creation.

Fetch/prune origin; record the exact merged `origin/main` SHA containing TB-02;
read repo rules, the Track B package, `docs/financial-authority-kernel.md`,
`docs/property-cash-events-v1.md`, and the ratified Owner Close sequence.
STOP if TB-02 is unmerged, if Track B source semantics changed, or if the
implementation would depend on an unmerged Track A branch. Use a clean
worktree/branch `codex/lease-history-tb-03-impact`.

Target result: a review-ready draft PR. Do not merge or deploy.

### Objective

Implement the versioned read-only impact contract and stale-safe Track B
executor for existing-Lease party, occupancy, participant, cancellation, and
restore transitions. Track B may discover exact owner-linked source IDs, but
it may classify owner lifecycle state or invoke an action only through a
merged, domain-owned adapter. The relationship-evidence resolver is deferred
to TB-05, after legacy fact promotion.

### Verified current behavior

Reverify:

- TB-02 evidence/business lifecycle, participant, bootstrap, and checked
  brand-new creation composition;
- current links on obligations, receipts/allocations, deposits, documents,
  tasks, Timeline, Ledger, periods, and statement evidence;
- current Owner Close authority, property-period locks, and idempotency;
- `property_cash_events_v1` current tenant-attribution limitation;
- current record-state vocabulary; and
- current loaders' pagination/caps.
- TB-02's exact evidence/business lifecycle, participant, bootstrap, and
  exact-one creation contract; and
- file 92's distinction between ratified Owner Close numbering and unmerged
  Track A local labels.

Relevant files:

- Track B file 03 and file 92;
- merged TB-02 migration/actions/tests;
- finance schema migrations and generated types;
- `docs/financial-authority-kernel.md`;
- `docs/property-cash-events-v1.md`;
- `src/features/leases/actions.ts`;
- focused Lease UI/data files;
- new pgTAP and material-token/concurrency script.

### Required changes

1. Start with RED tests for:
   - preview performs no writes;
   - full dependency totals/hash exceed first page;
   - stale target/dependency rejection;
   - cross-organization/role denial;
   - direct executor bypass;
   - idempotent replay/different payload;
   - issued/settled/closed/published preservation;
   - forced downstream failure rolling back Track B writes;
   - missing owner-state adapter returning `owner_state_unresolved` and no
     available action;
   - checked restore detecting interval/dependency conflicts and never silently
     reactivating old relationships; and
   - cross-property transition acquiring every property-period lock in stable
     order.
2. Implement the finite preview vocabulary and TB-03 execution subset from
   file 03. Continuity kinds preview as `deferred_to_tb06`;
   `resolve_duplicate_person` previews as
   `identity_resolution_unavailable` until separately approved. Do not
   implement those executors here.
3. Implement an authorized, versioned, keyset-paginated impact RPC/service
   returning normalized proposed change, target revision, material token,
   counts/states/classes, exact first-page links, periods, permitted actions,
   unavailable actions, and cursors.
4. Ensure the material token covers the full set, not only returned rows.
   When merged Track A occurrences exist, return typed affected occurrence and
   downstream draft identities/states for every term/party/occupancy
   supersession.
5. Implement checked existing-Lease operations for:
   - add/end co-tenant, authorized occupant, and occupancy participant;
   - end/add billing contact;
   - schedule move-in/out, record actual move-in/out, and give notice;
   - cancel planned party/participant/reservation facts before effect;
   - correct a not-yet-effective relationship;
   - void/replace a false historical party;
   - supersede completed occupancy/participant evidence;
   - archive a Lease only after impact proves no open/blocked relationship; and
   - restore a Lease only after full scope, interval, term, dependency, and
     stale-token revalidation, without reactivating prior rows implicitly.
6. Reauthorize, acquire Track B row/unit locks, reload, and compare tokens
   inside execution.
7. Require a merged owner adapter to classify `draft`, `issued`, `settled`,
   `closed`, or `published`. If absent, return `owner_state_unresolved` and
   action unavailable; do not infer state from table names or columns.
8. Before any execution affecting a financial period, acquire the merged
   Track A assert-open/property-period lock inside the same transaction.
   Cross-property changes lock every source/destination property-period in the
   owner's deterministic order. Do not update finance tables from Track B.
9. Return explicit unavailable prerequisites for draft regeneration, approval
   reset, reversal, reopen/restatement, deposit action, or artifact
   replacement when not implemented.
10. Keep preview completely write-free, including activity logs. On successful
    execution only, add exact activity evidence for selected action, source
    identities, actor, and result.
11. Add a focused confirmation UI only sufficient to render the example
    contract and choose an available action. No generic workflow builder.

### Invariants

- Preview is read-only.
- Existing-Lease relationship transitions use this complete impact contract;
  TB-02 never guesses dependency freedom.
- Track B reports exact linked source identities but never invents an owner's
  lifecycle state.
- Server owns counts, states, hashes, and permissions.
- Exact IDs, no fuzzy/name matching.
- Full material set is hash-bound.
- Execution rejects stale preview.
- Financial/publication actions remain Track A-owned.
- Draft changes do not mutate issued/settled/closed/published evidence.
- Corrections preserve voided/superseded rows.
- Supersession reports affected occurrence/draft identities and never rewrites
  obligations, invoices, receipts, projections, close evidence, or statements.
- Every financial-period execution uses the merged Track A lock/assert-open
  contract inside the same transaction; all source/destination locks follow
  the owner-defined deterministic order.
- Restore never silently reactivates prior party, occupancy, participant, or
  term versions.
- Payload-bound idempotency and atomic failure.

### Acceptance criteria

1. Preview reports display/calculation/workflow/financial dependencies without
   writing activity.
2. Each owner state comes from a merged adapter; a missing adapter returns
   `owner_state_unresolved` and no action.
3. Pagination is stable and complete above one page.
4. Concurrent dependency change invalidates the token.
5. Routine existing-Lease transitions and zero-dependency corrections succeed
   append-preservingly through explicit actions.
6. Checked restore revalidates conflicts and does not reactivate old rows.
7. Available draft-only action regenerates only through its owner.
8. Issued/settled/closed/published cases do not mutate originals.
9. Financial-period changes hold every required owner lock in the same
   transaction, including deterministic cross-property ordering.
10. Direct RPC/DML and cross-org bypass fail.
11. Forced downstream failure changes nothing.
12. Execution, not preview, writes exact activity.
13. The UI never reduces the response to a generic "cannot edit".

### Verification

- RED/GREEN pgTAP;
- database reset, lint, full pgTAP;
- material-token/pagination tests above page limits;
- two-session stale-preview, restore/conflict, and close-versus-correction
  scripts;
- missing-owner-adapter and deterministic cross-property property-period lock
  tests;
- forced atomic-failure test;
- focused Vitest for contract normalization/rendering/actions;
- full `test:all`, lint, typecheck, generated types, build;
- authenticated browser flow for one clear, one draft-only, and one blocked
  impact;
- function ACL/RLS/direct-bypass inspection;
- `git diff --check` and final scope review.

State any Track A action that remained unavailable and therefore unexecuted.

### Scope exclusions

No:

- generic dependency/workflow platform;
- automatic finance/table mutation;
- invoice/receipt/deposit/close/statement implementation;
- legacy migration;
- historical read-model rollout;
- renewal/replacement/transfer;
- broad UI redesign;
- hosted mutation/deploy/merge.

### Deliverables

- exact TB-02 merge baseline;
- contract version/schema and reason/action vocabulary;
- append-only impact/transition migration, RPCs, actions, and tests;
- typed occurrence/draft impact evidence or explicit unavailable adapter;
- owner-state adapter inventory, checked restore evidence, and
  same-transaction lock evidence;
- pagination/material-token/concurrency evidence;
- focused confirmation UI;
- list of available and unavailable Track A adapters;
- clean commit, pushed parity, review-ready draft PR; and
- exact evidence gate for TB-04.

### Stop conditions

Stop if:

- TB-02 is not merged;
- complete dependency identity cannot be determined without fuzzy matching;
- the only approach trusts a client list/count;
- an owner lifecycle state would have to be guessed without a merged adapter;
- a required financial action would need Track B to own it;
- property-period serialization conflicts with the merged kernel;
- one unbounded response would be required; or
- hosted/deployment access is required.

## TB-04 prompt — Legacy classification and bounded pilot

**Mode:** Standard
**Effort:** Extra High
**Reason:** Existing compatibility rows can be classified safely only with
deterministic manifests, explicit uncertainty, idempotent repair, and rollback
evidence.

Implement TB-04 only. Do not combine this prompt with another Track B slice or
with any Track A implementation.

### Context and exact merged-main prerequisite

Repository: `soley-bot/nestory`.

Planning evidence SHA:

`2dea9fb71a539e01ee81b4601f8965fb62a681d5`

Merged predecessor: TB-03 Dependency impact and existing-history transitions.

Fetch/prune origin and record the exact merged `origin/main` SHA containing
TB-03. Read repo rules, the complete Track B package, current seed/fixture
contracts, import migrations, and verification runbooks. Inspect all
intervening changes. STOP if TB-03 is unmerged or if a clean local Supabase
pilot cannot be isolated. Use branch
`codex/lease-history-tb-04-migration-pilot` in a clean worktree.

Target result: a review-ready draft PR containing local migration/pilot
evidence only. Do not apply to hosted environments. Do not merge or deploy.

### Objective

Classify each asserted identity, boundary, and participation fact from existing
compatibility rows as deterministic, inferred, operator-review, or unresolved;
add a resumable dry-run/apply contract; and prove one bounded local pilot
without fabricating history. Record potential predecessor/successor evidence
only as unresolved review issues; accepted continuity links do not exist until
TB-06. A row-level rollup may route review but never replaces fact-level
confidence.

### Verified current behavior

Reverify:

- compatibility primary party/occupancy values and TB-02 provenance fields;
- trigger-created actual move-in equals Lease start and some move-out equals
  Lease end;
- import supports one tenant/header dates and Plan 04 explicit term fields;
- activity logs cannot reliably reconstruct an old primary Person;
- current deterministic demo fixture/manifest contract;
- archived/open/missing/duplicate/unitless/overlap cases in local data; and
- TB-03 impact behavior for a proposed repair.

Relevant files:

- Track B files 00, 04, 05, 90, and 92;
- merged TB-01 through TB-03 migrations/tests;
- `supabase/seed.sql` as read-only source unless a narrowly justified fixture
  change is approved;
- `supabase/migrations/20260706104000_import_runs.sql`;
- `supabase/migrations/20260706110500_import_types_and_saved_mappings.sql`;
- latest lease import migration/actions;
- `scripts/demo-seed-manifest.mjs` patterns;
- new Track B migration manifest/apply scripts and tests;
- generated types.

### Required changes

1. Start with RED tests proving current data cannot distinguish confirmed
   physical dates from Lease-date inference and that ambiguous identity cannot
   be auto-applied.
2. Add a typed migration-run/fact-item/resolution contract with:
   - baseline/schema version;
   - organization/filter;
   - deterministic source/material hash;
   - issue/resolution kind;
   - exact source/target IDs;
   - asserted fact kind, boundary kind, and before/after
     provenance/confidence;
   - actor/reason/time;
   - apply idempotency/result IDs; and
   - retry/failure state.
3. Implement a read-only, complete, paginated dry run that classifies every
   asserted identity/boundary and only independently evidenced explicit
   participant source assertion as deterministic, safe inferred, operator
   review, or `legacy_unresolved`. Overlapping party/occupancy rows never create
   a participant fact. Potential continuity
   evidence remains an unresolved review issue for TB-06; do not create or
   accept a link. A row rollup uses the least-trusted material fact only for
   queueing.
4. Treat trigger/header actual dates as inferred unless independent exact
   evidence is cited.
5. Never infer people, co-tenants, occupants, renewal links, actual dates, or
   tenancy-specific operational links from names/proximity.
6. Implement stale-hash rejecting, fact-item-idempotent apply that durably
   records deterministic, safe-inferred, reviewed, and unresolved
   classification/provenance. Promote only deterministic or operator-resolved
   normalized facts to `accepted`, validating accepted-version/overlap
   constraints at that moment. Safe-inferred facts stay
   `legacy_unresolved`/provisional with inferred confidence and are excluded
   from confirmed actual occupancy, responsibility, participant presence, and
   vacancy.
7. Preserve every source row; use TB-03 correction operations for accepted
   replacements.
8. Select one explicitly named local organization/property from the current
   deterministic fixture and document why it is bounded. Include active,
   ended, cancelled, inferred, and unresolved cases through isolated test
   additions where needed.
9. Prove retry/interruption and local rollback/recovery.
10. Emit before/after manifests and known-answer Unit/Person/Lease queries for
    later TB-05, without yet changing product read paths.

### Invariants

- No fuzzy matching.
- No inferred fact becomes confirmed without reviewed evidence.
- No source/history row is deleted or overwritten.
- Dry run writes nothing.
- Apply is exact, stale-safe, resumable, and payload-bound.
- Unresolved remains visible.
- Organization and property scope is exact.
- Plan 04 terms and Track A financial attribution are not changed.
- Current compatibility remains available.
- Local-only pilot; no hosted mutation.

### Acceptance criteria

1. Every inventoried asserted fact/boundary has one explicit class; a single
   source row may contain multiple classes. Continuity candidates remain
   unresolved review issues for TB-06.
2. Dry-run reruns produce identical ordered IDs/counts/hash.
3. More-than-one-page manifests are complete and stable.
4. Ambiguous Person/date/unit cases cannot auto-apply.
5. Trigger-derived actual dates remain inferred.
6. Safe-inferred classifications persist durably for labelled provisional
   reads but do not become accepted/confirmed normalized facts.
7. Reviewed apply can be retried without duplicates.
8. Changed source data rejects a stale apply.
9. Interruption resumes safely.
10. Local rollback/recovery preserves pre-pilot data.
11. Known-answer results distinguish confirmed/inferred/unknown.

### Verification

- RED/GREEN pgTAP;
- unit tests for manifest normalization/hash/pagination/apply planning;
- `npm run supabase:start`;
- `npm run db:reset`;
- `npm run db:reset:demo -- --reference-date <explicit-date>`;
- `npm run demo:seed:manifest` before and after;
- dry-run twice and compare exact output/hash;
- apply/retry/interruption/rollback rehearsal on local data;
- `npm run db:lint`;
- `supabase test db`;
- full relevant application tests, `test:all`, lint, typecheck, generated
  types, build;
- `git diff --check`; and
- manual inspection proving no hosted credentials/mutations or fabricated
  fixtures.

State the exact named pilot property and every unresolved item retained.

### Scope exclusions

Do not:

- mutate hosted Supabase or production data;
- broad-backfill every organization;
- change official Unit/Person/Lease readers;
- drop compatibility fields;
- fuzzy-match or auto-confirm dates;
- modify Track A finance attribution;
- implement continuity or broad UI;
- deploy or merge.

### Deliverables

- exact TB-03 merge baseline;
- append-only migration and dry-run/apply contract;
- scripts/tests/manifests;
- named local pilot evidence and rollback record;
- fact-level unresolved/review inventory plus non-authoritative row rollups;
- generated types;
- clean commit, pushed parity, review-ready draft PR; and
- exact known-answer gate for TB-05.

### Stop conditions

Stop if:

- TB-03 is not merged;
- the local pilot cannot be isolated;
- the only way to fill a field is to invent identity/date/occupancy;
- source hashes cannot cover the full set;
- an apply would rewrite Track A financial attribution;
- rollback/retry cannot be proven; or
- hosted access is required.

Do not stop because some records remain unresolved; retaining uncertainty is
the required outcome.

## TB-05 prompt — Historical reads and relationship evidence

**Mode:** Standard
**Effort:** High
**Reason:** Trustworthy history and Track A consumption need the same
accepted-version, evidence-aware, exact-ID, authorized, scalable relationship
projection without moving rent calculation into Track B.

Implement TB-05 only. Do not combine this prompt with another Track B slice or
with any Track A implementation.

### Context and exact merged-main prerequisite

Repository: `soley-bot/nestory`.

Planning evidence SHA:

`2dea9fb71a539e01ee81b4601f8965fb62a681d5`

Merged predecessor: TB-04 Legacy classification and bounded pilot.

Fetch/prune origin; record the exact merged SHA containing TB-04; read repo
rules, Track B files 00, 01, 04, 05, and 90, plus TB-04's final manifest and
known-answer evidence. STOP if TB-04 is unmerged or if accepted/inferred/
unknown semantics are not queryable. Use clean branch
`codex/lease-history-tb-05-read-models`.

Target result: a review-ready draft PR. Do not merge or deploy.

### Objective

Implement checked, paginated Unit, Person, and Lease history projections,
Track B's period-effective relationship-evidence envelope, and focused
existing-surface adoption. Do not create a writable history table or choose
rent policy, calculation dates, due dates, proration, or artifact lifecycle.

### Verified current behavior

Reverify:

- Unit detail chooses one status-derived active Lease and can include ended
  parties as current People;
- Lease detail loads all rows but exposes only unended parties;
- Person detail filters toward active Lease relationships;
- Reports/search/Timeline/Documents use compatibility names/headers in
  material paths;
- current pagination limits and report 5,000-row guard;
- TB-04 accepted/provenance/confidence fields and known answers; and
- current authorization for archived/financial records.

Relevant files:

- Track B file 04;
- merged Track B migrations/types;
- `src/features/units/data/units.ts`
- `src/features/units/data/unit-summary.ts`
- `src/features/people/data/people.ts`
- `src/features/leases/data/leases.ts`
- `src/features/leases/data/lease-summary.ts`
- corresponding Unit/People/Lease components/tests;
- Reports/Timeline/Documents/import link helpers as read-only inspection
  evidence for the owner/surface handoff; do not edit them in TB-05; and
- new read-model migration/pgTAP/query-plan evidence.

### Required changes

1. Write RED known-answer tests first for:
   - former renters of one Unit/date range;
   - tenant responsibility versus accepted person-level physical-occupancy
     participant versus merely authorized/associated Person;
   - an accepted but `planned`, `cancelled_before_effective`, or
     unknown-boundary participant never appearing as confirmed physical
     residence;
   - ended party visibility;
   - corrected/voided version resolution;
   - confirmed versus scheduled/unknown vacancy;
   - current profile display versus historical role;
   - cross-organization/role access;
   - `known`/`open_current`/`unknown` boundaries producing definite overlap,
     possible overlap, and non-overlap;
   - stable more-than-one-page cursors for Unit, Person, and each Lease child
     collection;
   - period-effective obligor candidates separated from billing-recipient
     candidates, with `billing_contact` never treated as debtor by role alone;
   - stable evidence material hash and reason codes; and
   - no `tenant_name` fallback.
2. Implement checked read contracts equivalent to:
   - `get_unit_occupancy_history_page`;
   - `get_person_lease_history_page`;
   - `get_lease_history`; and
   - `resolve_lease_relationship_evidence`.
3. Require explicit organization scope and query dates, including
   `as_of_date` for Person history. Every independently paginated collection
   has a max page size, stable sort/tie-breaker, opaque cursor containing
   filter/query hash and material token, and explicit truncation/next cursor.
4. Resolve every start/end as `known`, `open_current`, or `unknown`. Return
   definite overlap, possible overlap, and non-overlap separately; unknown
   facts never become confirmed history or vacancy.
5. Use accepted version, per-fact confidence, exact IDs, and Plan 04 term joins
   from file 04.
6. Derive confirmed vacancy only from confirmed actual boundaries; return
   scheduled forecast and unknown separately.
7. Report a named Person as physically resident only from the accepted
   occupancy-participant version whose `present`/`ended` lifecycle and
   confirmed known boundaries establish presence during accepted actual
   occupancy. An accepted but planned/cancelled/unknown-boundary participant,
   or a tenant/`authorized_occupant` role without participant evidence, is
   scheduled/unknown or contractual/authorized association, never confirmed
   physical residence.
8. Implement the relationship-evidence envelope with accepted party,
   occupancy, participant, Person/contact IDs and versions; actual, scheduled,
   and notice fact candidates; boundary kind/confidence/reasons; obligor and
   recipient candidates; and one material hash. Track A combines this with
   authoritative term/policy and owns approved calculation dates/reasons, due
   date, proration/notice selection, blockers, and the stored occurrence
   calculation snapshot.
9. Add necessary indexes and capture production-shaped `EXPLAIN` evidence.
10. Return current Person profile links/display separately from role/date and
    owner-provided artifact snapshot references.
11. Adopt the contract in focused Unit, Person, and Lease history sections.
   Preserve current operational overview behavior where not contradicted.
12. Implement only exact links originating in the focused TB-05
    Unit/Person/Lease history surfaces and the read targets those surfaces own.
    Preserve file 04's owner/surface matrix as the handoff: Timeline,
    Documents, import-conflict, Reports/search source adoption belongs to
    TB-07 plus the named domain owner, and Ledger belongs to Amendment 14.
13. Gate financial context by current permissions and return exact navigation,
    not duplicated calculations.

### Invariants

- Normalized tables remain the source of truth.
- No writable/mutable history projection.
- Responsible party, authorized/associated Person, accepted physical
  participant, billing contact, and current master data are separate.
- No confirmation from compatibility names/header dates.
- Unknown remains unknown; `open_current` is explicit and distinct.
- Track B owns relationship evidence only. Plan 04/Track A owns terms,
  calculation policy, occurrence snapshot, and downstream finance.
- Exact IDs and organization authorization.
- Stable bounded pagination.
- No finance recalculation or artifact rebuild.

### Acceptance criteria

1. "Who rented Unit X between dates?" returns known responsible people from
   accepted dated party/occupancy joins.
2. Confirmed physical occupants require an accepted participant version whose
   lifecycle and boundaries prove presence; planned/cancelled/unknown-boundary
   or authorized/associated people are labelled separately.
3. Former parties appear.
4. Voided evidence is excluded by default but auditable.
5. Vacancy confidence is correct.
6. Person history accepts `as_of_date` and shows every role/Lease with boundary
   kind, confidence, and stable child pagination.
7. Lease history shows all parties/occupancy/participants/terms/corrections
   with independently stable child pages.
8. Pages are stable above current page sizes and cursors reject changed
   filters/material.
9. The evidence resolver separates obligor candidates from the recipient and
   returns no Track B-calculated rent dates or snapshot.
10. Exact links originating in TB-05 history replace their fuzzy equivalents;
    Timeline/Documents/import/Reports/Ledger source adoption remains explicitly
    deferred to TB-07 or its named owner.
11. Unauthorized/cross-org/financial access fails.

### Verification

- RED/GREEN pgTAP and known-answer Vitest;
- database reset/lint/full pgTAP;
- high-cardinality cursor/filter/material-token tests for every independently
  paginated collection;
- relationship-evidence known-answer/hash/reason tests proving Track B does
  not select calculation policy;
- production-shaped `EXPLAIN (ANALYZE, BUFFERS)` or safe equivalent on local
  fixtures with recorded plan/index use;
- focused Unit/Person/Lease tests;
- `npm run test:all`, lint, typecheck, generated types, build;
- authenticated browser verification at desktop and mobile for the three
  focused history sections, exact links, empty/unresolved states;
- accessibility check on new focused UI;
- `git diff --check` and final no-finance-authority review.

### Scope exclusions

No:

- full navigation/UI redesign;
- all-report cutover;
- workspace search as the history engine;
- broad Unit Timeline;
- finance attribution change;
- continuity write workflow;
- compatibility removal;
- hosted mutation/deploy/merge.

### Deliverables

- exact TB-04 merge baseline;
- checked read contracts/indexes/tests;
- checked relationship-evidence contract/tests;
- known-answer and query-plan evidence;
- focused Unit/Person/Lease adoption;
- focused history-origin exact-link updates plus the deferred owner/surface
  handoff matrix;
- generated types;
- clean commit, pushed parity, review-ready draft PR; and
- exact gate evidence for TB-06.

### Stop conditions

Stop if:

- TB-04 is unmerged;
- a correct answer would require a compatibility name or fabricated date;
- unresolved data cannot be labelled safely;
- pagination would require loading the organization in memory;
- authorization cannot protect financial context; or
- the resolver would require Track B to choose due date, proration, charge
  window, or an approved occurrence calculation snapshot; or
- the slice expands into finance/report redesign.

## TB-06 prompt — Lease continuity workflows

**Mode:** Standard
**Effort:** Extra High
**Reason:** Extension, replacement, and transfer require atomic continuity,
interval locks, term authority, and explicit downstream-action stops.

Implement TB-06 only. Do not combine this prompt with another Track B slice or
with any Track A implementation.

### Context and exact merged-main prerequisite

Repository: `soley-bot/nestory`.

Planning evidence SHA:

`2dea9fb71a539e01ee81b4601f8965fb62a681d5`

Merged predecessor: TB-05 Historical reads and relationship evidence.

Fetch/prune origin; record the exact merged SHA containing TB-05; read the full
Track B package, Plan 04, the ratified Owner Close sequence, file 92
amendments, and currently merged Track A dependency adapters. STOP if TB-05 is
unmerged or if the requested case requires an unmerged Track A action. Use
clean branch `codex/lease-history-tb-06-continuity`.

Target result: a review-ready draft PR for supported continuity cases.
Do not merge or deploy under any condition.

### Objective

Implement explicit extension, new-agreement renewal, tenant replacement, unit
transfer, and early-termination orchestration without moving predecessor
dependencies or inventing unsupported IPS policy.

### Verified current behavior

Reverify:

- Plan 04 future terms stay under one Lease but do not define legal renewal;
- checked Lease update rejects property/unit transfer;
- TB-01 removed legacy/direct bypass;
- TB-02 relationship/participant model, exact-one creation composition, and
  accepted overlap semantics;
- TB-03 impact/action availability;
- TB-05 history/evidence read capability, with continuity explicitly deferred;
- current deposit, occurrence, obligation, period, statement, and artifact
  action availability; and
- file 92 amendment status on merged main.

Relevant files:

- Track B files 02, 03, 04, 90, 92;
- merged Track B migrations/actions/read models;
- Plan 04 RPC/action/test files;
- Lease form/actions/components;
- Unit interval locking utilities;
- new continuity migration/RPC/pgTAP/concurrency script.

### Required changes

1. Start with RED tests for:
   - successor link self/cycle/cross-org/duplicate/branch/merge rejection;
   - append-preserving void/supersede correction of a wrong continuity link;
   - primary-tenant business change preserving predecessor;
   - scheduled unit transfer preserving source actual occupancy until an
     explicit actual move-out;
   - actual destination move-in requiring explicit actual source move-out;
   - same-unit extension preserving same Lease only with explicit amendment;
   - new executed agreement creating successor;
   - predecessor dependencies not copied;
   - unavailable deposit/finance/close/artifact action failing before mutation;
   - idempotent replay/different payload;
   - concurrent destination occupancy race;
   - checked creation returning exactly one accepted primary party and one
     occupancy, with no trigger duplicate; and
   - cancelling a planned successor atomically cancelling its link,
     reservation, parties, occupancy, and participants, with no actual/effective
     facts, then permitting one later accepted plan; and
   - Plan 04 extension/termination never synthesizing party ends or actual
     occupancy.
2. Add append-preserving continuity identity with predecessor, successor,
   kind, effective date, reason, actor/time, supporting document, request ID,
   evidence state, and correction lineage. Enforce at most one accepted
   incoming and one accepted outgoing link per Lease; no branch, merge, or
   cycle.
3. Adopt file 04's reserved continuity collection/detail read contracts only
   from these normalized accepted links. Do not infer adjacent leases into a
   chain.
4. Implement explicit operator choice:
   - same-agreement extension;
   - new-agreement renewal;
   - tenant replacement;
   - unit transfer;
   - early termination; or
   - cancel a not-yet-effective successor plan.
5. Same-agreement extension and predecessor agreement closure must use Plan 04
   unchanged and never infer party ends or actual occupancy. Plan 04's checked
   future-range adjustment remains allowed; do not rewrite elapsed or
   financially referenced economics.
6. New agreement/tenant replacement/unit transfer creates a successor Lease
   through TB-02's single composition: Plan 04 creation plus the exact
   returned/adopted normalized relationship rows once, then the continuity
   link. Never insert a second trigger-created set.
7. Validate planned source/destination intervals for a scheduled transfer
   without fabricating source actual move-out. Require explicit source actual
   move-out before recording destination actual move-in.
8. Implement payload-bound `cancel_successor_plan` as one dependency-aware,
   append-preserving transaction: cancel/supersede the planned continuity link,
   successor reservation, planned party/participant facts, and occupancy;
   create no actual/effective fact; release accepted-link cardinality; preserve
   all evidence; and recheck impact under concurrency.
9. Lock predecessor and affected source/destination Unit intervals in a stable
   order. When a financial period is affected, use TB-03's merged Track A
   property-period lock contract in the same transaction.
10. Repreview/recheck TB-03 impact inside the transaction.
11. Invoke only merged Track A actions explicitly chosen by the operator.
   Otherwise return the unavailable prerequisite before writing.
   A held-deposit case remains blocked until Track A provides a checked
   custody-event-safe action; current Lease-form protection is a known gap.
12. Leave predecessor charges, obligations, invoices, receipts, deposits,
   documents, close, and statements attached to predecessor.
13. Add exact predecessor/successor navigation and focused confirmation UI.

### Invariants

- Same Lease only for same agreement, Unit, and responsible tenant set.
- New executed agreement creates new Lease.
- Post-commencement primary change creates new Lease.
- Unit transfer creates new Lease/occupancy.
- No overlap or same-day turnover.
- No multi-unit Lease, month-to-month, or holdover.
- Plan 04 owns terms.
- Track A owns finance/deposit/close/artifacts.
- Atomic, payload-bound, exact IDs, no branch/merge/cycle.
- Planned-successor cancellation is atomic and append-preserving, releases
  accepted-link cardinality, and never fabricates actual/effective facts.
- Elapsed relationship/economic history and all predecessor dependencies are
  preserved. Only Plan 04's checked unelapsed future-range adjustment is
  permitted.

### Acceptance criteria

1. Every supported path makes the explicit planned continuity decision.
2. Extension uses Plan 04 without synthesizing party ends or actual occupancy;
   only its allowed future-range adjustment may change an existing term.
3. Replacement/renewal/transfer creates exactly one successor, one accepted
   primary party, and one occupancy on retry.
4. Predecessor history and dependencies remain unchanged.
5. Source/destination occupancy never overlaps under concurrency.
6. Continuity chains reject branch, merge, cycle, and cross-org links; a wrong
   link is corrected through void/supersede lineage.
7. Required unavailable Track A action fails before mutation.
8. Planned-successor cancellation is dependency-aware/idempotent, preserves
   evidence, and allows one later accepted plan.
9. Early termination keeps contract and physical dates separate.
10. Exact history/navigation presents both leases.
11. Unsupported policies return named stops.

### Verification

- RED/GREEN pgTAP;
- database reset/lint/full pgTAP;
- two-session source/destination/duplicate-successor/branch/merge/
  cancel-versus-activate tests;
- forced downstream failure/atomic rollback;
- focused Plan 04 and Track B tests;
- full `test:all`, lint, typecheck, generated types, build;
- authenticated browser flows for extension, replacement, and transfer with
  one unavailable-action case;
- exact predecessor/dependency diff evidence;
- `git diff --check` and final ownership review.

### Scope exclusions

No:

- month-to-month, holdover, same-day turnover, multi-unit Lease;
- invented proration/notice/deposit policy;
- invoice/receipt/deposit/close/statement implementation;
- automatic dependency carry;
- broad historical redesign;
- hosted mutation/deploy/merge.

### Deliverables

- exact TB-05 merge baseline and merged Track A adapter inventory;
- continuity migration/RPC/actions/UI/tests;
- concurrency/idempotency/atomic evidence;
- exact list of supported and unavailable cases;
- generated types;
- clean commit, pushed parity, review-ready draft PR; and
- gate evidence for TB-07.

### Stop conditions

Stop if:

- TB-05 is unmerged;
- agreement identity is ambiguous;
- same-day/month-to-month/holdover/multi-unit behavior is required;
- a financial/deposit/closed/published action is unavailable;
- a held-deposit case lacks the merged checked Track A custody action;
- the only approach moves predecessor dependencies; or
- cross-track unmerged code/hosted access is required.

Do not stop merely because one unsupported case must remain unavailable; land
only the coherent supported set and report it.

## TB-07 prompt — Operational source-link adoption

**Mode:** Standard
**Effort:** High
**Reason:** Final Track B adoption must add exact optional tenancy context
without forcing every operational record onto a Lease or taking over finance
and publication authority.

Implement TB-07 only. Do not combine this prompt with another Track B slice or
with any Track A implementation.

### Context and exact merged-main prerequisite

Repository: `soley-bot/nestory`.

Planning evidence SHA:

`2dea9fb71a539e01ee81b4601f8965fb62a681d5`

Merged predecessor: TB-06 Lease continuity workflows.

Fetch/prune origin; record the exact merged SHA containing TB-06; read repo
rules, the complete Track B package, current Maintenance, Documents, Timeline,
Imports, Reports, and Track A link/snapshot contracts. STOP if TB-06 is
unmerged or a required shared contract exists only in an open PR. Use clean
branch `codex/lease-history-tb-07-operational-links`.

Target result: a review-ready draft PR. Do not merge or deploy.

### Objective

Adopt exact optional Lease/party/occupancy/participant context in Track
B-owned operational records and remaining focused history navigation. Keep
general property/unit work valid. Leave finance and statement/close evidence
snapshots to Track A, and generic signed-document publication/versioning to
Documents or the operational source owner.

### Verified current behavior

Reverify:

- Maintenance requests/tasks link property/unit/requester/vendor but not
  Lease/occupancy;
- inspection is currently a request/task type;
- Timeline links property/unit/Lease/Ledger but not party/occupancy or stable
  generic source identity;
- Documents link property/unit/Lease/task/Timeline/Ledger but not
  party/occupancy/person, and artifact mutation rules remain separately owned;
- import supports one tenant/header dates, not explicit multi-party/actual
  occupancy provenance;
- Reports/search use compatibility fields in some paths;
- TB-05/TB-06 exact read/continuity links; and
- merged Track A amendment status from file 92.

Relevant files:

- Track B files 03, 04, 05, 90, 92;
- `supabase/migrations/20260628100234_maintenance_tasks_workflow.sql`
- latest task/document/timeline/import migrations and RPCs;
- `src/features/maintenance/**`
- `src/features/documents/**`
- `src/features/timeline/**`
- `src/features/imports/**`
- focused Reports/search link helpers;
- generated types and new cross-module pgTAP.

### Required changes

1. Start with RED tests for:
   - tenancy-specific task/inspection retaining exact historical context;
   - general property/unit task requiring no Lease;
   - completed/signed evidence rejecting silent relink;
   - Timeline exact source/party/occupancy/participant links and rejection of
     unregistered, cross-organization, or caller-impersonated source kinds;
   - explicit import provenance/confidence;
   - current tenant change not reattributing old operational record;
   - cross-org/direct DML/RPC bypass; and
   - successor Lease not automatically inheriting context.
2. Add optional exact Lease/party/occupancy/participant/person fields only where the
   record explicitly concerns a tenancy.
3. Validate organization/property/unit/Lease/occupancy/party/participant scope
   in checked writes.
4. Keep general maintenance/recurring work property/unit scoped.
5. Freeze/version only Track B-owned task, inspection, and source-link context
   according to its merged owner contract.
6. Add an allowlisted typed Timeline source registry with
   organization-aware validation/FKs and domain-owned writers. Track B may
   write only Track B source kinds and must not let callers impersonate a
   receipt, allocation, deposit, Ledger, journal, or other owner's identity.
   Timeline remains a projection, not the source of truth.
7. Let Documents cite Track B evidence through exact IDs only through a merged
   Documents/source-owner version/publication contract. Do not redefine
   signed/published bytes, snapshots, or replacement lifecycle; defer and STOP
   that adoption if the contract is absent. Track A owns only statement
   artifacts and snapshots/checksums of evidence included in close.
8. Adopt TB-02's merged normalized explicit
   party/occupancy/participant payload and exact-one commit contract in import
   templates, saved mappings, preview, validation, and operational import UX.
   Preserve source row and per-fact confidence; do not redefine the RPC
   semantics or infer omitted history.
9. Replace remaining affected name-search navigation with exact IDs and use
   TB-05 history contracts in focused Reports/search where current labels would
   misstate former relationships.
10. Add cross-module contract tests and update generated types.

If these changes cannot remain one coherent exact-source-link PR after current
repo inspection, STOP and split the work into module-specific follow-up
prompts rather than combining finance, migrations, and broad UI.

### Invariants

- Optional tenancy context; not every task/document requires Lease.
- Exact IDs and effective-date context.
- No current-tenant inference.
- Completed/signed/published evidence is preserved by its owning domain.
- Timeline/search are projections, not history authority.
- Timeline source kinds are allowlisted, organization-valid, and written only
  by their owning domain.
- Successor receives no implicit links.
- Track A owns financial handoff, close, Owner Statements, and immutable
  statement/close-evidence snapshots. It does not automatically own generic
  operational-document publication.
- Import preserves source/confidence and uncertainty.
- Organization/RLS/direct bypass protection.
- No compatibility retirement yet.

### Acceptance criteria

1. General maintenance works without Lease/occupancy.
2. Tenancy-specific maintenance/inspection has exact accepted context.
3. Old context remains stable after tenant/unit continuity change.
4. Completed/signed evidence cannot be silently relinked.
5. Timeline has exact registered source and Track B links; caller-selected
   financial source impersonation fails.
6. Explicit import facts retain per-fact source/confidence; omitted facts
   remain absent.
7. A successor Lease inherits nothing automatically.
8. Affected navigation uses exact IDs.
9. Track A financial/publication behavior is unchanged.
10. Cross-org/direct bypass fails.

### Verification

- RED/GREEN pgTAP;
- database reset/lint/full pgTAP;
- focused Maintenance/Documents/Timeline/Imports/Reports tests;
- source-link immutability and successor non-inheritance tests;
- full `test:all`, lint, typecheck, generated types, build;
- focused authenticated browser flows for one general task, one
  tenancy-specific inspection/task, exact Timeline/Document navigation, and
  explicit import preview;
- accessibility and high-cardinality checks for adopted surfaces;
- `git diff --check`; and
- final review proving no Track A lifecycle implementation.

### Scope exclusions

No:

- maintenance bill/chargeback finance;
- invoice/receipt/deposit/Owner Statement behavior;
- signed document publication redesign;
- generic CRM, resident profile, or tenant portal;
- full navigation or Unit Timeline redesign;
- fuzzy import reconciliation;
- compatibility field removal;
- hosted mutation/deploy/merge.

### Deliverables

- exact TB-06 merge baseline and shared-contract inventory;
- narrow operational link migration/RPC/actions/tests;
- explicit import provenance support;
- focused exact-link adoption;
- generated types;
- list of file 92 amendments merged versus pending;
- clean commit, pushed parity, review-ready draft PR; and
- final Track B completion evidence with deferred items.

### Stop conditions

Stop if:

- TB-06 is unmerged;
- exact tenancy context would require name/date inference;
- a shared Track A contract is only unmerged;
- preserving completed/signed evidence requires Track B to own publication;
- a required generic Documents/source-owner version contract is not merged;
- general operations would be forced to have a Lease;
- the scope cannot remain one coherent PR; or
- hosted/deployment access is required.
