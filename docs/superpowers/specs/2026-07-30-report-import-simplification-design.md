# Reports And Imports Simplification Design

## Goal

Reduce Reports and Import to the smallest reliable workflows that match the
Nestory and IPS requirements in Google Drive.

Reports becomes one monthly-reporting workspace with three formal outputs.
Import becomes one guided CSV workflow with progressive disclosure. The
redesign removes product surface as well as visual clutter, while preserving
the data validation, traceability, and safe write boundaries required for
financial and onboarding work.

## Product Authorities

The product boundary comes from:

- `IPS Meeting Summary`, which identifies three required formal reports:
  Monthly Unit Profit & Loss, Owner Statement, and IPS Management Fee
  Statement.
- `Note:Things to work on`, which asks for end-to-end workflows, plain
  property-management language, tighter tables, inline feedback, and better
  PDF reports.
- The current Nestory repository, which remains the authority for implemented
  data, authentication, source traceability, import validation, and safe write
  behavior.

The Google Drive documents define what the product needs. They do not authorize
invented financial values when the current data model cannot prove them.

## Formal Report Boundary

Reports contains exactly three visible report kinds.

### Monthly Unit Profit & Loss

This replaces the visible `Unit Performance` report.

Required output:

- one row per unit for the selected month
- property and unit identity
- income
- expenses
- net income
- direct access to the underlying source records

The current unit-performance loader may be reused where its figures remain
valid. The user-facing name and report structure must use `Monthly Unit Profit
& Loss`.

### Owner Statement

This remains a formal report, but its visible structure must match the IPS
owner-balance requirement.

Required output:

- opening owner balance
- net income generated during the selected month
- owner withdrawals or payments
- closing owner balance carried forward
- unit-level transaction detail combined into the selected owner's statement

Security deposits, utility deposits, and pet deposits are excluded from owner
income and owner-statement totals. A deposit may be disclosed separately only
when the data source proves that disclosure and it cannot be mistaken for
income.

The existing readiness step remains because an owner-facing document must not
be generated from an invalid property, recipient, or period. Readiness is part
of the Owner Statement workflow, not a separate report.

If opening or closing owner balance is not authoritative in the current
implementation, the report must remain visibly unavailable for publication.
The redesign must not calculate a plausible-looking balance from incomplete
sources.

### IPS Management Fee Statement

This is a new internal monthly report for IPS.

Required output:

- selected month and optional property scope
- property and optional unit identity
- management fee source
- fee amount collected
- total management fees collected
- source-record access

Recorded, earned, outstanding, and collected fees must not be conflated. The
headline and exported total include collected management fees only. Any other
state may appear only as a clearly labeled exception or source detail.

## Removed Formal Reports

Remove these report kinds from the report catalog, report navigation, report
selection, and primary export UI:

- Rent Roll
- Property Performance
- standalone Income & Expense
- Lease Expiry
- Vacancy & Lease Risk
- Maintenance Cost
- Record Readiness
- People Readiness

Their underlying operational records are not deleted. They belong in the
modules where operators already do the work:

- rent, lease expiry, and vacancy information in Units and Leases
- property performance in Overview and property records
- transaction detail in Finance and Ledger
- maintenance cost in Maintenance and Finance
- record cleanup in the relevant Units, Leases, Properties, or People
  workspace

Existing internal links must be changed to those operational destinations.
Legacy report-page URLs must redirect to the closest supported module while
preserving useful month, property, unit, status, or People-scope parameters.
A removed export URL must never silently return a different report.

Use these fallback destinations:

| Removed report | Operational destination |
| --- | --- |
| Rent Roll | `/units` |
| Property Performance | `/overview?lens=finance` |
| Income & Expense | `/ledger` |
| Lease Expiry | `/leases?status=current&endsWithin=60d&sort=end_asc` |
| Vacancy & Lease Risk | `/units?occupancy=unoccupied` |
| Maintenance Cost | `/maintenance` |
| Record Readiness | `/overview?lens=records` |
| People Readiness | `/people` |

Only parameters accepted by the destination are carried forward.

## Reports Workspace

`/reports` opens the monthly-reporting workspace directly. It does not show a
catalog or packet library.

The canonical report routes are:

- `/reports/unit-profit-loss`
- `/reports/owner-statement`
- `/reports/management-fees`

`/reports` defaults to Monthly Unit Profit & Loss. The former
`/reports/unit-performance` and `profit-loss` aliases redirect to the new Unit
Profit & Loss route with supported scope intact.

The page contains:

1. a compact `Reports` header
2. three report tabs
3. one filter row
4. one compact totals strip when totals are trustworthy
5. the report table or readiness list
6. one `Export` control with PDF and Excel options

The filter row adapts to the active report:

- month and property for all three reports
- unit for Monthly Unit Profit & Loss
- owner for Owner Statement

Report state remains URL-backed. Deep links to a supported report and scope
remain shareable.

Remove:

- report-family navigation
- report categories
- report packets
- the report-builder card
- the `Preview ready` strip
- repeated row, scope, and period metadata
- separate source-count captions on every summary value
- three simultaneous PDF, CSV, and Print controls

Rows retain a compact source action. Full traceability remains available
without making source counts the visual focus of every metric.

Exports are PDF and actual Excel workbooks. CSV may remain as an internal
compatibility endpoint during migration, but it is not presented as Excel or
shown as a primary report action.

## Import Boundary

Keep all four import types because they support the IPS onboarding workflow:

- Properties
- Units / rent roll
- People
- Leases

Keep these safety capabilities:

- type-specific template download
- automatic and manual header mapping
- saved mappings
- staged import runs
- validation preview
- blocked-row correction
- partial success for valid rows
- recent run history
- RPC-backed commits and activity history

These capabilities remain implementation boundaries, not separate dashboard
sections.

## Import Workflow

The main screen presents one vertical workflow.

### Start

Show one compact import-type selector, one nearby template link, and the file
dropzone. Do not repeat the selected type, readiness explanation, dependency
guide, or template action in other panels.

### Match

After upload, apply automatic or saved mappings immediately.

Hide the full column-mapping form when every required field is matched. Show a
compact `Review column matching` disclosure when the operator wants to inspect
it. Open that disclosure automatically when a required or ambiguous match needs
attention.

### Review And Import

Show one summary line such as:

`126 ready, 4 need attention`

Use one preview table. Put row issues directly in the affected row. When
blocked rows exist, show only the relevant correction actions, including error
row or fix-template download where supported.

Use one primary action:

`Import 126 ready rows`

The action preserves the staged-run and safe-commit boundaries internally.
Blocked rows remain attached to the import run for correction. The completion
message states created, updated, skipped, and failed counts once.

Put recent import history in a collapsed `Past imports` disclosure after the
workflow. It is available for audit without dominating a new import.

Remove:

- the page-description paragraph
- the four import-type cards
- the selected-type readiness guide
- the four-step progress bar
- the four statistic cards
- the empty Match Columns panel shown before upload
- the separate consequence panel
- the separate cleanup-queue panel
- the always-expanded import-run history cards
- duplicate template and setup actions

## Error And Empty States

- Before upload, the dropzone is the main empty state.
- A file-read or CSV-header error appears beside the dropzone with a direct
  correction.
- Missing required mappings open the mapping disclosure and identify the exact
  fields.
- Row errors appear in the preview row and prevent only invalid rows from
  committing.
- A report with no matching records explains the active scope and offers one
  clear reset action.
- A financially untrustworthy report is unavailable for export and explains
  the missing authority without showing ready-looking totals.

## Accessibility And Responsive Behavior

- Preserve semantic tab, table, form, status, alert, and dialog behavior.
- Keep visible keyboard focus and predictable focus return.
- On mobile, tabs and filters may scroll or stack without document-level
  overflow.
- Mapping disclosure, preview table, and Past imports remain keyboard
  accessible.
- Print and PDF output must remain readable independently of the application
  shell.

## Verification And Delivery

Implementation is complete when:

1. Reports shows exactly three visible formal report kinds.
2. Removed report links resolve to the correct operational modules and no
   application navigation points to a deleted report.
3. Monthly Unit Profit & Loss, Owner Statement, and IPS Management Fee
   Statement preserve organization scope and source traceability.
4. Owner Statement excludes deposit categories and does not export an
   unsupported owner balance.
5. Report export offers PDF and real Excel output behind authentication.
6. Import shows one compact workflow while preserving mapping, validation,
   staging, partial success, safe commit, cleanup data, and run history.
7. Focused report, import, route, export, and link-contract tests pass.
8. Lint, TypeScript, the relevant test suite, build, UI copy, and route
   coverage pass.
9. Authenticated browser checks pass for Reports and Import at desktop and
   mobile widths.
10. Final desktop screenshots of the Reports and Import results are uploaded
    to the user's Nestory Google Drive folder and verified by Drive readback.

## Out Of Scope

- A general accounting system, corporate P&L, payroll, tax, or ERP reporting
- Additional formal reports not named by IPS
- Invented owner-balance authority
- Changing the four supported onboarding import domains
- Removing historical import-run or source-traceability data
