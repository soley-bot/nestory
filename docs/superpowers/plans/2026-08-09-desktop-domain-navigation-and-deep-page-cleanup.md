# Desktop Domain Navigation and Deep-Page Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role-aware expandable desktop sidebar groups for deep workspace pages, retain current mobile navigation, and repair the three confirmed desktop deep-page inconsistencies.

**Architecture:** `AppShell` will own a typed role-filtered destination tree and render domain children with the existing sidebar sub-menu primitives. Existing Finance and Maintenance local navigation remains mounted as a mobile fallback but is hidden at the desktop breakpoint. The audit fixes remain isolated in the route manifest, Maintenance activity-resolution data flow, and Ledger source-integrity model.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, shadcn Sidebar, Vitest, Testing Library, Supabase activity projections.

## Global Constraints

- This pass changes desktop navigation only; mobile receives regression verification but no redesign.
- Cross-page Finance and Maintenance controls are hidden on desktop and retained on mobile.
- True within-page tabs and filters remain unchanged.
- Existing authorization and route guards remain authoritative.
- Operations Members receive only the Maintenance My work child destination.
- No new dependencies are introduced.

---

### Task 1: Role-aware desktop domain destination tree

**Files:**
- Modify: `src/components/layout/app-shell.tsx`
- Test: `src/components/layout/app-shell.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceRole`, `usePathname()`, `SidebarMenuSub`, `SidebarMenuSubItem`, and `SidebarMenuSubButton`.
- Produces: typed `children` on multi-page destinations and a desktop domain renderer with route-derived active and expanded state.

- [ ] **Step 1: Write failing AppShell tests**

Add tests asserting that Super Admin sees links named `Finance work`, `Rent`, `Expenses`, `Owner balances`, `Leases`, `Ledger`, `Petty cash`, `Cases`, `My work`, `Recurring work`, `Inspections`, `Work orders`, `Timeline history`, `Property timeline`, `Maintenance timeline`, `Financial timeline`, `Documents`, and `Import`. Assert Finance roles have Finance children but no Maintenance or Records children. Assert Operations Manager receives all Maintenance children, while Operations Member receives only `My work`.

Add a route-state test using `navigation.pathname = "/ledger"` and assert the Finance domain control has `aria-expanded="true"` and the Ledger child link has `aria-current="page"`.

- [ ] **Step 2: Run the AppShell tests and verify failure**

Run: `npm test -- src/components/layout/app-shell.test.tsx`

Expected: FAIL because domain child links and expandable controls are not rendered.

- [ ] **Step 3: Implement the destination tree**

Extend `GlobalDestination` with an optional child collection:

```ts
type GlobalDestinationChild = {
  href: string;
  label: string;
  routes: readonly string[];
};

type GlobalDestination = {
  children?: readonly GlobalDestinationChild[];
  href: string;
  icon: LucideIcon;
  id: string;
  label: string;
  routes: readonly string[];
};
```

Add the exact Finance, Maintenance, and Records children from the approved design. Build Operations Member's Maintenance destination separately with only `{ href: "/tasks", label: "My work", routes: ["/tasks"] }`.

Render direct destinations with the existing `SidebarMenuButton`. Render multi-page destinations with an accessible native domain toggle, `aria-expanded`, a chevron, and `SidebarMenuSub` children. Initialize active domains expanded and update expansion when the pathname moves into a domain. In icon-collapsed mode, keep the parent domain landing link and allow existing sidebar CSS to hide its children.

- [ ] **Step 4: Run AppShell tests**

Run: `npm test -- src/components/layout/app-shell.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the destination tree**

```powershell
git add -- src/components/layout/app-shell.tsx src/components/layout/app-shell.test.tsx
git commit -m "feat(nav): expose desktop domain pages"
```

### Task 2: Desktop-only removal of duplicate cross-page controls

**Files:**
- Modify: `src/features/finance/components/finance-workspace-navigation.tsx`
- Modify: `src/features/maintenance/components/maintenance-screen.tsx`
- Create: `src/features/finance/components/finance-workspace-navigation.test.tsx`
- Test: `src/features/maintenance/components/maintenance-workspace-ui.test.tsx`

**Interfaces:**
- Consumes: existing Finance and Maintenance local navigation components.
- Produces: mobile-only fallback navigation using the shared `md:hidden` breakpoint.

- [ ] **Step 1: Write failing visibility-contract tests**

Assert each local navigation root includes `md:hidden`, retains its accessible workspace label, and still contains every existing mobile destination. Keep all existing assertions for active-route behavior.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/features/finance/components/finance-workspace-navigation.test.tsx src/features/maintenance/components/maintenance-workspace-ui.test.tsx`

Expected: FAIL because the local navigation roots are not desktop-hidden.

- [ ] **Step 3: Apply the desktop breakpoint boundary**

Add `md:hidden` to the Finance `<nav aria-label="Finance workspace">` and Maintenance `<nav aria-label="Maintenance workspace">`. Do not remove links, dropdown items, active-state behavior, status tabs, filters, or page content.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/features/finance/components/finance-workspace-navigation.test.tsx src/features/maintenance/components/maintenance-workspace-ui.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the responsive boundary**

```powershell
git add -- src/features/finance/components/finance-workspace-navigation.tsx src/features/finance/components/finance-workspace-navigation.test.tsx src/features/maintenance/components/maintenance-screen.tsx src/features/maintenance/components/maintenance-workspace-ui.test.tsx
git commit -m "feat(nav): keep workspace switchers mobile only"
```

### Task 3: Correct the stale People detail smoke fixture

**Files:**
- Modify: `config/ui-route-coverage.json`
- Test: `src/lib/ui/route-coverage.test.ts`

**Interfaces:**
- Consumes: seeded person ID `80000000-0000-4000-8000-000000000001`.
- Produces: a smoke path resolving to the existing seeded People record.

- [ ] **Step 1: Add a failing fixture regression assertion**

In the route-coverage test, locate the `/people/[personId]` manifest entry and assert:

```ts
expect(personDetail?.smoke.path).toBe(
  "/people/80000000-0000-4000-8000-000000000001",
);
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/lib/ui/route-coverage.test.ts`

Expected: FAIL with the current `80100000-0000-0000-0000-000000000001` path.

- [ ] **Step 3: Replace the stale manifest path**

Change only the People detail smoke path to `/people/80000000-0000-4000-8000-000000000001`.

- [ ] **Step 4: Run the route-coverage test**

Run: `npm test -- src/lib/ui/route-coverage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the fixture correction**

```powershell
git add -- config/ui-route-coverage.json src/lib/ui/route-coverage.test.ts
git commit -m "fix(routes): correct people detail smoke fixture"
```

### Task 4: Resolve Maintenance activity targets before quick-view rendering

**Files:**
- Modify: `src/features/maintenance/data/maintenance.ts`
- Test: `src/features/maintenance/data/maintenance.test.ts`

**Interfaces:**
- Consumes: `resolveRecentChangeTargets({ logs, organizationId, supabase })` and `ActivityTargetQueryClient` from `src/features/activity/recent-change-targets.ts`.
- Produces: `groupActivityByTaskId(rows, resolvedById)` that prefers sanitized resolved activity and never exposes a raw UUID as a navigable label.

- [ ] **Step 1: Write a failing activity-group regression test**

Add a test with a task activity row whose entity reference cannot be resolved. Assert the resulting quick-view activity uses `actionLabel: "Source unavailable"`, has no raw UUID in its visible label, and does not generate a UUID-only record link.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- src/features/maintenance/data/maintenance.test.ts`

Expected: FAIL because `groupActivityByTaskId` currently calls `toRecentChange(row)` directly.

- [ ] **Step 3: Resolve and index Maintenance activity rows**

After loading `activityRows`, call:

```ts
const resolvedActivity = await resolveRecentChangeTargets({
  logs: activityRows,
  organizationId,
  supabase: supabase as unknown as ActivityTargetQueryClient,
});
const resolvedActivityById = new Map(
  resolvedActivity.map((change) => [change.id, change]),
);
```

Change `groupActivityByTaskId` to accept the map and use `resolvedById.get(row.id) ?? toRecentChange(row)`, matching Ledger, People, and Timeline. Keep review-instruction parsing separate because it consumes instruction metadata rather than navigable quick-view activity.

- [ ] **Step 4: Run Maintenance data and workspace tests**

Run: `npm test -- src/features/maintenance/data/maintenance.test.ts src/features/maintenance/components/maintenance-workspace-ui.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit activity sanitization**

```powershell
git add -- src/features/maintenance/data/maintenance.ts src/features/maintenance/data/maintenance.test.ts
git commit -m "fix(maintenance): resolve quick-view activity targets"
```

### Task 5: Make Ledger source integrity internally consistent

**Files:**
- Modify: `src/features/ledger/ledger.types.ts`
- Modify: `src/features/ledger/data/ledger.ts`
- Modify: `src/features/ledger/components/ledger-inspector.tsx`
- Test: `src/features/ledger/data/ledger-source.test.ts`
- Test: `src/features/ledger/components/ledger-inspector.test.tsx`

**Interfaces:**
- Consumes: normalized ledger source types from `normalizeLedgerSource`.
- Produces: `sourceResolved: boolean` on `LedgerEntry`, true only when both `source_id` exists and `source_type` is recognized.

- [ ] **Step 1: Write failing unknown-source tests**

Add a data test proving a row with a non-null `source_id` and unknown `source_type` maps to `sourceResolved: false`, `sourceLabel: "Source unavailable"`, and a `Source needs review` risk indicator. Add an inspector test proving the same entry renders `Needs review` and never renders `Source linked`.

- [ ] **Step 2: Run Ledger tests and verify failure**

Run: `npm test -- src/features/ledger/data/ledger-source.test.ts src/features/ledger/components/ledger-inspector.test.tsx`

Expected: FAIL because integrity currently checks only `sourceId`.

- [ ] **Step 3: Add the resolved-source invariant**

Add `sourceResolved: boolean` to `LedgerEntry`. In `toLedgerEntry`, compute:

```ts
const normalizedSource = normalizeLedgerSource(entry.source_type);
const sourceResolved = Boolean(entry.source_id) && normalizedSource !== "unknown";
```

Use `sourceResolved` in `buildLedgerRiskIndicators` for its description, label, and tone. Use it in `LedgerInspector` for the Record integrity color and copy. Preserve `sourceId` for internal traceability and preserve the existing source label formatter.

- [ ] **Step 4: Update valid Ledger fixtures and run the Ledger suite**

Set `sourceResolved: true` on recognized-source fixtures and `false` on missing or unknown-source fixtures.

Run: `npm test -- src/features/ledger`

Expected: PASS.

- [ ] **Step 5: Commit the source-integrity repair**

```powershell
git add -- src/features/ledger/ledger.types.ts src/features/ledger/data/ledger.ts src/features/ledger/components/ledger-inspector.tsx src/features/ledger/data/ledger-source.test.ts src/features/ledger/components/ledger-inspector.test.tsx
git commit -m "fix(ledger): align source integrity states"
```

### Task 6: Desktop browser verification and final quality gate

**Files:**
- Verify only; no planned production file changes.

**Interfaces:**
- Consumes: completed Tasks 1 through 5 and the running local application.
- Produces: evidence that desktop deep pages are reachable and the three audit inconsistencies are closed without a mobile regression.

- [ ] **Step 1: Run static and focused automated verification**

Run:

```powershell
npm run typecheck
npm run lint
npm test -- src/components/layout/app-shell.test.tsx src/features/finance/components/finance-workspace-navigation.test.tsx src/features/maintenance/components/maintenance-workspace-ui.test.tsx src/features/maintenance/data/maintenance.test.ts src/features/ledger/data/ledger-source.test.ts src/features/ledger/components/ledger-inspector.test.tsx src/lib/ui/route-coverage.test.ts
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 2: Verify representative desktop routes**

At a desktop viewport, verify `/finance`, `/ledger`, `/maintenance`, `/tasks`, `/timeline`, and `/documents`. Confirm domain expansion, active child state, direct child navigation, and absence of duplicate desktop Finance or Maintenance cross-page controls.

- [ ] **Step 3: Verify collapsed desktop sidebar**

Collapse the sidebar to icons. Confirm Finance, Maintenance, and Records parent icons retain tooltips and navigate to their role-appropriate landing routes without showing clipped child lists.

- [ ] **Step 4: Run a mobile regression smoke**

At a mobile viewport, verify Finance local navigation and the Maintenance workspace dropdown remain visible and usable. Do not make mobile layout changes.

- [ ] **Step 5: Verify audit closures**

Open the seeded People detail smoke path, a Maintenance task activity quick view, and an unknown-source Ledger entry. Confirm the People page resolves, no raw UUID is displayed as an activity target, and Ledger never shows `Source unavailable` together with `Source linked`.

- [ ] **Step 6: Commit any test-only verification adjustments**

If verification required test-fixture-only edits, commit only those explicit files with:

```powershell
git commit -m "test(nav): cover desktop deep-page access"
```

If no files changed, do not create an empty commit.
