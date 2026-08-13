# Authenticated route discoverability

<!-- contract-sha256:5906e5b9fc5230306cbb5ac5ac583a164837e9e6eb7f9554557c3bfb51b7f45b -->

This report is generated from `config/authenticated-route-discoverability.json`. The contract covers all 38 production pages inside the authenticated dashboard layout. `/workspace` is the authenticated arrival router and is verified once per role as the shell entry.

Classifications are `global`, `context`, `profile`, or `intentionally inaccessible`. An authorized page is incomplete unless its visible entry and browser journey from the current shell or contextual origin both exist.

| Route | Guard / capability | Super Admin | Finance Manager | Finance Member | Operations Manager | Operations Member | Dead-end checks |
| --- | --- | --- | --- | --- | --- | --- | --- |
<!-- authenticated-route:/account -->
| `/account` | `requireWorkspaceContext` / `workspace` | profile via profile-account; passed sa:account | profile via profile-account; passed fm:account | profile via profile-account; passed fmem:account | profile via profile-account; passed om:account | profile via profile-account; passed omem:account | none |
<!-- authenticated-route:/balances -->
| `/balances` | `requireFinanceContext` / `canReadFinance` | global via shell-balances; passed sa:balances | global via shell-balances; passed fm:balances | global via shell-balances; passed fmem:balances | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/bills-expenses -->
| `/bills-expenses` | `requireFinanceContext` / `canReadFinance` | global via shell-expenses; passed sa:expenses | global via shell-expenses; passed fm:expenses | global via shell-expenses; passed fmem:expenses | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/documents -->
| `/documents` | `requireSuperAdminContext` / `canManageAccess` | global via shell-documents; passed sa:documents | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/finance -->
| `/finance` | `requireFinanceContext` / `canReadFinance` | global via shell-finance; passed sa:finance | global via shell-finance; passed fm:finance | global via shell-finance; passed fmem:finance | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/financial-timeline -->
| `/financial-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-financial-timeline; passed sa:financial-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/import -->
| `/import` | `requireSuperAdminContext` / `canManageAccess` | global via shell-import; passed sa:import | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/inspections -->
| `/inspections` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-inspections; passed sa:inspections | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-inspections; passed om:inspections | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/leases -->
| `/leases` | `requireFinanceContext` / `canReadFinance` | global via shell-leases; passed sa:leases | global via shell-leases; passed fm:leases | global via shell-leases; passed fmem:leases | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/ledger -->
| `/ledger` | `requireFinanceContext` / `canReadFinance` | global via shell-ledger; passed sa:ledger | global via shell-ledger; passed fm:ledger | global via shell-ledger; passed fmem:ledger | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/maintenance -->
| `/maintenance` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-maintenance; passed sa:maintenance | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-maintenance; passed om:maintenance | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/maintenance-timeline -->
| `/maintenance-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-maintenance-timeline; passed sa:maintenance-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/overview/[view] -->
| `/overview/[view]` | `requireSuperAdminContext` / `canManageAccess` | context via overview-drilldown; passed sa:overview-attention | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/overview -->
| `/overview` | `requireSuperAdminContext` / `canManageAccess` | global via shell-overview; passed sa:overview | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/owners -->
| `/owners` | `requireSuperAdminContext` / `canManageAccess` | context via people-owners; passed sa:owners | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/people/[personId] -->
| `/people/[personId]` | `requireSuperAdminContext` / `canManageAccess` | context via people-detail; passed sa:person-detail | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/people -->
| `/people` | `requireSuperAdminContext` / `canManageAccess` | global via shell-people; passed sa:people | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/petty-cash -->
| `/petty-cash` | `requireFinanceContext` / `canReadFinance` | global via shell-petty-cash; passed sa:petty-cash | global via shell-petty-cash; passed fm:petty-cash | global via shell-petty-cash; passed fmem:petty-cash | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link, no-admin-person-link |
<!-- authenticated-route:/properties/[propertyId]/account -->
| `/properties/[propertyId]/account` | `requireFinanceContext` / `canReadFinance` | context via property-account; passed sa:property-account | context via property-account; passed fm:property-account | context via property-account; passed fmem:property-account | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | none |
<!-- authenticated-route:/properties/[propertyId] -->
| `/properties/[propertyId]` | `requireSuperAdminContext` / `canManageAccess` | context via property-detail; passed sa:property-detail | Intentionally inaccessible — Requires canManageAccess; use the finance-safe property account. | Intentionally inaccessible — Requires canManageAccess; use the finance-safe property account. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/properties -->
| `/properties` | `requireSuperAdminContext` / `canManageAccess` | global via shell-properties; passed sa:properties | Intentionally inaccessible — Requires canManageAccess; use Owner balances and property accounts. | Intentionally inaccessible — Requires canManageAccess; use Owner balances and property accounts. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/properties/setup -->
| `/properties/setup` | `requireSuperAdminContext` / `canManageAccess` | context via property-setup; passed sa:property-setup | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/property-timeline -->
| `/property-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-property-timeline; passed sa:property-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/recurring-tasks -->
| `/recurring-tasks` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-recurring; passed sa:recurring | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-recurring; passed om:recurring | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/rent-income -->
| `/rent-income` | `requireFinanceContext` / `canReadFinance` | global via shell-rent; passed sa:rent | global via shell-rent; passed fm:rent | global via shell-rent; passed fmem:rent | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/reports/[reportKind] -->
| `/reports/[reportKind]` | `requireFinanceReportContext` / `canReadFinanceReports` | context via report-detail; passed sa:report-detail | context via report-detail; passed fm:report-detail | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | finance-safe-property-account, no-admin-unit-link, no-admin-person-link |
<!-- authenticated-route:/reports -->
| `/reports` | `requireFinanceReportContext` / `canReadFinanceReports` | global via shell-reports; passed sa:reports | global via shell-reports; passed fm:reports | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | none |
<!-- authenticated-route:/settings -->
| `/settings` | `requireSuperAdminContext` / `canManageAccess` | global via shell-settings; passed sa:settings | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/rent-policy -->
| `/settings/rent-policy` | `requireLeaseConfigurationContext` / `canConfigureLeases` | context via settings-rent-policy; passed sa:rent-policy | global via shell-rent-policy; passed fm:rent-policy | Intentionally inaccessible — Requires canConfigureLeases. | Intentionally inaccessible — Requires canConfigureLeases. | Intentionally inaccessible — Requires canConfigureLeases. | none |
<!-- authenticated-route:/staff -->
| `/staff` | `requireSuperAdminContext` / `canManageAccess` | context via people-staff; passed sa:staff | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/tasks -->
| `/tasks` | `requireOperationsExecutionContext` / `canExecuteOperations` | global via shell-tasks; passed sa:tasks | Intentionally inaccessible — Requires canExecuteOperations. | Intentionally inaccessible — Requires canExecuteOperations. | global via shell-tasks; passed om:tasks | global via shell-tasks; passed omem:tasks | none |
<!-- authenticated-route:/tenants -->
| `/tenants` | `requireSuperAdminContext` / `canManageAccess` | context via people-tenants; passed sa:tenants | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/timeline -->
| `/timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-timeline; passed sa:timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/units/[unitId] -->
| `/units/[unitId]` | `requireSuperAdminContext` / `canManageAccess` | context via unit-detail; passed sa:unit-detail | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/units -->
| `/units` | `requireSuperAdminContext` / `canManageAccess` | context via units-list; passed sa:units | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/users-roles -->
| `/users-roles` | `requireSuperAdminContext` / `canManageAccess` | context via settings-access; passed sa:users-roles | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/vendors -->
| `/vendors` | `requireSuperAdminContext` / `canManageAccess` | context via people-vendors; passed sa:vendors | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/work-orders -->
| `/work-orders` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-work-orders; passed sa:work-orders | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-work-orders; passed om:work-orders | Intentionally inaccessible — Requires canManageOperations. | none |

## Browser evidence

- Tested implementation SHA: `b4754f486e82ebd1ec00311936f42125e0895017`
- Local base URL: `http://127.0.0.1:3210`
- Result: 67/67 visible-link journeys passed
- Role sessions: 5/5 started at `/workspace` and resolved to the role home once.
- Denied global anchors: 74 role/entry absence checks passed.
- Direct denials: 4 separate probes passed; these are authorization evidence, not discoverability journeys.

### Role session starts

- `super_admin`: passed — /workspace → Automatic role redirect → /overview
- `finance_manager`: passed — /workspace → Automatic role redirect → /finance
- `finance_member`: passed — /workspace → Automatic role redirect → /finance
- `operations_manager`: passed — /workspace → Automatic role redirect → /maintenance
- `operations_member`: passed — /workspace → Automatic role redirect → /tasks

### Denied global entry absence

- `super_admin`: passed — 0 forbidden global hrefs checked
- `finance_manager`: passed — 15 forbidden global hrefs checked
- `finance_member`: passed — 17 forbidden global hrefs checked
- `operations_manager`: passed — 19 forbidden global hrefs checked
- `operations_member`: passed — 23 forbidden global hrefs checked

### Visible-link journeys from the current shell/context

- `sa:account`: passed — Profile menu → Profile
- `sa:balances`: passed — Owner balances
- `sa:expenses`: passed — Expenses
- `sa:documents`: passed — Documents
- `sa:finance`: passed — Finance work
- `sa:financial-timeline`: passed — Financial timeline
- `sa:import`: passed — Import
- `sa:inspections`: passed — Inspections
- `sa:leases`: passed — Leases
- `sa:ledger`: passed — Ledger
- `sa:maintenance`: passed — Cases
- `sa:maintenance-timeline`: passed — Maintenance timeline
- `sa:overview-attention`: passed — Overview → Review
- `sa:overview`: passed — Overview
- `sa:owners`: passed — People → Owners
- `sa:person-detail`: passed — People → Bright Mekong Trading
- `sa:people`: passed — People
- `sa:petty-cash`: passed — Petty cash
- `sa:property-account`: passed — Ledger → Close Readiness House
- `sa:property-detail`: passed — Properties → Preview Close Readiness House → Open property
- `sa:properties`: passed — Properties
- `sa:property-setup`: passed — Properties → Set up property
- `sa:property-timeline`: passed — Property timeline
- `sa:recurring`: passed — Recurring work
- `sa:rent`: passed — Rent
- `sa:report-detail`: passed — Reports → Open report
- `sa:reports`: passed — Reports
- `sa:settings`: passed — Settings
- `sa:rent-policy`: passed — Settings → Rent Policy
- `sa:staff`: passed — People → Staff
- `sa:tasks`: passed — My work
- `sa:tenants`: passed — People → Tenants
- `sa:timeline`: passed — Timeline history
- `sa:unit-detail`: passed — Properties → Preview Central Residence → Units → Preview unit A-01 → Open unit
- `sa:units`: passed — Properties → Preview Close Readiness House → Units
- `sa:users-roles`: passed — Settings → Workspace Access
- `sa:vendors`: passed — People → Vendors
- `sa:work-orders`: passed — Work orders
- `fm:account`: passed — Profile menu → Profile
- `fm:balances`: passed — Owner balances
- `fm:expenses`: passed — Expenses
- `fm:finance`: passed — Finance work
- `fm:leases`: passed — Leases
- `fm:ledger`: passed — Ledger
- `fm:petty-cash`: passed — Petty cash
- `fm:property-account`: passed — Ledger → Close Readiness House
- `fm:rent`: passed — Rent
- `fm:report-detail`: passed — Reports → Open report
- `fm:reports`: passed — Reports
- `fm:rent-policy`: passed — Rent policy
- `fmem:account`: passed — Profile menu → Profile
- `fmem:balances`: passed — Owner balances
- `fmem:expenses`: passed — Expenses
- `fmem:finance`: passed — Finance work
- `fmem:leases`: passed — Leases
- `fmem:ledger`: passed — Ledger
- `fmem:petty-cash`: passed — Petty cash
- `fmem:property-account`: passed — Ledger → Close Readiness House
- `fmem:rent`: passed — Rent
- `om:account`: passed — Profile menu → Profile
- `om:inspections`: passed — Inspections
- `om:maintenance`: passed — Cases
- `om:recurring`: passed — Recurring work
- `om:tasks`: passed — My work
- `om:work-orders`: passed — Work orders
- `omem:account`: passed — Profile menu → Profile
- `omem:tasks`: passed — My work

## Known scope

- Public, authentication, invitation, API, and error routes are outside this authenticated dashboard inventory.
- Direct-denial checks prove authorization only; they are not counted as discoverability evidence.
- Hosted Supabase, Vercel, email, real IPS data, and production deployment remain unchanged.
