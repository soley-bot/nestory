# Nestory Platform UI and UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task.

**Goal:** Apply one instinctive, accessible, operational redesign to every current Nestory surface without changing business rules, permissions, URLs, or data behavior.

**Architecture:** Establish a tested UI contract and reusable workspace primitives first, then migrate complete vertical route families. A machine-readable route manifest, browser smoke suite, copy guard, and final role/viewport matrix prevent visually prominent routes from being redesigned while secondary routes are missed.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase/Postgres, Vitest, Testing Library, Playwright, axe-core.

**Approved design:** `docs/superpowers/specs/2026-07-15-platform-ui-ux-redesign-design.md`

## Global Constraints

- Read `PROJECT_RULES.md`, the relevant current-state/engineering/verification doc, and the applicable guide under `node_modules/next/dist/docs/` before changing Next.js behavior.
- Preserve current route URLs, query-string filters, server/client ownership, role checks, RLS, RPC boundaries, calculation semantics, redirects, exports, and print behavior.
- Keep authenticated UI quiet, dense, neutral, and operational. Do not copy CodeRabbit's brand, orange palette, terminology, or developer-product styling.
- Use three surface levels only: canvas, work surface, and raised/selected surface. Use deep teal/sage for selection, amber for attention, red only for destructive or failed states.
- Keep list workspaces table-first with a persistent inspector where the viewport permits it. Preserve the current 13px table body and 11px table-header density; use 14px for ordinary body, form, and inspector content.
- Label actions clearly. Explain only consequences, permissions, unfamiliar property/accounting meaning, irreversible actions, or handoffs. Remove instructions that merely narrate visible controls.
- Keep visible labels for fields and primary actions. Placeholder-only forms and unlabeled icon-only actions are out of scope even when a control seems obvious.
- Use progressive disclosure: local navigation and the dominant task remain visible; secondary metadata, advanced filters, and background detail belong in inspectors, drawers, or expandable regions.
- Add tests before each behavior change. Run the narrow failing test, implement the smallest change, rerun the narrow test, then run the phase gate.
- Use additive migrations only. Never weaken RLS or move privileged reads/writes into the browser.
- Do not deploy, push, or change hosted data without explicit approval.

## Program Phases and Gates

| Phase | Outcome | Exit gate |
| --- | --- | --- |
| 0. Coverage and baseline | Every route, state, role, and viewport is enumerated before visual work | Coverage and baseline scripts pass |
| 1. Foundations | Tokens and shared workspace/feedback primitives are stable | Foundation unit tests, lint, and typecheck pass |
| 2. Shell and findability | Global navigation and role-aware command search work everywhere | Shell, search API, keyboard, and access tests pass |
| 3. Operational workspaces | All list, board, timeline, document, and report workspaces share the new anatomy | Phase route smoke matrix passes |
| 4. Settings and consequential forms | Settings and mutations expose state and consequences without tutorial copy | Draft/permission/consequence tests pass |
| 5. Overview and record detail | Attention-first overview and linked detail pages use the same system | Overview/detail workflow tests pass |
| 6. Public, auth, responsive, accessibility, and states | Every remaining surface and non-happy state is redesigned | Three-viewport axe and keyboard audit passes |
| 7. Full-platform closeout | No route, role, state, or legacy redirect is missed | Full engineering, database, route, and visual evidence passes |

---

## Phase 0 — Coverage and Baseline

### Task 1: Create the route coverage contract

**Files:**

- Create: `config/ui-route-coverage.json`
- Create: `src/lib/ui/route-coverage.ts`
- Create: `src/lib/ui/route-coverage.test.ts`
- Create: `scripts/verify-ui-route-coverage.mjs`
- Modify: `package.json`

**Step 1: Write the failing contract test**

Define these types in `src/lib/ui/route-coverage.ts`:

```ts
export type UiPhase = 2 | 3 | 4 | 5 | 6;
export type UiRole = "public" | "unlinked" | "admin" | "staff" | "maintenance";
export type UiSurface = "public" | "auth" | "workspace" | "detail" | "settings" | "redirect";

export interface UiRouteContract {
  route: string;
  source: string;
  phase: UiPhase;
  surface: UiSurface;
  roles: UiRole[];
  states: string[];
}
```

The test must import `config/ui-route-coverage.json`, validate every row against the type contract, require unique `source` values, and assert coverage for all 46 current `page.tsx` files. Include dynamic routes literally as `/people/[personId]`, `/properties/[propertyId]`, `/reports/[reportKind]`, and `/units/[unitId]`.

**Step 2: Run the test and confirm failure**

Run: `npm test -- src/lib/ui/route-coverage.test.ts`

Expected: FAIL because the manifest and typed loader do not exist.

**Step 3: Add the complete manifest**

Record these route families and ownership:

- Phase 2 shell entry: `/workspace`.
- Phase 3 operations: `/properties`, `/units`, `/people`, `/owners`, `/staff`, `/tenants`, `/vendors`, `/leases`, `/rent-income`, `/bills-expenses`, `/ledger`, `/petty-cash`, `/maintenance`, `/tasks`, `/recurring-tasks`, `/inspections`, `/work-orders`, `/timeline`, `/financial-timeline`, `/maintenance-timeline`, `/property-timeline`, `/documents`, `/reports`, `/reports/[reportKind]`, `/people-reports`.
- Phase 4 settings and mutation-heavy flows: `/settings`, `/users-roles`, `/account`, `/import`.
- Phase 5 attention and detail: `/overview`, `/properties/[propertyId]`, `/units/[unitId]`, `/people/[personId]`.
- Phase 6 public/auth/system: `/`, `/login`, `/signup`, `/setup`, `/no-access`.
- Phase 6 redirect verification: `/property-dashboard`, `/finance-dashboard`, `/maintenance-dashboard`, `/payments`, `/invoices`, `/schedule`, `/team`.

Each non-redirect route must name its applicable states from `loading`, `populated`, `empty`, `filtered-empty`, `error`, `permission-blocked`, `draft`, `saving`, and `success`. The JSON is the Node-readable source of truth; `route-coverage.ts` imports it and exposes typed lookup helpers.

**Step 4: Add the filesystem verifier**

`scripts/verify-ui-route-coverage.mjs` must:

1. recursively find `src/app/**/page.tsx`;
2. normalize route groups away while retaining dynamic segment names;
3. compare the normalized set with `config/ui-route-coverage.json`;
4. fail with explicit `missing from manifest` and `stale manifest entry` lists.

Add `"test:ui-coverage": "node scripts/verify-ui-route-coverage.mjs"` to `package.json`.

**Step 5: Verify and commit checkpoint**

Run:

```powershell
npm test -- src/lib/ui/route-coverage.test.ts
npm run test:ui-coverage
npx tsc --noEmit
```

Expected: all commands exit 0 and the script reports `46/46 page routes covered`.

Commit checkpoint: `test(ui): lock full route coverage for redesign`

### Task 2: Capture a no-mutation browser baseline

**Files:**

- Create: `scripts/smoke-ui-redesign.mjs`
- Create: `artifacts/ui-redesign/.gitkeep`
- Modify: `package.json`
- Modify: `docs/verification.md`

**Step 1: Write the failing smoke runner contract**

Add `"test:ui-redesign": "node scripts/smoke-ui-redesign.mjs"`. The script must fail if `BASE_URL` is absent, authenticate only through existing environment-provided test credentials, and default to read-only navigation. It must never submit a form, drag a board card, upload a file, or invoke a mutation.

Cover three viewports:

- desktop: 1440×900;
- compact desktop/tablet: 1024×768;
- phone: 390×844.

Capture screenshots and console/page errors for representative routes `/overview`, `/properties`, `/units`, `/people`, `/leases`, `/rent-income`, `/maintenance`, `/timeline`, `/documents`, `/reports`, `/settings`, `/users-roles`, `/account`, and `/`.

**Step 2: Run and confirm the explicit environment failure**

Run: `npm run test:ui-redesign`

Expected: FAIL with `BASE_URL is required`; it must not silently choose production.

**Step 3: Implement baseline evidence output**

The runner creates a UTC run directory in `YYYY-MM-DDTHH-mm-ssZ` format and a named viewport subdirectory; for example, `artifacts/ui-redesign/2026-07-15T09-00-00Z/desktop/`. Store `summary.json` with route, final URL, page title, screenshot path, console errors, page errors, horizontal-overflow result, and access result.

Update `docs/verification.md` with the local invocation:

```powershell
$env:BASE_URL='http://localhost:3000'
$env:E2E_EMAIL='local fixture email'
$env:E2E_PASSWORD='local fixture password'
npm run test:ui-redesign
```

**Step 4: Verify against a local fixture**

Run the app and smoke suite using existing local test data. Confirm no route mutates data and screenshots exist for all route/viewport pairs that the role can access.

Commit checkpoint: `test(ui): add read-only redesign baseline`

### Task 3: Add the instinctive-copy guard

**Files:**

- Create: `scripts/verify-ui-copy.mjs`
- Create: `src/lib/ui/copy-rules.test.ts`
- Modify: `docs/frontend-quality-checklist.md`
- Modify: `package.json`

**Step 1: Write the failing copy test**

Test a small exported rule set with these categories:

- prohibited tutorial narration: `Select a row to`, `Double-click to`, `Use the filters above`, `Click the button`, `This page allows you to`;
- permitted help: consequence, permission, accounting meaning, irreversible action, and cross-team handoff text;
- required semantics: visible labels for form controls and accessible names for icon actions.

**Step 2: Run and confirm failure**

Run: `npm test -- src/lib/ui/copy-rules.test.ts`

Expected: FAIL because the rule module/script does not exist.

**Step 3: Implement the static verifier**

`scripts/verify-ui-copy.mjs` scans `src/app`, `src/components`, and `src/features`, prints file/line evidence for prohibited narration, and permits narrowly documented exclusions for public marketing copy. Add `"test:ui-copy": "node scripts/verify-ui-copy.mjs"`.

Add this checklist rule: **Label the action; explain only risk, consequence, permission, unfamiliar domain meaning, or handoff.** Include keyboard and screen-reader labels as a separate requirement so brevity never removes accessibility.

**Step 4: Establish the baseline without mass editing**

Run `npm run test:ui-copy`, record current failures in the first implementation PR, and make Phase 7 require zero unexplained failures. Do not mechanically delete copy before its owning route is migrated.

Commit checkpoint: `test(ui): codify instinctive copy rules`

---

## Phase 1 — Shared Foundations

### Task 4: Introduce semantic surface, state, and type tokens

**Files:**

- Modify: `src/app/globals.css`
- Create: `src/lib/ui/theme-contract.test.ts`

**Step 1: Write the failing token contract**

Parse `globals.css` and require variables for `--surface-canvas`, `--surface-work`, `--surface-raised`, `--state-selected`, `--state-attention`, `--state-danger`, `--focus-ring`, `--type-body`, `--type-table`, and `--type-table-header`. Reject route-specific raw colors introduced during the migration.

**Step 2: Run and confirm failure**

Run: `npm test -- src/lib/ui/theme-contract.test.ts`

Expected: FAIL with the missing semantic tokens.

**Step 3: Implement the theme layer**

Map the existing dark foundation into the three surfaces. Define deep teal/sage selection, amber attention, destructive red, neutral borders, and WCAG-visible focus. Retain 13px tables/11px headers and move ordinary body/form/inspector text to 14px. Keep spacing/radius restrained and avoid gradients in authenticated workspaces.

**Step 4: Verify**

Run:

```powershell
npm test -- src/lib/ui/theme-contract.test.ts
npx tsc --noEmit
npm run lint
```

Commit checkpoint: `feat(ui): establish redesign theme contract`

### Task 5: Build the reusable workspace anatomy

**Files:**

- Create: `src/components/layout/workspace-page.tsx`
- Create: `src/components/layout/workspace-split-view.tsx`
- Create: `src/components/layout/local-workspace-nav.tsx`
- Create: `src/components/layout/workspace-layout.test.tsx`
- Modify: `src/components/layout/page-header.tsx`

**Step 1: Write failing layout tests**

Require:

- one page title and compact context/action row;
- optional local navigation with a visible active item;
- one toolbar region;
- main work surface plus an inspector capped near 320px on wide screens;
- inspector collapse into a drawer below the compact-desktop breakpoint;
- no document-level horizontal overflow;
- main content remains keyboard reachable when the inspector opens/closes.

**Step 2: Run and confirm failure**

Run: `npm test -- src/components/layout/workspace-layout.test.tsx`

Expected: FAIL because the primitives do not exist.

**Step 3: Implement composable primitives**

Expose explicit slots rather than feature-specific conditionals:

```ts
type WorkspacePageProps = {
  header: React.ReactNode;
  localNav?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
};

type WorkspaceSplitViewProps = {
  list: React.ReactNode;
  inspector?: React.ReactNode;
  inspectorLabel: string;
  inspectorOpen: boolean;
  onInspectorOpenChange?: (open: boolean) => void;
};
```

Keep URL and data ownership in feature screens; these components own only layout and responsive behavior.

**Step 4: Verify**

Run the layout test, app-shell test, typecheck, and lint.

Commit checkpoint: `feat(ui): add shared operational workspace layout`

### Task 6: Add shared draft, consequence, form, and empty-state feedback

**Files:**

- Create: `src/components/ui/draft-action-bar.tsx`
- Create: `src/components/ui/consequence-panel.tsx`
- Create: `src/components/ui/form-section.tsx`
- Create: `src/components/ui/empty-state.tsx`
- Create: `src/components/ui/workflow-feedback.test.tsx`
- Modify: `src/components/ui/side-drawer.tsx`
- Modify: `src/components/ui/record-preview-drawer.tsx`

**Step 1: Write failing interaction tests**

Test explicit clean/dirty/saving/saved/error states, discard confirmation, disabled reasons, permission-blocked actions, and consequence content linked with `aria-describedby`. Empty states must distinguish no records, no filter matches, permission block, and load failure.

**Step 2: Run and confirm failure**

Run: `npm test -- src/components/ui/workflow-feedback.test.tsx`

**Step 3: Implement without embedding business rules**

Features pass labels, status, consequences, and callbacks. The primitives render feedback and accessibility semantics only. Extend drawer slots for sticky title, content, consequence summary, and sticky action footer.

**Step 4: Verify**

Run the new test, typecheck, lint, and existing drawer consumers' focused tests.

Commit checkpoint: `feat(ui): add shared workflow feedback primitives`

### Phase 1 Gate

Run:

```powershell
npm test -- src/lib/ui/theme-contract.test.ts src/components/layout/workspace-layout.test.tsx src/components/ui/workflow-feedback.test.tsx
npm run test:ui-coverage
npx tsc --noEmit
npm run lint
```

Do not start route migrations until all commands pass.

---

## Phase 2 — Shell, Navigation, and Global Findability

### Task 7: Build server-side role-aware workspace search

**Files:**

- Create: `src/features/workspace-search/workspace-search.types.ts`
- Create: `src/features/workspace-search/workspace-search.scopes.ts`
- Create: `src/features/workspace-search/data/workspace-search.ts`
- Create: `src/features/workspace-search/data/workspace-search.test.ts`
- Create: `src/app/api/workspace-search/route.ts`
- Create: `src/app/api/workspace-search/route.test.ts`
- Create: `supabase/migrations/20260715090000_workspace_search_indexes.sql`

**Step 1: Write failing authorization and ranking tests**

Require authenticated organization scope, capability-based entity scopes, trimmed queries of at least two characters, a hard result limit of 20, stable ranking, and no cross-organization data. Search only entities already visible to the current role: properties, units, people, leases, tasks/maintenance, documents, and permitted navigation actions.

**Step 2: Run and confirm failure**

Run:

```powershell
npm test -- src/features/workspace-search/data/workspace-search.test.ts src/app/api/workspace-search/route.test.ts
```

Expected: FAIL because the feature and route do not exist.

**Step 3: Implement the server data boundary**

Reuse the current authenticated Supabase server client and role/capability helpers. Return presentation-safe results only:

```ts
export type WorkspaceSearchResult = {
  id: string;
  kind: "property" | "unit" | "person" | "lease" | "maintenance" | "task" | "document" | "action";
  label: string;
  meta?: string;
  href: string;
};
```

Never accept organization or role from the client. Keep all entity predicates organization-scoped and RLS-compatible.

**Step 4: Add only missing indexes**

The migration enables no new extension. Add `CREATE INDEX IF NOT EXISTS` trigram indexes, following existing migration conventions, for normalized task title/description, document filename, and lease tenant name lookup. Do not duplicate existing trigram indexes for properties, units, people, ledger, or timeline.

**Step 5: Verify**

Run:

```powershell
npm test -- src/features/workspace-search/data/workspace-search.test.ts src/app/api/workspace-search/route.test.ts
npm run db:lint
npx tsc --noEmit
```

Commit checkpoint: `feat(search): add scoped global workspace search`

### Task 8: Add the accessible command palette

**Files:**

- Create: `src/components/layout/workspace-command-palette.tsx`
- Create: `src/components/layout/workspace-command-palette.test.tsx`
- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/layout/app-shell.test.tsx`

**Step 1: Write failing keyboard and access tests**

Test `Ctrl+K` and `Cmd+K`, click-to-open, 150ms debounced search, grouped results, arrow navigation, Enter activation, Escape close, focus return, loading/no-results/error states, and accessible dialog/listbox naming. Verify hidden actions never appear for unauthorized roles.

**Step 2: Run and confirm failure**

Run: `npm test -- src/components/layout/workspace-command-palette.test.tsx src/components/layout/app-shell.test.tsx`

Expected: FAIL because the palette is absent.

**Step 3: Implement palette behavior**

Place one compact `Search or jump…` trigger in the authenticated shell. Keep route navigation immediate; fetch entity results from `/api/workspace-search`. Recent destinations may be stored in local browser storage, but entity data and result permissions must never be cached there.

**Step 4: Verify**

Run focused tests, typecheck, lint, and manually navigate one result by keyboard with focus returning correctly after Escape.

Commit checkpoint: `feat(shell): add role-aware command palette`

### Task 9: Clarify global and local navigation hierarchy

**Files:**

- Modify: `src/components/layout/app-shell.tsx`
- Modify: `src/components/layout/app-shell.test.tsx`
- Modify: `src/components/layout/settings-tabs.tsx`
- Modify: `src/app/workspace/page.tsx`

**Step 1: Extend failing shell tests**

Require exactly one active global destination, collapsed groups that retain an accessible name, predictable keyboard tab order, and no duplicate links between the global shell and a route's local workspace navigation. Test admin, staff, and maintenance navigation visibility.

**Step 2: Implement the hierarchy**

- Global shell: Overview, Properties, People, Finance, Maintenance, Records, Reports, Settings, and command search.
- Local navigation: context-specific modes such as list/board/calendar, report family, timeline family, or settings section.
- `/workspace`: a concise organization entry/recovery page, not a second dashboard.

Keep current destinations and role filtering. Do not invent a universal module/dashboard layer.

**Step 3: Verify**

Run shell tests, auth entry-route tests, typecheck, lint, and read-only smoke `/workspace` for each fixture role.

Commit checkpoint: `feat(shell): separate global and local navigation`

### Phase 2 Gate

Run:

```powershell
npm test -- src/features/workspace-search/data/workspace-search.test.ts src/app/api/workspace-search/route.test.ts src/components/layout/workspace-command-palette.test.tsx src/components/layout/app-shell.test.tsx
npm run test:ui-coverage
npm run db:lint
npx tsc --noEmit
npm run lint
```

Then run the desktop smoke suite and confirm the palette can reach one permitted record in every supported result category.

---

## Phase 3 — Operational Workspaces

Migrate one complete route family per task. For every family: use `WorkspacePage` and `WorkspaceSplitView`; preserve server-loaded data, URL filters, saved calculations, role capabilities, and mutations; replace tutorial narration with clear labels/status; and add populated, empty, filtered-empty, loading, error, and permission tests before moving on.

### Task 10: Migrate Properties and Units as the reference workspaces

**Files:**

- Modify: `src/features/properties/components/property-screen.tsx`
- Modify: `src/features/properties/components/properties-table.tsx`
- Modify: `src/features/properties/components/property-inspector.tsx`
- Modify: `src/features/properties/components/property-filters.tsx`
- Create: `src/features/properties/components/property-screen.test.tsx`
- Modify: `src/features/units/components/unit-screen.tsx`
- Modify: `src/features/units/components/units-table.tsx`
- Modify: `src/features/units/components/unit-inspector.tsx`
- Modify: `src/features/units/components/unit-filters.tsx`
- Modify: `src/features/units/components/unit-screen.test.ts`

**Step 1: Write the failing experience tests**

Require dense sortable tables, URL-backed filters, a single selected row using `aria-selected`, direct record links, a 320px inspector on desktop, drawer fallback on smaller viewports, an explicit new-record action, and no instructions such as `Select a row` or `Double-click`. Empty filters must offer `Clear filters`; true empty states may offer `Add property` or `Add unit` only when authorized.

**Step 2: Run and confirm failure**

Run:

```powershell
npm test -- src/features/properties/components/property-screen.test.tsx src/features/units/components/unit-screen.test.ts
```

**Step 3: Implement Properties first, then Units**

Treat Properties as the visual reference. Use neutral table hierarchy, compact status chips, obvious row selection, inspector summary/actions, and drawer forms using Phase 1 primitives. Port the same anatomy to Units while preserving unit-specific tenancy and property context.

**Step 4: Verify workflows**

Run focused tests, filter tests, summary tests, `npm run test:properties-flow`, typecheck, lint, and read-only smoke at all three viewports.

Commit checkpoint: `feat(ui): migrate property and unit workspaces`

### Task 11: Migrate People and Leases

**Files:**

- Modify: `src/features/people/components/people-screen.tsx`
- Modify: `src/features/people/components/people-command-center.tsx`
- Modify: `src/features/people/components/people-table.tsx`
- Modify: `src/features/people/components/people-inspector.tsx`
- Create: `src/features/people/components/people-screen.test.tsx`
- Modify: `src/features/leases/components/lease-screen.tsx`
- Modify: `src/features/leases/components/leases-table.tsx`
- Modify: `src/features/leases/components/lease-inspector.tsx`
- Create: `src/features/leases/components/lease-screen.test.tsx`

**Step 1: Write failing route-family tests**

Test local People lenses for all/owners/staff/tenants/vendors without duplicating global navigation. Require role/status labels, relationship context, direct detail links, lease lifecycle dates, payment/deposit status, and permission-correct actions. Owner, staff, tenant, and vendor alias pages must render the same redesigned People workspace with the correct initial lens.

**Step 2: Implement and preserve route semantics**

Keep existing filters and alias routes. Do not merge people and leases into a generic CRM. Use the inspector for relationship/context detail and drawers for edits; show consequence copy only when role, contact, tenancy, or deposit behavior changes.

**Step 3: Verify**

Run People/Lease component, filter, insight, and summary tests; typecheck; lint; and smoke `/people`, `/owners`, `/staff`, `/tenants`, `/vendors`, and `/leases`.

Commit checkpoint: `feat(ui): migrate people and lease workspaces`

### Task 12: Migrate Finance workspaces

**Files:**

- Modify: `src/features/rent-income/components/rent-income-screen.tsx`
- Modify: `src/features/bills-expenses/components/bills-expenses-screen.tsx`
- Modify: `src/features/ledger/components/ledger-screen.tsx`
- Modify: `src/features/ledger/components/ledger-table.tsx`
- Modify: `src/features/ledger/components/ledger-inspector.tsx`
- Modify: `src/features/petty-cash/components/petty-cash-screen.tsx`
- Modify: `src/features/rent-income/components/rent-income-screen.test.tsx`
- Modify: `src/features/bills-expenses/components/bills-expenses-screen.test.tsx`
- Create: `src/features/ledger/components/ledger-screen.test.tsx`
- Create: `src/features/petty-cash/components/petty-cash-screen.test.tsx`

**Step 1: Write failing finance experience tests**

Require readable currency alignment, stable totals, status/date/property filters, inspector drilldown, explicit posted/pending/reversed state, and confirmation/consequence treatment for allocation, reversal, reconciliation, or cash-impacting actions. The visual redesign must not alter cash/deposit/accounting calculations.

**Step 2: Implement route by route**

Order: `/rent-income`, `/bills-expenses`, `/ledger`, `/petty-cash`. Reuse workspace and feedback primitives; retain feature-owned columns and business language. Surface consequences next to the mutation action, not in generic page introductions.

**Step 3: Verify**

Run all tests under `src/features/rent-income`, `bills-expenses`, `ledger`, `petty-cash`, and `finance`; then typecheck, lint, and smoke all four routes with a role that has finance access.

Commit checkpoint: `feat(ui): migrate finance workspaces`

### Task 13: Migrate Maintenance execution workspaces

**Files:**

- Modify: `src/features/maintenance/maintenance-route.tsx`
- Modify: `src/features/maintenance/components/maintenance-screen.tsx`
- Modify: `src/features/maintenance/components/maintenance-board-surface.tsx`
- Modify: `src/features/maintenance/components/maintenance-work-surfaces.tsx`
- Modify: `src/features/maintenance/components/maintenance-workflow-panel.tsx`
- Modify: `src/features/maintenance/components/maintenance-drawer-panels.tsx`
- Modify: `src/features/maintenance/components/maintenance-screen.test.ts`
- Modify: `src/features/maintenance/components/maintenance-vendor-form.test.tsx`
- Modify: `src/features/maintenance/components/maintenance-workflow-panel.test.tsx`

**Step 1: Write failing mode and capability tests**

Cover list, board, calendar, checklist, task, recurring-task, inspection, and work-order routes. Require one visible local mode navigation, unambiguous card/row status, keyboard-operable board alternatives, role-correct actions, workflow transition consequences, loading/error/empty states, and phone usability without hiding the primary action.

**Step 2: Implement without changing workflow contracts**

Keep `maintenance-route.tsx` as route composition. Preserve current capability helpers, transition rules, vendor picker, reminder behavior, checklist semantics, and mutation boundaries. Use the same record inspector/drawer language across modes while retaining a list/table alternative to drag-and-drop.

**Step 3: Verify**

Run all maintenance tests plus `npm run test:maintenance-mobile`, typecheck, lint, and role smoke for admin/staff/maintenance fixtures across `/maintenance`, `/tasks`, `/recurring-tasks`, `/inspections`, and `/work-orders`.

Commit checkpoint: `feat(ui): migrate maintenance execution workspaces`

### Task 14: Migrate Timeline and Documents

**Files:**

- Modify: `src/features/timeline/timeline-route.tsx`
- Modify: `src/features/timeline/components/timeline-screen.tsx`
- Modify: `src/features/timeline/components/timeline-table.tsx`
- Modify: `src/features/timeline/components/timeline-inspector.tsx`
- Modify: `src/features/documents/components/document-screen.tsx`
- Modify: `src/features/documents/components/document-list.tsx`
- Create: `src/features/documents/components/document-screen.test.tsx`

**Step 1: Write failing family tests**

Timeline tests cover global/property/maintenance/financial route scopes, stable filters, event-type labels, selected event, attachments, and permission-correct add/edit actions. Document tests cover list/search, file metadata, linked record context, upload state, true-empty versus filtered-empty, and safe download/open actions.

**Step 2: Implement shared workspace anatomy**

Keep the four timeline routes scoped through existing `timeline-route.tsx`; do not duplicate screens. Use list + inspector for documents, with upload/edit in a drawer. Explain file limits or linking consequences only at the upload/edit action.

**Step 3: Verify**

Run all Timeline/Document tests, typecheck, lint, and smoke `/timeline`, `/property-timeline`, `/maintenance-timeline`, `/financial-timeline`, and `/documents`.

Commit checkpoint: `feat(ui): migrate timeline and document workspaces`

### Task 15: Migrate Reports and People Reports

**Files:**

- Modify: `src/features/reports/components/reports-screen.tsx`
- Modify: `src/features/reports/components/reports-filters.tsx`
- Modify: `src/features/people/components/people-module-page.tsx`
- Modify: `src/app/(dashboard)/people-reports/page.tsx`
- Modify: `src/features/reports/components/reports-screen.test.tsx`
- Modify: `src/features/reports/components/reports-filters.test.tsx`

**Step 1: Write failing report experience tests**

Require a scannable report library, local report-family navigation, obvious date/property/owner filters, explicit preview/generate/export states, print-safe result hierarchy, empty-result handling, and no changes to trusted report totals or CSV/PDF data.

**Step 2: Implement library and report-result anatomy**

Use a focused report picker rather than descriptive cards for every option. Keep explanations only where a report's accounting scope or included/excluded data could be misunderstood. Apply the same system to People Reports without forcing it into the financial catalog.

**Step 3: Verify**

Run all report catalog/filter/screen/CSV/PDF/owner-statement/trusted-report tests, People report data tests, typecheck, lint, and smoke `/reports`, every catalogued `/reports/[reportKind]`, and `/people-reports`.

Commit checkpoint: `feat(ui): migrate report workspaces`

### Phase 3 Gate

Run:

```powershell
npm test
npm run test:properties-flow
npm run test:maintenance-mobile
npm run test:ui-copy
npm run test:ui-coverage
npx tsc --noEmit
npm run lint
```

Run the read-only browser matrix for every Phase 3 route at desktop and compact desktop, plus phone for Properties, People, Finance, and Maintenance. Compare tables, active local navigation, inspector behavior, empty states, and horizontal overflow against the approved design.

---

## Phase 4 — Settings and Consequential Forms

### Task 16: Rebuild Settings as a three-zone workspace

**Files:**

- Modify: `src/app/(dashboard)/settings/page.tsx`
- Modify: `src/features/organization/components/organization-settings-screen.tsx`
- Create: `src/features/organization/components/settings-workspace.tsx`
- Create: `src/features/organization/components/branch-editor.tsx`
- Create: `src/features/organization/components/team-editor.tsx`
- Create: `src/features/organization/components/settings-workspace.test.tsx`
- Modify: `src/components/layout/settings-tabs.tsx`

**Step 1: Write failing navigation and draft tests**

Require a local settings rail, focused editor, and live consequence/summary panel. Test URL-backed sections `?section=organization`, `?section=branches`, and `?section=teams`; clean/dirty/saving/saved/error state; discard confirmation; focus on the first invalid field; and permission-blocked controls. Obvious labels such as Name, Email, and Save must not carry tutorial explanations.

**Step 2: Run and confirm failure**

Run: `npm test -- src/features/organization/components/settings-workspace.test.tsx`

**Step 3: Implement the three-zone composition**

- Left: compact local section rail.
- Center: the active editor with grouped form sections.
- Right: current organization/branch/team scope, inherited values, affected records or users when known, and the draft action state.

Do not add settings APIs unless a current action already supports the edit. Unsupported settings remain absent rather than appearing as disabled future controls.

**Step 4: Verify**

Run the focused test, organization action tests if present, typecheck, lint, and admin browser smoke for all three query sections.

Commit checkpoint: `feat(settings): add focused three-zone workspace`

### Task 17: Redesign Users/Roles and Account around permissions and effects

**Files:**

- Modify: `src/features/organization/components/access-settings-screen.tsx`
- Create: `src/features/organization/components/access-settings-screen.test.tsx`
- Modify: `src/app/(dashboard)/users-roles/page.tsx`
- Modify: `src/app/(dashboard)/account/page.tsx`
- Create: `src/features/account/components/account-screen.tsx`
- Create: `src/features/account/components/account-screen.test.tsx`

**Step 1: Write failing permission tests**

For `/users-roles`, test role visibility, invite/member state, protected last-admin behavior, scope summaries, pending/saving/error feedback, and consequence text for changes that affect data access. For `/account`, test identity/session display, safe profile changes, sign-out action, and destructive or security-sensitive confirmation if currently supported.

**Step 2: Implement with consequence-first copy**

Make role and access effects visible beside the control that changes them. Remove generic descriptions of what a role selector or account form is. Keep permission checks on the server and reflect disabled reasons in the UI.

**Step 3: Verify**

Run access/account/auth action tests, typecheck, lint, then smoke both routes as admin and non-admin fixtures. Confirm unauthorized users never receive hidden member/access data in page payloads.

Commit checkpoint: `feat(settings): clarify access and account consequences`

### Task 18: Standardize record-creation and record-edit drawers

**Files:**

- Modify: `src/features/properties/components/property-form.tsx`
- Modify: `src/features/units/components/unit-form.tsx`
- Modify: `src/features/people/components/person-form.tsx`
- Modify: `src/features/leases/components/lease-form.tsx`
- Modify: `src/features/timeline/components/timeline-event-form.tsx`
- Modify: `src/features/documents/components/document-screen.tsx`
- Create: `src/components/ui/record-form-contract.test.tsx`

**Step 1: Write failing shared form-contract tests**

Each form must have a visible title, visible labels, required indicators, grouped sections, inline field errors, first-error focus, explicit Cancel/Save labels, dirty-state handling, saving/error/success feedback, and safe dismissal. Consequence text appears only for relationship, ownership, tenancy, accounting, access, upload, or irreversible effects.

**Step 2: Run and confirm failure**

Run: `npm test -- src/components/ui/record-form-contract.test.tsx`

**Step 3: Migrate one form at a time**

Use `FormSection`, `ConsequencePanel`, `DraftActionBar`, and extended `SideDrawer`. Preserve current Zod/schema validation, server actions, normalized payloads, optimistic behavior, and revalidation. Do not combine unrelated forms into a generic schema-driven form engine.

**Step 4: Verify**

Run the contract test plus every feature action/form test, typecheck, lint, and keyboard-only create/edit smoke using local disposable fixture data.

Commit checkpoint: `feat(forms): standardize record drawer interactions`

### Task 19: Add explicit consequences to high-impact workflows

**Files:**

- Modify: `src/features/rent-income/components/rent-income-screen.tsx`
- Modify: `src/features/bills-expenses/components/bills-expenses-screen.tsx`
- Modify: `src/features/ledger/components/ledger-entry-form.tsx`
- Modify: `src/features/petty-cash/components/petty-cash-screen.tsx`
- Modify: `src/features/maintenance/components/maintenance-workflow-panel.tsx`
- Modify: `src/features/imports/components/import-preview-screen.tsx`
- Modify: `src/features/reports/components/reports-screen.tsx`
- Modify: `src/features/rent-income/components/rent-income-screen.test.tsx`
- Modify: `src/features/bills-expenses/components/bills-expenses-screen.test.tsx`
- Create: `src/features/ledger/components/ledger-entry-form.test.tsx`
- Modify: `src/features/petty-cash/components/petty-cash-screen.test.tsx`
- Modify: `src/features/maintenance/components/maintenance-workflow-panel.test.tsx`
- Create: `src/features/imports/components/import-preview-screen.test.tsx`
- Modify: `src/features/reports/components/reports-screen.test.tsx`

**Step 1: Add failing consequence assertions**

Cover allocation/post/reversal/cash effects, maintenance status transitions and notification/vendor effects, import create/update/skip counts, and report generation scope. Require a pre-submit summary and a result state after completion. Do not add confirmation to harmless filters, navigation, or ordinary field changes.

**Step 2: Implement with feature-owned summaries**

Each feature computes its own consequence model and passes presentation-ready rows to `ConsequencePanel`. The shared component must not calculate finance, import, or maintenance meaning.

**Step 3: Verify**

Run all affected feature tests, database invariant tests, typecheck, lint, and mutation smoke only against local disposable fixtures. Compare row counts/totals before and after to prove the redesign did not change business effects.

Commit checkpoint: `feat(ui): expose consequences for high-impact actions`

### Phase 4 Gate

Run:

```powershell
npm test
npm run test:ui-copy
npx tsc --noEmit
npm run lint
npm run db:lint
```

Complete an admin/staff permission matrix for `/settings`, `/users-roles`, `/account`, and `/import`. Verify dirty-state, save, server error, permission block, and success states before continuing.

---

## Phase 5 — Attention-First Overview and Record Detail

### Task 20: Make Overview an attention-first operational home

**Files:**

- Modify: `src/features/overview/overview.types.ts`
- Modify: `src/features/overview/data/overview.ts`
- Modify: `src/features/overview/data/overview.test.ts`
- Create: `src/features/overview/components/overview-attention-queue.tsx`
- Modify: `src/features/overview/components/overview-screen.tsx`
- Modify: `src/features/overview/components/overview-header.tsx`
- Modify: `src/features/overview/components/overview-lens-workspace.tsx`
- Modify: `src/features/overview/components/overview-screen.test.tsx`

**Step 1: Write failing attention-model tests**

Add:

```ts
export type OverviewAttentionKind =
  | "overdue-rent"
  | "urgent-maintenance"
  | "expiring-lease"
  | "missing-document"
  | "unreconciled-finance"
  | "data-quality";
```

Require organization and role scope, deterministic priority, direct action/detail links, no more than 12 initial items, and honest empty state. Existing portfolio, property performance, and finance calculations remain unchanged.

**Step 2: Run and confirm failure**

Run: `npm test -- src/features/overview/data/overview.test.ts src/features/overview/components/overview-screen.test.tsx`

**Step 3: Implement attention before analytics**

Order the page: compact context header, attention queue, key health/portfolio summaries, then deeper lens/chart workspaces. Charts remain secondary and must not displace urgent work. Every attention item links to the existing route/filter/detail that resolves it; do not create a parallel task system.

**Step 4: Verify**

Run all Overview and property-performance tests, typecheck, lint, and browser smoke for admin/staff/maintenance roles at desktop and phone widths.

Commit checkpoint: `feat(overview): prioritize operational attention`

### Task 21: Migrate Property, Unit, and Person detail pages

**Files:**

- Modify: `src/features/properties/components/property-detail-screen.tsx`
- Modify: `src/features/properties/components/property-detail-view.tsx`
- Modify: `src/features/properties/components/property-units-table.tsx`
- Modify: `src/features/units/components/unit-detail-screen.tsx`
- Modify: `src/features/units/components/unit-detail-view.tsx`
- Modify: `src/features/people/components/person-detail-screen.tsx`
- Modify: `src/app/(dashboard)/properties/[propertyId]/page.tsx`
- Modify: `src/app/(dashboard)/units/[unitId]/page.tsx`
- Modify: `src/app/(dashboard)/people/[personId]/page.tsx`
- Modify: `src/features/properties/data/property-detail.test.ts`
- Modify: `src/features/units/unit-detail-route.test.ts`
- Create: `src/features/people/components/person-detail-screen.test.tsx`

**Step 1: Write failing detail anatomy tests**

Require a compact identity/status header, primary next actions, local record navigation, relationship/context summary, relevant tables/timeline/documents, role-correct controls, valid back destination, missing/not-found behavior, and no duplicate explanatory cards. Deep links and current URL semantics must remain stable.

**Step 2: Implement one shared visual rhythm, not one generic component**

Use the same header/local-nav/work-surface rhythm across all three details, but keep property, unit, and person feature ownership. Show the most actionable relationships first: units/performance for property, lease/tenant/history for unit, and relationships/activity for person.

**Step 3: Verify**

Run property detail, unit detail/route, People insight/filter, timeline, documents, and photo tests; typecheck; lint; and browser smoke direct links, missing IDs, and back navigation.

Commit checkpoint: `feat(ui): migrate linked record detail pages`

### Phase 5 Gate

Run all Overview/detail focused tests, full `npm test`, typecheck, lint, copy guard, coverage guard, and three-viewport smoke for `/overview` plus every dynamic detail route.

---

## Phase 6 — Public/Auth, Responsive, Accessibility, and System States

### Task 22: Align public, auth, and system routes with the new visual language

**Files:**

- Modify: `src/features/marketing/landing-page.tsx`
- Modify: `src/features/marketing/components/landing-header.tsx`
- Modify: `src/features/marketing/components/control-preview.tsx`
- Modify: `src/features/auth/components/auth-page-shell.tsx`
- Modify: `src/features/auth/components/login-form.tsx`
- Modify: `src/features/auth/components/signup-form.tsx`
- Modify: `src/features/auth/components/setup-organization-form.tsx`
- Modify: `src/app/no-access/page.tsx`
- Modify: `src/features/auth/auth-entry-routes.test.ts`

**Step 1: Write failing route-state tests**

Cover `/`, `/login`, `/signup`, `/setup`, and `/no-access`: visible labels, validation, loading/submitting/error/success, clear next action, keyboard focus, safe redirect behavior, and mobile layout. Public pages may be more expressive than authenticated workspaces but must share typography, surface, focus, and control language.

**Step 2: Implement concise entry experiences**

Keep the existing landing proposition and auth behavior. Remove excessive product explanation from forms; keep only account, workspace, security, and access consequences. The no-access page must explain what happened and give a valid recovery/sign-out action without exposing organization data.

**Step 3: Verify**

Run auth action/entry tests, typecheck, lint, and anonymous/authenticated browser smoke for all five routes.

Commit checkpoint: `feat(ui): align public and auth experiences`

### Task 23: Enforce responsive and accessibility behavior platform-wide

**Files:**

- Modify: `scripts/smoke-ui-redesign.mjs`
- Create: `src/lib/ui/accessibility-contract.test.tsx`
- Modify: `docs/frontend-quality-checklist.md`
- Modify: `package.json`

**Step 1: Write failing accessibility contracts**

Require accessible names for icon buttons, labels for form controls, headings in order, selected/current semantics, dialog focus trapping/return, error association, and status announcements. Extend browser checks with axe scans and horizontal-overflow checks at 1440×900, 1024×768, and 390×844.

**Step 2: Add the automated gate**

Add `"test:ui-a11y": "node scripts/smoke-ui-redesign.mjs --axe"`. Fail on serious/critical axe violations, uncaught page errors, desktop/phone document overflow, or unreachable primary actions. Keep known third-party exceptions explicit with rule, route, reason, and owner; never add blanket exclusions.

**Step 3: Perform the manual keyboard/zoom audit**

For every route family, verify:

1. keyboard-only global/local navigation and command palette;
2. table row, inspector, drawer, form, and close behavior;
3. 200% browser zoom without lost content/actions;
4. focus indicator visibility on all surfaces;
5. screen-reader names for icons, status chips, chart summaries, and loading/error announcements.

Record results in the Phase 7 evidence document.

**Step 4: Verify**

Run the accessibility contract, `npm run test:ui-a11y`, typecheck, and lint.

Commit checkpoint: `test(ui): enforce responsive accessibility matrix`

### Task 24: Standardize loading, empty, error, blocked, and success states

**Files:**

- Modify: `src/components/layout/module-loading.tsx`
- Create: `src/components/ui/error-state.tsx`
- Create: `src/components/ui/status-notice.tsx`
- Create: `src/components/ui/system-states.test.tsx`
- Modify: `config/ui-route-coverage.json`
- Create: `src/lib/ui/route-state-evidence.test.ts`

**Step 1: Write failing state-contract tests**

For each manifest state, require a visible and accessible rendering strategy:

- loading: stable skeleton matching the final workspace shape;
- true empty: explain the absence and show an authorized creation/import action when useful;
- filtered empty: show active-filter context and `Clear filters`;
- error: concise cause/retry path without leaking internals;
- permission blocked: explain the boundary and safe next step;
- success: confirm the completed effect without blocking continued work.

**Step 2: Implement shared presentation with feature-owned meaning**

Use shared state components for layout/accessibility. Features supply domain labels, retry callbacks, actions, and consequences. Avoid generic `Something went wrong` when the failure type is safely known. If the evidence test exposes a missing state, return to the exact owning screen listed in Tasks 10–22 and add the remediation there; do not introduce a cross-feature state switch.

**Step 3: Verify all manifest states**

Use unit fixtures for states that are unsafe or difficult to trigger in browser smoke. Update the route manifest/evidence mapping to point to a test or screenshot for every declared state.

Commit checkpoint: `feat(ui): standardize platform system states`

### Phase 6 Gate

Run:

```powershell
npm test
npm run test:ui-copy
npm run test:ui-coverage
npm run test:ui-a11y
npx tsc --noEmit
npm run lint
```

No serious/critical accessibility failures, missing manifest states, unexplained instructional-copy violations, or viewport overflow may proceed to closeout.

---

## Phase 7 — Full-Platform Verification and Release Readiness

### Task 25: Execute the complete route, role, state, and viewport audit

**Files:**

- Create: `docs/verification/ui-redesign-evidence.md`
- Modify: `config/ui-route-coverage.json`
- Modify: `scripts/smoke-ui-redesign.mjs`

**Step 1: Generate coverage evidence**

For every manifest row, record:

- final route and redirect destination where applicable;
- role fixtures tested and expected access result;
- populated/empty/error/permission evidence test or screenshot;
- desktop, compact-desktop, and required phone evidence;
- keyboard/a11y result;
- preserved query/filter/deep-link behavior;
- known limitation with owner and follow-up issue, if any.

The evidence file must be generated or checked from the manifest so a missing route fails verification rather than becoming an unchecked blank row.

**Step 2: Verify all legacy redirects**

Assert exact destinations and query preservation for `/property-dashboard`, `/finance-dashboard`, `/maintenance-dashboard`, `/payments`, `/invoices`, `/schedule`, and `/team`. These routes do not need redesigned page content, but they must remain covered because they are public entry points into the platform.

**Step 3: Perform cross-route workflow checks**

Verify read-only and local-disposable workflows:

1. command search → property → unit → person;
2. property list filter → inspector → detail → back with filter retained;
3. People lens alias → person detail → related lease;
4. rent/expense/ledger drilldown with unchanged totals;
5. maintenance list/board/calendar/checklist with capability-correct actions;
6. timeline scope routes and linked record navigation;
7. report library → parameterized report → CSV/PDF/print;
8. settings draft → discard/save/error;
9. import preview → create/update/skip consequence summary without production mutation.

**Step 4: Require zero silent gaps**

Run `npm run test:ui-coverage`. If a new page appeared during the redesign, assign it a phase, roles, states, and smoke evidence before closeout.

Commit checkpoint: `docs(ui): record full redesign verification evidence`

### Task 26: Run final engineering and database checks, then update current docs

**Files:**

- Modify: `docs/current-state.md`
- Modify: `docs/engineering-rules.md`
- Modify: `docs/verification.md`
- Modify: `docs/frontend-quality-checklist.md`
- Modify: `README.md`

**Step 1: Run the full local gate from a clean checkout state**

Run:

```powershell
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run test:ui-coverage
npm run test:ui-copy
npm run test:properties-flow
npm run test:maintenance-mobile
npm run db:lint
```

Start the built app with authenticated local fixture data, then run:

```powershell
$env:BASE_URL='http://localhost:3000'
npm run test:ui-redesign
npm run test:ui-a11y
```

Expected: every command exits 0; coverage reports all current page routes; smoke/a11y summaries contain no unexpected access, page error, serious/critical axe issue, or overflow failure.

**Step 2: Verify database/schema parity locally**

Run `npm run db:reset` only against the confirmed local stack, regenerate database types if the search-index migration or schema introspection changes generated output, and rerun `npm run db:lint`, typecheck, and all search tests. Do not reset or mutate a hosted project.

**Step 3: Update current documentation**

Document the shared workspace anatomy, command palette/search scopes, three-zone settings pattern, consequence-copy rule, responsive inspector behavior, route coverage gate, and verification commands. Correct the README route map from the manifest; do not reintroduce obsolete roadmap material.

**Step 4: Review the diff for accidental scope changes**

Run:

```powershell
git status --short
git diff --stat
git diff --check
git diff -- src/app src/components src/features src/lib config scripts supabase docs package.json
```

Confirm there are no unrelated data-model, auth, permission, calculation, or route changes and no generated browser artifacts staged for commit.

Commit checkpoint: `feat(ui): complete platform-wide redesign`

### Task 27: Optional hosted release verification — only after explicit approval

**Files:** none unless release evidence is requested.

1. Confirm the approved branch and exact commit SHA.
2. Confirm linked Supabase project and run a dry-run migration check before any push.
3. Strongly recommend installing the global Vercel CLI with `npm i -g vercel` before hosted release work. If the user declines a global install, use the repo-local dependency through `npx vercel`.
4. Deploy only after approval, inspect until ready, and smoke protected routes using the authorized preview access method.
5. Report exact SHA, deployment URL, migration result, route smoke result, and any fixture limits. Do not describe local/CI evidence as production certification.

---

## Final Route Coverage Checklist

The redesign is incomplete until each group below has test or browser evidence:

- Public/auth/system: `/`, `/login`, `/signup`, `/setup`, `/no-access`, `/workspace`.
- Overview/detail: `/overview`, `/properties/[propertyId]`, `/units/[unitId]`, `/people/[personId]`.
- Properties/units: `/properties`, `/units`.
- People/leases: `/people`, `/owners`, `/staff`, `/tenants`, `/vendors`, `/leases`.
- Finance: `/rent-income`, `/bills-expenses`, `/ledger`, `/petty-cash`.
- Maintenance: `/maintenance`, `/tasks`, `/recurring-tasks`, `/inspections`, `/work-orders`.
- Records: `/timeline`, `/financial-timeline`, `/maintenance-timeline`, `/property-timeline`, `/documents`, `/import`.
- Reports: `/reports`, every current `/reports/[reportKind]`, `/people-reports`.
- Settings/access: `/settings`, `/users-roles`, `/account`.
- Redirects: `/property-dashboard`, `/finance-dashboard`, `/maintenance-dashboard`, `/payments`, `/invoices`, `/schedule`, `/team`.

## Definition of Done

- The filesystem and the route manifest match exactly.
- Every route uses the approved surface, typography, focus, control, and state language or is a verified redirect.
- Every list workspace has an instinctive primary action, URL-safe filters, obvious selection, and responsive inspector/drawer behavior.
- Every consequential mutation shows scope/effect before submit and clear outcome afterward; ordinary controls are not burdened with explanatory prose.
- Admin, staff, maintenance, unaffiliated, and anonymous access behavior is unchanged and verified.
- All declared route states have automated test or browser evidence.
- The full engineering, database, browser, accessibility, copy, coverage, and diff checks pass.
- Current documentation describes what is actually implemented.
