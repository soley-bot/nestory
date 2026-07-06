# Engineering Rules

These rules are grounded in the current implementation.

## Architecture

- Use App Router server pages for data-loaded routes.
- Keep auth and organization scope server-side through
  `requireWorkspaceContext` or `requireAdminContext`.
- Use feature-owned modules under `src/features/<feature>` for actions, data,
  filters, components, types, and tests.
- Use shared UI primitives from `src/components/ui` for visible form controls.
- Use `src/lib` for small reusable cross-feature helpers only.
- Read the local Next.js docs under `node_modules/next/dist/docs/` before
  changing Next.js-specific behavior.

## Auth And Routing

- Workspace roles are `admin`, `manager`, and `member`.
- `requireAdminContext` gates admin-only surfaces.
- `requireWorkspaceContext` gates role-aware workspace surfaces.
- Organization subdomain routing is resolved by `getOrganizationSlugFromHost`.
- Localhost and reserved root/app/api/www hosts stay in fallback mode.
- Do not bypass `/setup` or `/no-access` redirects for unlinked users.

## Data Loading

- Server pages call feature data loaders such as `getPropertiesScreenData`,
  `getUnitsScreenData`, `getMaintenanceScreenData`, and
  `getReportsScreenData`.
- Keep filters URL-backed and normalized through feature filter helpers.
- Paginate large operational lists. Do not load unbounded tables into client
  state when a server-backed list already exists.
- Keep detail pages record-rich: property/unit detail should retain linked
  ledger, timeline, documents, maintenance, lease, and owner context.

## Mutations

- Mutations live in server actions.
- Use the existing Supabase RPC boundary for important writes.
- Preserve zod validation around form/action input.
- Revalidate all affected routes after writes. Existing action files show the
  route fanout for each feature.
- Keep archive/restore flows unless the user explicitly asks for hard delete.
- Document uploads must keep storage and metadata rollback behavior.
- Ledger/timeline/document/maintenance writes must preserve linked record and
  activity behavior.

## Database

- Every business table is organization-scoped.
- RLS is expected for business tables.
- Foreign-key and list/search indexes matter; do not remove them casually.
- Exact money fields and currency codes are required.
- Business dates and audit timestamps are separate concepts.
- Private documents live in Supabase Storage with database metadata.
- New schema work must be append-only migrations unless the user explicitly
  asks for a reset or destructive local cleanup.

## UI

- Authenticated pages are working software, not marketing pages.
- Use neutral dense layouts, compact headers, tables, filters, inspectors,
  drawers, badges, and clear record links.
- Dashboard pages may summarize; module pages should prioritize actual records.
- Keep raw UUIDs out of normal operator views.
- Keep long text wrapped or truncated deliberately.
- Prefer icon-first controls for common row/drawer actions with accessible
  labels/titles.
- Do not introduce decorative gradients, oversized cards, or landing-page
  composition into authenticated surfaces.

## Reports And Exports

- Reports are traceable: rows carry source links, source counts, metrics, and
  scoped period/property context.
- Supported report kinds are rent roll, unit performance, property performance,
  owner statement, income/expense, lease expiry, vacancy/risk, maintenance
  cost, and missing data.
- CSV export must remain formula-safe.
- PDF/export endpoints must stay auth-gated.

## Imports

- CSV import supports properties, unit/rent-roll data, people, and leases.
- Keep template download, header mapping, staged import runs, validation
  preview, cleanup queue, recent run history, and safe commit behavior.
- Commits should stay RPC-backed and preserve activity logs.
- Do not silently import invalid or ambiguous property, unit, people, or lease
  rows.

## Placeholder Policy

- Placeholder routes are acceptable navigation scaffolding.
- Do not document a placeholder as a finished module.
- When turning a placeholder into a real module, replace the route with a
  feature-owned implementation and update `docs/current-state.md`.
