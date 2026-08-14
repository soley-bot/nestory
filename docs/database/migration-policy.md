# Database migration policy

Nestory migrations are a forward-only deployment log. Once a migration has reached `main` or any shared Supabase environment, its filename and bytes are immutable.

## Normal change

1. Add one new file under `supabase/migrations` using `YYYYMMDDHHMMSS_short_description.sql`.
2. Use a timestamp later than the current migration head and do not reuse a timestamp.
3. Repair earlier behavior in the new migration; never edit the predecessor in place.
4. End the file with a newline so Git, PowerShell, and the Supabase CLI read identical bytes.
5. Run `npm run db:verify-migrations`, `npm run db:reset`, `npm run db:lint`, and `npm run test:database`.
6. Regenerate `src/types/database.generated.ts` with `npm run db:types` whenever the public schema changes, then review the generated diff.

The verifier compares the current filesystem with `MIGRATION_BASE_REF`. CI supplies the pull-request base or previous push commit. Locally it prefers `origin/main` when the branch differs, then falls back to `HEAD^`.

## Repairing a broken migration

If a migration has already been shared, add a forward repair that safely handles both the intended state and the partially applied state. Use explicit existence checks where replay safety requires them, retain grants/RLS/function ownership, and add pgTAP coverage for the repaired contract. Do not change the historical file to make a fresh reset look cleaner; that creates a different database history than deployed environments possess.

## Future baseline

A new baseline is an environment cutover, not routine cleanup. It may be created only when:

- every supported environment is proven at or beyond one named migration head;
- a full schema dump, Storage/RLS policies, grants, functions, and seed prerequisites are reproducible from an empty database;
- rollback artifacts and the pre-baseline migration archive are retained outside the executable migration directory;
- CI tests both an empty install from the proposed baseline and an upgrade from the last supported pre-baseline state;
- the cutover is approved and released as its own change.

Until those conditions are met, the current migration chain stays intact regardless of its length.
