# Nestory

Nestory starts as a web-first Property History and Performance Hub for property management companies in Cambodia, with a phased path toward a broader property management system.

## Product Direction

Nestory should grow from a timeline and ledger record-room foundation before expanding into broader PMS workflows. The next backbone module is Leases & Tenants.

Roadmap order:

1. Timeline/Ledger foundation
2. Leases & Tenants
3. Units and property dashboards
4. Maintenance/tasks
5. Reports/accounting expansion
6. Tenant portal/payments/integrations later

Future module database design should follow `docs/enterprise-lite-database-roadmap.md`.

## Local Development

Install dependencies:

```bash
npm install
```

Start the Next.js app:

```bash
npm run dev
```

Run verification:

```bash
npm run lint
npm run build
```

For the auth, Supabase, and Vercel smoke checklist, see `docs/foundation-checklist.md`.

## Supabase

Supabase CLI is installed as a local dev dependency. Docker Desktop must be running before local Supabase commands work.

Start Supabase:

```bash
npm run supabase:start
```

Validate and reset the local database:

```bash
npm run db:lint
npm run db:reset
npm run db:types
```

Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` plus a Supabase publishable key. Use server-only keys only in server-only code.

Phase 1 auth uses email/password, a single admin role, and a first workspace setup flow.

Hosted Supabase project:

- Organization: SOLEY
- Project: nestory
- Region: ap-southeast-1, Singapore
- Project ref: `pfvmztxktkwyewvxfgot`
- Public URL: `https://pfvmztxktkwyewvxfgot.supabase.co`

Codex Supabase MCP is authenticated for hosted project work. Supabase CLI hosted login is not required for local development; if we later want `supabase link` or `supabase db push`, log in with a fresh Supabase personal access token.

## Project Rules

Read `PROJECT_RULES.md` before making architecture, database, UI, or refactoring decisions.
