# Production database release

Nestory releases the hosted Supabase schema only from the exact SHA merged to `main`. Pull requests prove the migration chain locally; the protected main workflow owns the production write.

## One-time GitHub environment setup

Create a protected environment named `production-database`, restrict it to protected branches, and store these environment secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`

Do not store their values in repository variables, workflow arguments, documentation, issues, or logs. Environment reviewers may be added when the pilot release policy requires a human approval. The production job has its own `production-supabase` concurrency lock and does not cancel an in-progress database writer.

Supabase branching is useful for disposable preview validation when available, but it is optional and is not a pilot-readiness dependency.

## Pull-request path

1. Add only forward migrations with timestamps later than the migration head. Never change a migration already on `main` or in a shared environment.
2. Run `npm run db:verify-migrations`, a clean `npm run db:reset`, `npm run db:lint`, generated-type parity, pgTAP/database tests, applicable invariant or concurrency tests, and application checks.
3. Open a focused pull request. Pull-request workflows use local Supabase only and never receive the production environment secrets.
4. Merge normally after the protected `Application` and `Database` checks pass. Do not force-push, force-merge, or deploy a non-main SHA.

Merging is authorization for the protected workflow to release that exact main SHA. It is not authorization for a developer or connector to write to production.

## Protected main release

The `Production Database` job runs after local database CI and performs this fail-closed sequence:

1. Check out `github.sha`, query the current `main` SHA with a step-scoped GitHub token, and prove both values equal without persisting checkout credentials.
2. Link the pinned project Supabase CLI using protected environment secrets.
3. Run `npm run db:hosted-preflight`. The hosted ledger must be an exact ordered prefix of the Git migration versions. A single read-only Postgres query computes deterministic SHA-256 descriptors for every hosted row and returns only version, name, statement count, statement byte counts, per-statement hashes, and the canonical row hash. No raw hosted SQL crosses the routine runner. Every ordinary row must reconstruct from Git and match exactly; the 99-row released baseline must remain an exact prefix; and the 20 local reconciliation declarations, including six pinned legacy hosted-content exceptions, must match their declared Git, hosted, database-side, and canonical hashes. Any unknown, missing, duplicated, out-of-order, renamed, or content-mismatched remote row stops the release.
4. Capture an aggregate-only Pilot preservation snapshot. It requires exactly one Pilot organization and four Super Admin memberships, and records critical entity and history counts without exposing user identity or row contents.
5. When the exact-main workflow contains an explicitly approved one-time recovery artifact, classify the hosted checkpoint here before the dry-run. Run the artifact only at its exact starting ledger; after every recovery migration is present, verify that completed state and skip it. Partial or unknown states fail closed. The artifact must pin every target's raw and normalized hashes, perform only the approved byte normalization in one transaction, preserve function identity and metadata, and fail closed on any mismatch. It is not a migration-history repair or a general exception path.
6. Run a linked `db push --dry-run`.
7. Run the single production `db push`.
8. Run `npm run db:hosted-postflight`. Git and hosted ledgers must now be exactly equal.
9. Recompute the Pilot snapshot and require byte-identical pre/post counts before continuing.
10. Run linked database lint at error level and a final linked dry-run proving no migration remains pending.
11. Report `Vercel - nestory: Database` only from this hosted result. Vercel production promotion must not treat local database tests as a hosted release.

The final release record must include the merged SHA, workflow run, local/remote migration counts, linked lint, final dry-run, Vercel deployment ID and SHA, production aliases, runtime smoke, and worktree state.

## Prohibited production paths

- Do not use connector `apply_migration` against production. Connector migration tools may be used only in an explicitly disposable or preview project whose destruction cannot affect shared data.
- Do not run production `supabase db push`, migration repair, reset, seed, restore, or ad hoc schema DDL from a local checkout.
- Do not rename or rewrite historical SQL to silence a ledger mismatch. A reviewed identity reconciliation is allowed only when the exact SQL and semantic dependency order are proven and declared under `supabase/migration-reconciliations`.
- Do not make optional paid branching a prerequisite for the release lane.

## Failure and recovery

### Preflight reports an unknown or out-of-order remote version

Stop before any write. Capture the Git and hosted version sets, names, normalized and exact hashes, dependency order, linked schema probes, and the workflow SHA. Determine how the remote change was applied. Do not run `migration repair`.

If the SQL is exactly equivalent and clean replay proves the hosted timestamp order, propose a repository-only identity reconciliation with a manifest. If hosted history must be mutated, obtain explicit approval first with a backup/recovery plan, exact commands, affected versions, and rollback implications.

### Preflight reports a hosted name or SQL-content mismatch

Stop before any write. Compare the exact Git migration with the hosted ledger identity, statement counts, byte lengths, and hashes, then probe the resulting hosted objects read-only. Retrieve raw hosted SQL only in a controlled operator investigation when the hash evidence cannot locate the mismatch; never add raw SQL transport to the routine GitHub runner. Do not treat matching versions as proof that the SQL ran, and do not add a routine exception merely to make the gate pass. A legacy exception is acceptable only for independently verified pre-guardrail history and must immutably pin both sides while stating that SQL identity is not proven. New migrations must match exactly. Any hosted history mutation still requires explicit approval and a recovery plan.

### Dry-run fails

No production push has occurred. Preserve the run logs, reproduce against a clean local reset, and correct the change through the pull-request path.

### Push or postflight fails

The Database deployment status remains failed, so production promotion stays blocked. Stop all other database writers. Inspect the hosted ledger and schema read-only, identify the last completed migration, and compare it with the exact main SHA. Do not blindly retry, delete ledger rows, or reverse DDL. Use a new forward repair when the database state needs correction. Escalate any history mutation for explicit approval.

### Approved newline recovery

The custom-role release has one source-controlled recovery step for five legacy hosted functions whose stored bodies use CRLF while the forward migration's checked replacement expects LF. `scripts/classify-hosted-function-newline-recovery.sql` permits normalization only at hosted ledger count 103 and head `20260822045638`, reports completion once all four package migrations exist, and rejects partial states. `scripts/normalize-hosted-function-newlines.sql` recognizes each exact raw or already-normalized SHA-256 definition, replaces CRLF with LF only, and verifies the normalized hash plus unchanged function OID, owner, ACL, execution settings, and planner metadata. Missing, duplicate, mixed, unknown, or semantically different targets abort the transaction. The step does not alter migration files or migration history and becomes a verified no-op for later releases.

### Application rollback

Reverting application code does not reverse database migrations. Keep schema changes backward-compatible across rollout and rollback. Correct database behavior with a reviewed forward migration. For data recovery, follow the hosted backup/PITR policy and validate the recovery target before any restore; never experiment on production.

### Credential or environment failure

Leave the merge or release blocked. Restore the protected environment configuration without copying secret values into chat or logs, then rerun the exact failed main workflow. Never substitute personal credentials into the workflow file.
