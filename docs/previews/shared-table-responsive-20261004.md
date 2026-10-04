# Shared responsive table and breadcrumb follow-up

Base: `8afed5a1aa99f07a79b2bbe9318453acd2196e07`, preserved unchanged. This follow-up edits only shared Table, PageBreadcrumb, PageHeader and AppShell, their focused tests, and synthetic preview tooling. No feature-specific priority, columns, query/navigation handlers or permissions changed.

## Shared contract

- Table measures its own scroll viewport and shows a visible explanation plus First columns / Last columns buttons only when it overflows. These controls work with mouse or keyboard, announce their target via aria-controls, and retain focus at unavailable edges with guarded aria-disabled behavior. Native scrolling remains available. No columns are automatically hidden or reordered.
- Optional `mobileContent` lets the feature owner render primary record information and actions below 768px. View all columns reveals the complete original table; Use compact view restores the supplied composition. The feature must supply all critical amounts/statuses/actions and choose any secondary detail treatment. Existing callers without this prop automatically get overflow cues, but do not automatically get a mobile summary.
- The scroll container remains a direct child of the caller, preserving report max-height selectors and sticky headers. A focused test pins this existing structural contract.
- Breadcrumb links and the current label wrap without truncation. PageHeader's portal wrapper fills the available tools area; AppShell's bar grows from its existing 48px minimum rather than clipping long labels. The normal desktop fixture retains a 48px header.

Feature-worker coordination: adopt `Table mobileContent={...}` where that feature needs a primary mobile composition; own the choice and ordering of actual fields. The fixture illustrates names, outstanding balances, status, reference and actions all visible in compact mode. No universal column-hiding policy was introduced. Cross-thread messaging is unavailable here; the coordinator must relay this API to the feature worker before claiming actual feature adoption.

## Evidence

`output/playwright/shared-spacing/register-responsive-{before,after}` contains matching realistic fixtures at 320/390/768/1440: closed dropdown, open search suggestions, filters, full-table left/right/return-left, loading/empty/error and checks.json. Before reads pinned shared sources from `8afed5a1` through a read-only bundling overlay. Shared header class lists are read from the corresponding AppShell source and explicitly included in compiled Tailwind CSS, so baseline header classes remain present even after their source replacement.

The normal fixture uses Riverside House, West Street Apartments and North Riverside Court, references INV-104 through INV-106, ordinary balances and Showing 1-3 of 18. The separate `register-responsive-{before-stress,stress}` fixtures at 390/1440 use a long name, a large amount/count and a deliberate 1600px caller-configured table width to prove desktop overflow controls. Extreme values are labelled stress data, not presented as the normal product design.

The default closed 390px after view shows all primary data/actions without horizontal navigation. View all columns retains genuine horizontal scrolling with explicit controls. Open suggestions remain a conventional transient overlay; the closed screenshot is the main product preview. Eight stable animation frames are used before scroll captures to avoid capturing native keyboard-scroll motion halfway through a return to the first columns.

The top bar uses the actual shared header classes and actual PageBreadcrumb, with synthetic menu/search/theme controls. It does not mount the full signed-in AppShell or claim a live application audit. Next navigation/link behavior is adapted to a fixed synthetic route and ordinary anchors. Arial is a controlled fallback; production font metrics remain unverified.

## Coverage checklist

- [x] Actual 390px before/after closed/open pixels inspected; full-table right and return-left controls visibly reach values/actions and retain keyboard focus.
- [x] Actual 320/768 after pixels inspected; no document horizontal overflow in all recorded widths.
- [x] Normal 1440px before/after table fits without extra controls and keeps the 48px header; actual pixels inspected.
- [x] Deliberately wide 1440px stress table shows overflow controls; keyboard reaches both ends. Actual left/right/return-left pixels inspected.
- [x] Long mobile breadcrumb fits its growing header; desktop stays compact. Captured measurements show breadcrumbFits and breadcrumbWithinHeader true for corrected cases.
- [x] Loading/empty/error, typical and long labels, amounts, references, row actions, pagination, search suggestion focus and filter opening/closing.
- [x] 64 focused tests pass with one worker across table, workspace layout, app shell, search combo, pagination and interactive table. Scoped lint, TypeScript and diff whitespace checks pass.
- [ ] Real feature mobile-content adoption and actual feature column priorities; default existing tables gain cues only.
- [ ] Live signed-in routes, production fonts, full AppShell interactions, dark-mode new table/breadcrumb contract, native zoom, RTL and all platform consumers.

No screenshot was uploaded during this follow-up; the coordinator requested one complete combined preview before approval. Earlier Library artifacts retain their identities and are superseded as the main table preview by this closed realistic fixture. The complete shared preview archive includes earlier layout/drawer evidence, this matching table/breadcrumb package, coverage notes and self-contained HTML fixtures for coordinator review.
