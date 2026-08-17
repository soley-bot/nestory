# Authenticated route discoverability

<!-- contract-sha256:1f66d360ebd21d01553828c6b623a52dc9d4c90e70c8bc22dcafbfb1c6657dc3 -->

This report is generated from `config/authenticated-route-discoverability.json`. The contract covers all 47 production pages inside the authenticated dashboard layout. `/workspace` is the authenticated arrival router and is verified once per role as the shell entry.

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
<!-- authenticated-route:/finance/advanced -->
| `/finance/advanced` | `requireFinanceContext` / `canReadFinance` | global via shell-advanced-finance; passed sa:finance-advanced | global via shell-advanced-finance; passed fm:finance-advanced | global via shell-advanced-finance; passed fmem:finance-advanced | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
<!-- authenticated-route:/financial-timeline -->
| `/financial-timeline` | `requireSuperAdminContext` / `canManageAccess` | global via shell-financial-timeline; passed sa:financial-timeline | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/import -->
| `/import` | `requireSuperAdminContext` / `canManageAccess` | global via shell-import; passed sa:import | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/inspections -->
| `/inspections` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-inspections; passed sa:inspections | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-inspections; passed om:inspections | Intentionally inaccessible — Requires canManageOperations. | none |
<!-- authenticated-route:/leases -->
| `/leases` | `requireFinanceContext` / `canReadFinance` | global via shell-leases; passed sa:leases | global via shell-leases; passed fm:leases | global via shell-leases; passed fmem:leases | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/leases/[leaseId] -->
| `/leases/[leaseId]` | `requireFinanceContext` / `canReadFinance` | context via lease-detail; passed sa:lease-detail | context via lease-detail; passed fm:lease-detail | context via lease-detail; passed fmem:lease-detail | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/ledger -->
| `/ledger` | `requireFinanceContext` / `canReadFinance` | context via advanced-ledger; passed sa:ledger | context via advanced-ledger; passed fm:ledger | context via advanced-ledger; passed fmem:ledger | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
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
| `/petty-cash` | `requireFinanceContext` / `canReadFinance` | context via advanced-petty-cash; passed sa:petty-cash | context via advanced-petty-cash; passed fm:petty-cash | context via advanced-petty-cash; passed fmem:petty-cash | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link, no-admin-person-link |
<!-- authenticated-route:/properties/[propertyId]/account -->
| `/properties/[propertyId]/account` | `requireFinanceContext` / `canReadFinance` | context via property-account; passed sa:property-account | context via property-account; passed fm:property-account | context via property-account; passed fmem:property-account | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | none |
<!-- authenticated-route:/properties/[propertyId]/finance -->
| `/properties/[propertyId]/finance` | `requireFinanceContext` / `canReadFinance` | context via property-finance-invoice; passed sa:property-finance | context via property-finance-invoice; passed fm:property-finance | context via property-finance-invoice; passed fmem:property-finance | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account |
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
| `/settings` | `requireWorkspaceContext` / `settingsEntry` | global via shell-settings; passed sa:settings | Intentionally inaccessible — No configurable Settings destination. | Intentionally inaccessible — No configurable Settings destination. | Intentionally inaccessible — No configurable Settings destination. | Intentionally inaccessible — No configurable Settings destination. | none |
<!-- authenticated-route:/settings/organization -->
| `/settings/organization` | `requireSuperAdminContext` / `canManageAccess` | context via settings-organization; passed sa:settings-organization | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/appearance -->
| `/settings/appearance` | `requireSuperAdminContext` / `canManageAccess` | context via settings-appearance; passed sa:settings-appearance | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/branches -->
| `/settings/branches` | `requireSuperAdminContext` / `canManageAccess` | context via settings-branches; passed sa:settings-branches | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/teams -->
| `/settings/teams` | `requireSuperAdminContext` / `canManageAccess` | context via settings-teams; passed sa:settings-teams | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/access -->
| `/settings/access` | `requireSuperAdminContext` / `canManageAccess` | context via settings-access; passed sa:settings-access | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/settings/rent-policy -->
| `/settings/rent-policy` | `requireLeaseConfigurationContext` / `canConfigureLeases` | context via advanced-rent-policy; passed sa:rent-policy | context via advanced-rent-policy; passed fm:rent-policy | Intentionally inaccessible — Requires canConfigureLeases. | Intentionally inaccessible — Requires canConfigureLeases. | Intentionally inaccessible — Requires canConfigureLeases. | none |
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
<!-- authenticated-route:/units/[unitId]/finance -->
| `/units/[unitId]/finance` | `requireFinanceContext` / `canReadFinance` | context via unit-finance-invoice; passed sa:unit-finance | context via unit-finance-invoice; passed fm:unit-finance | context via unit-finance-invoice; passed fmem:unit-finance | Intentionally inaccessible — Requires canReadFinance. | Intentionally inaccessible — Requires canReadFinance. | finance-safe-property-account, no-admin-unit-link |
<!-- authenticated-route:/units -->
| `/units` | `requireSuperAdminContext` / `canManageAccess` | context via units-list; passed sa:units | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess; finance screens keep unit identity as trace text. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/users-roles -->
| `/users-roles` | `redirect` / `canManageAccess` | context via settings-access; passed sa:users-roles-redirect | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/vendors -->
| `/vendors` | `requireSuperAdminContext` / `canManageAccess` | context via people-vendors; passed sa:vendors | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | Intentionally inaccessible — Requires canManageAccess. | none |
<!-- authenticated-route:/work-orders -->
| `/work-orders` | `requireOperationsManagementContext` / `canManageOperations` | global via shell-work-orders; passed sa:work-orders | Intentionally inaccessible — Requires canManageOperations. | Intentionally inaccessible — Requires canManageOperations. | global via shell-work-orders; passed om:work-orders | Intentionally inaccessible — Requires canManageOperations. | none |

## Browser evidence

- Tested implementation SHA: `a4d30c13aacbfb26f210dc9a969c8138e8757c48`
- Local base URL: `http://localhost:3001`
- Result: 84/84 visible-link journeys passed
- Role sessions: 5/5 started at `/workspace` and resolved to the role home once.
- Denied global anchors: 69 role/entry absence checks passed.
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
- `finance_member`: passed — 16 forbidden global hrefs checked
- `operations_manager`: passed — 17 forbidden global hrefs checked
- `operations_member`: passed — 21 forbidden global hrefs checked

### Visible-link journeys from the current shell/context

- `sa:account`: passed — Profile menu → Profile
- `sa:balances`: passed — Owner accounts
- `sa:expenses`: passed — Expenses
- `sa:documents`: passed — Documents
- `sa:finance`: passed — Portfolio review
- `sa:finance-advanced`: passed — Advanced
- `sa:financial-timeline`: passed — Financial timeline
- `sa:import`: passed — Import
- `sa:inspections`: passed — Inspections
- `sa:leases`: passed — Leases
- `sa:lease-detail`: passed — Leases → Lease quick view → Open lease record
- `sa:ledger`: passed — Advanced → Ledger
- `sa:maintenance`: passed — Cases
- `sa:maintenance-timeline`: passed — Maintenance timeline
- `sa:overview-attention`: passed — Dashboard → Needs attention → View all checks
- `sa:overview`: passed — Dashboard
- `sa:owners`: passed — People → Owners
- `sa:person-detail`: passed — People → Bright Mekong Trading
- `sa:people`: passed — People
- `sa:petty-cash`: passed — Advanced → Petty cash
- `sa:property-account`: passed — Advanced → Ledger → Close Readiness House
- `sa:property-finance`: passed — Rent & collections → Invoice details → Open Property finance
- `sa:property-detail`: passed — Properties → Preview Close Readiness House → Open property
- `sa:properties`: passed — Properties
- `sa:property-setup`: passed — Properties → Set up property (empty-state entry)
- `sa:property-timeline`: passed — Property timeline
- `sa:recurring`: passed — Recurring work
- `sa:rent`: passed — Rent & collections
- `sa:report-detail`: passed — Reports → Open report
- `sa:reports`: passed — Reports
- `sa:settings`: passed — Settings
- `sa:settings-organization`: passed — Settings → Organization
- `sa:settings-appearance`: passed — Settings → Appearance
- `sa:settings-branches`: passed — Settings → Branches
- `sa:settings-teams`: passed — Settings → Teams
- `sa:settings-access`: passed — Settings → Access
- `sa:rent-policy`: passed — Advanced → Historical rent policies
- `sa:staff`: passed — People → Staff
- `sa:tasks`: passed — My work
- `sa:tenants`: passed — People → Tenants
- `sa:timeline`: passed — Timeline history
- `sa:unit-detail`: passed — Properties → Preview Central Residence → Units → Preview unit A-01 → Open unit
- `sa:unit-finance`: passed — Rent & collections → Invoice details → Open Unit finance
- `sa:units`: passed — Properties → Preview Close Readiness House → Units
- `sa:users-roles-redirect`: passed — Settings → Access → Legacy access redirect
- `sa:vendors`: passed — People → Vendors
- `sa:work-orders`: passed — Work orders
- `fm:account`: passed — Profile menu → Profile
- `fm:balances`: passed — Owner accounts
- `fm:expenses`: passed — Expenses
- `fm:finance`: passed — Portfolio review
- `fm:finance-advanced`: passed — Advanced
- `fm:leases`: passed — Leases
- `fm:lease-detail`: passed — Leases → Lease quick view → Open lease record
- `fm:ledger`: passed — Advanced → Ledger
- `fm:petty-cash`: passed — Advanced → Petty cash
- `fm:property-account`: passed — Advanced → Ledger → Close Readiness House
- `fm:property-finance`: passed — Rent & collections → Invoice details → Open Property finance
- `fm:rent`: passed — Rent & collections
- `fm:report-detail`: passed — Reports → Open report
- `fm:reports`: passed — Reports
- `fm:rent-policy`: passed — Advanced → Historical rent policies
- `fm:unit-finance`: passed — Rent & collections → Invoice details → Open Unit finance
- `fmem:account`: passed — Profile menu → Profile
- `fmem:balances`: passed — Owner accounts
- `fmem:expenses`: passed — Expenses
- `fmem:finance`: passed — Portfolio review
- `fmem:finance-advanced`: passed — Advanced
- `fmem:leases`: passed — Leases
- `fmem:lease-detail`: passed — Leases → Lease quick view → Open lease record
- `fmem:ledger`: passed — Advanced → Ledger
- `fmem:petty-cash`: passed — Advanced → Petty cash
- `fmem:property-account`: passed — Advanced → Ledger → Close Readiness House
- `fmem:property-finance`: passed — Rent & collections → Invoice details → Open Property finance
- `fmem:rent`: passed — Rent & collections
- `fmem:unit-finance`: passed — Rent & collections → Invoice details → Open Unit finance
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
