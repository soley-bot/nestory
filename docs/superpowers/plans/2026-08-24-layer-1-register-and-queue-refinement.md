# Layer 1 Register And Queue Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine Nestory's existing top-level tables and queues into one calm, predictable Layer 1 without rebuilding compliant screens or changing domain behavior.

**Architecture:** Keep each existing feature screen, route, query contract, drawer, and data projection. Standardize only the shared register anatomy: one title/action composition, one controls row, one dominant table or queue, explicit record navigation, restrained attention styling, and attached pagination. Use the existing `WorkspacePage`, `PageHeader`, `RecordLink`, `previewRowClassName`, `SideDrawer`, table primitives, and feature-owned filters rather than adding a new table framework.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, shadcn-derived UI primitives, Vitest, Testing Library, Playwright.

**Spec:** `docs/design/enterprise-frontend-redesign-system.md`

## Global Constraints

- `PROJECT.md` remains authoritative: one visible workspace title/action composition, no more than one secondary controls row, visible primary search, disclosed advanced URL-backed filters, one dominant work surface, and no nested decorative cards.
- Layer 1 covers top-level Properties, People, Maintenance, Finance work, Timeline, Documents, and Ledger registers or queues.
- Preserve current routes, URL search parameters, authorization, server projections, create/edit drawers, quick views, sorting, pagination, mobile transformations, and empty/error states.
- Do not add a new `/records` route, a new database query, a new summary RPC, a workflow engine, or a universal `Upcoming` panel.
- Add dated secondary content only when the existing screen data already owns it. Do not join unrelated domains to imitate a mockup.
- A row that opens a quick view may be selectable with Enter and Space. A row without quick view keeps an explicit canonical `RecordLink`; it must not rely on hover alone.
- Keep one primary line plus at most one supporting line per table identity cell. Use 13-14px body text, compact headers, and 40-48px rows where the domain content permits it.
- Warning and danger color are reserved for actionable or blocking states. Normal records remain neutral.
- Layer 2 record/detail redesign is explicitly out of scope for this plan.
- No Supabase migration, generated database type, hosted database write, deployment, or production action is part of Layer 1.

---

## File Map

- `src/components/data/interactive-table.tsx`: shared distinction between passive register rows and selectable quick-view rows; canonical record-link styling.
- `src/components/data/interactive-table.test.tsx`: contract tests for row affordances and nested record links.
- `src/features/properties/components/properties-table.tsx`: Properties identity link and shared row styling without changing current direct-open behavior.
- `src/features/properties/components/property-screen.test.tsx`: Properties header, controls, navigation, and sorting acceptance.
- `src/features/people/components/people-table.tsx`: People identity link, density, and neutral missing-data presentation.
- `src/features/people/components/people-screen.test.tsx`: People register anatomy and URL preservation acceptance.
- `src/features/maintenance/components/maintenance-screen.tsx`: preserve the current queue; keep review tabs and advanced filters within one controls band.
- `src/features/maintenance/components/maintenance-workspace-ui.test.tsx`: queue, keyboard, drawer, and controls-row acceptance.
- `src/features/finance-operations/components/finance-operations-screen.tsx`: flatten the top-level Finance work summary and demote repeated row actions.
- `src/features/finance-operations/components/finance-operations-screen.test.tsx`: Finance hierarchy, oldest-first ordering, filtering, and action emphasis acceptance.
- `src/features/timeline/components/timeline-table.tsx`, `src/features/documents/components/document-screen.tsx`, `src/features/ledger/components/ledger-table.tsx`: existing Records quick-view surfaces; behavior should remain unchanged.
- `src/features/timeline/components/timeline-screen.test.tsx`, `src/features/documents/components/document-screen.test.tsx`, `src/features/ledger/components/ledger-screen.test.tsx`: regression coverage proving Records already follows the Layer 1 contract.

### Task 1: Encode The Shared Layer 1 Row Contract

**Files:**
- Create: `src/components/data/interactive-table.test.tsx`
- Modify: `src/components/data/interactive-table.tsx`

**Interfaces:**
- Consumes: existing `cn()` and `RecordLink` behavior.
- Produces: `registerRowClassName: string` for non-selectable rows; preserves `previewRowClassName`, `selectedPreviewRowClassName`, and `RecordLink` for all feature tables.

- [ ] **Step 1: Write the failing shared-contract test**

```tsx
import { describe, expect, it } from "vitest";
import {
  previewRowClassName,
  registerRowClassName,
  selectedPreviewRowClassName,
} from "@/components/data/interactive-table";

describe("interactive table contract", () => {
  it("separates passive register rows from selectable quick-view rows", () => {
    expect(registerRowClassName).toContain("hover:bg-[var(--table-row-hover)]");
    expect(registerRowClassName).not.toContain("cursor-pointer");
    expect(previewRowClassName).toContain("cursor-pointer");
    expect(previewRowClassName).toContain("focus-visible:outline");
    expect(selectedPreviewRowClassName).toContain("table-row-selected-indicator");
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing export fails**

Run: `npx vitest run src/components/data/interactive-table.test.tsx`

Expected: FAIL because `registerRowClassName` is not exported.

- [ ] **Step 3: Split the passive and selectable row styles without changing existing consumers**

```tsx
export const registerRowClassName =
  "border-t border-border transition-colors hover:bg-[var(--table-row-hover)]";

export const previewRowClassName = cn(
  registerRowClassName,
  "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
);
```

Keep `selectedPreviewRowClassName` and `RecordLink` unchanged. This is a semantic affordance split, not a new component hierarchy.

- [ ] **Step 4: Run the shared test**

Run: `npx vitest run src/components/data/interactive-table.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the shared contract**

```bash
git add src/components/data/interactive-table.tsx src/components/data/interactive-table.test.tsx
git commit -m "refactor: define layer one table row contract"
```

### Task 2: Align Properties And People Without Rebuilding Their Tables

**Files:**
- Modify: `src/features/properties/components/properties-table.tsx`
- Modify: `src/features/properties/components/property-screen.test.tsx`
- Modify: `src/features/people/components/people-table.tsx`
- Modify: `src/features/people/components/people-screen.test.tsx`

**Interfaces:**
- Consumes: `registerRowClassName` and `RecordLink` from Task 1; existing property/person summary types and routes.
- Produces: explicit canonical record-name links and aligned desktop density while preserving current row/card navigation, sorting, query parameters, roles, linked context, and pagination.

- [ ] **Step 1: Add failing Properties assertions for a visible canonical link inside the existing predictable row**

Add to the existing Properties redesign-contract test after rendering the populated table:

```tsx
const propertyLink = screen.getByRole("link", { name: /Soley Residence/i });
expect(propertyLink).toHaveAttribute("href", "/properties/property-1");
expect(screen.getByRole("region", { name: "Properties table" })).toBeVisible();
```

Keep the existing tests that prove sorting and direct row opening. Layer 1 adds a visible record affordance; it does not remove the current shortcut.

- [ ] **Step 2: Run the Properties contract test and confirm it fails on the missing link**

Run: `npx vitest run src/features/properties/components/property-screen.test.tsx`

Expected: FAIL because the property name is currently plain text.

- [ ] **Step 3: Use the shared row class and `RecordLink` for the property identity**

Replace the local row class constant with the shared class and render the property name as:

```tsx
<RecordLink href={`/properties/${property.id}`} title={property.name}>
  {property.name}
</RecordLink>
```

Retain the existing property code/type supporting line, occupancy, lease health, net amount, status, sorting, and current `onOpenProperty` keyboard behavior. Do not add the mockup's Location, Attention, or Upcoming data because the current projection does not own those fields as one stable register contract.

- [ ] **Step 4: Add failing People assertions for canonical links and compact typography**

Add to the existing table-first People test:

```tsx
expect(screen.getByRole("link", { name: /Iori/i })).toHaveAttribute(
  "href",
  "/people/person-1",
);
expect(screen.getByRole("region", { name: "People table" })).toBeVisible();
```

Add a class assertion that the desktop table contains `text-[13px]` and its header contains `text-[11px]`.

- [ ] **Step 5: Run the People test and confirm the density assertion fails**

Run: `npx vitest run src/features/people/components/people-screen.test.tsx`

Expected: FAIL because the table currently uses `text-sm` and the header uses `text-xs`.

- [ ] **Step 6: Reuse `RecordLink` and align People density**

Change the desktop table and header classes to the same 13px/11px range used by Properties. Replace the raw person-name `Link` with `RecordLink` while preserving the exact `/people/[personId]` destination, role-scoped columns, contact fields, linked context, access status, and card rendering.

Do not add a new Attention column. Missing contact stays visible as muted missing data until Layer 2 defines a stable person-readiness model.

- [ ] **Step 7: Run both feature suites**

Run: `npx vitest run src/features/properties/components/property-screen.test.tsx src/features/people/components/people-screen.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the register alignment**

```bash
git add src/features/properties/components/properties-table.tsx src/features/properties/components/property-screen.test.tsx src/features/people/components/people-table.tsx src/features/people/components/people-screen.test.tsx
git commit -m "refactor: align property and people registers"
```

### Task 3: Keep Maintenance Queue-First And Flatten Finance Work Hierarchy

**Files:**
- Modify: `src/features/maintenance/components/maintenance-workspace-ui.test.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.tsx`
- Modify: `src/features/finance-operations/components/finance-operations-screen.test.tsx`

**Interfaces:**
- Consumes: existing Maintenance review tabs, case drawer, Finance `workFilter`, `CompactTotals`, invoice ordering, and capability-gated actions.
- Produces: a frozen Maintenance Layer 1 contract and a flatter Finance work header with only row-level secondary actions.

- [ ] **Step 1: Add a Maintenance acceptance test that freezes its already-correct queue anatomy**

In `maintenance-workspace-ui.test.tsx`, render the table surface and assert:

```tsx
expect(screen.getByRole("heading", { name: "Maintenance" })).toBeVisible();
expect(screen.getByRole("tab", { name: /Open/i })).toBeVisible();
expect(screen.getByRole("region", { name: /maintenance/i })).toBeVisible();
expect(screen.getByRole("button", { name: /New case/i })).toBeVisible();
```

Also assert that advanced filters are not expanded on initial render and that Enter on a selectable case opens the existing case drawer. Do not change `MaintenanceScreen` unless one of these existing guarantees fails.

- [ ] **Step 2: Run the Maintenance UI suite**

Run: `npx vitest run src/features/maintenance/components/maintenance-workspace-ui.test.tsx`

Expected: PASS after adapting only selectors to the existing accessible names. This proves Maintenance needs no Layer 1 redesign.

- [ ] **Step 3: Write failing Finance assertions for one flat summary and secondary row actions**

Extend the existing Finance work-queue tests:

```tsx
const summary = screen.getByLabelText("Finance work summary");
expect(summary).toHaveTextContent("open work");
expect(summary).toHaveTextContent("tenant payments");
expect(summary).toHaveTextContent("owner invoice payments");
expect(summary.className).not.toContain("rounded-xl");

for (const action of screen.getAllByRole("button", { name: /Record|Set up|Repair/i })) {
  expect(action.className).toContain("border");
}
```

- [ ] **Step 4: Run the focused Finance tests and confirm the flat-summary assertion fails**

Run: `npx vitest run src/features/finance-operations/components/finance-operations-screen.test.tsx -t "work queue summary|oldest-first|filters the mixed work queue"`

Expected: FAIL because the top-level work view currently renders `CompactTotals` as a rounded bordered card row.

- [ ] **Step 5: Replace only the top-level Finance work `CompactTotals` call**

Inside `FinanceWorkView`, replace the top-level `CompactTotals` with:

```tsx
<p
  aria-label="Finance work summary"
  className="text-sm text-muted-foreground"
>
  <span className="font-medium text-foreground">{workCount} open work</span>
  {" · "}{tenantDue.length} tenant payments
  {" · "}{ownerDue.length} owner invoice payments
</p>
```

Keep `CompactTotals` for scoped Rent and account views where totals are the actual reading task. Change only work-queue action buttons to the existing secondary or outline variant and compact size; do not change capability checks, action labels, drawers, invoice ordering, or payment semantics.

- [ ] **Step 6: Run Maintenance and Finance suites**

Run: `npx vitest run src/features/maintenance/components/maintenance-workspace-ui.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the queue hierarchy pass**

```bash
git add src/features/maintenance/components/maintenance-workspace-ui.test.tsx src/features/finance-operations/components/finance-operations-screen.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx
git commit -m "refactor: clarify top-level operations queues"
```

### Task 4: Prove Records Already Meets Layer 1 And Avoid A New Umbrella Route

**Files:**
- Modify: `src/features/timeline/components/timeline-screen.test.tsx`
- Modify: `src/features/documents/components/document-screen.test.tsx`
- Modify: `src/features/ledger/components/ledger-screen.test.tsx`

**Interfaces:**
- Consumes: existing `previewRowClassName`, `selectedPreviewRowClassName`, `RecordLink`, quick views, URL-backed filters, and canonical Records routes.
- Produces: regression coverage proving Timeline, Documents, and Ledger remain separate source-owned list views under the existing Records navigation.

- [ ] **Step 1: Add one explicit Layer 1 assertion to each Records suite**

Timeline:

```tsx
expect(screen.getByRole("link", { name: /Open Timeline event/i })).toBeVisible();
expect(screen.getByRole("region", { name: /timeline/i })).toBeVisible();
```

Documents:

```tsx
expect(screen.getByRole("region", { name: "Documents table" })).toBeVisible();
expect(screen.getByRole("button", { name: /Preview/i })).toBeVisible();
```

Ledger:

```tsx
expect(screen.getByRole("region", { name: /ledger/i })).toBeVisible();
expect(screen.getByRole("button", { name: /Preview/i })).toBeVisible();
```

Use the exact accessible names already rendered by each fixture. These tests formalize the existing direct-link-plus-quick-view contract; they do not add new UI.

- [ ] **Step 2: Run all three Records suites**

Run: `npx vitest run src/features/timeline/components/timeline-screen.test.tsx src/features/documents/components/document-screen.test.tsx src/features/ledger/components/ledger-screen.test.tsx`

Expected: PASS after aligning assertions to the existing names.

- [ ] **Step 3: Confirm the route boundary with the route inventory test**

Run: `npm run test:route-discoverability`

Expected: PASS with `/timeline`, `/documents`, and `/ledger` still directly addressable. No `/records` route is introduced.

- [ ] **Step 4: Commit the Records contract coverage**

```bash
git add src/features/timeline/components/timeline-screen.test.tsx src/features/documents/components/document-screen.test.tsx src/features/ledger/components/ledger-screen.test.tsx
git commit -m "test: preserve records register contract"
```

### Task 5: Verify Layer 1 As One Cross-Domain Surface

**Files:**
- Verify only: all files changed in Tasks 1-4.

**Interfaces:**
- Consumes: all Layer 1 deliverables.
- Produces: a locally verified, reviewable Layer 1 checkpoint with no database or production mutation.

- [ ] **Step 1: Run the focused Layer 1 component suites**

Run:

```bash
npx vitest run src/components/data/interactive-table.test.tsx src/features/properties/components/property-screen.test.tsx src/features/people/components/people-screen.test.tsx src/features/maintenance/components/maintenance-workspace-ui.test.tsx src/features/finance-operations/components/finance-operations-screen.test.tsx src/features/timeline/components/timeline-screen.test.tsx src/features/documents/components/document-screen.test.tsx src/features/ledger/components/ledger-screen.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run static and UI contract checks**

Run:

```bash
npm run lint
npm run test:ui-copy
npm run test:ui-coverage
```

Expected: all commands exit 0.

- [ ] **Step 3: Run the existing responsive/authenticated UI smoke**

Run: `npm run test:ui-redesign`

Expected: existing authenticated route and responsive screenshot assertions pass for the configured local fixture. If local auth or fixture prerequisites are absent, report that boundary without substituting production access.

- [ ] **Step 4: Review the rendered acceptance checklist**

Confirm on Properties, People, Maintenance, Finance, Timeline, Documents, and Ledger:

```text
[ ] One title/action composition
[ ] At most one secondary controls row
[ ] One dominant table or queue
[ ] Explicit record link or deliberate quick view
[ ] No repeated dominant row buttons
[ ] Warning color only for actionable state
[ ] Existing URL filters and pagination preserved
[ ] Existing mobile list/card transformation preserved
[ ] No Layer 2 detail-page changes
```

- [ ] **Step 5: Commit the verified Layer 1 checkpoint**

```bash
git add src/components/data src/features/properties/components src/features/people/components src/features/maintenance/components src/features/finance-operations/components src/features/timeline/components src/features/documents/components src/features/ledger/components
git commit -m "refactor: complete layer one register refinement"
```

## Layer 1 Completion Gate

Layer 1 is complete when all target routes feel like members of the same platform without making their domain data identical. Completion does not require adding the generated mockups' columns or Upcoming sections. It requires consistent hierarchy, controls, row affordances, density, attention semantics, and navigation while preserving real workflow behavior.

Layer 2 must not begin until the user reviews this checkpoint and agrees on the default relationship between a canonical record summary and a focused action.
