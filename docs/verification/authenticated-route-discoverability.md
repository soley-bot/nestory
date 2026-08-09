# Authenticated route discoverability

<!-- contract-sha256:0902761e9a797e7b2e6291c95f9c8be89a449ea829af74ac532b1e55a5830131 -->

This report is generated from `config/authenticated-route-discoverability.json`. The contract covers all 38 production pages inside the authenticated dashboard layout. `/workspace` is the authenticated arrival router and is verified separately as the shell entry.

Classifications are `global`, `context`, `profile`, or `intentionally inaccessible`. An authorized page is incomplete unless its visible entry and shell-start browser journey both exist.

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
| `/settings/rent-policy` | `requireSuperAdminContext` / `canManageAccess` | context via settings-rent-policy; passed sa:rent-policy | Intentionally inaccessible — Requires canManageAccess and canConfigureLeases. | Intentionally inaccessible — Requires canManageAccess and canConfigureLeases. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
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

- Tested implementation SHA: `b546991bac7d4f7edc961ca53e00d8f684268c2b`
- Local base URL: `http://127.0.0.1:3317`
- Result: 66/66 visible-link journeys passed
- Every journey began at `/workspace`; only the initial login/arrival used direct navigation.

- `sa:account`: passed — /workspace → Open workspace → Profile menu → Profile
- `sa:balances`: passed — /workspace → Open workspace → Owner balances
- `sa:expenses`: passed — /workspace → Open workspace → Expenses
- `sa:documents`: passed — /workspace → Open workspace → Documents
- `sa:finance`: passed — /workspace → Open workspace → Finance work
- `sa:financial-timeline`: passed — /workspace → Open workspace → Financial timeline
- `sa:import`: passed — /workspace → Open workspace → Import
- `sa:inspections`: passed — /workspace → Open workspace → Inspections
- `sa:leases`: passed — /workspace → Open workspace → Leases
- `sa:ledger`: passed — /workspace → Open workspace → Ledger
- `sa:maintenance`: passed — /workspace → Open workspace → Cases
- `sa:maintenance-timeline`: passed — /workspace → Open workspace → Maintenance timeline
- `sa:overview-attention`: passed — /workspace → Open workspace → Overview → Review
- `sa:overview`: passed — /workspace → Open workspace → Overview
- `sa:owners`: passed — /workspace → Open workspace → People → Owners
- `sa:person-detail`: passed — /workspace → Open workspace → People → Bright Mekong Trading
- `sa:people`: passed — /workspace → Open workspace → People
- `sa:petty-cash`: passed — /workspace → Open workspace → Petty cash
- `sa:property-account`: passed — /workspace → Open workspace → Owner balances → CTR-RES — Central Residence
- `sa:property-detail`: passed — /workspace → Open workspace → Properties → Preview Central Residence → Open property
- `sa:properties`: passed — /workspace → Open workspace → Properties
- `sa:property-setup`: passed — /workspace → Open workspace → Properties → Set up property
- `sa:property-timeline`: passed — /workspace → Open workspace → Property timeline
- `sa:recurring`: passed — /workspace → Open workspace → Recurring work
- `sa:rent`: passed — /workspace → Open workspace → Rent
- `sa:report-detail`: passed — /workspace → Open workspace → Reports → Open report
- `sa:reports`: passed — /workspace → Open workspace → Reports
- `sa:settings`: passed — /workspace → Open workspace → Settings
- `sa:rent-policy`: passed — /workspace → Open workspace → Settings → Rent Policy
- `sa:staff`: passed — /workspace → Open workspace → People → Staff
- `sa:tasks`: passed — /workspace → Open workspace → My work
- `sa:tenants`: passed — /workspace → Open workspace → People → Tenants
- `sa:timeline`: passed — /workspace → Open workspace → Timeline history
- `sa:unit-detail`: passed — /workspace → Open workspace → Properties → Preview Central Residence → Units → Preview unit A-01 → Open unit
- `sa:units`: passed — /workspace → Open workspace → Properties → Preview Central Residence → Units
- `sa:users-roles`: passed — /workspace → Open workspace → Settings → Workspace Access
- `sa:vendors`: passed — /workspace → Open workspace → People → Vendors
- `sa:work-orders`: passed — /workspace → Open workspace → Work orders
- `fm:account`: passed — /workspace → Open workspace → Profile menu → Profile
- `fm:balances`: passed — /workspace → Open workspace → Owner balances
- `fm:expenses`: passed — /workspace → Open workspace → Expenses
- `fm:finance`: passed — /workspace → Open workspace → Finance work
- `fm:leases`: passed — /workspace → Open workspace → Leases
- `fm:ledger`: passed — /workspace → Open workspace → Ledger
- `fm:petty-cash`: passed — /workspace → Open workspace → Petty cash
- `fm:property-account`: passed — /workspace → Open workspace → Owner balances → CTR-RES — Central Residence
- `fm:rent`: passed — /workspace → Open workspace → Rent
- `fm:report-detail`: passed — /workspace → Open workspace → Reports → Open report
- `fm:reports`: passed — /workspace → Open workspace → Reports
- `fmem:account`: passed — /workspace → Open workspace → Profile menu → Profile
- `fmem:balances`: passed — /workspace → Open workspace → Owner balances
- `fmem:expenses`: passed — /workspace → Open workspace → Expenses
- `fmem:finance`: passed — /workspace → Open workspace → Finance work
- `fmem:leases`: passed — /workspace → Open workspace → Leases
- `fmem:ledger`: passed — /workspace → Open workspace → Ledger
- `fmem:petty-cash`: passed — /workspace → Open workspace → Petty cash
- `fmem:property-account`: passed — /workspace → Open workspace → Owner balances → CTR-RES — Central Residence
- `fmem:rent`: passed — /workspace → Open workspace → Rent
- `om:account`: passed — /workspace → Open workspace → Profile menu → Profile
- `om:inspections`: passed — /workspace → Open workspace → Inspections
- `om:maintenance`: passed — /workspace → Open workspace → Cases
- `om:recurring`: passed — /workspace → Open workspace → Recurring work
- `om:tasks`: passed — /workspace → Open workspace → My work
- `om:work-orders`: passed — /workspace → Open workspace → Work orders
- `omem:account`: passed — /workspace → Open workspace → Profile menu → Profile
- `omem:tasks`: passed — /workspace → Open workspace → My work

## Known scope

- Public, authentication, invitation, API, and error routes are outside this authenticated dashboard inventory.
- Direct-denial checks prove authorization only; they are not counted as discoverability evidence.
- Hosted Supabase, Vercel, email, real IPS data, and production deployment remain unchanged.
