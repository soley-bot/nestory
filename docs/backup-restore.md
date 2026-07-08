# Backup And Restore

Nestory stores business rows in Supabase Postgres and private files in
Supabase Storage. Treat a recoverable backup as both parts.

## Production Baseline

- Supabase Dashboard database backups are the primary restore path.
- Paid plans can add point-in-time recovery for smaller data-loss windows.
- Database backups do not include Storage objects, so document and photo files
  need a separate Storage export.
- Local backup files must stay out of Git. Use `backups/` or another private
  encrypted location.

## Before Risky Changes

Run these from the repo root after confirming the linked project is correct:

```bash
npx supabase migration list --linked
npx supabase db dump --linked --role-only -f backups/roles.sql
npx supabase db dump --linked -f backups/schema.sql
npx supabase db dump --linked --data-only --use-copy -f backups/data.sql
```

Then export Storage buckets from Supabase Dashboard, Supabase Storage CLI, or an
S3-compatible tool. Nestory buckets currently include private business files and
photos, so do not treat database dumps alone as complete recovery.

## Restore Drill

1. Restore the database backup to a new Supabase project or a disposable local
   database.
2. Restore Storage objects into matching buckets.
3. Run `npx supabase migration list --linked` against the restored project and
   confirm migration history matches this repo.
4. Point a throwaway Nestory environment at the restored project.
5. Smoke `/login`, one protected route redirect, one document/photo record, and
   one report export.

## v1.0 Signoff

v1.0 is not production-certified until a restore drill has been completed for
both database rows and Storage objects on the selected Supabase plan.

Sources:

- Supabase Database Backups: https://supabase.com/docs/guides/platform/backups
- Supabase CLI backup/restore: https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- Supabase Storage object download: https://supabase.com/docs/guides/storage/management/download-objects
