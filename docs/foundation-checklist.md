# Foundation Checklist

Read this doc for verification, auth, Supabase, Vercel, environment, or module
release checks. Do not load it for pure UI or schema planning unless verification
is part of the task.

Use this checklist before adding new product modules or after changing auth,
routing, Supabase policies, Vercel config, or environment variables.

For dated hosted project details, current tooling notes, and known manual
hardening, read `docs/project-state.md`. Re-verify those facts before relying on
them.

## Local Verification

```bash
npm run lint
npm run build
```

If local Supabase schema changes were made and Docker Desktop is running:

```bash
npm run db:lint
npm run db:reset
npm run db:types
```

## Hosted Supabase Checks

- Confirm `.env.local` points to the intended hosted Supabase project.
- Confirm Supabase Auth URL Configuration:
  - Site URL: `https://nestory-bay.vercel.app`
  - Redirect URL: `http://localhost:3000/auth/callback`
  - Redirect URL: `https://nestory-bay.vercel.app/auth/callback`
  - Redirect URL: Vercel preview callback URLs when testing previews.
- Run hosted Supabase security advisors.
- Run hosted Supabase performance advisors.
- Treat `unused_index` INFO notices as expected until real usage data exists.
- Do not delete confirmed Auth users or workspaces unless the user explicitly identifies them as test data.
- Delete only clearly pending, unconfirmed, no-membership test users during cleanup.

## Auth Smoke

Run this flow on production after auth changes:

1. Open `https://nestory-bay.vercel.app/signup`.
2. Create an account with an inbox you can access.
3. Confirm the Supabase email link.
4. Confirm `/auth/callback` exchanges the code and redirects.
5. Confirm a first-time admin lands on `/setup`.
6. Create a workspace.
7. Confirm the app lands on `/timeline`.
8. Sign out.
9. Sign back in.
10. Confirm the existing admin lands directly on `/timeline`.

## Production Deployment Checks

The Vercel CLI may not be globally installed in every session. Install it with
`npm i -g vercel` before relying on deployment, env, or log commands.

```bash
vercel ls --scope soley-bots-projects
vercel inspect <deployment-url> --scope soley-bots-projects --wait
```

Confirm Vercel Functions are in `[sin1]` so the app stays close to the Singapore Supabase project.

Use `vercel curl` for protected deployment checks from the linked project:

```bash
vercel curl /auth/callback --deployment <deployment-url> -- -I
```

Expected without a Supabase code: `307` redirect to `/login`.

## Known Manual Hardening

- Supabase Auth leaked password protection currently reports as disabled. Enable it in Supabase Auth password settings when the project plan supports it.
