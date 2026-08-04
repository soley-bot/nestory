# Task-First Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Nestory's boxy, stacked table-first presentation with a compact but legible task-first workspace system that preserves operational density, URL behavior, permissions, and domain authority.

**Architecture:** Change the shared workspace composition first, validate it through Leases and Maintenance pilots, then migrate each domain vertically without changing backend contracts. Settings is a separate sequential stream because its current three-zone composition and draft guards require coordinated changes. Tables remain the primary data surface where they are the correct tool, but page hierarchy comes from spacing, typography, alignment, and progressive disclosure before borders or cards.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Playwright smoke scripts, Supabase-backed existing domain actions.

## Global Constraints

- Baseline branch and commit at planning time: `main` at `2bc6cd677ad50110ed2d4df797dfe87f28d403ef`.
- Create an implementation branch named `codex/task-first-workspace-redesign` from the current `origin/main` after fetching and proving zero divergence.
- Do not change database tables, migrations, RPCs, server actions, route URLs, URL parameter names, finance authority, lease authority, permissions, or role behavior.
- Do not add a generic dashboard builder, saved-view engine, workflow engine, or new design-system package.
- Preserve `WorkspacePage`, `PageHeader`, `SettingsTabs`, `ConsequencePanel`, editor props, and `SettingsEditorHandle.discard()` as public APIs. Add optional props only where this plan specifies them.
- Preserve quick-view dialogs, drawers, focus restoration, back/forward navigation, draft guards, pagination, sorting, filters, and deep links.
- Treat laptop layouts as the primary target: validate at 1440 x 900 and 1280 x 800. Validate 200% browser zoom. Mobile is a non-regression target, not a redesign target in this slice.
- Keep user-facing labels plain. Do not expose internal accounting terms or explicitly label the management company as `IPS`.
- Use the configured organization/company name when a collector or manager label is needed.
- Use focused tests after each task, one typecheck at each wave gate, and the full standard gate once at the end. Do not run the full suite after every small commit.
- Keep each task's changes within its listed files. If a required change falls outside that list, stop that task and record the dependency before editing.
- Do not update `PROJECT.md` until the visual pilots are approved and the final interface contract is stable.

## Product Decision

The new rule is not "make every page less table-like." The rule is:

1. Show one clear context and title.
2. Show the primary action beside that title.
3. Use at most one secondary controls row.
4. Give the remaining height to one dominant work surface.
5. Use inline summaries and dividers before cards and bordered containers.
6. Keep search visible; move advanced filters into a popover or drawer.
7. Make task views meaningful and few in number.
8. Open short focused work in a modal; open long or multi-step work in a drawer or wizard.
9. Keep status, empty, error, permission, saving, and draft states explicit.

The earlier platform redesign specification remains authoritative for domain behavior, URLs, accessibility, and operational density. This plan supersedes only its literal stacked-band/table-frame interpretation and its persistent three-zone settings layout. The approved finance specification remains authoritative for finance language and accounting behavior.

## Source Material

- Current route screenshots: `output/design-audit-2026-08-04/`
- Existing platform specification: `docs/superpowers/specs/2026-07-15-platform-ui-ux-redesign-design.md`
- Approved finance specification: `docs/superpowers/specs/2026-07-30-ips-finance-workflow-simplification-design.md`
- Approved finance Figma file: <https://www.figma.com/design/N7HYfaJ9159eWDdBev0sxG>
- Canonical product and verification contract: `PROJECT.md`

## Acceptance Contract

Every migrated workspace must satisfy all of these conditions:

- Exactly one visible level-one heading describes the page.
- The primary action is visible without scanning a separate toolbar band.
- Local navigation and secondary controls occupy one controls region at most.
- The main data or task surface begins above the fold at 1280 x 800.
- Search stays visible on list-heavy routes.
- Advanced controls are disclosed by a labelled `Filters` button with an active count.
- A table's outer border/radius is removed on desktop; row separators, sticky headers, selection, pagination, and horizontal overflow remain.
- Cards remain only when they communicate a discrete object, state, warning, or action boundary.
- Keyboard order follows title, primary action, local navigation, controls, then work surface.
- At 200% zoom, controls wrap without horizontal page scrolling and the work surface remains reachable.
- Existing route, mutation, permission, and finance/lease authority tests keep passing.

## Required Visual Gate Before Product-Code Changes

The executing session must not begin Task 1 until this gate is approved.

- [ ] Open the current Leases and Maintenance screenshots from `output/design-audit-2026-08-04/` and the approved finance Figma file.
- [ ] Produce one desktop reference composition for Leases and one for Maintenance at 1440 x 900. Figma is preferred; a faithful static HTML reference is acceptable.
- [ ] Each reference must show the visible title, one primary action, one controls row, the dominant work surface, a filter-open state, and a quick-view/drawer-open state.
- [ ] Do not introduce a new visual language. Reuse the current tokens, buttons, typography, density, and navigation shell.
- [ ] Ask the user to approve the two compositions. Record the approved Figma URL or reference screenshot paths in the implementation-session handoff.
- [ ] After approval, capture the branch name and baseline SHA before Task 1.

## Execution Waves and Ownership

| Wave | Tasks | Dependency | Parallel rule |
| --- | --- | --- | --- |
| A | 1-2 | Visual gate approved | Tasks 1 and 2 may run in parallel because their files do not overlap. |
| B | 3-4 | Wave A merged | Leases and Maintenance may run in parallel. Stop for the runtime screenshot checkpoint after both. |
| C | 5-11 | Pilot checkpoint approved | Domain tasks may run in parallel only with exclusive file ownership. |
| D | 12-16 | Shared header stable | Execute sequentially because settings files and draft behavior overlap. |
| E | 17-18 | All migrations merged | Compatibility audit, documentation, full verification, and screenshots are sequential. |

Do not allow domain agents to edit shared layout or shared UI files after Wave A. Route a shared change back through one designated integration owner.

---

## Task 1: Establish the Shared Task-First Workspace Composition

**Files:**

- Modify: `src/components/layout/workspace-page.tsx`
- Modify: `src/components/layout/page-header.tsx`
- Delete or reduce to a compatibility wrapper: `src/components/layout/workspace-page-context.tsx`
- Test: `src/components/layout/workspace-layout.test.tsx`

**Contract:**

- Keep the existing `WorkspacePage` props unchanged.
- Add only `navigation?: ReactNode` to `PageHeaderProps`.
- A generated `WorkspacePage` header renders a visible `PageHeader` with the existing breadcrumb portal behavior.
- `actions` render in the visible header, not in a second toolbar band.
- `localNav` and `toolbar` share one `data-slot="workspace-controls"` region.
- Do not render a toolbar when only `actions` are supplied.

- [ ] Rewrite the generated-header tests first. Assert one visible `h1`, breadcrumb content inside `#workspace-page-tools`, header actions in `data-slot="page-header-actions"`, and no `role="toolbar"` for actions-only pages.
- [ ] Add a test where both `localNav` and `toolbar` are present. Assert both are descendants of one `data-slot="workspace-controls"` element and there is one labelled toolbar.
- [ ] Keep the existing overflow, portal fallback, and quick-view interaction tests.
- [ ] Run the focused test and confirm it fails for the current `sr-only` heading and split bands:

```powershell
npm test -- src/components/layout/workspace-layout.test.tsx
```

- [ ] Implement the generated header through `PageHeader`. The target composition is structurally equivalent to:

```tsx
<div data-slot="workspace-page" className="flex h-full min-h-0 flex-1 flex-col">
  <PageHeader
    actions={actions}
    breadcrumb={breadcrumb}
    context={context}
    title={title}
  />
  {localNav || toolbar ? (
    <div data-slot="workspace-controls">
      {localNav}
      {toolbar ? <div aria-label="Workspace tools" role="toolbar">{toolbar}</div> : null}
    </div>
  ) : null}
  <div className="min-h-0 flex-1" data-slot="workspace-body">{children}</div>
</div>
```

- [ ] Keep custom `header` rendering compatible. Do not invent a title when the caller deliberately supplies `header`.
- [ ] Add `navigation?: ReactNode` to `PageHeader`, rendered beneath the title/action line within the same header boundary. Add `data-slot="page-header-navigation"` and `data-slot="page-header-actions"` hooks.
- [ ] Remove `WorkspacePageContext` if it has no remaining import. If retaining it as a wrapper, it must render a visible heading and use `PageHeader`; it must not contain `sr-only` as its primary heading strategy.
- [ ] Run focused verification:

```powershell
npm test -- src/components/layout/workspace-layout.test.tsx
npx eslint src/components/layout/workspace-page.tsx src/components/layout/page-header.tsx src/components/layout/workspace-page-context.tsx src/components/layout/workspace-layout.test.tsx
```

- [ ] Commit only the shared composition files:

```powershell
git add src/components/layout/workspace-page.tsx src/components/layout/page-header.tsx src/components/layout/workspace-page-context.tsx src/components/layout/workspace-layout.test.tsx
git commit -m "refactor(ui): establish task-first workspace composition"
```

## Task 2: Add an Inline Consequence Presentation

**Files:**

- Modify: `src/components/ui/consequence-panel.tsx`
- Test: `src/components/ui/workflow-feedback.test.tsx`

**Contract:** Add `variant?: "contained" | "inline"`; default to `"contained"` so existing callers remain visually unchanged until migrated.

- [ ] Add a failing test for `variant="inline"`. Assert `role="region"`, heading association, summary, rows, and children remain. Assert `data-variant="inline"` is present and the outer container does not have the contained border/radius classes.
- [ ] Add a regression assertion that the omitted variant resolves to `data-variant="contained"`.
- [ ] Run the test and confirm failure:

```powershell
npm test -- src/components/ui/workflow-feedback.test.tsx
```

- [ ] Implement the variant. `inline` removes the outer card treatment and the nested `border-y`; it keeps row dividers, semantic `<dl>`, title, summary, and region labelling.
- [ ] Run focused verification:

```powershell
npm test -- src/components/ui/workflow-feedback.test.tsx
npx eslint src/components/ui/consequence-panel.tsx src/components/ui/workflow-feedback.test.tsx
```

- [ ] Commit:

```powershell
git add src/components/ui/consequence-panel.tsx src/components/ui/workflow-feedback.test.tsx
git commit -m "feat(ui): add inline consequence presentation"
```

## Task 3: Migrate Leases as the List-Workspace Pilot

**Files:**

- Modify: `src/features/leases/components/lease-screen.tsx`
- Modify: `src/features/leases/components/lease-filters.tsx`
- Modify: `src/features/leases/components/leases-table.tsx`
- Test: `src/features/leases/components/lease-screen.test.tsx`

**Remove:** Page-local `LeaseCommandStrip` and `LeaseCommandMetric`; they repeat or misrepresent page-scoped counts.

**Preserve:** URL parameters, pagination, sorting, quick views, lease creation drawer, rent-generation actions, permission checks, authoritative server totals, and lease mutation behavior.

- [ ] Rewrite the first layout test so `Lease summary` and `This page` are absent, while the visible `Leases` heading and primary create action are present.
- [ ] Add a filter-disclosure test: search is initially visible; the seven advanced controls are absent; activating `Filters` reveals them; active filter count is announced; Reset is disabled or absent with no active filters and enabled when a filter is active.
- [ ] Keep the page-two regression assertion. The authoritative total and pagination range must still come from server data rather than the visible row count.
- [ ] Add a table assertion for `data-slot="register-table-frame"` and verify its desktop class list has no rounded border/card padding treatment.
- [ ] Run and confirm the tests fail against the command strip and always-visible controls:

```powershell
npm test -- src/features/leases/components/lease-screen.test.tsx
```

- [ ] Keep search in the single controls row. Move status, property, unit, billing recipient, collection method, renewal state, and date/period controls into the existing `src/components/ui/filter-popover.tsx`.
- [ ] Use the filter popover's existing `activeCount`, title, trigger, focus, Escape, and outside-click behavior. Do not create another filter component.
- [ ] Render `LeaseReviewStrip` as inline status/context, not as a bordered dashboard card.
- [ ] Remove only the table's desktop outer frame. Keep semantic table markup, header, row separators, selection states, empty state, loading state, pagination, and horizontal scrolling.
- [ ] Run focused verification:

```powershell
npm test -- src/features/leases/components/lease-screen.test.tsx
npx eslint src/features/leases/components/lease-screen.tsx src/features/leases/components/lease-filters.tsx src/features/leases/components/leases-table.tsx src/features/leases/components/lease-screen.test.tsx
```

- [ ] Commit:

```powershell
git add src/features/leases/components/lease-screen.tsx src/features/leases/components/lease-filters.tsx src/features/leases/components/leases-table.tsx src/features/leases/components/lease-screen.test.tsx
git commit -m "refactor(leases): focus workspace on lease tasks"
```

## Task 4: Migrate Maintenance as the Multi-View Pilot

**Files:**

- Modify: `src/features/maintenance/components/maintenance-screen.tsx`
- Modify: `src/features/maintenance/components/maintenance-work-surfaces.tsx`
- Modify: `src/features/maintenance/components/maintenance-board-surface.tsx`
- Test: `src/features/maintenance/components/maintenance-workspace-ui.test.tsx`

**Preserve:** board drag behavior, list and calendar routes, saved queue URL behavior, role permissions, quick view, pagination, mutation actions, and mobile smoke coverage.

- [ ] Add a failing test asserting exactly one Board/List control is present when the parent work surface owns view selection.
- [ ] Add a standalone board test asserting it still exposes an accessible List alternative when no parent switch is supplied.
- [ ] Rewrite saved-queue assertions to expect lightweight task tabs/links rather than separate bordered cards.
- [ ] Assert search, filters, and the canonical view control share one workspace controls region.
- [ ] Assert the scope summary is inline and the list table has no desktop outer card frame.
- [ ] Run the failing focused test:

```powershell
npm test -- src/features/maintenance/components/maintenance-workspace-ui.test.tsx
```

- [ ] Convert saved queue shortcuts into local task navigation without changing their URLs or labels.
- [ ] Keep one search/filter/view row. Remove the duplicate Board/List control from the child surface when the parent owns it; pass an explicit boolean or render prop instead of detecting DOM state.
- [ ] Keep an accessible List alternative inside a standalone `MaintenanceBoardSurface`.
- [ ] Render the queue/scope summary inline with typography and dividers. Preserve status semantics and counts.
- [ ] Remove the list table's desktop outer frame while keeping row and board state cues.
- [ ] Run focused verification:

```powershell
npm test -- src/features/maintenance/components/maintenance-workspace-ui.test.tsx
npx eslint src/features/maintenance/components/maintenance-screen.tsx src/features/maintenance/components/maintenance-work-surfaces.tsx src/features/maintenance/components/maintenance-board-surface.tsx src/features/maintenance/components/maintenance-workspace-ui.test.tsx
```

- [ ] Commit:

```powershell
git add src/features/maintenance/components/maintenance-screen.tsx src/features/maintenance/components/maintenance-work-surfaces.tsx src/features/maintenance/components/maintenance-board-surface.tsx src/features/maintenance/components/maintenance-workspace-ui.test.tsx
git commit -m "refactor(maintenance): unify queues and work surfaces"
```

## Pilot Runtime Screenshot Checkpoint

Do not begin Wave C until this checkpoint is approved.

- [ ] Run the development server with the existing authenticated local fixture.
- [ ] Capture Leases and Maintenance at 1440 x 900 and 1280 x 800.
- [ ] Capture one filter-open state and one quick-view/drawer-open state per route.
- [ ] Compare them side by side with the approved reference composition and the old audit screenshots.
- [ ] Verify visually: one title, one action cluster, one controls row, earlier start of real data, no duplicate view switch, no outer table card, no lost context.
- [ ] Run the Wave B gate:

```powershell
npx tsc --noEmit
npm test -- src/components/layout/workspace-layout.test.tsx src/components/ui/workflow-feedback.test.tsx src/features/leases/components/lease-screen.test.tsx src/features/maintenance/components/maintenance-workspace-ui.test.tsx
```

- [ ] Ask for user approval before broadening the pattern. If rejected, revise Tasks 1, 3, and 4 rather than applying compensating one-off CSS in later domains.

## Task 5: Simplify People Around Directory Lenses

**Files:**

- Modify: `src/features/people/components/people-screen.tsx`
- Modify: `src/features/people/components/people-command-center.tsx`
- Modify: `src/features/people/components/people-workspace-navigation.tsx`
- Modify: `src/features/people/components/people-filters.tsx`
- Modify: `src/features/people/components/people-table.tsx`
- Test: `src/features/people/components/people-screen.test.tsx`

- [ ] Add failing tests for one visible heading, the Directory overview action in the header, and canonical lenses `All`, `Owners`, `Staff`, `Tenants`, and `Vendors`.
- [ ] Assert `Workspace Access` is absent from People navigation; access remains under Settings.
- [ ] Assert the duplicate Role selector is absent from the filter popover while an incoming `role` URL parameter still selects the matching lens and preserves back/forward behavior.
- [ ] Assert the desktop table frame is flat while quick views and pagination still work.
- [ ] Run the failing test:

```powershell
npm test -- src/features/people/components/people-screen.test.tsx
```

- [ ] Move the Directory overview trigger into the header action area and remove its separate command rail.
- [ ] Make the five canonical lenses the sole visible role-navigation mechanism. Keep parsing legacy/current role query values in `people-filters.tsx`; do not break bookmarked URLs.
- [ ] Keep search visible and advanced non-role filters in the existing popover.
- [ ] Remove the outer table card on desktop. Preserve mobile behavior, quick view, selection, pagination, and empty/error states.
- [ ] Run and commit:

```powershell
npm test -- src/features/people/components/people-screen.test.tsx
npx eslint src/features/people/components/people-screen.tsx src/features/people/components/people-command-center.tsx src/features/people/components/people-workspace-navigation.tsx src/features/people/components/people-filters.tsx src/features/people/components/people-table.tsx src/features/people/components/people-screen.test.tsx
git add src/features/people/components/people-screen.tsx src/features/people/components/people-command-center.tsx src/features/people/components/people-workspace-navigation.tsx src/features/people/components/people-filters.tsx src/features/people/components/people-table.tsx src/features/people/components/people-screen.test.tsx
git commit -m "refactor(people): organize directory around role lenses"
```

## Task 6: Simplify Records Around Search and Advanced Filters

**Files:**

- Modify: `src/features/timeline/components/timeline-screen.tsx`
- Modify: `src/features/timeline/components/timeline-filters.tsx`
- Modify: `src/features/timeline/components/timeline-table.tsx`
- Test: `src/features/timeline/components/timeline-screen.test.tsx`

- [ ] Add a failing disclosure test: search is visible; the eight advanced filters are hidden until `Filters` opens; active count and Reset behavior are correct.
- [ ] Assert there is one `Records`/route heading and no second `Timeline records` section heading/count band.
- [ ] Assert review context is inline and the table's desktop outer frame is absent.
- [ ] Preserve filter query serialization, quick view, record links, pagination, and route-specific authority tests.
- [ ] Run the failing test:

```powershell
npm test -- src/features/timeline/components/timeline-screen.test.tsx
```

- [ ] Put the eight controls in a two-column `FilterPopover` layout at desktop widths, collapsing naturally at zoom/narrow widths.
- [ ] Remove the duplicated internal title/count header from `TimelineTable`; expose counts once in the controls or pagination text.
- [ ] Render review context inline and flatten only the table's outer shell.
- [ ] Do not add a Records sub-navigation in this task.
- [ ] Run and commit:

```powershell
npm test -- src/features/timeline/components/timeline-screen.test.tsx
npx eslint src/features/timeline/components/timeline-screen.tsx src/features/timeline/components/timeline-filters.tsx src/features/timeline/components/timeline-table.tsx src/features/timeline/components/timeline-screen.test.tsx
git add src/features/timeline/components/timeline-screen.tsx src/features/timeline/components/timeline-filters.tsx src/features/timeline/components/timeline-table.tsx src/features/timeline/components/timeline-screen.test.tsx
git commit -m "refactor(records): prioritize search and record review"
```

## Task 7: Rebalance Overview Toward the Operating Surface

**Files:**

- Modify: `src/features/overview/components/overview-screen.tsx`
- Modify: `src/features/overview/components/overview-header.tsx`
- Modify: `src/features/overview/components/portfolio-workspace.tsx`
- Modify: `src/features/overview/components/overview-lens-workspace.tsx`
- Create: `src/features/overview/components/overview-summary.tsx`
- Test: `src/features/overview/components/overview-screen.test.tsx`

- [ ] Add failing tests for one visible Overview heading, preserved month control, preserved lens URLs, and a single inline portfolio summary.
- [ ] Assert repeated KPI card grids are absent by accessible section names, not by brittle class checks.
- [ ] Assert the primary operating list/queue appears before secondary explanatory content in DOM order.
- [ ] Run the failing test:

```powershell
npm test -- src/features/overview/components/overview-screen.test.tsx
```

- [ ] Keep the existing overview calculations and server data unchanged. Convert top-level KPIs into one compact semantic `<dl>` or inline summary row.
- [ ] Preserve the month and lens controls. Keep alerts and warnings discrete when they require action; flatten decorative metric cards.
- [ ] Give the primary operating surface the remaining viewport height and internal scroll behavior.
- [ ] Run and commit:

```powershell
npm test -- src/features/overview/components/overview-screen.test.tsx
npx eslint src/features/overview/components/overview-screen.tsx src/features/overview/components/overview-header.tsx src/features/overview/components/portfolio-workspace.tsx src/features/overview/components/overview-lens-workspace.tsx src/features/overview/components/overview-summary.tsx src/features/overview/components/overview-screen.test.tsx
git add src/features/overview/components
git commit -m "refactor(overview): make operating work the primary surface"
```

## Task 8: Flatten the Properties Register

**Files:**

- Modify: `src/features/properties/components/property-screen.tsx`
- Modify: `src/features/properties/components/properties-table.tsx`
- Test: `src/features/properties/components/property-screen.test.tsx`

- [ ] Add failing assertions for one visible Properties heading, the primary add action in the header, and the existing `PropertyFilters` popover behavior.
- [ ] Assert `data-slot="register-table-frame"` has no desktop rounded/border/padded card treatment.
- [ ] Keep property cards/mobile rendering, URL filters, sorting, selection, quick view, and pagination tests unchanged.
- [ ] Run the failing test:

```powershell
npm test -- src/features/properties/components/property-screen.test.tsx
```

- [ ] Leave `PropertyFilters` behavior intact; it already follows progressive disclosure.
- [ ] Flatten the desktop register shell only. Preserve mobile cards and the table's semantic/interactive behavior.
- [ ] Run and commit:

```powershell
npm test -- src/features/properties/components/property-screen.test.tsx
npx eslint src/features/properties/components/property-screen.tsx src/features/properties/components/properties-table.tsx src/features/properties/components/property-screen.test.tsx
git add src/features/properties/components/property-screen.tsx src/features/properties/components/properties-table.tsx src/features/properties/components/property-screen.test.tsx
git commit -m "refactor(properties): flatten the property register"
```

## Task 9: Flatten the Units Register

**Files:**

- Modify: `src/features/units/components/unit-screen.tsx`
- Modify: `src/features/units/components/units-table.tsx`
- Test: `src/features/units/components/unit-screen.test.ts`

- [ ] Add failing assertions for one visible Units heading, primary add action placement, existing `UnitFilters` behavior, and a flat desktop register frame.
- [ ] Preserve unit cards/mobile rendering, URL filters, property scoping, sorting, quick view, selection, and pagination.
- [ ] Run the failing test:

```powershell
npm test -- src/features/units/components/unit-screen.test.ts
```

- [ ] Leave `UnitFilters` behavior intact and flatten only the desktop table shell.
- [ ] Run and commit:

```powershell
npm test -- src/features/units/components/unit-screen.test.ts
npx eslint src/features/units/components/unit-screen.tsx src/features/units/components/units-table.tsx src/features/units/components/unit-screen.test.ts
git add src/features/units/components/unit-screen.tsx src/features/units/components/units-table.tsx src/features/units/components/unit-screen.test.ts
git commit -m "refactor(units): flatten the unit register"
```

## Task 10: Simplify Property Detail Into Tabs and Flat Sections

**Files:**

- Modify: `src/features/properties/components/property-detail-screen.tsx`
- Modify: `src/features/properties/components/property-detail-view.tsx`
- Modify: `src/features/properties/components/property-units-table.tsx`
- Create: `src/features/properties/components/property-detail-screen.test.tsx`
- Preserve data tests: `src/features/properties/data/property-detail.test.ts`

- [ ] Create a failing component test covering the existing eight tabs, one selected `tabpanel`, visible property heading/context, and preserved primary actions.
- [ ] Add assertions that only the selected panel is mounted/visible and that financial summary values use one semantic `<dl>` instead of a grid of nested cards.
- [ ] Add a property-units assertion that links, quick views, and row actions remain available inside the selected tab.
- [ ] Run the new failing test and the existing data test:

```powershell
npm test -- src/features/properties/components/property-detail-screen.test.tsx src/features/properties/data/property-detail.test.ts
```

- [ ] Make tabs visually uncontained within the detail header. Render one selected tab panel and use section dividers/spacing for facts, units, leases, documents, maintenance, and finance content.
- [ ] Preserve all eight tab values and their URL/deep-link behavior. Preserve drawers, record links, server values, and permissions.
- [ ] Do not combine unrelated tabs or change what their queries load.
- [ ] Run and commit:

```powershell
npm test -- src/features/properties/components/property-detail-screen.test.tsx src/features/properties/data/property-detail.test.ts
npx eslint src/features/properties/components/property-detail-screen.tsx src/features/properties/components/property-detail-view.tsx src/features/properties/components/property-units-table.tsx src/features/properties/components/property-detail-screen.test.tsx
git add src/features/properties/components/property-detail-screen.tsx src/features/properties/components/property-detail-view.tsx src/features/properties/components/property-units-table.tsx src/features/properties/components/property-detail-screen.test.tsx
git commit -m "refactor(properties): simplify property detail hierarchy"
```

## Task 11: Simplify Person Detail Without Changing Access Behavior

**Files:**

- Modify: `src/features/people/components/person-detail-screen.tsx`
- Test: `src/features/people/components/person-detail-screen.test.tsx`

- [ ] Add failing tests for uncontained tabs, one selected tabpanel, flattened linked-record groups, and preserved person context/actions.
- [ ] Preserve access status, role management, owner/tenant/vendor-specific records, drawers, links, and permission behavior.
- [ ] Run the failing test:

```powershell
npm test -- src/features/people/components/person-detail-screen.test.tsx
```

- [ ] Replace decorative outer cards in `RiskRow`, `LinkedGroup`, and linked rows with spacing, dividers, and state badges. Keep true warnings or dangerous actions contained.
- [ ] Keep every existing tab value and deep-link target.
- [ ] Run and commit:

```powershell
npm test -- src/features/people/components/person-detail-screen.test.tsx
npx eslint src/features/people/components/person-detail-screen.tsx src/features/people/components/person-detail-screen.test.tsx
git add src/features/people/components/person-detail-screen.tsx src/features/people/components/person-detail-screen.test.tsx
git commit -m "refactor(people): simplify person detail hierarchy"
```

## Wave C Verification Gate

- [ ] Run all Wave C component tests together:

```powershell
npm test -- src/features/people/components/people-screen.test.tsx src/features/timeline/components/timeline-screen.test.tsx src/features/overview/components/overview-screen.test.tsx src/features/properties/components/property-screen.test.tsx src/features/units/components/unit-screen.test.ts src/features/properties/components/property-detail-screen.test.tsx src/features/properties/data/property-detail.test.ts src/features/people/components/person-detail-screen.test.tsx
npx tsc --noEmit
```

- [ ] Capture one 1440 x 900 screenshot of Overview, People, Records, Properties, Units, one property detail, and one person detail.
- [ ] Reject any route that recreates a title band plus navigation band plus toolbar band plus card-framed table. Fix the owning domain task before entering Settings.

## Task 12: Put Settings Title and Navigation in One Header

**Files:**

- Modify: `src/components/layout/page-header.tsx`
- Modify: `src/components/layout/settings-tabs.tsx`
- Modify: `src/features/organization/components/organization-settings-screen.tsx`
- Modify: `src/features/organization/components/access-settings-screen.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/app/(dashboard)/users-roles/page.tsx`
- Test: `src/components/layout/settings-tabs.test.tsx`
- Test: `src/app/(dashboard)/settings/page.test.tsx`
- Test: `src/app/(dashboard)/users-roles/page.test.tsx`

- [ ] Add failing tests that `Settings` and its local navigation share one header boundary and that exactly one visible level-one heading exists on both routes.
- [ ] Assert `SettingsTabs` keeps URL/current-page semantics but has no independent full-width border band.
- [ ] Assert the access guard/provider still wraps the protected screen and no permission behavior changes.
- [ ] Run the failing tests:

```powershell
npm test -- src/components/layout/settings-tabs.test.tsx "src/app/(dashboard)/settings/page.test.tsx" "src/app/(dashboard)/users-roles/page.test.tsx"
```

- [ ] Render `SettingsTabs` through the `PageHeader.navigation` slot added in Task 1.
- [ ] Make `SettingsTabs` visually uncontained and horizontally scrollable when necessary. Keep focus and `aria-current` behavior.
- [ ] Remove duplicate settings title/nav markup from child screens while preserving server guards.
- [ ] Run and commit:

```powershell
npm test -- src/components/layout/settings-tabs.test.tsx "src/app/(dashboard)/settings/page.test.tsx" "src/app/(dashboard)/users-roles/page.test.tsx"
npx eslint src/components/layout/page-header.tsx src/components/layout/settings-tabs.tsx src/features/organization/components/organization-settings-screen.tsx src/features/organization/components/access-settings-screen.tsx "src/app/(dashboard)/settings/page.tsx" "src/app/(dashboard)/users-roles/page.tsx" src/components/layout/settings-tabs.test.tsx "src/app/(dashboard)/settings/page.test.tsx" "src/app/(dashboard)/users-roles/page.test.tsx"
git add src/components/layout/page-header.tsx src/components/layout/settings-tabs.tsx src/features/organization/components/organization-settings-screen.tsx src/features/organization/components/access-settings-screen.tsx "src/app/(dashboard)/settings/page.tsx" "src/app/(dashboard)/users-roles/page.tsx" src/components/layout/settings-tabs.test.tsx "src/app/(dashboard)/settings/page.test.tsx" "src/app/(dashboard)/users-roles/page.test.tsx"
git commit -m "refactor(settings): unify title and navigation"
```

## Task 13: Replace the Three-Zone Settings Grid With Two Zones

**Files:**

- Modify: `src/features/organization/components/settings-workspace.tsx`
- Modify: `src/features/configuration/components/configuration-registry-catalog.tsx`
- Test: `src/features/organization/components/settings-workspace.test.tsx`

**Contract:** One lightweight section rail and one main content surface. No persistent 300-pixel summary column.

- [ ] Replace the existing three-zone test with semantic assertions for one section navigation and one labelled content region.
- [ ] Assert organization facts appear once and the configuration catalog remains read-only.
- [ ] Assert section links preserve URL/deep-link/current state and keyboard focus behavior.
- [ ] Run the failing test:

```powershell
npm test -- src/features/organization/components/settings-workspace.test.tsx
```

- [ ] Remove the persistent summary column. Move the few decision-relevant facts into the selected section's header or inline consequence panel.
- [ ] Keep the rail visually uncontained; use a divider between rail and content at desktop widths and a compact local selector/stack at narrow widths.
- [ ] Keep registry/catalog values read-only and preserve their existing source-of-truth labels.
- [ ] Run and commit:

```powershell
npm test -- src/features/organization/components/settings-workspace.test.tsx
npx eslint src/features/organization/components/settings-workspace.tsx src/features/configuration/components/configuration-registry-catalog.tsx src/features/organization/components/settings-workspace.test.tsx
git add src/features/organization/components/settings-workspace.tsx src/features/configuration/components/configuration-registry-catalog.tsx src/features/organization/components/settings-workspace.test.tsx
git commit -m "refactor(settings): replace three-zone workspace"
```

## Task 14: Move Branch Creation Into a Focused Drawer

**Files:**

- Modify: `src/features/organization/components/branch-editor.tsx`
- Modify tests in: `src/features/organization/components/settings-workspace.test.tsx`
- Reuse unchanged: `src/components/ui/side-drawer.tsx`
- Reuse unchanged: existing drawer draft-guard utilities imported by the editor

- [ ] Add failing tests: branch list remains the main surface; `Add branch` opens a drawer; the three existing fields, inline consequence, and one save area appear inside; closing a dirty drawer invokes the existing discard guard.
- [ ] Assert editing an existing branch continues to use the established behavior unless the current editor already routes editing through the same form state.
- [ ] Run the failing test:

```powershell
npm test -- src/features/organization/components/settings-workspace.test.tsx
```

- [ ] Use `SideDrawer`; do not use a wizard because this form has only three fields and one decision.
- [ ] Place impact text through `ConsequencePanel variant="inline"` and retain `DraftActionBar` as the sole save/discard area.
- [ ] Keep `BranchEditor` props and `SettingsEditorHandle.discard()` unchanged.
- [ ] Run and commit:

```powershell
npm test -- src/features/organization/components/settings-workspace.test.tsx
npx eslint src/features/organization/components/branch-editor.tsx src/features/organization/components/settings-workspace.test.tsx
git add src/features/organization/components/branch-editor.tsx src/features/organization/components/settings-workspace.test.tsx
git commit -m "refactor(settings): move branch creation to drawer"
```

## Task 15: Move Team Creation Into a Focused Drawer

**Files:**

- Modify: `src/features/organization/components/team-editor.tsx`
- Modify tests in: `src/features/organization/components/settings-workspace.test.tsx`
- Reuse unchanged: `src/components/ui/side-drawer.tsx`

- [ ] Add failing tests mirroring the branch contract: list first, `Add team` drawer, existing fields, inline impact, one save area, and guarded dirty close.
- [ ] Run the failing test:

```powershell
npm test -- src/features/organization/components/settings-workspace.test.tsx
```

- [ ] Use the same drawer and draft conventions as Branches. Do not extract a generic settings-form engine.
- [ ] Keep `TeamEditor` props and `SettingsEditorHandle.discard()` unchanged.
- [ ] Run and commit:

```powershell
npm test -- src/features/organization/components/settings-workspace.test.tsx
npx eslint src/features/organization/components/team-editor.tsx src/features/organization/components/settings-workspace.test.tsx
git add src/features/organization/components/team-editor.tsx src/features/organization/components/settings-workspace.test.tsx
git commit -m "refactor(settings): move team creation to drawer"
```

## Task 16: Make Workspace Access and Account Single-Surface Pages

**Files:**

- Modify: `src/features/organization/components/access-settings-screen.tsx`
- Test: `src/features/organization/components/access-settings-screen.test.tsx`
- Modify: `src/features/account/components/account-screen.tsx`
- Test: `src/features/account/components/account-screen.test.tsx`

- [ ] Replace the four-card access layout test with one surface grouped by `Needs access`, `Pending`, and `Active`.
- [ ] Add failing tests that Invite opens in `SideDrawer`, keeps validation/focus behavior, and closes safely after save/cancel.
- [ ] Preserve focused-member/deep-link behavior. In this slice, existing member edit forms may remain inline if moving them would change permission/draft behavior.
- [ ] Add account tests that profile, security, and session information use flat sections and one save area per editable concern; dangerous actions remain contained.
- [ ] Run the failing tests:

```powershell
npm test -- src/features/organization/components/access-settings-screen.test.tsx src/features/account/components/account-screen.test.tsx
```

- [ ] Implement the access grouping as headings and row lists separated by dividers, not three new bordered cards.
- [ ] Put invite work in `SideDrawer`; preserve the existing action and permission boundary.
- [ ] Flatten Account's decorative section wrappers while keeping warnings, session state, validation, and mutations intact.
- [ ] Run and commit:

```powershell
npm test -- src/features/organization/components/access-settings-screen.test.tsx src/features/account/components/account-screen.test.tsx
npx eslint src/features/organization/components/access-settings-screen.tsx src/features/organization/components/access-settings-screen.test.tsx src/features/account/components/account-screen.tsx src/features/account/components/account-screen.test.tsx
git add src/features/organization/components/access-settings-screen.tsx src/features/organization/components/access-settings-screen.test.tsx src/features/account/components/account-screen.tsx src/features/account/components/account-screen.test.tsx
git commit -m "refactor(settings): simplify access and account surfaces"
```

## Task 17: Audit Unmigrated Workspace Consumers for Shared-Layout Regressions

**Files to inspect and modify only if the shared header creates a demonstrated regression:**

- `src/app/workspace/page.tsx`
- `src/features/documents/components/document-screen.tsx`
- `src/features/finance-operations/components/finance-operations-screen.tsx`
- `src/features/ledger/components/ledger-screen.tsx`
- `src/features/petty-cash/components/petty-cash-screen.tsx`
- `src/features/property-setup/components/property-setup-screen.tsx`
- `src/features/reports/components/reports-screen.tsx`
- `src/app/workspace/page.test.ts`
- `src/features/documents/components/document-screen.test.tsx`
- `src/features/finance-operations/components/finance-operations-screen.test.tsx`
- `src/features/ledger/components/ledger-screen.test.tsx`
- `src/features/petty-cash/components/petty-cash-screen.test.tsx`
- `src/features/property-setup/components/property-setup-screen.test.tsx`
- `src/features/reports/components/reports-screen.test.tsx`

**This is a compatibility pass, not permission to redesign finance or reporting behavior.**

- [ ] Inventory every remaining `WorkspacePage` call and record whether it supplies generated title/context, custom header, local navigation, toolbar, and actions.
- [ ] Add or adjust focused tests only where a regression is found: duplicate heading, action disappearing, empty controls row, inaccessible toolbar, clipped content, or broken quick view.
- [ ] Verify finance labels, transaction state, balances, report period logic, and accounting authority are unchanged.
- [ ] Verify property setup still uses its existing wizard where setup is multi-step.
- [ ] Run the compatibility tests selected from actual affected consumers plus the shared test:

```powershell
npm test -- src/components/layout/workspace-layout.test.tsx src/app/workspace/page.test.ts src/features/documents/components/document-screen.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/ledger/components/ledger-screen.test.tsx src/features/petty-cash/components/petty-cash-screen.test.tsx src/features/property-setup/components/property-setup-screen.test.tsx src/features/reports/components/reports-screen.test.tsx
```

- [ ] Run route-level screenshots for Finance Operations, Ledger, Petty Cash, Reports, Documents, and Property Setup at 1280 x 800. Fix shared-composition regressions with the smallest local adjustment.
- [ ] If no source changes are required, do not create an empty commit. If changes are required, commit only affected consumers and their tests:

```powershell
git add src/app/workspace/page.tsx src/app/workspace/page.test.ts src/features/documents/components/document-screen.tsx src/features/documents/components/document-screen.test.tsx src/features/finance-operations/components/finance-operations-screen.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/ledger/components/ledger-screen.tsx src/features/ledger/components/ledger-screen.test.tsx src/features/petty-cash/components/petty-cash-screen.tsx src/features/petty-cash/components/petty-cash-screen.test.tsx src/features/property-setup/components/property-setup-screen.tsx src/features/property-setup/components/property-setup-screen.test.tsx src/features/reports/components/reports-screen.tsx src/features/reports/components/reports-screen.test.tsx
git commit -m "fix(ui): align remaining workspace consumers"
```

## Task 18: Update the Contract, Run the Full Gate, and Produce Handoff Evidence

**Files:**

- Modify: `PROJECT.md`
- Modify only if route coverage changed: `scripts/verify-ui-route-coverage.mjs`
- Modify only if copy constraints changed: `scripts/verify-ui-copy.mjs`
- Create: `docs/superpowers/plans/2026-08-04-task-first-workspace-redesign-verification.md`

- [ ] Update the authenticated interface contract in `PROJECT.md` to state:
  - one visible title/action composition;
  - at most one secondary controls row;
  - one dominant work surface;
  - search visible and advanced filters disclosed;
  - tables are unframed on desktop but retain full semantics;
  - cards are reserved for discrete objects/states/actions;
  - settings uses header navigation plus a two-zone content layout;
  - laptop-first checks at 1440 x 900, 1280 x 800, and 200% zoom.
- [ ] Keep the finance interaction and terminology contract intact. Do not rewrite domain authority as visual guidance.
- [ ] Run the standard gate, one command at a time:

```powershell
npm run lint
npx tsc --noEmit
npm run test:all
npm run build
npm run test:ui-coverage
npm run test:ui-copy
```

- [ ] Run the relevant authenticated UI smoke scripts:

```powershell
npm run test:ui-redesign
npm run test:ui-a11y
npm run test:properties-flow
npm run test:maintenance-mobile
```

- [ ] At 1440 x 900 and 1280 x 800, capture Overview, Properties, Units, People, Leases, Maintenance list, Maintenance board, Records, Settings, Workspace Access, Account, Finance Operations, Ledger, and Reports.
- [ ] At 200% zoom, verify Overview, Leases, Maintenance, Property detail, and Settings with keyboard-only navigation.
- [ ] In `2026-08-04-task-first-workspace-redesign-verification.md`, record:
  - branch and exact HEAD SHA;
  - every command and exit code;
  - screenshot paths;
  - routes and roles actually exercised;
  - any production/hosted behavior not verified;
  - explicit confirmation that no schema, RPC, route URL, or URL parameter contract changed.
- [ ] Run a residual-pattern scan and inspect each hit rather than blindly deleting it:

```powershell
rg -n "rounded-(md|lg).*border|border.*rounded-(md|lg)|grid-cols-\[.*300px|Lease summary|Timeline records|Workspace Access" src/features src/components/layout
```

- [ ] Run diff hygiene:

```powershell
git diff --check
git status --short
git diff --stat origin/main...HEAD
```

- [ ] Commit documentation and any verified coverage-script adjustment:

```powershell
git add PROJECT.md docs/superpowers/plans/2026-08-04-task-first-workspace-redesign-verification.md scripts/verify-ui-route-coverage.mjs scripts/verify-ui-copy.mjs
git commit -m "docs(ui): define task-first workspace contract"
```

- [ ] Re-run `git status --short` and ensure no generated screenshots, local environment files, browser auth state, or unrelated user changes are staged.
- [ ] Push only after the user asks for push or the implementation session's authorization explicitly includes it.

## Self-Review Checklist for the Executing Session

- [ ] Every requirement in the Acceptance Contract is covered by at least one test or named screenshot check.
- [ ] No task changes backend behavior, schema, RPC signatures, server action contracts, or URL parameter names.
- [ ] No new component was created solely to wrap one child in another border.
- [ ] No page has both page-local role tabs and a duplicate role filter.
- [ ] No multi-view route shows duplicate view switches.
- [ ] No generated workspace title is visually hidden.
- [ ] No primary action is stranded in a second full-width band.
- [ ] No settings editor has more than one visible save area.
- [ ] Draft guards, focus restoration, Escape behavior, and back/forward navigation have regression coverage.
- [ ] Finance and lease authority tests pass without weakening assertions.
- [ ] The final verification report distinguishes local evidence from hosted/production evidence.

## Recommended Handoff Prompt

Use this exact prompt in the new session:

> Work through `docs/superpowers/plans/2026-08-04-task-first-workspace-redesign.md` using `superpowers:subagent-driven-development`. Start with the Required Visual Gate and do not edit product code until I approve the Leases and Maintenance reference compositions. Keep shared-file ownership isolated, use focused tests per task, stop for the pilot runtime screenshot checkpoint, and do not push unless I explicitly authorize it.
