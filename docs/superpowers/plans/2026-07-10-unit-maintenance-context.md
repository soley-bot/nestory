# Unit Maintenance Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve maintenance context when an operator opens a linked unit and make unit-record sections bookmarkable through the URL.

**Architecture:** Put the unit-detail query contract in a small feature-owned route helper. The App Router page parses `section` and `sourceTaskId` on the server, passes them through the detail screen, and renders section navigation as `Link` transitions. Maintenance owns the source task, but uses the unit route helper to construct the destination consistently.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.7, TypeScript, Vitest.

## Global Constraints

- Keep workspace auth and organization scope unchanged.
- Keep the unit record quiet, dense, and operational.
- Preserve existing `/units/[unitId]` behavior when no query parameters are present.
- Accept only known section values; invalid values fall back to `overview`.
- Do not add database or mutation changes.

---

### Task 1: Define and verify the unit-detail URL contract

**Files:**
- Create: `src/features/units/unit-detail-route.ts`
- Create: `src/features/units/unit-detail-route.test.ts`
- Modify: `src/features/maintenance/data/maintenance.test.ts`

**Interfaces:**
- Consumes: `buildHref(pathname, params)` from `src/lib/url/href.ts`.
- Produces: `UnitRecordSection`, `parseUnitDetailQuery(searchParams)`, and `buildUnitRecordHref({ unitId, section, sourceTaskId })`.

- [x] **Step 1: Write failing route-contract tests**

```ts
expect(parseUnitDetailQuery({ section: "maintenance", sourceTaskId: "task-1" })).toEqual({
  section: "maintenance",
  sourceTaskId: "task-1",
});
expect(parseUnitDetailQuery({ section: "unknown" })).toEqual({ section: "overview" });
expect(buildUnitRecordHref({ unitId: "unit-1", section: "maintenance", sourceTaskId: "task-1" })).toBe(
  "/units/unit-1?section=maintenance&sourceTaskId=task-1",
);
expect(buildMaintenanceHrefs(task).unit).toBe(
  "/units/unit-1?section=maintenance&sourceTaskId=task-1",
);
```

- [x] **Step 2: Run the focused tests and verify RED**

Run: `npm run test -- src/features/units/unit-detail-route.test.ts src/features/maintenance/data/maintenance.test.ts`

Expected: FAIL because the route helper does not exist and the maintenance unit href still points to the generic unit overview.

- [x] **Step 3: Implement the minimal route helper**

```ts
export type UnitRecordSection =
  | "overview"
  | "photos"
  | "lease"
  | "finance"
  | "maintenance"
  | "documents"
  | "reports"
  | "timeline";

export function parseUnitDetailQuery(searchParams: Record<string, string | string[] | undefined>) {
  const rawSection = firstValue(searchParams.section);
  return {
    section: isUnitRecordSection(rawSection) ? rawSection : "overview",
    sourceTaskId: firstValue(searchParams.sourceTaskId) || undefined,
  };
}
```

Use `buildHref` for deterministic query construction and update `buildMaintenanceHrefs` to call `buildUnitRecordHref` with `section: "maintenance"` and `sourceTaskId: task.id`.

- [x] **Step 4: Re-run the focused tests and verify GREEN**

Run: `npm run test -- src/features/units/unit-detail-route.test.ts src/features/maintenance/data/maintenance.test.ts`

Expected: PASS.

### Task 2: Drive the unit detail from the URL

**Files:**
- Modify: `src/app/(dashboard)/units/[unitId]/page.tsx`
- Modify: `src/features/units/components/unit-detail-screen.tsx`
- Modify: `src/features/units/components/unit-detail-view.tsx`

**Interfaces:**
- Consumes: `parseUnitDetailQuery`, `buildUnitRecordHref`, and `UnitRecordSection` from Task 1.
- Produces: bookmarkable section tabs and a task-aware return link.

- [x] **Step 1: Parse query state in the server page**

Add `searchParams` to `UnitPageProps`, await it with `params`, parse the query, and pass `activeSection` plus `sourceTaskId` to `UnitDetailScreen`.

- [x] **Step 2: Pass the route state through the client screen**

Add typed `activeSection` and optional `sourceTaskId` props to `UnitDetailScreen`, then pass them to `UnitDetailView` without introducing another state store.

- [x] **Step 3: Replace local tab state with links**

Remove `useState` from `UnitDetailView`. Render each tab as a Next.js `Link` to `buildUnitRecordHref({ unitId, section, sourceTaskId })`, keep `aria-selected`, use `replace` to avoid filling browser history with tab changes, and keep the existing section visibility conditions.

- [x] **Step 4: Add the task-aware return path**

When `sourceTaskId` exists, point the leading return link to `/maintenance?archiveState=all&taskId=<id>` and label it `Back to case`; otherwise preserve the existing `/units` link and `Units` label.

- [x] **Step 5: Run focused and full verification**

Run:

```text
npm run test -- src/features/units/unit-detail-route.test.ts src/features/maintenance/data/maintenance.test.ts
npm run lint -- "src/app/(dashboard)/units/[unitId]/page.tsx" src/features/units/components/unit-detail-screen.tsx src/features/units/components/unit-detail-view.tsx src/features/units/unit-detail-route.ts src/features/units/unit-detail-route.test.ts src/features/maintenance/data/maintenance.ts src/features/maintenance/data/maintenance.test.ts
npx tsc --noEmit
npm run test
npm run build
```

Expected: every command exits with code 0. Browser smoke should confirm a case unit link opens `?section=maintenance&sourceTaskId=...`, the Maintenance tab is selected, tab changes update the URL, and `Back to case` restores the selected maintenance case.
