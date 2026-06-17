# Enterprise-Lite Database Roadmap

This document turns the long-term PMS direction into a database design contract.
It is intentionally not a migration plan yet. Use it to guide future Supabase
migrations after the current Timeline/Ledger foundation is stable.

## Direction

Nestory should grow toward broad PMS capability through an enterprise-lite
database, not a full enterprise ERP on day one.

The current foundation stays the source of truth for record-room work:

- Properties and units
- Timeline events
- Ledger entries
- Documents
- Activity logs
- Ledger period locks
- One Admin role in Phase 1

The next real backbone is Leases & Tenants. Payments, reports, tenant portal,
maintenance, communications, and workflows should build on that tenant and lease
identity instead of building around `leases.tenant_name`.

## Research Inputs

This roadmap was shaped from a read-only multi-agent review of:

- Current Nestory project rules, README, routes, feature loaders, and Supabase
  migrations.
- Existing Timeline/Ledger RPCs, RLS policies, storage policies, activity logs,
  and period-lock controls.
- Supabase guidance on explicit Data API grants, RLS policy performance, private
  storage access, local CLI workflows, constraints, indexes, and schema hygiene.

Useful external references:

- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase local CLI development](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase changelog](https://supabase.com/changelog.md)

## Non-Negotiable Quality Rules

Every future PMS table should follow these rules unless a migration explicitly
documents why it does not.

1. Organization scope first.
   Every business table should include `organization_id`. Cross-table
   relationships must be org-consistent through composite foreign keys, database
   triggers, or RPC validation.

2. RLS and grants in the same migration.
   A new table is not done until RLS is enabled, policies are written, and Data
   API grants are explicit. Do not depend on default exposure behavior.

3. Admin-only until access is deliberately expanded.
   Phase 1 and near-term staff modules should reuse the existing admin helper
   pattern. Tenant portal access should be added later with separate tenant
   account helpers.

4. RPC writes for important business changes.
   Use RPCs for writes that need audit logs, linked timeline/ledger records,
   archive/restore behavior, period-lock checks, numbering, allocations, or
   idempotency.

5. Archive over delete.
   Business records should use `archived_at` and `archived_by` instead of hard
   deletes. Hard deletes stay limited to development cleanup or explicit future
   maintenance tools.

6. Activity logs are part of the mutation.
   If a change matters to an operator, the business record update and
   `activity_logs` insert should happen in the same database transaction where
   practical.

7. Money stays exact.
   Use `numeric(14,2)` or a deliberate integer-minor-unit model. Every money
   amount must include a `currency_code` value. Keep USD and KHR support.

8. Dates and timestamps are distinct.
   Use `date` for business dates such as lease start, due date, and transaction
   date. Use `timestamptz` for audit timestamps.

9. Index the way screens read.
   Add indexes for every foreign key, then add composite or partial indexes for
   real filters: org plus status, date, property, unit, lease, assignee, or
   archived state.

10. Prefer check constraints for fast-moving statuses.
    Postgres enums are useful for stable concepts such as currency. Workflow,
    task, request, invoice, and payment statuses should usually start as text
    columns with `CHECK` constraints so they can evolve with less friction.

11. Private storage first.
    Keep uploaded documents in private storage. Expose tenant-facing files
    through signed URLs or tightly scoped server routes until tenant storage RLS
    is mature.

12. Migrations stay append-only.
    After schema work, run local validation: `npm run db:lint`,
    `npm run db:reset`, and `npm run db:types`. Use Supabase advisors before
    pushing to hosted projects.

## Current Foundation Assessment

The current schema is a good foundation for Timeline/Ledger work:

- Public business tables have RLS enabled.
- Admin policies are organization-scoped.
- Authenticated Data API grants are explicit.
- Foreign key indexes were added after advisor feedback.
- Timeline and Ledger writes already use RPC-style boundaries.
- Ledger period locks are enforced by database triggers.
- Document storage is private, MIME/size limited, and org-prefixed.

The main risk before expansion is not missing tables. The main risk is allowing
new modules to bypass relationship integrity, write boundaries, audit logging,
and tenant identity.

## Hardening Before New Modules

Before implementing the Leases & Tenants schema, decide these items:

- Cross-org integrity contract:
  Either add `UNIQUE (organization_id, id)` to base tables and use composite
  foreign keys in new tables, or create private validation helpers/triggers for
  each new module.

- Write-boundary contract:
  Business tables may be table-readable by authenticated admins, but writes that
  affect history, money, documents, or status transitions should go through RPCs.

- Period-lock scope:
  Decide whether closed periods block only financial edits, or also late
  receipt uploads, document edits, and timeline corrections.

- Attachment transaction model:
  Current uploads involve storage plus database rows. Future document-heavy
  workflows should reduce split failure states with server-side transaction
  boundaries, cleanup rules, and clear activity-log behavior.

- Seed coverage:
  Expand local seed data with leases, ledger entries, locks, documents, archived
  records, and audit logs as each module becomes real.

## Sidebar-Aligned Roadmap

### 1. Workspace Foundation

Already present or in progress:

- `organizations`
- `organization_members`
- `properties`
- `units`
- `timeline_events`
- `ledger_entries`
- `documents`
- `activity_logs`
- `ledger_period_locks`

Recommended next hardening:

- Add recent-activity indexes such as
  `(organization_id, created_at desc)` and
  `(organization_id, entity_type, entity_id, created_at desc)`.
- Add query-shaped indexes where real screens filter by org and date.
- Keep `organization_members.role = 'admin'` until role expansion is deliberate.

### 2. Leasing

Leases & Tenants is the next backbone module.

Recommended tables:

| Table | Purpose |
| --- | --- |
| `tenants` | Durable tenant profile independent of a single lease. |
| `tenant_contacts` | People, phone, email, and contact roles under a tenant. |
| `lease_parties` | Joins leases to tenants and contact roles such as primary tenant, co-tenant, guarantor, billing contact, or authorized occupant. |
| `lease_terms` | Renewal/version history with start/end dates, rent amount, due day, and status. |
| `lease_occupancies` | Unit-first move-in, move-out, reserved, occupied, notice, and vacancy history. |
| `lease_deposits` | Security deposit and other deposit lifecycle records. |

Key rules:

- Keep `public.leases` as the parent lease record.
- Backfill one tenant and one primary lease party from existing
  `leases.tenant_name` when this module starts.
- Keep `tenant_name` temporarily for compatibility, then move display labels to
  lease party summaries.
- Do not build tenant portal or payments on tenant-name text.
- Add `tenant_id`, `lease_term_id`, and `lease_occupancy_id` document links only
  when the module needs them.

Important constraints:

- `lease_end_date >= lease_start_date`
- `lease_terms.end_date >= lease_terms.start_date`
- rent and deposit amounts must be non-negative
- currency is required when an amount exists
- one primary contact per active tenant
- one primary tenant per active lease
- one active occupancy per unit
- unique lease term sequence per lease
- unique lease number per organization when lease numbers are introduced

High-value indexes:

- `tenants(organization_id, lower(display_name))`
- `tenant_contacts(tenant_id)`
- `lease_parties(lease_id)`
- `lease_parties(tenant_id)`
- `lease_terms(organization_id, end_date)` for active renewal alerts
- `lease_occupancies(organization_id, property_id, unit_id, actual_move_in_date desc)`
- `lease_deposits(lease_id, status)`
- `timeline_events(lease_id, event_date desc)` for active rows

### 3. Units And Property Dashboards

Dashboard data should be derived from the operational source tables, not stored
as manually editable dashboard rows.

Recommended approach:

- Continue making units the main record-room drilldown.
- Compute occupancy, rent collection, open issues, recent activity, and
  property/unit performance from leases, terms, occupancies, charges, payments,
  tasks, and ledger records.
- Use SQL views or materialized summaries only when query cost or repeated
  report usage justifies them.
- If views are exposed through Supabase, use `security_invoker = true` where
  appropriate and test RLS behavior.

Possible future read models:

- `unit_current_state`
- `property_operational_summary`
- `unit_financial_summary`
- `lease_balance_summary`
- `occupancy_snapshot_monthly`

### 4. Financial, Reports, And Payments

Nestory should use an enterprise-lite receivables/payment subledger first, not a
full double-entry general ledger.

Preserve:

- `ledger_entries` as the operational/cash ledger.
- `ledger_period_locks` as the period control.
- `documents`, `timeline_events`, and `activity_logs` as linked record-room
  evidence.

Recommended tables:

| Table | Purpose |
| --- | --- |
| `charge_runs` | Monthly or manual rent/fee generation batch. |
| `charges` | Source of tenant or lease receivables. |
| `invoices` | Tenant-facing grouping, numbering, and document export snapshot. |
| `invoice_lines` | Optional invoice detail rows when invoice PDFs/exports matter. |
| `payments` | Money received, including method, reference, provider fields, and linked ledger entry. |
| `payment_allocations` | Many-to-many application of payments to charges. |
| `receipts` | Payment receipt registry and generated document link. |
| `balance_snapshots` | Optional period-close balances for reporting speed and audit. |
| `report_exports` | Later CSV/PDF/XLSX export job tracking. |

Key rules:

- Charges and allocations own tenant balances. `ledger_entries` should not be
  the only receivable truth.
- Do not mix currencies inside one allocation.
- Allocation totals must not exceed charge or payment totals.
- Use `FOR UPDATE` locks inside allocation RPCs.
- Reuse ledger period locks for charges, invoices, payments, allocations, and
  receipts once those tables exist.
- Only add double-entry accounting if owner statements, bank reconciliation,
  tax/VAT, or accountant export become real requirements.

Recommended RPC boundaries:

- `post_charge_run`
- `void_charge`
- `issue_invoice`
- `record_payment`
- `allocate_payment`
- `void_payment`
- `issue_receipt`

High-value indexes:

- `charges(organization_id, lease_id, due_date)`
- `charges(organization_id, property_id, due_date)`
- `charges(organization_id, status, due_date)`
- `charges(organization_id, charge_run_id)`
- `payments(organization_id, payment_date desc)`
- `payments(organization_id, lease_id, payment_date desc)`
- `payments(organization_id, property_id, payment_date desc)`
- `payment_allocations(payment_id)`
- `payment_allocations(charge_id)`
- `payment_allocations(organization_id, allocated_at desc)`
- `invoices(organization_id, lease_id, issue_date desc)`
- `invoices(organization_id, status, due_date)`

Initial reports:

- Aged receivables
- Lease balances
- Rent roll
- Cash receipts
- Ledger export
- Property financial summary

### 5. Operations

Maintenance and task work should start with a shared request/task model.

Recommended tables:

| Table | Purpose |
| --- | --- |
| `tenant_requests` | Intake from staff or tenant portal. Maintenance is a request type. |
| `tasks` | Staff work items that can be created manually or from requests. |
| `task_comments` | Optional internal comments when task history becomes rich. |
| `task_assignments` | Optional many-to-many assignment table if one assignee stops being enough. |

Key rules:

- `tenant_requests` is intake. `tasks` is the staff execution record.
- One request may create one or more tasks.
- Do not create a separate maintenance-case table until complexity demands it.
- Attach documents/photos to requests and tasks through explicit FKs first.
  Move to `document_links` only if one document needs many unrelated parents.

High-value indexes:

- `tenant_requests(organization_id, status, requested_at desc)` for active rows
- `tenant_requests(organization_id, tenant_id, requested_at desc)`
- `tenant_requests(organization_id, property_id, unit_id, requested_at desc)`
- `tasks(organization_id, status, due_at)` for active rows
- `tasks(organization_id, assigned_to_user_id, status, due_at)` for active rows
- `tasks(organization_id, property_id, unit_id, created_at desc)`

### 6. Tenant Experience

Tenant Portal and Communications should not reuse staff membership.

Recommended tables:

| Table | Purpose |
| --- | --- |
| `tenant_portal_accounts` | Portal identity linked to tenant and active leases. |
| `conversations` | Thread container linked to request, task, lease, unit, or property. |
| `conversation_participants` | Staff and tenant visibility/participation. |
| `messages` | Thread messages with sender, visibility, body, and attachments. |
| `notifications` | In-app notification records. |
| `notification_deliveries` | Later email/SMS/provider delivery tracking. |

RLS direction:

- Staff admins use the existing organization-admin helper.
- Tenant portal accounts use separate private helpers such as
  `app_private.is_tenant_portal_user(org_id)` and
  `app_private.can_access_tenant_lease(lease_id)`.
- Tenant users only see their own requests, participant conversations,
  tenant-visible messages, their own notifications, and documents exposed
  through signed URLs or server routes.
- Keep direct storage policies admin-scoped until tenant document access has
  been thoroughly designed and tested.

High-value indexes:

- `messages(conversation_id, created_at)`
- `messages(organization_id, created_at desc)`
- `conversation_participants(conversation_id)`
- `conversation_participants(participant_type, participant_id)`
- unread notification partial indexes for staff users and tenant portal accounts

### 7. Automation

Workflows should begin as auditable definitions and run history, not invisible
triggers spread across the database.

Recommended tables:

| Table | Purpose |
| --- | --- |
| `workflow_templates` | Reusable workflow definitions. |
| `workflow_template_steps` | Ordered step definitions. |
| `workflow_runs` | One execution instance tied to a business context. |
| `workflow_run_steps` | Step execution state, retries, errors, and outputs. |

Key rules:

- Use explicit RPCs, idempotency keys, and queued run steps.
- Store `context_type` and `context_id` for flexible workflow contexts.
- When a workflow creates a real business record, store that created record ID
  in the run step result.
- Avoid starting with database triggers everywhere; retries can duplicate tasks,
  messages, and notifications if the model is not explicit.

High-value indexes:

- `workflow_runs(organization_id, status, created_at desc)`
- `workflow_run_steps(workflow_run_id, step_order)`
- `workflow_run_steps(status, scheduled_for)` for queued or waiting rows
- unique `(organization_id, idempotency_key)` where an idempotency key exists

## Recommended Migration Sequence

1. Foundation hardening doc-to-schema pass
   - Decide composite org-aware FK strategy.
   - Add missing query-shaped indexes.
   - Add seed coverage for current Timeline/Ledger controls.

2. Leases & Tenants compatibility pass
   - Add tenants, contacts, and lease parties.
   - Backfill current `tenant_name`.
   - Keep current screens compatible.

3. Lease lifecycle pass
   - Add lease terms, occupancies, deposits, and lease workflow RPCs.
   - Emit timeline events and activity logs inside RPCs.

4. Units and dashboard read models
   - Add views or summaries only after source tables are mature.

5. Receivables and payments pass
   - Add charges and charge runs first.
   - Add payments and allocations next.
   - Add invoice/receipt document generation after core balances are correct.

6. Operations pass
   - Add tenant requests and tasks.
   - Add maintenance views over request/task data.

7. Tenant experience pass
   - Add tenant portal accounts, conversations, messages, and notifications.
   - Expand RLS carefully, with tenant-specific helpers.

8. Automation pass
   - Add workflow templates and run history.
   - Keep writes RPC-driven and idempotent.

## Review Checklist For Future Database PRs

Use this checklist before accepting future schema changes:

- Does every business table have `organization_id`?
- Is cross-org relationship integrity enforced by database constraints, triggers,
  or RPCs?
- Are RLS policies and explicit grants included in the same migration?
- Are write-heavy business actions routed through RPCs when audit/logging/locks
  matter?
- Are archive fields present where history must be preserved?
- Are activity logs written in the same transaction where practical?
- Are money columns exact and currency-aware?
- Are business dates separate from audit timestamps?
- Are all foreign keys indexed?
- Are real screen/report filters supported by composite or partial indexes?
- Are tenant portal policies separate from staff organization membership?
- Are storage objects private by default?
- Were `npm run db:lint`, `npm run db:reset`, and `npm run db:types` run after
  schema changes?

