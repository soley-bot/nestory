# Nestory

Nestory is a web-first Property History and Performance Hub for property
management companies. It starts with Cambodia property operations and is being
shaped as a reusable PMS core that can support company-specific branding,
settings, reports, workflows, and integrations over time.

The product north star is the Timeline-First Record Room:

> Show the complete history and performance of a property or unit in one place.

## Documentation Map

Read only the docs needed for the task:

- `PROJECT_RULES.md` - durable product, architecture, UI, data, and engineering
  guardrails. Start here.
- `docs/project-state.md` - dated current implementation, environment, hosted
  service, and verification notes. Read for deployment/env/current-state work.
- `docs/foundation-checklist.md` - local, Supabase, auth, and deployment
  verification runbook. Read before verification or infra changes.
- `docs/enterprise-lite-database-roadmap.md` - future PMS schema contract and
  database review checklist. Read for schema/RLS/storage/module design.
- `docs/operational-ui-handoff.md` - authenticated app UI contract for dense,
  quiet, operational record screens. Read for UI work.
- `docs/complete-app-goals.md` - final product target, module goals, and build
  order. Read for roadmap or scope decisions.
- `docs/build-goal-prompts.md` - copy-paste prompts for each major build goal.
  Read when starting a new implementation session.

`PROJECT_RULES.md` should stay timeless. Move volatile facts such as CLI
versions, hosted project state, deployment URLs, and dated verification results
to `docs/project-state.md`.

Keep the always-read docs compact. Link to deeper docs instead of repeating long
rules or status blocks.

## Product Direction

Nestory should grow from the record-room foundation before expanding into
broader PMS workflows.

Roadmap order:

1. Closed Dashboard operating loop.
2. Unit Operating Record.
3. Reports and owner/operator outputs.
4. Deep detail pages and CRUD completeness.
5. Documents/evidence system.
6. Maintenance/issues workflow.
7. Import/data cleanup.
8. Audit/history hardening.
9. Role-based access and portals.
10. Production readiness and onboarding.

Future module database design should follow
`docs/enterprise-lite-database-roadmap.md`. The full product target and build
sequence live in `docs/complete-app-goals.md`.

## Local Development

Install dependencies:

```bash
npm install
```

Start the Next.js app:

```bash
npm run dev
```

Run standard verification:

```bash
npm run lint
npm run build
```

## Supabase

Supabase CLI is installed as a local dev dependency. Docker Desktop must be
running before local Supabase commands work.

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

Copy `.env.example` to `.env.local` and fill in
`NEXT_PUBLIC_SUPABASE_URL` plus a Supabase publishable key. Use server-only keys
only in server-only code.

For hosted project details, auth notes, and known manual hardening, see
`docs/project-state.md`.

## Deployment And Checks

Use `docs/foundation-checklist.md` before adding product modules or after
changing auth, routing, Supabase policies, Vercel config, or environment
variables.

The Vercel CLI may not be globally installed in every session. Install it with:

```bash
npm i -g vercel
```

This unlocks agentic deployment, environment, and log commands such as
`vercel env pull`, `vercel deploy`, and `vercel logs`.
