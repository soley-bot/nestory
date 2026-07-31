# TB-02 Task 1 Report

## Status

`DONE_WITH_CONCERNS`

TB-02 is implemented, locally verified, committed, pushed, and open as a
review-ready draft PR. The concern is an out-of-scope `AccessSettingsScreen`
failure in the repository-wide Vitest run; all TB-02, Lease, People, Unit,
database, concurrency, lint, type, build, browser, and ACL/RLS gates pass.

No hosted mutation, deployment, merge, TB-03 transition, or historical
read-model cutover was performed.

## Provenance

- Repository:
  `D:\nestory\.worktrees\lease-history-tb-02-model-bootstrap`
- Branch: `codex/lease-history-tb-02-model-bootstrap`
- Exact baseline / `origin/main` at start:
  `f3ba808c4205e526469bf3929d8e78ab95c78767`
- Merged TB-01 predecessor:
  `b6b277f2b456ff65acad3ca286bac3043929f8cb`
- TB-01 predecessor ancestry check: PASS
- Implementation commit:
  `d8acfe56d7c29ec2de549b435d0232d9d37ece83`
- Draft PR: https://github.com/soley-bot/nestory/pull/49
- Initial pushed parity: local HEAD, remote branch, and PR head all matched
  `d8acfe56d7c29ec2de549b435d0232d9d37ece83`.
- A second documentation-only handoff commit adds this report; its exact SHA
  is recorded in the final task response and PR head.

## Implemented behavior

### Relationship evidence model

- Added independent evidence state, business lifecycle, source, typed boundary
  kind/confidence, source/correction linkage, supersession lineage,
  actor/time, and reason evidence to Lease parties and occupancies.
- Added generated inclusive date ranges and PostgreSQL GiST exclusions only
  for accepted, sufficiently known facts:
  - one primary-tenant interval per Lease/date;
  - no overlapping same-Person/same-role interval per Lease;
  - no overlapping accepted Unit occupancy interval; and
  - no overlapping accepted participant interval for one exact party.
- Replaced the old active-only unique indexes with interval-aware exclusions.
- Preserved scheduled and actual occupancy as separate boundary sets. Actual
  evidence takes precedence in the protected occupancy range once it exists.
- Kept `open_current` distinct from `unknown`.

### Normalized Person participation

- Added `public.lease_occupancy_participants` linking one exact organization,
  occupancy, and Lease party.
- Enforced exact Lease scope, same-organization links, individual-only
  participation, allowed Lease-party roles, accepted-actual-occupancy
  containment for `present`/`ended`, and cross-Unit Person overlap denial.
- Added guarded mutation context, direct DML denial, least-privilege grants,
  and authenticated-admin SELECT RLS.
- Kept party authorization, Lease-level Unit occupancy, and observed Person
  residence as separate facts. No participant is inferred from a party role.

### Legacy bootstrap and checked creation/import

- Mechanically classified every pre-TB-02 party and occupancy row as
  `legacy_unresolved`.
- Preserved the existing IDs and date values while recording their boundary
  kinds separately and keeping confidence `unknown`.
- Created exact bootstrap activity entries without promoting any legacy fact
  or inventing participant evidence.
- Moved the Plan 04 implementation to an inaccessible private helper and
  retained its public signature as a safe compatibility alias into the TB-02
  composition.
- Added `public.create_lease_with_relationships(...)`, which:
  - checks admin organization, Person, Unit/property, source import row,
    normalized payload, and payload-bound idempotency;
  - invokes Plan 04 atomically;
  - adopts exactly one trigger-created primary party and occupancy;
  - enriches those exact rows instead of inserting duplicates;
  - accepts explicit party, occupancy, and participant facts;
  - leaves omitted actual and party boundaries `NULL`/`unknown`;
  - returns exact Lease, party, occupancy, and participant IDs; and
  - logs the exact normalized entity IDs.
- Updated the generic Lease import commit boundary to call the same checked
  composition and persist exact result IDs on `import_rows`. Import templates,
  mappings, preview UX, and broad import surfaces remain unchanged for TB-07.
- Updated `createLeaseAction` to submit the normalized relationship payload
  and require the checked result's exact Lease ID.
- Preserved TB-01 archive/write guards and Plan 04 term authority.
- Existing-Lease relationship transitions remain unavailable and continue to
  return the existing transition-required contract for TB-03.

## Files changed

- `supabase/migrations/20260731022909_lease_history_tb02_model_bootstrap.sql`
- `supabase/tests/lease_history_tb02_model_bootstrap_test.sql`
- `supabase/tests/lease_history_tb02_creation_behavior_test.sql`
- `supabase/tests/lease_history_integrity_guards_behavior_test.sql`
- `scripts/lease-history-model-concurrency.mjs`
- `scripts/lease-history-model-concurrency-contract.test.mjs`
- `src/features/leases/lease-relationship-input.ts`
- `src/features/leases/lease-relationship-input.test.ts`
- `src/features/leases/actions.ts`
- `src/types/database.generated.ts`
- `package.json`
- `docs/current-state.md`
- `docs/engineering-rules.md`

## RED evidence

Tests were written before the corresponding implementation.

1. The focused relationship-payload Vitest initially failed because
   `lease-relationship-input.ts` did not exist. A temporary null-returning
   implementation then produced two assertion failures, proving the tests did
   not pass against scaffolding.
2. The initial pgTAP model/creation tests failed on missing typed columns,
   missing `lease_occupancy_participants`, missing exclusions, and missing
   `create_lease_with_relationships`.
3. The concurrency contract test initially failed because
   `lease-history-model-concurrency.mjs` did not exist.
4. The lifecycle-mapping test was tightened to active/cancelled semantics and
   failed before the implementation mapped active to
   `effective`/`occupied` and cancelled to
   `cancelled_before_effective`.

## GREEN verification

### Database

- `npm run db:reset`
  - PASS; all append-only migrations, including
    `20260731022909_lease_history_tb02_model_bootstrap.sql`, applied and seed
    completed.
- `supabase test db`
  - PASS; 31 files / 1,166 pgTAP assertions.
- Focused TB-01/TB-02/Plan 04 pgTAP during implementation
  - PASS; 159/159 assertions across the three focused files.
- `npm run db:lint`
  - PASS; `{"results":[],"message":"db lint"}` and no schema errors.
- `npm run db:types`
  - PASS; local public-schema types regenerated into
    `src/types/database.generated.ts`.

The first final full pgTAP attempt was intentionally treated as invalid
evidence because the temporary browser fixture had not yet been reset; it
reported the expected extra property/unit/Lease and non-legacy test rows. A
fresh `npm run db:reset` removed those fixtures, and the final clean-baseline
run passed all 1,166 assertions.

### Concurrency and compatibility

- `npm run leases:test-history-model`
  - PASS; true two-session accepted party, participant, and same-Unit
    occupancy races each produced exactly one commit and one SQLSTATE `23P01`
    exclusion rejection.
- `npm run leases:test-history-integrity`
  - PASS; TB-01 Person/archive serialization and exact
    `relationship_transition_required` behavior remain intact.
- `npm run leases:test-term-authority`
  - PASS; Plan 04 overlap and period-transition serialization remains intact.

### Application tests and static checks

- `npx vitest run src/features/leases src/features/people src/features/units`
  - PASS; 22 files / 154 tests.
- Focused new payload/concurrency contract:
  `npx vitest run src/features/leases/lease-relationship-input.test.ts scripts/lease-history-model-concurrency-contract.test.mjs`
  - PASS; 2 files / 5 tests.
- `npx tsc --noEmit`
  - PASS.
- `npm run lint`
  - PASS.
- `npm run test:demo-tools`
  - PASS; 23/23 tests.
- `npm run test:ui-coverage`
  - PASS; 54/54 routes.
- `npm run test:ui-copy`
  - PASS.
- `git diff --check`
  - PASS before staging and on the staged implementation diff.

### Build

- Initial `npm run build`
  - BLOCKED only by absent local public Supabase environment variables.
- Process-local build using the public local Supabase URL/anonymous key parsed
  from `supabase status -o env`, without printing, persisting, or committing
  the values, followed by `npm run build`
  - PASS; Next.js 16.2.9 compilation, type checking, and static generation
    completed.
  - Non-blocking existing warning: multiple lockfiles affected workspace-root
    inference.

### Checked import contract

The pgTAP creation behavior suite directly exercised
`create_lease_with_relationships` with explicit planned party, scheduled
occupancy, and participant boundaries. It proved:

- one exact accepted primary party;
- one exact accepted occupancy;
- one exact planned participant when explicitly supplied;
- exact returned and activity entity IDs;
- omitted actual move-in/out remain `NULL`;
- term dates do not become party boundaries;
- same-payload replay returns the same IDs without duplicates;
- different-payload reuse is rejected; and
- generic Lease import stores the exact Lease, party, and occupancy result IDs.

### Authenticated browser flow

Using the Playwright CLI against the production build on
`http://127.0.0.1:3102`:

1. Signed in with the local admin fixture and opened `/leases`.
2. The existing seed's all-zero UUID version nibble is rejected by the
   existing `z.uuid()` form validation, so temporary RFC-v4-shaped local
   Person/property/Unit fixtures were used to test the real action/RPC path.
3. Submitted an active Lease for `TB02 Browser Tenant`, property
   `TB02 Browser Property`, Unit `TB02-01`, 31 Jul 2026 through 31 Aug 2026,
   USD 975 monthly, due day 5.
4. PASS: the drawer closed, `Lease added.` toast appeared, Lease/current
   counts incremented, and the new active row rendered.
5. Database inspection for temporary Lease
   `68d39456-639d-4cb7-9886-5a9be65093dd` proved:
   - exactly one accepted/effective/operator-confirmed primary party;
   - exactly one accepted/occupied/operator-confirmed occupancy;
   - zero inferred participants;
   - party, scheduled, and actual dates remained `NULL` with
     `unknown` kind/confidence; and
   - exact Lease, term, party, and occupancy activity rows referenced the
     returned IDs.
6. Closed the browser and reset the database. The temporary fixtures and
   browser artifacts are not present in the commit.

## Final ACL/RLS inspection

Direct catalog inspection after the clean reset showed:

- `lease_occupancy_participants.relrowsecurity = true`.
- Participant table grants:
  - `authenticated`: `SELECT`;
  - `service_role`: `SELECT`;
  - `anon`: none;
  - only owner `postgres` retains mutation privileges.
- One authenticated SELECT policy:
  `Admins can view lease occupancy participants`, using
  `app_private.is_org_admin(organization_id)`.
- `public.create_lease_with_relationships(...)`:
  `postgres` and `authenticated` EXECUTE only.
- Public Plan 04 compatibility alias
  `public.create_lease_with_authoritative_term(...)`:
  `postgres` and `authenticated` EXECUTE only.
- Private Plan 04 helper
  `app_private.create_lease_with_authoritative_term_plan04(...)`:
  `postgres` EXECUTE only.
- Anonymous and service-role callers have no checked creation EXECUTE.

## Repository-wide test concern

`npm run test:all` did not fully pass:

- 1 failed / 173 passed test files;
- 2 failed / 1,358 passed tests; and
- both failures are in `AccessSettingsScreen`:
  - `preserves same-Staff draft feedback when revalidation materializes its invitation`
  - `blocks a duplicate grant and focuses the server-loaded invitation`

The expected invitation feedback/focus copy was not rendered. This branch does
not change organization-access code or those tests. The original full-suite
baseline was inconclusive because it exceeded the controller command window,
so this report does not overstate that they were re-proven on the exact
baseline. Focused TB-02/Lease/People/Unit tests and `test:demo-tools` pass.

## Self-review findings and corrections

The complete staged diff was reviewed for schema integrity, authorization,
idempotency, compatibility, exact identity, concurrency, secrets, generated
artifacts, and scope.

Corrections made during RED/GREEN and self-review:

- A participant BEFORE trigger originally relied on a generated `NEW` range
  that was not yet available. It now calculates the candidate typed range
  from the incoming boundaries before containment/overlap checks.
- Overly strict lifecycle/date checks were relaxed so accepted lifecycle and
  unknown boundaries remain independent; only sufficiently known ranges enter
  exclusions.
- The public Plan 04 signature now preserves status-derived lifecycle while
  leaving unprovided relationship boundaries unknown.
- The nested Person archive guard was made `SECURITY DEFINER` so its private
  helper remains callable without exposing that helper.
- Cancelled imports now produce
  `cancelled_before_effective` party/occupancy evidence and no actual dates.
- Active, notice, draft, ended, terminated, and cancelled application
  lifecycle mappings were made explicit.
- The TB-01 archive rejection message was restored exactly so existing callers
  and concurrency assertions remain compatible.
- The same-Unit concurrency fixture was changed to trusted Lease-header setup
  plus guarded accepted occupancy inserts, avoiding use of the production RPC
  for an intentionally conflicting fixture while still testing the real
  exclusion under two sessions.
- The one TB-01 behavior fixture that legitimately writes completed historical
  dates was updated to supply the new typed boundary fields.
- Temporary Playwright output was removed; secret/TODO/FIXME scans found no
  committed browser artifacts, credentials, or unfinished markers.

No unresolved TB-02 correctness defect was found in self-review.

## Checks intentionally not run

- Hosted Supabase migration, hosted data mutation, deployment, and merge:
  explicitly excluded by the TB-02 brief.
- Existing-Lease add/end/change/correct/record/cancel UI flows:
  explicitly deferred to TB-03.
- Historical read-model/UI cutover:
  explicitly deferred to TB-05.
- Import templates/mapping/preview UX adoption:
  explicitly deferred to TB-07.

## Remaining concerns and handoff

1. Review the unrelated `AccessSettingsScreen` full-suite failures separately;
   they are not remediated in this TB-02 branch.
2. The local seed uses non-RFC-versioned UUID text that existing `z.uuid()`
   validation rejects in a browser form. The authenticated path was therefore
   proven with temporary RFC-v4 fixtures and a clean reset afterward.
3. Do not begin TB-03 until PR 49 is reviewed and merged. TB-02 itself does
   not authorize existing-history transitions, promotion, or read cutover.
