# Project State

This file contains dated facts about the current Nestory implementation,
environment, hosted services, and verification state. Do not read it by default;
use it when the task needs current-state, deployment, environment, or hosted
service context.

Re-check these facts before making deployment, security, database, or production
decisions. Durable product and engineering rules belong in `PROJECT_RULES.md`.
Avoid copying this file's dated facts back into always-read docs.

## Last Updated

- Updated on 2026-06-27 during a docs-only session.
- Current branch at update time: `main`.
- Worktree note: unrelated source-code changes were already present. This
  documentation session should not be treated as a clean source-code checkpoint.

## Current Implementation Shape

Nestory is currently a Next.js App Router app with:

- TypeScript.
- Tailwind CSS.
- Supabase Auth.
- Supabase Postgres.
- Supabase Storage.
- Feature-owned modules under `src/features/*`.
- Shared primitives under `src/components/*`.
- Shared utilities under `src/lib/*`.

The root route redirects into `/overview`; unauthenticated users are then sent
to `/login` by the auth proxy. Public marketing pages are not part of the MVP
surface.

Current implemented or scaffolded product areas include:

- Auth and first workspace setup.
- Overview.
- Properties.
- Units.
- Timeline.
- Ledger.
- People.
- Leases.
- Documents.
- Imports.
- Payments.
- Reports.
- Settings.
- Maintenance.
- Tenants redirecting into People with the tenant role filter.

Future communications, workflows, tenant portal, and roadmap pages are not
exposed in the app shell. Keep them in roadmap docs until there is real product
behavior behind them.

The current product direction is reusable-core first: company-specific branding,
settings, reports, workflows, and integrations should layer on top of shared PMS
core modules instead of becoming one-off forks.

## Local Tooling Notes

The following facts are session-sensitive and should be verified before use:

- Node.js was previously recorded as `v24.8.0`.
- npm was previously recorded as `11.6.0`.
- Supabase CLI is available through the project dependency via
  `npx supabase`.
- Docker Desktop must be running before local Supabase commands such as
  `npm run supabase:start`, `npm run db:lint`, or `npm run db:reset`.
- Vercel CLI availability differs by session. In the current Codex session, the
  global Vercel CLI is not installed. Install it with `npm i -g vercel` before
  relying on `vercel env pull`, `vercel deploy`, or `vercel logs`.

Do not install Supabase CLI globally with npm. Use the local dependency through
project scripts or `npx supabase`.

## Hosted Supabase State

These hosted details were recorded from earlier foundation work and should be
re-verified before production changes:

- Organization: `SOLEY`.
- Project: `nestory`.
- Project ref: `pfvmztxktkwyewvxfgot`.
- Region: `ap-southeast-1` / Singapore.
- Public URL: `https://pfvmztxktkwyewvxfgot.supabase.co`.
- Hosted database intentionally has no seed data.
- Public schema tables were designed with explicit Data API grants for
  `authenticated` plus server-only `service_role`; no broad anonymous table
  grants are intended.
- Hosted auth state was previously verified with confirmed users,
  organizations, and admin memberships; do not delete confirmed Auth users or
  workspaces unless the user explicitly identifies them as test data.

Known manual hardening:

- Supabase Auth leaked password protection was previously reported as disabled.
  Enable it in Supabase Auth password settings when the project plan supports
  it.

## Hosted Auth And Callback Notes

The intended auth flow:

- Email/password sign up and login.
- `/auth/callback` exchanges the Supabase code for a session cookie.
- First-time admins land on `/setup`.
- Existing admins land on the authenticated app.

Expected Supabase Auth URL configuration:

- Site URL: `https://nestory-bay.vercel.app`.
- Redirect URL: `http://localhost:3000/auth/callback`.
- Redirect URL: `https://nestory-bay.vercel.app/auth/callback`.
- Vercel preview callback URLs when testing previews.

Expected callback behavior without a Supabase code:

- `/auth/callback` should redirect to `/login`, not 404.

## Local Verification History

Earlier foundation verification recorded:

- `npm run supabase:start` passed.
- `npm run db:lint` passed with no schema errors.
- `npm run db:reset` passed.
- `npx supabase db advisors --local --type all --level warn --fail-on error`
  passed with no issues.

Later local seed work recorded a coherent demo portfolio with properties,
units, leases, ledger entries, timeline events, and period locks. If local
Supabase reset reports a storage container healthcheck issue, verify seeded
counts and relationship queries before treating it as a SQL seed failure.

## Deployment Notes

- Vercel hosting should stay close to the Singapore Supabase project. The
  preferred function region is `sin1` where applicable.
- Protected Vercel previews may return `401 Unauthorized` to direct fetches. Use
  the Vercel share-link or authenticated preview flow before treating that as a
  broken deployment.
- Use `docs/foundation-checklist.md` for deployment and auth smoke checks.

## Reverification Checklist

Before using this file for production decisions, re-run or re-check:

- `node --version`.
- `npm --version`.
- `npx supabase --version`.
- Docker Desktop status.
- `vercel --version` after installing the CLI if deployment work is needed.
- `.env.local` points to the intended Supabase project.
- Hosted Supabase security and performance advisors.
- Supabase Auth callback URL configuration.
- Vercel deployment region and protection settings.
