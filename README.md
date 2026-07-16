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
npm run test:ui-coverage
npm run test:ui-copy
npm run test:ui-redesign
npm run test:ui-a11y
```

## Main Routes

- Public/auth/system: `/`, `/login`, `/signup`, `/setup`, `/no-access`,
  `/workspace`
- Overview and record detail: `/overview`, `/properties/[propertyId]`,
  `/units/[unitId]`, `/people/[personId]`
- Properties and units: `/properties`, `/units`
- People and leases: `/people`, `/owners`, `/staff`, `/tenants`, `/vendors`,
  `/leases`, `/people-reports`
- Finance: `/rent-income`, `/bills-expenses`, `/ledger`, `/petty-cash`
- Maintenance: `/maintenance`, `/tasks`, `/recurring-tasks`, `/inspections`,
  `/work-orders`
- Records: `/timeline`, `/financial-timeline`, `/maintenance-timeline`,
  `/property-timeline`, `/documents`, `/import`
- Reports: `/reports`, `/reports/[reportKind]`
- Settings/access: `/settings`, `/users-roles`, `/account`
- Preserved legacy entries: `/property-dashboard`, `/finance-dashboard`,
  `/maintenance-dashboard`, `/payments`, `/invoices`, `/schedule`, `/team`
  redirect to their current workspaces while retaining incoming query values.
- APIs: `/api/workspace-search`, `/api/reports/export`, `/api/reports/pdf`,
  `/api/people-reports/export`, `/api/people-reports/pdf`

`config/ui-route-coverage.json` is the executable route inventory. The latest
local redesign evidence is in `docs/verification/ui-redesign-evidence.md`.

## Documentation

- `PROJECT_RULES.md` is the always-read rule file.
- `docs/current-state.md` maps what exists in code now.
- `docs/engineering-rules.md` explains current architecture and implementation
  rules.
- `docs/verification.md` lists checks and handoff expectations.
- `docs/frontend-quality-checklist.md` defines the operational UI contract.

Old roadmap and starter-build docs were removed. Keep new docs tied to
implemented code.
