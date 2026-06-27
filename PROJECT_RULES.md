# Nestory Project Rules

Nestory is a web-first Property History and Performance Hub for property
management companies, starting with Cambodia operations and growing toward a
broader PMS. This is the compact, always-readable rule set. Keep dated facts and
deep checklists in owner docs instead of here.

Product goal:

> Show the complete history and performance of a property or unit in one place.

## Context Budget

- Read this file first for product and engineering guardrails.
- Read `docs/project-state.md` only for current environment, hosted service,
  deployment, or verification facts.
- Read `docs/operational-ui-handoff.md` only for authenticated UI work.
- Read `docs/enterprise-lite-database-roadmap.md` only for schema, RLS, storage,
  or future PMS module design.
- Read `docs/complete-app-goals.md` for final product scope, build order, or
  roadmap decisions.
- Read `docs/foundation-checklist.md` only before verification, auth,
  Supabase, Vercel, or environment changes.
- Do not duplicate long checklists across docs. Link to the owner doc instead.

## Product Direction

- Web-first and desktop-optimized; mobile must remain usable.
- Timeline-First Record Room is the north star.
- Working pages should feel quiet, neutral, dense, operational, and trustworthy.
- Prefer tables, filters, inspectors, clear icons, readable records, and fast
  repeated workflows.
- Avoid decorative dashboards, gradients, oversized cards, and marketing-style
  layouts on authenticated work surfaces.
- Overview is the exception: it is a calm decision dashboard that answers "what
  needs attention and why?" before sending users into records.
- Build one phase at a time. Do not build the full PMS before the record-room
  foundation is reliable.

## Reusable PMS Core

Build Nestory as a reusable core, not a copied codebase per property company.

Core modules should stay company-agnostic:

- Properties and units.
- Timeline and Ledger.
- People, owners, vendors, tenants, leases, terms, and occupancies.
- Documents and photos.
- Activity logs.
- Reports, exports, imports, and settings.

Company-specific behavior should be configuration or bounded extensions:

- Branding, organization settings, currency display, report templates, numbering
  rules, workflow steps, approval rules, and integrations.
- Do not hardcode one company's terminology, report layout, or workflow into
  core modules when it could reasonably become organization settings later.

## Scope And Roadmap

Early constraints stay in place until explicitly changed:

- One `Admin` role.
- Simple UI.
- Archive over delete.
- Activity logging.
- USD/KHR support.
- Server/RPC write boundaries for important mutations.
- Reusable components and feature-owned modules.

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

The full target product and copy-paste build prompts live in
`docs/complete-app-goals.md` and `docs/build-goal-prompts.md`.

## Data Rules

- Every business table should be organization-scoped.
- Prefer columns such as `organization_id`, `property_id`, `unit_id`,
  `created_at`, `created_by`, `updated_at`, `updated_by`, `archived_at`, and
  `archived_by` where relevant.
- New PMS tables must follow the database roadmap: RLS plus explicit grants,
  exact money, distinct business dates and audit timestamps, indexed foreign
  keys, private storage, and append-only migrations.
- Do not build future tenant, payment, or portal workflows around free-text
  tenant names. Use durable people, tenant, lease, and occupancy identity.

## Write And History Rules

- Use server-side mutations for writes.
- Use RPCs for changes that affect history, money, documents, archive/restore,
  ledger locks, linked records, or activity logs.
- Important business changes should write an activity log entry in the same
  transaction where practical.
- Use database constraints for required relationships and uniqueness.
- Avoid duplicate submissions, client-only validation as the only protection,
  unsafe multi-step linked updates, and client-only critical totals.
- Hard deletes are rare; preserve business history through archive/status fields
  unless an explicit maintenance cleanup requires otherwise.

## Money, Dates, And Storage

- Support USD and KHR.
- Do not store money as loose JavaScript floats. Use exact database types and a
  currency code for every amount.
- Keep business dates such as `event_date`, `lease_start_date`,
  `lease_end_date`, and `transaction_date` distinct from audit timestamps.
- Cambodia local-date expectations matter, but avoid hardcoding assumptions that
  block future company-specific timezones or reporting calendars.
- Use Supabase Storage for uploaded documents/photos and database rows for
  metadata. Keep business documents private by default.

## UI Rules

- Apply `docs/operational-ui-handoff.md` before changing authenticated list,
  table, card, inspector, or photo-ready record surfaces.
- Timeline and Ledger are working tables, not landing pages.
- Keep primary records visible early in the viewport.
- Use side drawers for create, edit, archive, restore, attachment, period-lock,
  and activity-detail workflows.
- Recent changes is secondary audit context; keep it from taking over primary
  record pages.
- Hide raw UUIDs from normal operator views.
- Design mobile-first even though desktop is the main operating context.
- Long labels, titles, descriptions, file names, and linked records must wrap or
  truncate deliberately.
- Use shared Nestory/Radix controls for polished selects, dates, and accounting
  months.

## Code Organization

- Follow `AGENTS.md` before editing Next.js code. This repo may use newer
  Next.js APIs and conventions than old assumptions suggest.
- Keep feature-specific UI, queries, actions, validation, types, and helpers
  inside `src/features/<feature>` until real reuse appears.
- Keep shared primitives boring and practical under `src/components/*` and
  `src/lib/*`.
- Avoid dumping-ground files such as giant `utils.ts`, `types.ts`, or
  `constants.ts`.
- Review files above 250-400 lines for splitting; 400+ lines should usually be
  refactored unless the structure is intentionally simple.
- Prefer server-first data fetching, URL search params for filters, local state
  for small interactions, and simple form state. Add heavier state only when the
  product has a clear need.

## Testing And Verification

- Test business logic as it appears: filters, permissions, occupancy, totals,
  currency formatting, lease expiry, archive/restore, and import validation.
- Use `docs/foundation-checklist.md` before or after changes to auth, routing,
  Supabase policies, Vercel config, environment variables, or new product
  modules.
- Run app build/test only when code or config changes justify it. Docs-only
  changes can use `git diff --check` and focused read-through.

## Documentation Rule

When a change updates architecture, database policy, product scope, UI rules, or
deployment assumptions, update the smallest relevant doc in the same session.
Keep always-read docs concise; put deep details in the specialized owner doc.
