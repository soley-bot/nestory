# Authenticated route discoverability

<!-- contract-sha256:441a91d5b1ea6e8b82a1eff554797d3fe8cb7cbabea6c90a7e359b683387eac5 -->

This report is generated from `config/authenticated-route-discoverability.json`. The contract covers all 47 production pages inside the authenticated dashboard layout. `/workspace` is the authenticated arrival router and is verified once per role as the shell entry.

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
| `/documents` | `requirePermission` / `canManageAccess` | global via shell-documents; pending sa:documents | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/finance -->
| `/finance` | `requireFinanceContext` / `canReadFinance` | global via shell-finance; pending sa:finance | global via shell-finance; pending fm:finance | global via shell-finance; pending fmem:finance | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/finance/advanced -->
| `/finance/advanced` | `requireFinanceContext` / `canReadFinance` | global via shell-advanced-finance; pending sa:finance-advanced | global via shell-advanced-finance; pending fm:finance-advanced | global via shell-advanced-finance; pending fmem:finance-advanced | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/financial-timeline -->
| `/financial-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-financial-timeline; pending sa:financial-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/import -->
| `/import` | `requireSuperAdminContext` / `canManageAccess` | global via shell-import; pending sa:import | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/inspections -->
| `/inspections` | `requirePermission` / `canManageOperations` | global via shell-inspections; pending sa:inspections | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-inspections; pending om:inspections | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/leases -->
| `/leases` | `requirePermission` / `canReadFinance` | global via shell-leases; pending sa:leases | global via shell-leases; pending fm:leases | global via shell-leases; pending fmem:leases | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/leases/[leaseId] -->
| `/leases/[leaseId]` | `requirePermission` / `canReadFinance` | context via lease-detail; pending sa:lease-detail | context via lease-detail; pending fm:lease-detail | context via lease-detail; pending fmem:lease-detail | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/ledger -->
| `/ledger` | `requireFinanceContext` / `canReadFinance` | context via advanced-ledger; pending sa:ledger | context via advanced-ledger; pending fm:ledger | context via advanced-ledger; pending fmem:ledger | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/maintenance -->
| `/maintenance` | `requirePermission` / `canManageOperations` | global via shell-maintenance; pending sa:maintenance | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-maintenance; pending om:maintenance | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/maintenance-timeline -->
| `/maintenance-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-maintenance-timeline; pending sa:maintenance-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/overview/[view] -->
| `/overview/[view]` | `requireSuperAdminContext` / `canManageAccess` | context via overview-drilldown; pending sa:overview-attention | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/overview -->
| `/overview` | `requireSuperAdminContext` / `canManageAccess` | global via shell-overview; pending sa:overview | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/owners -->
| `/owners` | `requirePermission` / `canManageAccess` | context via people-owners; pending sa:owners | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/people/[personId] -->
| `/people/[personId]` | `requirePermission` / `canManageAccess` | context via people-detail; pending sa:person-detail | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/people -->
| `/people` | `requirePermission` / `canManageAccess` | global via shell-people; pending sa:people | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/petty-cash -->
| `/petty-cash` | `requireFinanceContext` / `canReadFinance` | context via advanced-petty-cash; pending sa:petty-cash | context via advanced-petty-cash; pending fm:petty-cash | context via advanced-petty-cash; pending fmem:petty-cash | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link, no-admin-person-link |
<!-- authenticated-route:/properties/[propertyId]/account -->
| `/properties/[propertyId]/account` | `requireFinanceContext` / `canReadFinance` | context via property-account; pending sa:property-account | context via property-account; pending fm:property-account | context via property-account; pending fmem:property-account | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | none |
<!-- authenticated-route:/properties/[propertyId]/finance -->
| `/properties/[propertyId]/finance` | `requireFinanceContext` / `canReadFinance` | context via property-finance-invoice; pending sa:property-finance | context via property-finance-invoice; pending fm:property-finance | context via property-finance-invoice; pending fmem:property-finance | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/properties/[propertyId] -->
| `/properties/[propertyId]` | `requirePermission` / `canManageAccess` | context via property-detail; pending sa:property-detail | Intentionally inaccessible — Requires canManageAccess; use the finance-safe property account. | Intentionally inaccessible — Requires canManageAccess; use the finance-safe property account. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/properties -->
| `/properties` | `requirePermission` / `canManageAccess` | global via shell-properties; pending sa:properties | Intentionally inaccessible — Requires canManageAccess; use Owner balances and property accounts. | Intentionally inaccessible — Requires canManageAccess; use Owner balances and property accounts. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/properties/setup -->
| `/properties/setup` | `requirePermission` / `canManageAccess` | context via property-setup; pending sa:property-setup | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/property-timeline -->
| `/property-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-property-timeline; pending sa:property-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/recurring-tasks -->
| `/recurring-tasks` | `requirePermission` / `canManageOperations` | global via shell-recurring; pending sa:recurring | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-recurring; pending om:recurring | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/rent-income -->
| `/rent-income` | `requireFinanceContext` / `canReadFinance` | global via shell-rent; pending sa:rent | global via shell-rent; pending fm:rent | global via shell-rent; pending fmem:rent | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/reports/[reportKind] -->
| `/reports/[reportKind]` | `requireFinanceReportContext` / `canReadFinanceReports` | context via report-detail; pending sa:report-detail | context via report-detail; pending fm:report-detail | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | finance-safe-property-account, no-admin-unit-link, no-admin-person-link |
<!-- authenticated-route:/reports -->
| `/reports` | `requireFinanceReportContext` / `canReadFinanceReports` | global via shell-reports; pending sa:reports | global via shell-reports; pending fm:reports | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | Intentionally inaccessible — Requires canReadFinanceReports. | none |
<!-- authenticated-route:/settings -->
| `/settings` | `requireWorkspaceContext` / `settingsEntry` | global via shell-settings; pending sa:settings | Intentionally inaccessible — No configurable Settings destination. | Intentionally inaccessible — No configurable Settings destination. | Intentionally inaccessible — No configurable Settings destination. | Intentionally inaccessible — No configurable Settings destination. | none |
<!-- authenticated-route:/settings/organization -->
| `/settings/organization` | `requireSuperAdminContext` / `canManageAccess` | context via settings-organization; pending sa:settings-organization | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/appearance -->
| `/settings/appearance` | `requireSuperAdminContext` / `canManageAccess` | context via settings-appearance; pending sa:settings-appearance | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/branches -->
| `/settings/branches` | `requireSuperAdminContext` / `canManageAccess` | context via settings-branches; pending sa:settings-branches | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/teams -->
| `/settings/teams` | `requireSuperAdminContext` / `canManageAccess` | context via settings-teams; pending sa:settings-teams | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/access -->
| `/settings/access` | `requireSuperAdminContext` / `canManageAccess` | context via settings-access; pending sa:settings-access | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/roles -->
| `/settings/roles` | `requireSuperAdminContext` / `canManageAccess` | context via settings-roles; pending sa:settings-roles | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/staff -->
| `/staff` | `requirePermission` / `canManageAccess` | context via people-staff; pending sa:staff | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/tasks -->
| `/tasks` | `requireOperationsExecutionContext` / `canExecuteOperations` | global via shell-tasks; pending sa:tasks | Intentionally inaccessible — Requires canExecuteOperations. | Intentionally inaccessible — Requires canExecuteOperations. | global via shell-tasks; pending om:tasks | global via shell-tasks; pending omem:tasks | none |
<!-- authenticated-route:/tenants -->
| `/tenants` | `requirePermission` / `canManageAccess` | context via people-tenants; pending sa:tenants | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/timeline -->
| `/timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-timeline; pending sa:timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/units/[unitId] -->
| `/units/[unitId]` | `requirePermission` / `canManageAccess` | context via unit-detail; pending sa:unit-detail | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/units/[unitId]/finance -->
| `/units/[unitId]/finance` | `requireFinanceContext` / `canReadFinance` | context via unit-finance-invoice; pending sa:unit-finance | context via unit-finance-invoice; pending fm:unit-finance | context via unit-finance-invoice; pending fmem:unit-finance | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/units -->
| `/units` | `requirePermission` / `canManageAccess` | context via units-list; pending sa:units | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/users-roles -->
| `/users-roles` | `redirect` / `canManageAccess` | context via settings-access; pending sa:users-roles-redirect | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/vendors -->
| `/vendors` | `requirePermission` / `canManageAccess` | context via people-vendors; pending sa:vendors | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/work-orders -->
| `/work-orders` | `requirePermission` / `canManageOperations` | global via shell-work-orders; pending sa:work-orders | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-work-orders; pending om:work-orders | Intentionally inaccessible — Requires canManageOperations. | none |

## Browser evidence

Browser evidence pending the exact-HEAD local fixture run.

## Known scope

- Public, authentication, invitation, API, and error routes are outside this authenticated dashboard inventory.
- Direct-denial checks prove authorization only; they are not counted as discoverability evidence.
- Hosted Supabase, Vercel, email, real IPS data, and production deployment remain unchanged.
