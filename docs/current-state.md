# Current State

Last rebuilt from code inventory on 2026-07-02. This file describes what is
implemented now. It is not a roadmap or early-stage plan.

## Product Baseline

Nestory is a multi-module property operations app. The implemented core covers:

- Workspace auth, setup, organization membership, roles, and subdomain-aware
  workspace lookup.
- Desktop-first authenticated shell with role-aware navigation.
- Overview and module dashboards.
- Property and unit operating records.
- People directory split into tenants, owners, vendors, and staff.
- Lease operations with normalized tenant/person and lease backbone records.
- Ledger operations, timeline history, period locks, and document attachment.
- Maintenance requests, work orders, schedule, tasks, inspections, recurring
  work, reminders, assignment, and status changes.
- Dedicated property/unit photo records with private photo storage and cover
  thumbnail selection.
- Private document storage and document metadata.
- CSV unit import with mapping, validation, create/update commit, and cleanup
  queue.
- Traceable reports and CSV/PDF endpoints.
- Organization branches, teams, users, roles, and access management.

## Route Map

Public and auth:

- `/` renders the marketing/public entry.
- `/login`, `/signup`, `/setup`, `/no-access` handle auth and workspace access.
- `/auth/callback`, `/auth/confirm` handle Supabase auth callbacks.

Core dashboard shell:

- `/overview` loads dashboard attention and portfolio context.
- `/property-dashboard`, `/finance-dashboard`, and some planned settings or
  timeline routes use the placeholder dashboard/detail surface.
- `/maintenance-dashboard` is a real maintenance summary using maintenance data.

Property and units:

- `/properties` is a server-loaded operational list with filters, table/card
  selection, create/edit/archive/restore drawers, and inspector context.
- `/properties/[propertyId]` is a detail record with photos, units, leases,
  ledger, timeline, documents, maintenance, owner history, health, and next
  actions.
- `/units` is a server-loaded list with filters, table/card selection,
  create/edit/archive/restore drawers, and inspector context.
- `/units/[unitId]` is a detail record with photos, lease, ledger, timeline,
  documents, maintenance, health, financial summary, and next actions.

People and leases:

- `/people` is the all-roles people directory.
- `/tenants`, `/owners`, `/vendors`, and `/team` reuse the people module with
  role-specific copy, create defaults, search, and access-status display for
  staff.
- `/leases` supports lease list, filters, create/update/archive/restore, linked
  tenant/person data, terms, occupancy, deposits, documents, timeline context,
  risk, and next actions.

Finance and history:

- `/ledger` supports income/expense records, filters, create/update/archive,
  restore, period locks, receipt attachment, and linked timeline/document
  context.
- `/timeline` supports event filters, create/update/archive/restore, document
  attachment, linked ledger context, and activity display.
- `/payments` redirects to `/ledger?direction=income`.

Maintenance operations:

- `/maintenance` is the request/inbox surface.
- `/work-orders` uses the board surface.
- `/schedule` uses the agenda/calendar surface.
- `/tasks` uses the board/task surface with role-aware assignment controls.
- `/inspections` uses the checklist surface.
- `/recurring-tasks` uses the routine surface.
- Maintenance also has workload, reminder, drawer, document, ledger, and
  timeline linkage behavior in feature components and actions.

Documents, imports, and reports:

- `/documents` manages private business document metadata and upload/replace,
  archive/restore, and links to property/unit/lease/ledger/timeline/task.
- `/import` handles CSV unit imports with template download, mapping, preview,
  validation, cleanup queue, and commit via unit RPCs.
- `/reports` supports rent roll, unit performance, property performance, owner
  statement, income/expense, lease expiry, vacancy/risk, maintenance cost, and
  missing-data reports.
- `/api/reports/export` and `/api/reports/pdf` expose report export endpoints.

Settings and access:

- `/settings` manages organization structure: branches and teams.
- `/users-roles` manages software access, roles, staff/person links, branches,
  and existing-user access invites.
- `/account` shows the signed-in user's workspace profile.

Placeholder routes:

- Placeholder modules currently include amenities, property inspections,
  inventory, invoices, petty cash, specialized timelines, branding, module
  settings, notifications, security, backup/data, integrations, and some
  dashboard variants. Treat these as navigation scaffolding, not complete
  product modules.

## Database Shape

Supabase migrations define organization-scoped tables with RLS, indexes, and
RPC write boundaries. Current table families include:

- Access: `organizations`, `organization_members`,
  `organization_branches`, `organization_teams`.
- Property core: `properties`, `units`.
- People and lease backbone: `people`, `person_roles`, `person_contacts`,
  `property_owners`, `vendor_profiles`, `leases`, `lease_parties`,
  `lease_terms`, `lease_occupancies`, `lease_deposits`.
- Finance and history: `ledger_entries`, `ledger_period_locks`,
  `timeline_events`, `activity_logs`.
- Media and documents: `asset_photos` plus private `nestory-photos`, and
  `documents` plus private `nestory-documents`.
- Maintenance: `tenant_requests`, `tasks`.

Implemented RPC families include:

- Workspace bootstrap and access-member lookup/invites.
- Property, unit, person, lease, document, ledger, timeline, and maintenance
  create/update/archive/restore.
- Ledger period locking.
- Maintenance assignment and task status/update.
- Branch and team creation.
- Document link validation and property primary-owner sync.

## Feature Ownership

- Auth and setup: `src/features/auth`, `src/lib/auth`.
- App shell and layout: `src/components/layout`.
- Properties: `src/features/properties`.
- Units: `src/features/units`.
- Photos: `src/features/photos`.
- People: `src/features/people`.
- Leases: `src/features/leases`.
- Ledger: `src/features/ledger`.
- Timeline: `src/features/timeline`.
- Maintenance: `src/features/maintenance`.
- Documents: `src/features/documents`.
- Imports: `src/features/imports`.
- Reports: `src/features/reports`.
- Organization settings/access: `src/features/organization`.
- Activity/recent changes: `src/features/activity`.

## Test Coverage Areas

Tests currently cover filters, search param validation, date helpers, money
totals, record selection, property/unit summary and detail, people filters,
lease summaries, ledger summaries/filters, timeline filters, maintenance
filters/checklists/summary/notifications, imports, reports/export, auth tenant
host parsing, and schema-error helpers.
