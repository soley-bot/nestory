# Nestory Complete App Goals

This doc defines the complete target product so future sessions build toward one
property management system instead of disconnected pages.

## Product North Star

Nestory is a unit-first property operating system. It should let an operator see
what is happening now, open the full history behind it, take the next repair
action, attach evidence, and produce a trustworthy report.

The complete operating chain is:

```text
Dashboard -> Property -> Unit -> Lease -> Person -> Ledger -> Timeline -> Documents -> Reports
```

The Dashboard is the control room. The record pages are where work happens.

## Complete Product Standard

Nestory is complete when a user can:

1. Open the Dashboard and see portfolio risk, occupancy, cash, lease runway, and
   recent activity.
2. Click any problem and land on the correct module with a supported URL filter,
   visible review state, selected record or inspector context, and a clear repair
   action.
3. Open a property or unit and see the complete operating history and
   performance in one place.
4. Manage leases, people, money, events, documents, and maintenance without
   losing the link back to property and unit truth.
5. Attach evidence to the records it supports.
6. Generate reports and exports that match the connected operational data.
7. Import messy old records into reviewable cleanup queues before committing.
8. Protect business history through archive/status/audit behavior instead of
   destructive deletes.
9. Use role-based access only after the single-Admin operating system is solid.
10. Deploy and verify the product with repeatable local, preview, and production
    checks.

## Final Module Goals

### Dashboard Control Room

- Show portfolio health, unit risk, lease risk, occupancy, cash movement, open
  work, missing data, and recent activity.
- Every card, chart, metric, quick action, and audit item must route to a real
  destination state.
- Dashboard counts should fall when the underlying issue is fixed.

### Properties

- Property CRUD with archive/restore.
- Current owner link plus ownership history.
- Units, leases, ledger, timeline, documents, maintenance, and reports scoped to
  the property.
- Property health: occupancy, NOI, expenses, open issues, missing owner,
  missing documents, and recent activity.

### Units

- Unit CRUD with archive/restore and status history.
- Unit Operating Record: current status, current lease, tenant/person links,
  revenue, expenses, NOI, maintenance, documents, timeline, health, and next
  actions.
- Repair actions for missing lease, vacancy, rent gaps, open issues, and missing
  evidence.

### Leases

- Lease CRUD with renewal, termination, amendment, archive/restore, and expiry
  review.
- Durable links to people, unit, property, terms, rent schedule, deposits, and
  documents.
- Lease timeline and related ledger activity.

### People

- Durable people records for tenants, owners, vendors, and contacts.
- Role-specific links back to properties, leases, work, and documents.
- Missing contact, no-role, duplicate, and cleanup workflows.

### Ledger

- Income and expense CRUD with exact money and USD-only MVP display.
- Links to property, unit, lease, person, timeline event, and documents.
- Rent charges, payments, deposits, expenses, corrections, period locks, and
  exports.

### Timeline

- Operational history for maintenance, inspections, incidents, lease events,
  payment notes, documents, and follow-ups.
- Every timeline event should be linkable to the records it explains.
- Recent activity should route to exact records when possible.

### Documents

- Upload, preview/download, categorize, archive, and replace documents.
- Link documents to properties, units, leases, people, ledger entries, timeline
  events, maintenance cases, reports, and imports.
- Surface missing-document risks where they affect operations or reporting.

### Maintenance And Issues

- Cases with priority, status, due date, vendor, cost, documents/photos, and
  follow-up timeline.
- Convert maintenance costs into ledger entries when appropriate.
- Feed open issues into unit and property health.

### Reports And Exports

- Rent roll.
- Unit performance.
- Property performance.
- Owner statements.
- Income/expense.
- Lease expiry.
- Vacancy and risk.
- Maintenance cost.
- Missing data.
- PDF and CSV export packs.

### Import And Cleanup

- Import old spreadsheets and review before committing.
- Detect missing owners, tenants, leases, contacts, rent, documents, and invalid
  links.
- Provide guided cleanup queues that feed back into the operating loop.

### Roles And Portals

Keep phase 1 as one Admin. Add role-based access only after the operating system
and reports are trustworthy.

Future roles:

- Admin.
- Manager/Operator.
- Accountant.
- Owner viewer.
- Tenant viewer.
- Vendor/Maintenance.

Future portals:

- Owner portal for statements, documents, and portfolio view.
- Tenant portal for lease, documents, requests, and payments.
- Vendor portal for assigned work.

### Production Readiness

- Vercel deployment flow.
- Supabase RLS and storage policies.
- Auth hardening.
- Audit logs.
- Backups and export packs.
- Browser smoke tests for critical roles and flows.
- Clear onboarding/setup path.

## Build Order

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

## Completion Rule

A module is not complete when its page exists. It is complete when a user can
land there from a real problem, understand the context, take the repair action,
preserve evidence/history, and see connected reports update.
