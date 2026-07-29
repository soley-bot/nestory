# Fixture Dependency Inventory

**Inventory baseline:** `b592557f3d2919ab5bd7932426fc218a1bea5d4d`  
**Seed file:** `supabase/seed.sql`  
**Inventory method:** full-repository UUID, login, route, name, status, and
script search; pgTAP bodies were classified by whether they read/mutate seeded
rows or merely reuse the UUID namespace inside transaction-local fixtures.

## Stable login and workspace contracts

| Contract | Stable value | Consumers |
| --- | --- | --- |
| Primary organization | `00000000-0000-0000-0000-000000000001` / `nestory` | 13 seed-dependent pgTAP files, browser scripts, route loaders |
| Empty organization | `00000000-0000-0000-0000-000000000002` | empty-state browser verification and cross-org denial |
| Admin | `00000000-0000-0000-0000-000000000101` / `nestory@gmail.com` | finance, accounting, maintenance, access, browser flows |
| Manager | `00000000-0000-0000-0000-000000000201` / `manager@nestory.com` | access tests and role-matrix browser checks |
| Member | `00000000-0000-0000-0000-000000000211` / `member@nestory.com` | maintenance assignment and mobile My Work checks |
| Empty Admin | `00000000-0000-0000-0000-000000000301` / `demo@nestory.com` | empty workspace and cross-org tests |
| Manager/Member Staff | `80300000-...-0001` and `80300000-...-0002` | Staff-to-Access integrity, branch assignment, maintenance authorization |
| Primary branch | `00000000-0000-0000-0000-000000000501` | access and maintenance scope |
| Secondary branch | `00000000-0000-0000-0000-000000000503` | access uniqueness/acceptance coverage |

All four logins keep the local-only password documented in the seed. No test
may inspect a password hash.

## Material pgTAP dependencies

Thirteen suites materially depend on seeded rows:

| Test file | Seed contract used |
| --- | --- |
| `accounting_dual_post_test.sql` | organization/admin plus properties `...0001`-`...0005` and units `...0001`/`...0002`; transaction rolls back its postings |
| `accounting_kernel_test.sql` | organization/admin/property `...0001`; fixed source IDs in the task namespace |
| `accounting_security_test.sql` | admin/demo users, property `...0001`, fixed source IDs |
| `finance_payment_drilldown_test.sql` | organization/admin/property `...0001`; inserts its own obligations |
| `finance_settlement_activity_logging_test.sql` | organization/admin/demo/property `...0001`; inserts and rolls back settlement rows |
| `income_payer_integrity_test.sql` | property `...0001`, lease `3000...0001`, tenant people `8000...0001`/`...0002`, owner `8010...0001`, and the display name `Dara Sok` |
| `invite_only_b2b_auth_test.sql` | Admin/Manager/Member/Demo identities, branches, memberships, and Staff access links |
| `lease_deposit_event_workflow_test.sql` | primary and empty organizations plus Admin membership |
| `maintenance_role_workflow_test.sql` | primary property/unit, tenant/vendor/staff/access anchors, tasks `9100...0001` and `...0003`-`...0012`, exact initial statuses, assignments, checklist IDs, costs, and branch scope |
| `overview_property_cash_events_test.sql` | primary/empty organizations, Admin/Demo, property `...0001`; test-created finance events |
| `petty_cash_auditability_test.sql` | primary/empty organizations, Admin/branch, properties `...0001`/`...0002`, staff/vendor anchors |
| `staff_workspace_access_acceptance_test.sql` | Admin/Manager/Member/Demo identities, Staff records, memberships, and branch scope |
| `staff_workspace_access_uniqueness_test.sql` | the same access graph plus secondary branch and fixed invitation namespace |

Six suites intersect only generic or all-zero UUID literals and create their
own isolated state: finance inventory authorization/diagnostics, financial
authority kernel, lease-term authority behavior, property-cash-events v1, and
report-document snapshot. They do not require rich portfolio rows.

## Non-database consumers

- `config/ui-route-coverage.json` requires property
  `10000000-0000-0000-0000-000000000001` and unit
  `20000000-0000-0000-0000-000000000001` to remain routable.
- `scripts/smoke-properties-flow.mjs` defaults to `nestory@gmail.com`.
- `scripts/smoke-ui-redesign.mjs` signs in
  `manager@nestory.com` and `member@nestory.com` for its role matrix.
- `scripts/smoke-maintenance-mobile.mjs` requires an explicitly supplied local
  fixture login and exercises assigned work.
- Component tests use presentation-only names such as `Riverside House` and
  `Dara Sok`; only the SQL income-payer suite couples a presentation name to
  the database seed.

## Current seed bypass inventory

The baseline seed directly inserts every operational layer:

- organizations, branches, properties, units, people, memberships, roles,
  contacts, owners, vendors;
- leases, parties, terms, occupancies, and deposits;
- Ledger, timeline, tenant requests, tasks, activity, and period locks.

It does not populate current finance obligations, receipts, payments,
allocations, deposit events, petty cash, accounting source links, documents, or
photos. Direct seeded Ledger rows therefore dominate the old demo story and
do not represent current finance workflows.

Direct deterministic inserts remain necessary for local reset identities
because the checked creation RPCs generate random primary keys. The rebuilt
seed must label that boundary, insert the same normalized/source columns those
RPCs enforce, and prove equivalent invariants with pgTAP. Application code
continues to use checked RPCs.

## Rows to retire or refresh

- Six simultaneously active properties and 36 units exceed the requested
  compact demo portfolio.
- Twenty-four lease rows and their operational dates are frozen around
  June/July 2026.
- Twelve open maintenance cases/tasks contain stale June/early-July due dates.
- Twelve direct Ledger rows and five hand-written timeline rows demonstrate
  compatibility behavior rather than current receipt/payment allocation.
- Six one-owner-per-property people should become a two-owner/three-active-
  property model.
- No current Rent & Income, Bills & Expenses, receipt, payment, allocation,
  deposit-event, or petty-cash scenario exists.
- Documents/photos are intentionally empty and must stay empty until real
  storage objects are included.

## Preservation strategy

- Preserve all stable identities listed above.
- Keep three active properties and 18 active units; preserve extra property
  anchors only as archived test fixtures when a rollback-based suite requires
  them.
- Preserve maintenance task IDs and checklist item IDs used by pgTAP while
  refreshing their relative dates, descriptions, and valid initial states.
- Keep `Dara Sok` on tenant person `8000...0001` and lease `3000...0001`.
- Move current-looking operational assertions into the new demo seed contract
  instead of coupling more existing tests to presentation names.
- Keep the Demo organization free of properties, people, leases, finance,
  maintenance, documents, and photos.

