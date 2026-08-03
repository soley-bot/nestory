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
- `lease_terms` is the rent-term authority. The duplicated dates and rent
  values on `leases` are compatibility projections only; application writes,
  imports, and stale clients must use the checked lease/term RPCs and must not
  restore `leases -> lease_terms` synchronization.
- Lease responsibility, unit occupancy, and named Person residence are
  separate facts. Keep party, occupancy, and participant evidence typed by
  evidence state, business lifecycle, source, boundary kind/confidence,
  lineage, and actor/time/reason. Only accepted sufficiently known ranges may
  participate in overlap exclusions; `legacy_unresolved` rows stay
  non-authoritative until a checked promotion workflow exists.
- Brand-new Lease writes must use the checked relationship composition and
  return the exact Lease, party, occupancy, and participant identities.
  Compatibility-trigger rows are adopted, never duplicated. Direct
  relationship DML stays denied, and existing-Lease relationship changes stay
  fail-closed until their impact contract and transition workflows are
  implemented.
- Authoritative term mutations require explicit due day and frequency,
  payload-bound idempotency, organization/lease scope checks, non-overlapping
  effective ranges, activity history, and Plan 03 property-period authority
  for every affected month. Preserve historical term identity through
  supersession instead of rewriting material history.
- Rent policy uses normalized, effective-dated `rent_policy_versions`.
  Unresolved rules may exist only in drafts; approval requires a complete
  explicit policy, and approved rows are immutable. Do not replace this with a
  generic JSON settings blob or infer IPS defaults.
- Automated rent generation remains blocked until Plan 09 consumes the exact
  resolved term and policy identities. Readiness from compatibility rent alone
  is never sufficient.
- Keep property obligations separate from settlement events. Cash reporting
  uses receipt and payment dates; future accrual reporting uses charge and
  invoice dates. Existing management-fee compatibility evidence is read-only
  and shown once under owner/property Expenses with IPS as vendor for
  disclosure only; it does not establish recognition or owner-deduction
  timing. Any existing company-book projection is backend compatibility
  evidence only; it authorizes no product view, new recognition/write path,
  or dual-write.
- A Plan 05 owner-state preview for receipt or reversal must bind the proposed
  cash-action date and return every distinct source and destination
  property-period scope in deterministic order. Never derive a cash-action
  lock only from the obligation due date. Retained legacy allocations must
  fall back to their non-null receipt header rather than emitting null scope
  material.
- Reserved receipt-allocation Ledger projections are Rent & Income evidence,
  not manual rows. Keep edit/archive/restore controls off those rows, and
  compare a negative contra-income Ledger amount to positive balanced journal
  controls by magnitude in finance diagnostics.
- Journal-linked manual Ledger rows are append-only after creation. The
  current Ledger edit/archive paths do not atomically correct their accounting
  journals, so keep edit/archive/restore controls off every such row until a
  checked reversal-and-replacement authority exists.
- Security deposits and owner contributions do not count as property operating
  income.
- Existing owner contributions remain read-only Owner funding outside Tenant
  Income until a checked contribution authority exists. Only qualified,
  reversal-aware canonical allocation events may enter an Owner Preview;
  unallocated or ambiguously attributed rows are disclosure-only blockers.
- Finance has one visible owner/property perspective. The target shows a
  management fee once under Expenses with IPS as vendor; do not add a
  management-company fee report, duplicate entry, or a generic perspective
  selector. Preserve the current fee compatibility source as read-only and
  disclosure-only until the dedicated `management_fee_assessment` authority
  exists, and never dual-write or move it blindly into generic expense
  storage.
- Owner payments never use the generic property-expense form or totals.
  Preserve existing rows as read-only evidence until a checked
  owner-distribution authority exists, and apply the same qualified canonical
  allocation rule before any row enters an Owner Preview.
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
  Single-click or Enter opens the shared modal quick view. Escape, backdrop,
  and the close control dismiss it and return focus to the opener. Where a true
  detail route exists, retain an explicit record link and allow double-click as
  a pointer shortcut; do not invent detail routes for modules that lack one.
- Finance routes go further: use centered modals for short money actions, the
  shared `SideDrawer` for multi-step setup or longer conditional forms, and an
  existing dedicated detail page for full account history. Do not add a side
  inspector. Replace multi-card metric grids with one compact totals line above
  the operational table.
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

- The public report surface is limited to Monthly Unit Profit & Loss, Owner
  Statement, and Management Fee Statement.
- Reports remain traceable: rows carry source links and scoped period/property
  context. If the screen payload bounds source links, preserve the full source
  count/summary and disclose the omitted count in the row. Do not add library
  cards, report packets, source-count decoration, or new report kinds without
  an approved reporting requirement.
- Unit Profit & Loss uses resolved unit-linked operating income and expense
  effects from `get_property_cash_events_v1_page`, preserves reversal signs,
  and must fail closed on deposit, owner-funding, company-fee, property-level,
  or unresolved classifications.
  Do not allocate property-level rows to units without an approved allocation
  rule. Management Fee Statement remains defined but unavailable until
  owner-recognition authority exists. Legacy fee receipt allocations, earned
  estimates, and outstanding estimates are not publishable substitutes.
- Do not export Owner Statement until opening and closing owner balances are
  authoritative. Never infer those balances from an incomplete source model.
- PDF and Excel are the public export choices and must remain auth-gated. The
  CSV compatibility endpoint must remain formula-safe.

## Imports

- CSV import supports properties, unit/rent-roll data, people, and leases.
- Keep template download, automatic/saved header mapping, staged import runs,
  row validation, and safe commit behavior.
- The main UI uses one ready-row import action. Each submit must claim the run
  from a server-owned SHA-256 identity over a versioned contract, organization
  scope, type, ordered headers and mapping, and ordered raw records. File
  metadata, client draft state, and reference-derived validation or normalized
  fields are not identity inputs. `stage_import_run_v1` computes both the raw
  claim and exact semantic snapshot in PostgreSQL and must insert the
  server-generated run, every row, and SQL-derived counts in one transaction.
  A duplicate claim must verify its organization, type, headers, mapping, and
  ordered raw row set. Reuse an identical clean staged snapshot; atomically
  replace a clean staged run with a new server UUID when reference-derived
  semantics change; never replace a committing, terminal, or provenance-linked
  run. Staging and commit must take the same claim advisory lock before the run
  row lock. Commit only rows accepted by the checked RPC boundary and reconcile
  stored committing or terminal summaries without replaying a terminal commit
  RPC. Legacy non-atomic staged runs must fail closed and require re-upload.
- Keep mapping diagnostics, fix downloads, and past runs secondary to the main
  flow rather than restoring separate setup, preview-save, and commit steps.
- Commits should stay RPC-backed and preserve activity logs.
- Lease import commits must persist the exact normalized Lease, party, and
  occupancy result IDs returned by the checked relationship composition.
- Do not silently import invalid or ambiguous property, unit, people, or lease
  rows.

## Placeholder Policy

- Placeholder routes are acceptable navigation scaffolding.
- Do not document a placeholder as a finished module.
- When turning a placeholder into a real module, replace the route with a
  feature-owned implementation and update `docs/current-state.md`.
