# Supabase migration history reconciliation and release hardening

## Status

Approved implementation design derived from the delegated production-reconciliation objective and the 2026-08-21 read-only audit.

## Verified diagnosis

- Git `origin/main` and the production Vercel deployment both point to `3f9ecdcdc0475d639f94fc8007d658bc626324c7`.
- Supabase reports 77 matching migration versions, 20 local-only versions, and 20 remote-only versions.
- Historical execution records show all 20 remote-only rows were created through the Supabase connector `apply_migration` operation. That operation accepted a migration name and SQL body but generated a hosted timestamp instead of preserving the Git filename version.
- Every expected pair has the same migration name.
- Every hosted SQL payload equals its paired Git SQL after removing trailing CR and LF characters only. No SQL token or statement differs.
- None of the 20 hosted-only versions appears in any Git object path.
- Renaming to the hosted timestamps preserves all relative ordering except that `close_draft_cancellation_relationships` replays immediately before `protect_settled_lease_deposits`. The former changes cancellation lifecycle triggers and the activation runner; the latter replaces the lease header deposit guard. They have no creation-time dependency on one another. A clean reset and the lease/deposit/cancellation tests are release gates.

## Reconciliation decision

Accept the already-recorded hosted timestamps as canonical by renaming the 20 Git migration files. Do not edit their SQL bytes. Do not mutate `supabase_migrations.schema_migrations`, run `migration repair`, reset the hosted project, or reseed production.

A checked-in reconciliation manifest records each old path, hosted path, migration name, exact Git-byte SHA-256, and SQL SHA-256 after trailing newline normalization. Migration discipline permits only declarations whose source and destination contents are identical and whose hashes match the manifest.

## Permanent release architecture

The existing `Database` CI job remains a required PR and main-branch check for forward-only discipline, empty replay, lint, generated types, pgTAP, and concurrency tests.

For pushes to `main`, a separate `production_database` job runs after `Database` and:

1. checks out the triggering SHA and fails unless it is still the exact `origin/main` SHA;
2. enters the protected `production-database` GitHub environment;
3. serializes all production database work with a non-cancelling concurrency group;
4. links the pinned repository Supabase CLI using protected secrets;
5. runs a hosted preflight that requires the remote versions to be an exact prefix of Git and rejects unknown remote versions;
6. runs a Supabase dry run;
7. applies pending migrations with `db push` only;
8. runs hosted postflight, linked error-level lint, and a final dry run;
9. reports `Vercel - nestory: Database` from this hosted result rather than from local database CI.

Production use of connector `apply_migration` is prohibited in repository agent rules, migration policy, and the operator runbook. Connector execution may be used only against an explicitly disposable or preview project.

## Credentials and environment

The `production-database` GitHub environment is restricted to the protected `main` branch and holds:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`

The workflow checks only whether these values are present and never prints them. Missing credentials fail closed before linking.

## Recovery

- Unknown hosted versions stop the release. Operators capture migration-list evidence and compare hosted names and normalized SQL hashes to Git.
- Migration-history mutation is never automatic. If it is genuinely required, the operator must first document backup/PITR coverage, exact repair commands, affected rows, rollback implications, and receive explicit approval.
- A failed new migration is repaired by a new forward migration. An already-applied file is never edited.
- Production is never reset or seeded.
- Supabase Branching may be added later for preview validation, but the release path does not depend on it.

## Acceptance criteria

- The 20 Git files use the hosted versions with unchanged SQL bytes.
- A fresh local reset replays the entire reordered chain.
- Migration discipline and reconciliation hashes pass.
- Hosted preflight rejects unknown remote versions and postflight requires exact equality.
- PR/local database and application gates stay intact.
- Production database release is main-SHA-only, serialized, environment-protected, and is the source of the Vercel Database status.
- After merge, migration list and final dry run show zero unexplained local-only or remote-only versions.
- Git, hosted schema, Vercel deployment SHA, aliases, runtime smoke, and logs are verified independently before pilot readiness is claimed.
