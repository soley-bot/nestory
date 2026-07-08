# Nestory

Nestory is a Next.js + Supabase property operations app. The current product
already includes authenticated workspaces, role-aware navigation, property and
unit records, people and leases, ledger and timeline history, maintenance
workflows, documents, imports, reports, organization settings, and access
management.

## Stack

- Next.js `16.2.9` App Router
- React `19.2.7`
- Supabase Auth, Postgres, RLS, RPCs, and Storage
- Tailwind CSS v4
- Vitest, Playwright packages, ESLint, TypeScript

## Local Commands

```bash
npm run dev
npm run lint
npm run test
npm run build
npm run supabase:start
npm run supabase:stop
npm run db:lint
npm run db:reset
npm run db:types
```

## Main Routes

- Public/auth: `/`, `/login`, `/signup`, `/setup`, `/no-access`
- Dashboards: `/overview`, `/property-dashboard`, `/maintenance-dashboard`,
  `/finance-dashboard`
- Property: `/properties`, `/properties/[propertyId]`, `/units`,
  `/units/[unitId]`, `/amenities`, `/property-inspections`
- People: `/people`, `/tenants`, `/owners`, `/vendors`, `/staff`; `/team`
  redirects to `/staff`.
- Maintenance: `/maintenance`, `/work-orders`, `/schedule`, `/tasks`,
  `/inspections`, `/recurring-tasks`, `/inventory`
- Finance: `/rent-income`, `/bills-expenses`, `/leases`, `/ledger`,
  `/petty-cash`, `/reports`; `/payments` and `/invoices` redirect to the
  current finance queues.
- Timeline: `/timeline`, `/property-timeline`, `/maintenance-timeline`,
  `/financial-timeline`
- Admin/settings: `/settings`, `/users-roles`, `/branding`,
  `/property-settings`, `/lease-settings`, `/maintenance-settings`,
  `/financial-settings`, `/notifications`, `/security`, `/backup-data`,
  `/integrations`
- Data: `/documents`, `/import`
- APIs: `/api/reports/export`, `/api/reports/pdf`

Some routes are deliberate placeholder surfaces while the real modules live in
adjacent pages. See `docs/current-state.md`.

## Documentation

- `PROJECT_RULES.md` is the always-read rule file.
- `docs/current-state.md` maps what exists in code now.
- `docs/engineering-rules.md` explains current architecture and implementation
  rules.
- `docs/verification.md` lists checks and handoff expectations.
- `docs/backup-restore.md` covers the database and Storage recovery procedure.

Old roadmap and starter-build docs were removed. Keep new docs tied to
implemented code.
