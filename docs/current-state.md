# Current State

Last rebuilt from code inventory on 2026-07-21. This file describes what is
implemented now. It is not a roadmap or early-stage plan.

## Product Baseline

Nestory is a multi-module property operations app. The implemented core covers:

- Invite-only workspace auth, organization membership, roles, and
  subdomain-aware workspace lookup.
- Responsive authenticated shell with role-aware navigation, a collapsible
  desktop rail, and global search/jump behavior.
- Overview with domain lenses and module workspaces.
- Property and unit operating records.
- People directory split into tenants, owners, vendors, and staff.
- Lease operations with normalized tenant/person and lease backbone records.
- Ledger operations, timeline history, period locks, and document attachment.
- Rent & Income operations for expected and received incoming money before
  confirmed rows post into the ledger.
- Bills & Expenses operations for outgoing bills and expense approvals before
  approved rows post into the ledger.
- A compatibility accounting kernel retained behind existing operational
  finance workflows pending a separate retirement decision. It is not exposed
  as management-company accounting, general-ledger, or ERP product UI.
- Maintenance cases with request intake, work orders, calendar scheduling,
  inspections, recurring templates, reminders, assignment, and status changes.
- Dedicated property/unit photo records with private photo storage and cover
  thumbnail selection.
- Private document storage and document metadata.
- CSV unit import with mapping, validation, create/update commit, and cleanup
  queue.
- Traceable reports and CSV/PDF endpoints.
- Organization branches, teams, users, roles, and access management.

## Interface Model

- The authenticated shell keeps a collapsible global navigation rail,
  account/theme controls, page context/tools, and one `Search or jump` command
  trigger consistent across modules. Command search offers quick access and a
  dedicated page-jump mode, then searches role-scoped properties, units,
  people, leases, maintenance cases/tasks, and documents on the server without
  exposing raw identifiers.
- Operational list pages use the same anatomy: compact page context and primary
  action in the shared command bar, URL-backed workspace tools, full-width
  record content, a compact modal quick view for secondary context, and a side
  drawer for create/edit/lifecycle work. List pages do not reserve a persistent
  side inspector. Row click or Enter opens the quick view; Properties and Units
  also use double-click as a shortcut to their existing detail routes while
  retaining explicit record links for keyboard and touch access.
- Settings uses three zones: local settings navigation, the active settings
  workspace, and a persistent draft action area for save/discard/status. Access
  management follows the same draft and consequence conventions.
- Copy names ordinary controls directly. Extra explanation is reserved for
  risk, consequence, permission, unfamiliar domain meaning, or a handoff. Archive,
  restore, import, and other consequential actions show record scope and effect
  before submission and a specific outcome afterward.
- Shared loading, empty, filtered-empty, error/retry, permission, draft, saving,
  and success states use the same state primitives across route families.

## Route Map

Public and auth:

- `/` renders the marketing/public entry.
- `/login` provides password sign-in only. `/forgot-password` and
  `/update-password` use Supabase recovery sessions. `/accept-invite` reviews
  and accepts a Nestory invitation after Supabase verifies the invited email.
- `/signup` is a retired redirect to `/login`. `/setup` cannot provision a
  workspace and sends authenticated users to `/no-access`.
- `/workspace` is a concise authenticated organization entry surface with one
  role-aware continuation link to `/overview` for admins, `/maintenance` for
  managers, or `/tasks` for members. Users without a matching membership go
  to `/no-access`; they cannot create an organization from a public route.
- `/auth/callback`, `/auth/confirm` handle Supabase auth callbacks.

Core dashboard shell:

- The shell command palette searches navigation actions immediately and queries
  organization-scoped properties, units, and people after the minimum search
  length. Keyboard focus is trapped while open and restored on close.
- `/overview` provides cash-basis property performance with Portfolio,
  Property finance, Leasing, Maintenance, and Records lenses. Portfolio ranks
  properties by cash income, paid property expenses, net cash, collection
  rate, arrears, management fees, and reporting readiness. Period, property,
  review, and Property finance subview state is URL-backed.
- `/overview/attention` and `/overview/readiness` are breadcrumb detail pages
  reached from the compact dashboard summaries. Overview drill-downs use full
  pages instead of modal, drawer, or inspector overlays.
- `/property-dashboard`, `/finance-dashboard`, and `/maintenance-dashboard`
  redirect to the consolidated Overview lenses for legacy links and preserve
  incoming query values unless the destination reserves that key.

Property and units:

- `/properties` is a server-loaded operational list with filters, table/card
  quick view, create/edit/archive/restore drawers, and direct detail navigation.
- `/properties/[propertyId]` is a detail record with photos, units, leases,
  ledger, timeline, documents, maintenance, owner history, health, and next
  actions.
- `/units` is a server-loaded list with filters, table/card quick view,
  create/edit/archive/restore drawers, and direct detail navigation.
- `/units/[unitId]` is a detail record with photos, lease, ledger, timeline,
  documents, maintenance, health, financial summary, and next actions.

People and leases:

- `/people`, `/tenants`, `/owners`, `/vendors`, and `/staff` reuse one dense
  People workspace with local relationship lenses, URL-backed filters,
  direct table/card record links, and create/edit/archive/restore drawers. The
  list workspace does not reserve a side inspector; full person context lives
  on the person detail route. `/people` places its cross-role readiness summary
  behind a compact overview popover, while each alias opens its matching lens
  and create default; Staff also shows software-access status. `/team`
  redirects to `/staff` for legacy links.
- `/people-reports` is a People-domain report hub with CSV/PDF exports for
  relationship, tenant, owner, vendor, and staff readiness.
- `/leases` supports lease list, filters, create/update/archive/restore, linked
  tenant/person data, terms, occupancy, deposits, documents, timeline context,
  risk, and next actions.

Finance and history:

- `/rent-income` supports expected and received incoming money across rent,
  deposits, reimbursements, parking, late fees, owner contributions, company
  revenue compatibility categories, and other income. Leases can generate
  idempotent monthly rent charge rows for active/notice leases. Confirmed
  receipts post into the official ledger; property reporting excludes deposits
  and owner contributions from operating income.
- `/bills-expenses` supports outgoing vendor bills, maintenance, utilities,
  supplies, owner payouts, refunds, and other property expenses. Approved
  obligations can be settled through dated payments and allocations.
- `/ledger` supports income/expense records, filters, create/update/archive,
  restore, period locks, receipt attachment, month-close workflow queues, and
  linked timeline/document context. Posted rows carry source metadata for
  manual, rent/income, bills/expenses, petty cash, and maintenance origins.
  Journal linkage remains an internal compatibility concern rather than an
  operator-facing general-ledger product.
- `/petty-cash` supports the IPS-style PM petty cash workflow: cash accounts,
  monthly register periods, advances, cash-in rows, expense rows, running
  balance, receipt references, owner-reimbursable handling, month rollover, and
  posting cleared cash expenses into the official ledger.
- `/timeline`, `/property-timeline`, `/maintenance-timeline`, and
  `/financial-timeline` support scoped event filters, date and unit filtering,
  create/update/archive/restore, document attachment, linked ledger context,
  and activity display.
- `/payments` redirects to `/rent-income` for legacy links.
- `/invoices` redirects to `/bills-expenses` for legacy links.

Maintenance operations:

- `/maintenance` is the cases workspace with inbox, list, board, calendar,
  templates, and report links over the existing maintenance records.
- `/work-orders` remains a legacy board route.
- `/schedule` redirects to `/maintenance?view=calendar` for legacy links.
- `/tasks` uses a compact My Work list for members and role-aware assignment
  controls for administrative workspaces.
  Members without a linked staff profile see a setup-required state instead of
  an ambiguous empty queue.
- Maintenance cases expose a role-aware workflow header over the existing task
  record. Executable linked-member assignments use member start, checklist,
  block/resume, submission, and manager review. Unassigned, vendor, and legacy
  offline assignments use explicit manager-coordinated start, block/resume, and
  completion controls without imitating member submission or posting finance.
  Submitted member work remains operationally open in a dedicated
  completion-review queue and no longer generates member execution reminders.
- Actual-cost capture is separate from official financial posting: managers can
  record actual cost, while only administrators can link or post the ledger
  effect. Checklist and current-blocker gaps are advisory at completion review;
  missing actual cost is warned only when a positive estimate exists, and
  evidence/document warnings are outside this phase.
- `/inspections` uses the checklist surface.
- `/recurring-tasks` uses the routine surface and is labeled Recurring Work in
  nav.
- Maintenance also has workload, reminder, drawer, document, ledger, and
  timeline linkage behavior in feature components and actions.
- Admins retain full linked-record and evidence-upload navigation. Managers and
  members receive the same operational labels without predictable links to
  admin-only destinations. Member task payloads omit mutable organization-wide
  option collections, documents, and signed document URLs.
- Maintenance capabilities distinguish operational actual-cost capture from
  official finance posting: admins can do both, managers can record actual cost
  without linking or posting a ledger effect, and members can do neither.
- Maintenance tasks support `ready_for_review` and a nullable, validated
  `blocked_reason`. Checked RPCs make create/update plus assignment atomic,
  restrict member execution to the linked assignee and exact branch, and reserve
  completion approval or noted reopening for scoped managers and admins.
- A submitted task remains incomplete with its tenant request open. Approval
  sets `completed_at` and closes the request; reopening requires a trimmed
  3-500 character note recorded in task activity history.

Documents, imports, and reports:

- `/documents` manages private business document metadata and upload/replace,
  archive/restore, and links to property/unit/lease/ledger/timeline/task.
- `/import` handles CSV imports for properties, units/rent roll, people, and
  leases with type-specific templates, header mapping, saved mappings, staged
  import runs, validation, cleanup queue, recent run history, and safe commit
  behavior through the import run commit boundary and existing write RPCs.
- `/reports` is the report library. `/reports/[reportKind]` is the selected
  report builder with scope/period filters, summary metrics, traceable report
  rows, and CSV/PDF/print export for rent roll, unit performance, property
  performance, owner statement, income/expense, lease expiry, vacancy/risk,
  maintenance cost, and record-readiness reports.
- `/api/reports/export` and `/api/reports/pdf` expose report export endpoints.

Settings and access:

- `/settings` uses the three-zone settings layout to manage organization
  structure, branches, and teams with explicit draft/save/discard feedback.
- `/users-roles` manages software access, roles, staff/person links, branches,
  and existing-user access invites.
- `/account` shows the signed-in user's workspace profile.

## Database Shape

Supabase migrations define organization-scoped tables with RLS, indexes, and
RPC write boundaries. Current table families include:

- Access: `organizations`, `organization_members`, `organization_invitations`,
  `organization_branches`, `organization_teams`.
- Property core: `properties`, `units`.
- People and lease backbone: `people`, `person_roles`, `person_contacts`,
  `property_owners`, `vendor_profiles`, `leases`, `lease_parties`,
  `lease_terms`, `lease_occupancies`, `lease_deposits`.
- Finance and history: `finance_income_items`, `finance_expense_items`,
  `finance_receipts`, `finance_receipt_allocations`, `finance_payments`,
  `finance_payment_allocations`, `lease_deposit_events`, `ledger_entries`,
  `ledger_period_locks`, `petty_cash_accounts`, `petty_cash_periods`,
  `petty_cash_entries`, `timeline_events`, `activity_logs`. Income and expense
  items represent obligations; receipt, payment, allocation, and deposit-event
  rows represent dated settlement activity used by cash reporting.
  Checked public RPCs record and reverse deposit events while private
  implementations and direct event-table writes remain unavailable to API
  callers. The lease quick view shows held balance and immutable event history.
- Bills & Expenses supports `dateBasis=invoice` (default) and
  `dateBasis=paid`; paid basis is a settlement-event drilldown over payments
  and allocations scoped by payment `paid_date`, so partial and multi-month
  payments appear in the month cash reporting recognizes them. Counts and
  totals are server aggregates and compose with status, expense type,
  property, unit, and search filters.
- Accounting compatibility: `accounting_books`, `accounting_accounts`,
  `accounting_periods`, `accounting_journal_entries`, and
  `accounting_journal_lines`. Existing workflows still maintain these records
  for compatibility pending a separate retirement decision; they do not define
  a product-facing company-accounting feature. The current currency enum
  supports USD.
- Media and documents: `asset_photos` plus private `nestory-photos`, and
  `documents` plus private `nestory-documents`.
- Maintenance: `tenant_requests`, `tasks`.

Implemented RPC families include:

- Service-role-only workspace provisioning; admin-checked invitation
  create/resend/revoke; verified-email invitation acceptance; access lookup,
  update, and removal with SQL-enforced final-administrator protection.
- Property, unit, person, lease, document, ledger, timeline, and maintenance
  create/update/archive/restore.
- Finance income and expense workflow creation, status changes, dated receipt
  and payment settlement, allocation, reversal, and deposit events.
- Compatibility journal posting, accounting period locking, reversals, and
  historical ledger backfill retained behind existing workflows.
- Ledger period locking.
- Petty cash account creation, register row creation, month rollover, and
  posting expense rows into the ledger.
- Maintenance atomic create/update/assignment, assigned-member execution,
  manager-coordinated execution, and manager/admin completion review. New
  assignees require an active staff record plus an exact-branch linked member
  identity. Managers may record operational actual cost but checked SQL rejects
  manager ledger creation, mutation, linking, or posting.
- Branch and team creation.
- Document link validation and property primary-owner sync.

## Feature Ownership

- Auth, recovery, and invitation acceptance: `src/features/auth`, `src/lib/auth`.
- App shell and layout: `src/components/layout`.
- Properties: `src/features/properties`.
- Units: `src/features/units`.
- Photos: `src/features/photos`.
- People: `src/features/people`.
- Leases: `src/features/leases`.
- Rent & Income: `src/features/rent-income`.
- Bills & Expenses: `src/features/bills-expenses`.
- Finance close summaries: `src/features/finance`.
- Accounting compatibility helpers: `src/features/accounting`.
- Ledger: `src/features/ledger`.
- Timeline: `src/features/timeline`.
- Maintenance: `src/features/maintenance`.
- Documents: `src/features/documents`.
- Imports: `src/features/imports`.
- Reports: `src/features/reports`.
- Organization settings/access: `src/features/organization`.
- Activity/recent changes: `src/features/activity`.

## Local Runtime

- The default local workflow runs Next.js directly against the Supabase CLI
  stack using the repository scripts and local environment variables.
- A Docker workflow is also implemented for the production Next.js runtime:
  `Dockerfile` builds the Next.js standalone output on Node.js 24,
  `compose.yaml` runs the non-root app container with a health check, and the
  container reaches the host-managed local Supabase services through
  `host.docker.internal`.
- `docs/docker-local.md` documents start, status/log, and non-destructive stop
  commands. `.env.docker` is local-only and ignored by Git.

## Test Coverage Areas

Tests currently cover filters, search param validation, date helpers, money
totals, record selection, property/unit summary and detail, people filters,
lease summaries, ledger summaries/filters, timeline filters, maintenance
filters/checklists/summary/notifications, imports, reports/export, auth tenant
host parsing, and schema-error helpers. Database tests additionally cover the
settlement-event allocation, reversal, RLS, backfill, pagination behavior, and
the maintenance manager/member/reviewer workflow boundary.
Compatibility database tests still cover the accounting schema and security
boundary, balanced/idempotent posting, period locks and reversals, historical
backfill, transaction rollback, and seeded ledger-to-journal parity.

The UI route manifest currently covers all 47 page routes. Local redesign
verification captures every route at 1440x900, 1024x768, and 390x844, audits
admin/manager/member/anonymous access outcomes, and rejects serious/critical
axe findings, application errors, document overflow, unreachable actions,
blocked mutations, or lost query contracts.
