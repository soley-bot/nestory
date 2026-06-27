# Nestory Build Goal Prompts

Use these prompts in order. Each goal should start by reading `AGENTS.md`,
`PROJECT_RULES.md`, the relevant local Next.js docs under
`node_modules/next/dist/docs/`, and the task-specific docs named in the prompt.

## Goal 1: Closed Dashboard Operating Loop

```text
We are in D:\nestory. First read AGENTS.md, PROJECT_RULES.md, the relevant local
Next.js docs under node_modules/next/dist/docs/, docs/operational-ui-handoff.md,
and project memory for Nestory Dashboard flow planning.

Goal: build the full closed operating loop across Dashboard -> Properties ->
Units -> Leases -> Ledger -> Timeline.

Every Dashboard card, chart, metric, quick action, and recent-activity item
should land on a destination page with:
1. a real supported URL contract,
2. a parser/data-loader path that honors that contract,
3. a visible review/repair state on the destination screen,
4. selected row or inspector context where appropriate,
5. a clear repair action from that destination,
6. revalidation so Dashboard counts and destination tables update after fixes.

Primary work:
- Unit risk flow: Dashboard unit-risk links should land on Units with clear
  repair actions for missing lease, unoccupied/vacant unit, or bad unit status.
- Lease runway flow: Dashboard lease-ending/expired/missing-tenant links should
  land on Leases with clear renewal/closeout/fix actions.
- Ledger exception flow: Dashboard cash/current-month/high-expense links should
  land on Ledger with filtered rows, selected/inspectable entry, and create/edit
  actions.
- Timeline audit flow: recent activity and timeline actions should land on the
  exact changed record when possible, or a useful filtered review state when not.
- Property health flow: keep owner-link, low-occupancy, and negative-net-income
  paths coherent with Properties, Units, Ledger, and Timeline.

Do not invent route tokens without wiring parser + loader + screen state. Keep
the UI quiet, dense, operational, table-first, and consistent with the
authenticated app.

Verify with npm test, npm run lint, npm run build, and authenticated browser
smoke using local Supabase seed if available.
```

## Goal 2: Unit Operating Record

```text
We are in D:\nestory. First read AGENTS.md, PROJECT_RULES.md, the relevant local
Next.js docs under node_modules/next/dist/docs/, docs/operational-ui-handoff.md,
and project memory for Nestory unit-first MVP planning.

Assume the previous goal wired the closed operating loop:
Dashboard -> Properties -> Units -> Leases -> Ledger -> Timeline.

Goal: make /units/[unitId] the canonical one-click operating record for a unit.

A user should be able to open one unit and understand:
- current occupancy/status,
- current lease,
- tenant/person links,
- rent/revenue history,
- expenses tied to the unit,
- simple unit performance/NOI,
- timeline/maintenance events,
- documents/evidence,
- missing or risky data,
- and the next repair action.

Primary work:
1. Inspect the current /units/[unitId] page, unit detail data loader, unit
   inspector, filters, related actions, and existing schema.
2. Map data already available from Units, Leases, People, Ledger, Timeline, and
   Documents.
3. Build a dense operational unit detail view with identity, property context,
   lease/tenant block, financial summary, ledger history, timeline history,
   documents, health/risk indicators, and repair actions.
4. Wire actions to existing create/edit drawers or related detail pages using
   supported route contracts.
5. Ensure mutations revalidate /overview, /units, /units/[unitId], /leases,
   /ledger, /timeline, /documents, and /reports where relevant.
6. Add focused tests for aggregation, linked record hrefs, summary calculations,
   and any route parsing.

Verify with npm test, npm run lint, npm run build, and authenticated browser
smoke from Dashboard or Units list to a unit detail page.
```

## Goal 3: Reports And Owner/Operator Outputs

```text
We are in D:\nestory. Read AGENTS.md, PROJECT_RULES.md,
docs/complete-app-goals.md, docs/operational-ui-handoff.md,
docs/foundation-checklist.md, and any existing report/export code before coding.

Goal: turn connected unit/property truth into trustworthy reports and exports.

Build reports from the same linked data used by the operating record. Reports
must not be decorative summaries that disagree with Unit, Lease, Ledger, or
Timeline records.

Primary outputs:
- rent roll,
- unit performance,
- property performance,
- owner statement,
- income/expense,
- lease expiry,
- vacancy/risk,
- maintenance cost,
- missing data,
- PDF/CSV export packs where existing export infrastructure supports it.

Primary work:
1. Inspect current Reports, export routes, data loaders, and existing report
   preview assets.
2. Define report data contracts around property, unit, lease, ledger, timeline,
   and documents.
3. Build report filters and drill-through links back to source records.
4. Make report totals traceable to source rows.
5. Add empty/error states for missing data.
6. Add tests for calculations, filters, and exported data shape.

Verify with npm test, npm run lint, npm run build, and browser smoke for at
least one property report, one unit report, and one export path.
```

## Goal 4: Deep Detail Pages And CRUD Completeness

```text
We are in D:\nestory. Read AGENTS.md, PROJECT_RULES.md,
docs/complete-app-goals.md, docs/operational-ui-handoff.md, and
docs/enterprise-lite-database-roadmap.md before coding.

Goal: make the core modules operationally complete, not just list pages.

Deepen detail pages and CRUD for:
- Properties,
- Units,
- Leases,
- People,
- Ledger entries,
- Timeline events,
- Documents.

For each record type, verify:
1. detail page or inspector shows identity, linked records, history, documents,
   risk, and next actions;
2. create/edit/archive/restore is safe and validates business rules;
3. linked create actions preserve context through supported route contracts;
4. mutations write history/activity where appropriate;
5. revalidation updates Dashboard, detail pages, lists, and reports;
6. tests cover business rules and critical route behavior.

Do this in small slices. Prefer one record family at a time if the diff grows.
```

## Goal 5: Documents And Evidence System

```text
We are in D:\nestory. Read AGENTS.md, PROJECT_RULES.md,
docs/complete-app-goals.md, docs/enterprise-lite-database-roadmap.md,
docs/foundation-checklist.md, and existing Documents/Storage code.

Goal: make Documents the evidence layer for the PMS.

Documents should be uploadable, private by default, previewable/downloadable,
categorized, archived, and linkable to:
- properties,
- units,
- leases,
- people,
- ledger entries,
- timeline events,
- maintenance cases,
- reports,
- imports.

Primary work:
1. Audit current storage bucket, document metadata schema, RLS, and UI.
2. Add missing attachment flows from Unit, Lease, Ledger, Timeline, and
   Maintenance contexts.
3. Surface missing-document risks where they affect operations or reporting.
4. Add preview/download/replace/archive behavior where missing.
5. Add tests for linking, permissions, route behavior, and metadata.

Verify with npm test, npm run lint, npm run build, and browser smoke for upload,
attach, preview/download, and archive.
```

## Goal 6: Maintenance And Issues Workflow

```text
We are in D:\nestory. Read AGENTS.md, PROJECT_RULES.md,
docs/complete-app-goals.md, docs/operational-ui-handoff.md, and
docs/enterprise-lite-database-roadmap.md.

Goal: add a real maintenance/issues workflow connected to the operating record.

Maintenance cases should support:
- property/unit link,
- priority,
- status,
- due date,
- vendor/person link,
- cost estimate and actual cost,
- documents/photos,
- timeline events,
- ledger expense link,
- open issue health indicators.

Primary work:
1. Inspect any existing maintenance route, schema, and placeholders.
2. Add the minimum schema/actions/UI needed for operational cases.
3. Connect cases to Unit Operating Record, Property health, Timeline, Ledger,
   Documents, and Reports.
4. Add review filters for open/overdue/high-cost cases.
5. Add tests for status transitions, links, and report inputs.

Verify with npm test, npm run lint, npm run build, and browser smoke from a Unit
detail page through creating or reviewing a maintenance case.
```

## Goal 7: Import And Data Cleanup

```text
We are in D:\nestory. Read AGENTS.md, PROJECT_RULES.md,
docs/complete-app-goals.md, docs/foundation-checklist.md, and any existing
Import module code.

Goal: make old spreadsheet/data import safe and reviewable.

The import flow should detect missing owners, tenants, leases, contacts, rent,
documents, duplicate people, invalid links, and ambiguous units before committing
data.

Primary work:
1. Inspect current Import route/actions/schema.
2. Define staged import records and cleanup queues.
3. Add preview/validation before commit.
4. Route cleanup issues to existing repair flows where possible.
5. Preserve imported source evidence and activity logs.
6. Add tests for validation, duplicate detection, and commit behavior.

Verify with npm test, npm run lint, npm run build, and browser smoke for one
sample import preview and cleanup queue.
```

## Goal 8: Audit And History Hardening

```text
We are in D:\nestory. Read AGENTS.md, PROJECT_RULES.md,
docs/complete-app-goals.md, docs/foundation-checklist.md, and activity log code.

Goal: make business history trustworthy.

Primary work:
1. Audit all important mutations for activity logging and archive/status behavior.
2. Ensure important changes capture actor, before/after values, linked records,
   and business dates where appropriate.
3. Add activity detail/recent activity routes that land on exact records or
   useful review states.
4. Add tests for activity hrefs and log payloads.
5. Make delete behavior explicit and rare; prefer archive/status/history.

Verify with npm test, npm run lint, npm run build, and browser smoke for Recent
Activity -> changed record paths.
```

## Goal 9: Role-Based Access And Portals

```text
We are in D:\nestory. Read AGENTS.md, PROJECT_RULES.md,
docs/complete-app-goals.md, docs/enterprise-lite-database-roadmap.md, and
docs/foundation-checklist.md.

Goal: add role-based access after the single-Admin operating system is solid.

Do not overbuild. Start with the minimum role model and prove it with tests.

Future roles:
- Admin,
- Manager/Operator,
- Accountant,
- Owner viewer,
- Tenant viewer,
- Vendor/Maintenance.

Primary work:
1. Design organization membership roles and action permissions.
2. Add RLS policies, route guards, and server-action authorization.
3. Add role-aware navigation and empty/denied states.
4. Add owner/tenant/vendor portal surfaces only after permission boundaries are
   proven.
5. Add role-based browser/API probes.

Verify with npm test, npm run lint, npm run build, RLS checks, and browser smoke
for each supported role.
```

## Goal 10: Production Readiness And Onboarding

```text
We are in D:\nestory. Read AGENTS.md, PROJECT_RULES.md,
docs/complete-app-goals.md, docs/foundation-checklist.md, docs/project-state.md,
and current Vercel/Supabase setup.

Goal: make Nestory packageable as a property management system.

Primary work:
1. Verify Vercel project link, env vars, preview deploy, production deploy, and
   logs using Vercel CLI.
2. Verify Supabase auth, RLS, storage policies, backups, and seed/demo setup.
3. Add onboarding/setup flow for a new organization.
4. Add smoke scripts for critical flows.
5. Add operator handoff docs: setup, import, daily use, reporting, backup, and
   troubleshooting.
6. Run final local, preview, and production verification.

Definition of done:
- A fresh operator can set up an organization, enter/import records, use the
  Dashboard, repair issues, attach evidence, and produce reports.
- Deployment, logs, env, auth, storage, and backup checks are repeatable.
```
