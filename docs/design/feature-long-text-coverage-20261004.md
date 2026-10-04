# Feature text containment evidence — 2026-10-04

Reviewed base: `db86c5d09c71c485a5b5d4ad1772cdcc00b51451`.
Branch: `codex/feature-long-text-20261004`.
The supplied bundle was verified and its HEAD matched this SHA. Work uses a separate
local clone under task-14, so neither the reviewed checkout nor its Git metadata is
modified. No dependencies, records, permissions, database changes or hosted writes.

## Scope

- Feature-owned names, contacts, identifiers, warnings, filenames, table cells and
  search results wrap instead of using ellipsis or line clamps.
- Mobile inspector/card headings and facts have usable width; status badges and
  actions can move onto another row. Related-person links grow with their text.
- Property net and P&L amount columns have enough space for the large fixture amounts.
  Existing currency formatting and financial calculations are unchanged.
- Report column options and filter selections wrap; the column picker stays inside
  the viewport. Report detail labels stack on mobile and remain inline on desktop.
- Repeated rules were removed from feature detail lists and the auth switch footer.
- Property and unit inspector actions follow the content rather than overlaying it.
- Existing copy, role checks, queries, sorting, mutations and callbacks are unchanged.
  No font sizes were reduced and no new disclosure hides warnings or identifiers.
- No files in `src/components` or global CSS were edited. RecordLink/Card/select
  adjustments are classes on feature consumers, preserving the shared worker's scope.

## Reproduce the rendered evidence

Use the existing installed dependencies; no installation or application server is needed:

```powershell
node scripts/capture-feature-layout.mjs before
node scripts/capture-feature-layout.mjs after
```

`before` loads actual source from the reviewed Git SHA through esbuild, without
checking out or changing it. `after` loads the isolated working tree. Both use the
same controlled fixtures and the repository's actual Tailwind/global CSS. The local
server binds loopback, accepts GET only, and browser requests outside loopback are
aborted. Next routing/image, theme toggle and the auth action are synthetic boundaries.
The auth submission returns a controlled long error and never authenticates.

Outputs live in `output/playwright/feature-layout/{before,after}`:

- 127 PNGs per phase: 24 feature surfaces at 320/390/768/1440, 11 zoom-reflow captures,
  report-table captures without the picker, scroll-end captures and finance amount captures.
- `assertions.json`: 107 cases per phase, with document overflow, non-scroll viewport
  escape, real truncation/clipping, text outside its box and text outside table cells.
- `environment.json`: reviewed SHA, browser/Node versions and rendering boundaries.

The after command fails on unexpected overflow, clipping, cell overlap or page errors.
Deliberate table/board/navigation scroll viewports are distinguished from document
overflow. Visually hidden accessibility text and inert background content are excluded.
Shared breadcrumb truncation is separately reported, never counted as fixed here.

Fixtures include a long multilingual-style person/company name, a long property
name, uninterrupted reference identifiers, email addresses, a long PDF filename,
multi-sentence error/warning text and `USD 9,876,543,210.99`.

## Exact screenshot coverage

These are rendered component fixtures, **not navigated or signed-in route audits**.
Each row was captured at all four requested widths; the route column identifies
where the active components are used.

| Route association | Actual rendered components / fixture keys | State |
| --- | --- | --- |
| `/login` | AuthPageShell + LoginForm (`auth`) | Long description, synthetic submit error |
| `/overview`, `/overview/[view]` | RecordsPropertyPreviewList (`dashboard`) | Long property name, missing links |
| `/properties` | PropertiesTable (`properties-register`), PropertyInspector (`property`) | Mobile card, desktop register, long owner/address/name, large net, actions |
| `/properties` | PropertyFilters (`property-filters`) | Open filters, long removable query chip |
| `/units` | UnitsTable (`units-register`), UnitInspector (`unit-inspector`) | Mobile card, desktop table, raw unit identifier, long tenant and lease label, amounts/status/actions |
| `/units/[unitId]` related drawers | UnitLeaseDetailsPanel (`unit`) | Long tenant/person link, full dates and rent |
| `/people` | PeopleTable (`people-register`), PeopleInspector (`people`) | Long legal name/contact/relationship, full warning, actions |
| Person choices in leases/finance | PersonSelect (`person-search`) | Open searchable result with long label and email |
| `/leases` | LeasesTable (`leases-register`), LeaseInspector (`leases`) | Full tenant/property/unit, dates, rent/deposit, next-action warning |
| `/maintenance` | BoardSurface (`maintenance`) | Long task/property/unit/vendor/assignee/due text, status, priority, Preview |
| `/timeline` and scoped Timeline consumers | TimelineTable (`timeline-register`), TimelineInspector (`timeline`) | Full record title/source identifier, archived source, attachment, history error and Retry |
| `/reports/unit-profit-loss` | ProfitLossDetail + ReportColumns (`reports`) | Expanded account/transaction lines, open column picker, full names/memo/amounts |
| `/reports/[reportKind]` detail drawer | ReportResultsTable (`report-detail`) | Open drawer; long inline label and value; mobile stacked facts; totals |
| `/reports/unit-profit-loss` compact filters | ReportsFilters (`report-filters`) | Full selected property/unit labels, Apply/Reset |
| `/settings/organization` and settings consumers | SettingsSectionHeader in actual CardHeader (`settings`) | Long title/description and Save action |
| Document consumers | DocumentList (`documents`) | Long uninterrupted filename/category/date |
| `/finance/accounts/[accountId]` | FinanceAccountActivityScreen (`finance`) | Long account name/identifier/description/property/contact, filter toolbar, table and full amount |
| Component empty/error examples | RecordsPropertyPreviewList + DocumentList + UnitMaintenanceCasePanel (`empty`) | Empty records/documents, long blocked-case title |
| `/people` loading | PeopleScreenSkeleton (`loading`) | Mobile and desktop loading controls/rows |

200% reflow-equivalent screenshots cover `auth`, `property`, `unit`, `unit-inspector`,
`people`, `leases`, `timeline`, `reports`, `report-detail`, `settings`, and `finance`.
They use 720 CSS pixels at device scale factor 2, corresponding to a 1440-pixel
display at 200%. This is **not native browser-menu zoom verification**.

Actual PNG pixels were inspected, including mobile warnings/names/controls, desktop
registers, report drawers, table amounts and selected report labels. Labelled top-crop
contact sheets support review; the original full-page PNGs are retained unchanged.
Pixel inspection found and corrected a settings header that had become too narrow
and a unit identifier overlapping neighbouring cells, beyond document-width checks.

## Checks completed

- [x] Bundle verification and exact reviewed HEAD verification.
- [x] Scoped ESLint for changed TSX files; TypeScript `--noEmit --incremental false`.
- [x] Existing focused UI suites with `--maxWorkers=1 --no-file-parallelism`.
  Fifteen distinct files, 370 distinct tests passed across the focused runs.
  The old lease test that required deposit attention to truncate now requires wrapping.
- [x] Actual rendered screenshot assertions; `git diff --check` and harness syntax check.
- [x] Reviewed matching before/after PNG pixels; no live audit claimed.
- [x] No Docker, full build, dependency installation, remote publication, merge or deployment.

Focused test files: `profit-loss-detail`, `report-results-table`, `timeline-inspector`,
`organization-identity-editor`, `people-screen-skeleton`, `lease-screen`, `people-screen`,
`property-screen`, `unit-detail-screen`, `timeline-screen`, `person-select`,
`reports-filters`, `maintenance-workspace-ui`, `people-command-center`, and
`finance-operations-screen` (all under their feature component directories).

## Unverified and coordination checklist

- [ ] Full signed-in routes, production data, every permission/role state, mutations,
  native exports/downloads and actual network failures. Live browser setup remains deferred.
- [ ] Full auth recovery/invitation routes: wrapping is source-reviewed, but only the
  login form/shell has rendered evidence here.
- [ ] Full property/unit/person/lease detail pages, edit/create/archive dialogs and
  every drawer combination. Detail values were source-reviewed; selected inspectors
  and related drawers are rendered above.
- [ ] Full rent-income/bills-expenses/ledger pages. Invoice/recipient/vendor and ledger
  warning wrapping are source-reviewed and covered by focused existing UI tests where
  available; the finance screenshot is the actual account-activity screen only.
- [ ] Full maintenance screen table, calendar/workload/routine views, workflow dialogs,
  drag/drop and async transitions. Board cards are rendered; other active table labels
  were source-reviewed and existing maintenance UI tests passed.
- [ ] Every report kind, report directory, saved views, non-compact report-filter option
  popovers, paginated data and every financial magnitude. Rendered report data is one
  expanded expense group plus an empty unit transaction drawer.
- [ ] Complete settings identity/access/roles/teams/branches/appearance pages. Settings
  title/description/action layout is rendered; identity raw values and access labels
  were source-reviewed, with existing targeted tests for the identity editor.
- [ ] Real Geist font metrics: fixtures use system fallbacks. Next/font downloads,
  native browser-menu zoom, dark theme, other browsers and screen-reader/axe audits
  were not run. This limits the breadth of visual/accessibility claims.
- [ ] Shared finance breadcrumb truncation remains at all widths and the 200% reflow
  equivalent. It is recorded in `sharedClipped` and belongs to the shared layout worker.
- [ ] Shared global search/filter/table/pagination primitives and full app chrome are
  owned by the other worker. Feature consumer overrides should be checked during
  integration against that worker's final shared spacing changes.

The final result applies only to the controlled component/state matrix above. It
does not establish a platform-wide or production visual pass.

Final mobile register refinement: Timeline uses one responsive table DOM with card-style rows below md; title, type/status, identifiers, cost and Preview remain visible. Lease mobile cards now show rent, property cards show net, and unit cards label rent and net. Desktop behavior and callbacks are preserved. Geometry checks allow three CSS pixels of vertical glyph overhang and exclude root overflow from ancestor clipping because fixed drawer elements are clipped by the viewport.

At 768px some desktop register tables intentionally scroll horizontally; the first viewport does not show every column. Shared overflow cues/responsive table contracts remain an integration check. The mobile feature cards and Timeline rows show financial values directly. Final recheck: 76 focused tests passed after the mobile refinement; standalone TypeScript and scoped ESLint passed. Final after matrix: 107 cases, no feature geometry failures or browser errors; five shared breadcrumb truncation findings remain explicitly excluded from that claim.
