# Authenticated route discoverability

<!-- contract-sha256:70ef1b3de96bd1c761cb9dddbca7eb47b46a554da3bf730011c990c627179bd7 -->

This report is generated from `config/authenticated-route-discoverability.json`. The contract covers all 39 production pages inside the authenticated dashboard layout. `/workspace` is the authenticated arrival router and is verified once per role as the shell entry.

Classifications are `global`, `context`, `profile`, or `intentionally inaccessible`. An authorized page is incomplete unless its visible entry and browser journey from the current shell or contextual origin both exist.

| Route | Guard / capability | Super Admin | Finance Manager | Finance Member | Operations Manager | Operations Member | Dead-end checks |
| --- | --- | --- | --- | --- | --- | --- | --- |
<!-- authenticated-route:/account -->
| `/account` | `requireWorkspaceContext` / `workspace` | profile via profile-account; pending sa:account | profile via profile-account; pending fm:account | profile via profile-account; pending fmem:account | profile via profile-account; pending om:account | profile via profile-account; pending omem:account | none |
<!-- authenticated-route:/balances -->
| `/balances` | `requireFinanceContext` / `canReadFinance` | global via shell-balances; pending sa:balances | global via shell-balances; pending fm:balances | global via shell-balances; pending fmem:balances | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/bills-expenses -->
| `/bills-expenses` | `requireFinanceContext` / `canReadFinance` | global via shell-expenses; pending sa:expenses | global via shell-expenses; pending fm:expenses | global via shell-expenses; pending fmem:expenses | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/documents -->
| `/documents` | `requireSuperAdminContext` / `canManageAccess` | global via shell-documents; pending sa:documents | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/finance -->
| `/finance` | `requireFinanceContext` / `canReadFinance` | global via shell-finance; pending sa:finance | global via shell-finance; pending fm:finance | global via shell-finance; pending fmem:finance | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/financial-timeline -->
| `/financial-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-financial-timeline; pending sa:financial-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/import -->
| `/import` | `requireSuperAdminContext` / `canManageAccess` | global via shell-import; pending sa:import | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/inspections -->
| `/inspections` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-inspections; pending sa:inspections | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-inspections; pending om:inspections | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/leases -->
| `/leases` | `requireFinanceContext` / `canReadFinance` | global via shell-leases; pending sa:leases | global via shell-leases; pending fm:leases | global via shell-leases; pending fmem:leases | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/leases/[leaseId] -->
| `/leases/[leaseId]` | `requireFinanceContext` / `canReadFinance` | context via lease-detail; pending sa:lease-detail | context via lease-detail; pending fm:lease-detail | context via lease-detail; pending fmem:lease-detail | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/ledger -->
| `/ledger` | `requireFinanceContext` / `canReadFinance` | global via shell-ledger; pending sa:ledger | global via shell-ledger; pending fm:ledger | global via shell-ledger; pending fmem:ledger | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/maintenance -->
| `/maintenance` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-maintenance; pending sa:maintenance | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-maintenance; pending om:maintenance | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/maintenance-timeline -->
| `/maintenance-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-maintenance-timeline; pending sa:maintenance-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/overview/[view] -->
| `/overview/[view]` | `requireSuperAdminContext` / `canManageAccess` | context via overview-drilldown; pending sa:overview-attention | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/overview -->
| `/overview` | `requireSuperAdminContext` / `canManageAccess` | global via shell-overview; pending sa:overview | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/owners -->
| `/owners` | `requireSuperAdminContext` / `canManageAccess` | context via people-owners; pending sa:owners | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/people/[personId] -->
| `/people/[personId]` | `requireSuperAdminContext` / `canManageAccess` | context via people-detail; pending sa:person-detail | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/people -->
| `/people` | `requireSuperAdminContext` / `canManageAccess` | global via shell-people; pending sa:people | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/petty-cash -->
| `/petty-cash` | `requireFinanceContext` / `canReadFinance` | global via shell-petty-cash; pending sa:petty-cash | global via shell-petty-cash; pending fm:petty-cash | global via shell-petty-cash; pending fmem:petty-cash | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link, no-admin-person-link |
<!-- authenticated-route:/properties/[propertyId]/account -->
| `/properties/[propertyId]/account` | `requireFinanceContext` / `canReadFinance` | context via property-account; pending sa:property-account | context via property-account; pending fm:property-account | context via property-account; pending fmem:property-account | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | none |
<!-- authenticated-route:/properties/[propertyId] -->
| `/properties/[propertyId]` | `requireSuperAdminContext` / `canManageAccess` | context via property-detail; pending sa:property-detail | Intentionally inaccessible — Requires canManageAccess; use the finance-safe property account. | Intentionally inaccessible — Requires canManageAccess; use the finance-safe property account. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/properties -->
| `/properties` | `requireSuperAdminContext` / `canManageAccess` | global via shell-properties; pending sa:properties | Intentionally inaccessible — Requires canManageAccess; use Owner balances and property accounts. | Intentionally inaccessible — Requires canManageAccess; use Owner balances and property accounts. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/properties/setup -->
| `/properties/setup` | `requireSuperAdminContext` / `canManageAccess` | context via property-setup; pending sa:property-setup | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/property-timeline -->
| `/property-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-property-timeline; pending sa:property-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/recurring-tasks -->
| `/recurring-tasks` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-recurring; pending sa:recurring | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-recurring; pending om:recurring | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/rent-income -->
| `/rent-income` | `requireFinanceContext` / `canReadFinance` | global via shell-rent; pending sa:rent | global via shell-rent; pending fm:rent | global via shell-rent; pending fmem:rent | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/reports/[reportKind] -->
| `/reports/[reportKind]` | `requireFinanceReportContext` / `canReadFinanceReports` | context via report-detail; pending sa:report-detail | context via report-detail; pending fm:report-detail | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | finance-safe-property-account, no-admin-unit-link, no-admin-person-link |
<!-- authenticated-route:/reports -->
| `/reports` | `requireFinanceReportContext` / `canReadFinanceReports` | global via shell-reports; pending sa:reports | global via shell-reports; pending fm:reports | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | none |
<!-- authenticated-route:/settings -->
| `/settings` | `requireSuperAdminContext` / `canManageAccess` | global via shell-settings; pending sa:settings | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/rent-policy -->
| `/settings/rent-policy` | `requireLeaseConfigurationContext` / `canConfigureLeases` | context via settings-rent-policy; pending sa:rent-policy | global via shell-rent-policy; pending fm:rent-policy | Intentionally inaccessible — Requires canConfigureLeases. | Intentionally inaccessible — Requires canConfigureLeases. | Intentionally inaccessible — Requires canConfigureLeases. | none |
<!-- authenticated-route:/staff -->
| `/staff` | `requireSuperAdminContext` / `canManageAccess` | context via people-staff; pending sa:staff | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/tasks -->
| `/tasks` | `requireOperationsExecutionContext` / `canExecuteOperations` | global via shell-tasks; pending sa:tasks | Intentionally inaccessible — Requires canExecuteOperations. | Intentionally inaccessible — Requires canExecuteOperations. | global via shell-tasks; pending om:tasks | global via shell-tasks; pending omem:tasks | none |
<!-- authenticated-route:/tenants -->
| `/tenants` | `requireSuperAdminContext` / `canManageAccess` | context via people-tenants; pending sa:tenants | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/timeline -->
| `/timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-timeline; pending sa:timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/units/[unitId] -->
| `/units/[unitId]` | `requireSuperAdminContext` / `canManageAccess` | context via unit-detail; pending sa:unit-detail | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/units -->
| `/units` | `requireSuperAdminContext` / `canManageAccess` | context via units-list; pending sa:units | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/users-roles -->
| `/users-roles` | `requireSuperAdminContext` / `canManageAccess` | context via settings-access; pending sa:users-roles | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/vendors -->
| `/vendors` | `requireSuperAdminContext` / `canManageAccess` | context via people-vendors; pending sa:vendors | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/work-orders -->
| `/work-orders` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-work-orders; pending sa:work-orders | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-work-orders; pending om:work-orders | Intentionally inaccessible — Requires canManageOperations. | none |

## Browser evidence

Browser evidence pending the exact-HEAD local fixture run.

## Known scope

- Public, authentication, invitation, API, and error routes are outside this authenticated dashboard inventory.
- Direct-denial checks prove authorization only; they are not counted as discoverability evidence.
- Hosted Supabase, Vercel, email, real IPS data, and production deployment remain unchanged.
