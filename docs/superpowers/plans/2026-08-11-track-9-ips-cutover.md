# Track 9 IPS migration and cutover milestone

## Operator outcome

A Super Admin can stage one redacted IPS cutover manifest, see every blocking
or signed exception, reconcile the exact imported entity counts, tenant
opening balances, owner opening components, and intentionally selected rent
months, then freeze one immutable cutover result that replays without creating
duplicates.

The local acceptance story uses a synthetic authority-start date and redacted
data owner. The real IPS authority-start date, real data owner, hosted target,
backup checkpoint, and activation remain explicit Track 12 approval inputs and
must not be invented here.

## Acceptance criteria

1. A canonical manifest stores its SHA-256, authority-start date, redacted data
   owner, committed property/unit/people/lease import runs, approved owner
   opening entries, explicitly selected historical rent months, expected
   counts/totals, and signed exceptions.
2. Stage is Super Admin-only, organization-scoped, RLS plus FORCE RLS, direct
   application DML is denied, and every durable row is immutable except through
   checked state transitions with append-only transition evidence.
3. Ambiguous/missing relationships, nonterminal or cross-tenant import runs,
   unapproved owner openings, duplicate source keys, adjacent unselected rent
   months, malformed exact money, or mismatched source totals produce typed
   blockers. Nothing is silently imported or inferred.
4. Commit locks selected financial months in ascending order, generates only
   the explicitly selected historical rent months through the existing checked
   rent authority, and reconciles exact entity counts, invoice balances, and
   all four owner components. A mismatch is visible and cannot activate.
5. Same actor/key/payload returns the same batch and reconciliation identities;
   conflicting payload or actor is rejected atomically. Concurrent commit
   attempts produce one result, no deadlock, no pending idempotency, and no
   duplicate invoice or import effect.
6. A pre-activation batch can be abandoned without deleting imported authority;
   a reconciled/activated batch and its manifest, items, totals, exceptions,
   hashes, transitions, and sign-off cannot be changed or deleted.
7. The Import workspace shows the authority date, data owner, manifest hash,
   blockers, selected months, pre/post counts and money, signed exceptions, and
   precise next action. Finance and Operations roles cannot stage, commit, or
   activate cutover authority.
8. One authenticated browser flow stages, blocks, corrects with a new manifest,
   commits, verifies exact database effects, replays idempotently, and proves
   role denial. The guarded baseline is restored afterward.
9. Two clean disposable-local rehearsals use the same redacted manifest and
   produce the same canonical manifest hash, counts, totals, and reconciliation
   hash. Duration and manual steps are recorded.
10. One complete milestone matrix runs after the browser flow. Any genuine
    accounting, authorization, isolation, integrity, idempotency, concurrency,
    or irreversible-data finding is corrected in one batch with affected gates
    and one focused independent re-review only.

## Interfaces

- CLI-generated additive migration for `ips_cutover_batches`,
  `ips_cutover_items`, `ips_cutover_reconciliations`, and
  `ips_cutover_transitions`.
- Checked RPCs:
  - `stage_ips_cutover_batch(organization, authority_start_date, data_owner,
    manifest, idempotency_key)`;
  - `commit_ips_cutover_batch(organization, batch, signoff_reason,
    idempotency_key)`;
  - `abandon_ips_cutover_batch(organization, batch, reason,
    idempotency_key)`;
  - `get_ips_cutover_batch(organization, batch)`;
  - `get_ips_cutover_readiness(organization, batch)`.
- Existing `stage_import_run_v1`, `commit_generic_import_run`,
  `commit_unit_import_run`, owner-opening authority, and
  `generate_lease_rent_invoice(..., manual_recovery, ...)` remain the sole
  domain writers. Track 9 orchestrates and reconciles them; it does not create
  a parallel import or receivable ledger.

## Focused RED before production edits

- `supabase/tests/ips_cutover_import_test.sql`: schema/RLS/grants, canonical
  hash, role/cross-tenant denial, blockers, exact reconciliation, replay,
  conflict, abandon/freeze, and selected-month-only behavior.
- `scripts/ips-cutover-concurrency.node-test.mjs`: real two-session stage/commit
  replay and selected-month generation serialization.
- `src/features/imports/actions.test.ts` and
  `src/features/imports/components/import-preview-screen.test.tsx`: exact
  action payloads, blocker rendering, role-shaped controls, and immutable
  reconciliation history.
- `scripts/verify-ips-cutover-manifest.node-test.mjs`: literal redacted manifest
  and two-rehearsal hash/totals contract.

## Forbidden scope

- No hosted Supabase/Vercel mutation, real IPS data, invitation, email, cron,
  backup, deploy, push, merge, or authority activation.
- No adjacent-month rent backfill, DoorLoop full-history import, accounts
  payable, general ledger, bank reconciliation, or silent defaults.
- No weakening of existing import, opening-balance, rent, owner-close,
  statement, RLS, evidence, or financial-month controls.
