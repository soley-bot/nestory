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
- Public signup and workspace setup are disabled. Unlinked authenticated users
  go to `/no-access`; only the server-only provisioning command may create a
  client organization and its pending first-admin invitation.
- Supabase Auth owns identities, verified email, passwords, recovery, sessions,
  and JWTs. Nestory owns invitation intent, role/scope/staff linkage,
  acceptance, revocation, membership, and audit history.
- Never create an active membership before a matching verified user explicitly
  accepts the pending invitation.

## People And Workspace Access

- A Staff record is the operational person identity. Workspace Access is a
  separate sign-in grant linked to Staff; an Access Level (`admin`, `manager`,
  or `member`) and Scope describe authorization.
- Operational responsibility is not an Access Level. The current schema and
  route/RLS model enforce module-specific assignments where implemented, but
  do not provide a general maintenance/finance/property-operations
  responsibility model. Do not add a decorative responsibility field without
  database enforcement, RLS, route access, query filtering, navigation, and
  backward-compatible tests.
- Reuse the existing invitation and membership RPC boundaries. Do not implement
  Staff access through direct browser writes or a second invitation path.
- Role-specific Owner, Tenant, Staff, and Vendor forms may share components and
  the `people` record, but must not expose unrelated fields or imply that a
  People role grants Workspace Access.
- Person selectors must filter active roles at an organization-scoped,
  authoritative query or RPC boundary. Preserve historical linked values for
  existing records without offering archived or ineligible people for new
  assignments.

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
- Keep property obligations separate from settlement events. Cash reporting
  uses receipt and payment dates; future accrual reporting uses charge and
  invoice dates.
- Security deposits and owner contributions do not count as property operating
  income.
- Do not add management-company payroll, overhead, P&L, general-ledger, tax, or
  ERP UI.

## UI

- Authenticated pages are working software, not marketing pages.
- Use neutral dense layouts, compact headers, tables, filters, quick views,
  drawers, badges, and clear record links.
- Keep list workspaces structurally consistent: compact title/primary action,
  URL-backed tools, full-width record content, a compact record quick view,
  then a side drawer for create/edit/lifecycle work.
- Do not reserve persistent side-inspector space beside operational tables.
  For Properties and Units, single-click, Enter, or Space opens the shared
  modal quick view. Double-click has no special behavior. Escape, backdrop, and
  the close control dismiss the quick view and return focus to its originating
  row or card. Where a true detail route exists, open it only through the
  clearly labelled full-record action inside the quick view; do not invent
  detail routes for modules that lack one.
- Dirty create/edit/lifecycle drawers use the shared centered confirmation dialog
  for the close control, backdrop, Escape, and form cancellation. Cancelling the
  decision restores focus to the initiating drawer control; confirmed discard
  closes through the existing form boundary. A save-in-progress close attempt
  must show the continue-waiting state and must not offer destructive discard.
- Keep one global `Search or jump` command surface. Navigation actions may be
  client-known; entity results must remain organization/role scoped through the
  server search boundary. Do not expose raw UUIDs in results or URLs shown as
  labels.
- Settings uses three zones: local settings navigation, the active workspace,
  and the shared draft action/status area. Do not create a separate save model
  for individual settings pages.
- Label ordinary actions directly. Add explanation only for risk, consequence,
  permission, unfamiliar domain meaning, or handoff. Consequential actions must
  identify the affected record/scope and the operational effect before submit.
- Dashboard pages may summarize; module pages should prioritize actual records.
- Keep raw UUIDs out of normal operator views.
- Keep long text wrapped or truncated deliberately.
- Prefer icon-first controls for common row/drawer actions with accessible
  labels/titles.
- Do not introduce decorative gradients, oversized cards, or landing-page
  composition into authenticated surfaces.
- Use shared loading, empty, filtered-empty, error/retry, permission, draft,
  saving, and success primitives. Every route state declared in
  `config/ui-route-coverage.json` must name concrete evidence.

## Reports And Exports

- Reports are traceable: rows carry source links, source counts, metrics, and
  scoped period/property context.
- Supported report kinds are rent roll, unit performance, property performance,
  owner statement, income/expense, lease expiry, vacancy/risk, maintenance
  cost, missing data, and People readiness.
- People readiness remains a separate trusted-report row schema under
  `/reports/people-readiness`; do not mix Person rows into property/unit Record
  Readiness. Normalize its bounded `peopleView` and `archiveState` filters,
  page through the authoritative People loader, and keep Staff access state at
  the organization-scoped Workspace Access boundary.
- CSV export must remain formula-safe.
- PDF/export endpoints must stay auth-gated.

## Imports

- CSV import supports properties, unit/rent-roll data, people, and leases.
- Keep template download, header mapping, staged import runs, validation
  preview, cleanup queue, recent run history, and safe commit behavior.
- Commits should stay RPC-backed and preserve activity logs.
- Do not silently import invalid or ambiguous property, unit, people, or lease
  rows.

## Documentation And Verification

- `docs/current-state.md` describes merged behavior on `main`; do not include an
  open branch or unmerged pull request as implemented product state.
- When a shared interaction contract changes, update `docs/current-state.md`,
  this file, relevant browser scripts, route evidence, and focused tests in the
  same release boundary.
- A stale smoke script is not release evidence. Mark it explicitly and use a
  current focused browser check until the script is realigned.
- Keep historical dated plans/specifications as historical context; they do not
  override the current code, current-state document, or verification guide.

## Placeholder Policy

- Placeholder routes are acceptable navigation scaffolding.
- Do not document a placeholder as a finished module.
- When turning a placeholder into a real module, replace the route with a
  feature-owned implementation and update `docs/current-state.md`.
