# Report and Import Simplification Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Reduce Nestory to the three reports required by the Drive brief, turn Import into one compact progressive flow, preserve trusted source and staged-write behavior, and deliver authenticated screenshots to the Nestory Drive folder.

**Architecture:** Keep the existing `TrustedReport` data boundary and import staging/RPC boundary. Narrow report routing and presentation at the type/catalog layer, add a focused management-fee loader over authoritative receipt allocations, add a real XLSX exporter, and expose one compact report workspace. Keep import mapping, validation, staging, partial success, cleanup facts, and history, but progressively disclose them behind one primary import action.

**Tech Stack:** Next.js 16.2.9 App Router, React 19, TypeScript, Supabase, Vitest/Testing Library, standards-based OOXML packaged with fflate 0.8, Playwright.

---

### Task 1: Narrow the public report contract and preserve legacy destinations

**Files:**

- Modify: `src/features/reports/reports.types.ts`
- Modify: `src/features/reports/report-catalog.ts`
- Modify: `src/features/reports/reports.filters.ts`
- Modify: `src/app/(dashboard)/reports/page.tsx`
- Modify: `src/app/(dashboard)/reports/[reportKind]/page.tsx`
- Create: `src/features/reports/legacy-report-destinations.ts`
- Create: `src/features/reports/legacy-report-destinations.test.ts`
- Modify: `src/features/reports/report-catalog.test.ts`
- Modify: `src/features/reports/reports.filters.test.ts`

**Step 1: Write failing contract tests**

Assert that:

- `ReportKind`/`reportKindValues` expose only `unit-profit-loss`, `owner-statement`, and `management-fees`.
- `/reports` resolves to `unit-profit-loss`.
- the old `unit-performance` query normalizes to `unit-profit-loss`.
- each retired report kind resolves to its approved operational fallback:

```ts
expect(getLegacyReportDestination("rent-roll")).toBe("/units");
expect(getLegacyReportDestination("property-performance"))
  .toBe("/overview?lens=finance");
expect(getLegacyReportDestination("income-expense")).toBe("/ledger");
expect(getLegacyReportDestination("lease-expiry"))
  .toBe("/leases?status=current&endsWithin=60d&sort=end_asc");
expect(getLegacyReportDestination("vacancy-risk"))
  .toBe("/units?occupancy=unoccupied");
expect(getLegacyReportDestination("maintenance-cost")).toBe("/maintenance");
expect(getLegacyReportDestination("missing-data"))
  .toBe("/overview?lens=records");
expect(getLegacyReportDestination("people-readiness")).toBe("/people");
```

Run:

```powershell
npx vitest run src/features/reports/report-catalog.test.ts src/features/reports/reports.filters.test.ts src/features/reports/legacy-report-destinations.test.ts
```

Expected: FAIL because the old ten-report contract remains.

**Step 2: Implement the narrow contract**

- Replace the report union and catalog with the three approved kinds and plain titles.
- Make `DEFAULT_REPORT_KIND` equal `unit-profit-loss`.
- Preserve `unit-performance` as a compatibility alias.
- Have the dynamic route redirect known retired kinds to their operational destination before calling `notFound()`.
- Have `/reports` redirect directly to the canonical selected report instead of rendering a library.
- Keep property, month, unit, and owner filters only where valid.

**Step 3: Run the focused tests**

Run the command from Step 1.

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/features/reports src/app/(dashboard)/reports
git commit -m "refactor: narrow reports to required statements"
```

### Task 2: Build the authoritative Unit P&L and Management Fee reports

**Files:**

- Modify: `src/features/reports/data/trusted-report.ts`
- Create: `src/features/reports/data/management-fee-report.ts`
- Create: `src/features/reports/data/management-fee-report.test.ts`
- Modify: `src/features/reports/data/trusted-report.test.ts`
- Modify: `src/features/reports/data/owner-statement-report.ts`
- Modify: `src/features/reports/data/owner-statement-report.test.ts`
- Modify: `src/features/reports/reports.types.ts`

**Step 1: Write failing report tests**

Cover these facts:

- Unit P&L is titled `Monthly Unit Profit & Loss` and contains only property, unit, income, expense, and net income columns.
- Management Fee Statement groups current-month `management_fee_received` cash by property and excludes earned/outstanding fee amounts.
- receipt reversals subtract from collected fees.
- Owner Statement remains a readiness view and sets an explicit export block when authoritative opening/closing owner balances are unavailable.
- Owner Statement no longer presents deposits, fee diagnostics, or owner cash movement as a substitute for opening/net income/payments/closing balance.

Use a pure builder for management-fee rows:

```ts
buildManagementFeeReport({
  generatedAt,
  monthScope,
  properties,
  receiptAllocations,
  viewQuery,
})
```

Run:

```powershell
npx vitest run src/features/reports/data/trusted-report.test.ts src/features/reports/data/management-fee-report.test.ts src/features/reports/data/owner-statement-report.test.ts
```

Expected: FAIL because the new kind, loader, and export block do not exist.

**Step 2: Implement the data paths**

- Rename the current unit-performance output to the canonical Unit P&L kind and remove maintenance/document columns from the report surface while retaining source links internally.
- Load management-fee receipt allocations from `finance_receipt_allocations` joined to `finance_receipts` and `finance_income_items`, scoped by organization, property, and receipt date.
- Use the canonical fee types and reversal semantics already established by `buildPropertyCash`; report only received/collected cash.
- Add an optional `exportValidation` field to `TrustedReport`.
- Reduce Owner Statement readiness columns to status, owner, property, and blocking reason, and set a `409` export validation explaining that opening and closing balances are not yet authoritative.

**Step 3: Run focused tests**

Run the command from Step 1.

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/features/reports
git commit -m "feat: add trusted management fee statement"
```

### Task 3: Add real Excel export and enforce report export readiness

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/reports/data/excel.ts`
- Create: `src/features/reports/data/excel.test.ts`
- Create: `src/app/api/reports/excel/route.ts`
- Create: `src/app/api/reports/excel/route.test.ts`
- Modify: `src/app/api/reports/pdf/route.ts`
- Modify: `src/app/api/reports/pdf/route.test.ts`
- Modify: `src/app/api/reports/export/route.ts`
- Modify: `src/app/api/reports/export/route.test.ts`
- Modify: `src/features/reports/data/report-format.ts`
- Modify: `src/features/reports/data/report-format.test.ts`

**Step 1: Install and lock the minimal ZIP dependency**

Run:

```powershell
npm install fflate@0.8.2
```

Expected: `fflate` is added to dependencies and the lockfile is updated without increasing the inherited audit count. ExcelJS was evaluated and rejected because its production dependency chain added high-severity audit findings.

**Step 2: Write failing exporter and route tests**

Assert that:

- the workbook contains a `Report` sheet with title/scope/period, report columns, rows, and totals;
- cells beginning with `=`, `+`, `-`, or `@` are written as text, never formulas;
- the route uses the existing user/admin membership checks;
- the response content type is the XLSX MIME type;
- PDF, CSV compatibility, and Excel endpoints return the report’s `exportValidation.status` and message when publication is blocked;
- filenames use `.xlsx`.

Run:

```powershell
npx vitest run src/features/reports/data/excel.test.ts src/app/api/reports/excel/route.test.ts src/app/api/reports/pdf/route.test.ts src/app/api/reports/export/route.test.ts src/features/reports/data/report-format.test.ts
```

Expected: FAIL because XLSX support and readiness handling are missing.

**Step 3: Implement workbook and routes**

- Build the workbook from `TrustedReport`, keeping styling restrained and machine-readable.
- Set `runtime = "nodejs"` and `dynamic = "force-dynamic"` on the XLSX route.
- Return:

```ts
"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
```

- Keep the existing CSV endpoint as a compatibility surface, but remove it from the UI.

**Step 4: Run focused tests and audit**

```powershell
npx vitest run src/features/reports/data/excel.test.ts src/app/api/reports/excel/route.test.ts src/app/api/reports/pdf/route.test.ts src/app/api/reports/export/route.test.ts src/features/reports/data/report-format.test.ts
npm audit --omit=dev
```

Expected: tests PASS; audit result recorded honestly.

**Step 5: Commit**

```powershell
git add package.json package-lock.json src/features/reports src/app/api/reports
git commit -m "feat: export trusted reports as Excel"
```

### Task 4: Replace the report library/builder with one minimal workspace

**Files:**

- Modify: `src/features/reports/components/reports-screen.tsx`
- Modify: `src/features/reports/components/reports-screen.test.tsx`
- Modify: `src/features/reports/components/reports-filters.tsx`
- Modify: `src/features/reports/components/reports-filters.test.tsx`
- Delete: `src/features/reports/components/print-button.tsx` if no remaining import uses it

**Step 1: Write failing interaction tests**

The rendered workspace must have:

- one navigation with exactly three report tabs;
- one horizontal filter row with only property and month, plus unit only for Unit P&L;
- one `Export` disclosure containing `PDF` and `Excel`;
- no library, category, packet, builder, preview-ready, source-count, or report-family copy;
- a compact totals row and one table/readiness list;
- an Owner Statement publication warning with disabled/absent export links.

Run:

```powershell
npx vitest run src/features/reports/components/reports-screen.test.tsx src/features/reports/components/reports-filters.test.tsx
```

Expected: FAIL against the current library/builder UI.

**Step 2: Implement the minimal workspace**

- Keep both exported component names temporarily if route tests depend on them, but render the same compact workspace.
- Use `<nav aria-label="Reports">` for the three tabs.
- Use a native `<details>` menu for the two export choices to avoid a new interaction dependency.
- Keep row links for operational drill-down, but remove repeated evidence/source metadata from the default view.
- Render empty and validation states inline in the table area.

**Step 3: Run focused tests**

Run the command from Step 1.

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/features/reports
git commit -m "refactor: simplify reports workspace"
```

### Task 5: Retarget all internal links and update route contracts

**Files:**

- Modify: `src/app/(dashboard)/people-reports/page.tsx`
- Modify: `src/features/people/people.insights.ts`
- Modify: `src/features/people/components/people-command-center.tsx`
- Modify: `src/features/maintenance/maintenance.hrefs.ts`
- Modify: `src/features/units/components/unit-screen.tsx`
- Modify: `src/features/properties/components/property-detail-view.tsx`
- Modify: `src/features/units/components/unit-detail-view.tsx`
- Modify matching `*.test.ts` / `*.test.tsx` files
- Modify: `config/ui-route-coverage.json`
- Modify: `scripts/smoke-ui-redesign.mjs`

**Step 1: Write/update failing link tests**

Assert that no in-product link targets a retired report route and that operational links use the approved fallback or the canonical Unit P&L route.

Run:

```powershell
rg -n "/reports/(rent-roll|unit-performance|property-performance|income-expense|lease-expiry|vacancy-risk|maintenance-cost|missing-data|people-readiness)" src config scripts
npm run test:ui-coverage
```

Expected before implementation: retired route references are reported.

**Step 2: Replace links and coverage entries**

- Unit financial drill-down uses `/reports/unit-profit-loss`.
- Readiness, leasing, maintenance, rent-roll, and people links return to their operational modules.
- Legacy `/people-reports` redirects to `/people`.
- Update coverage/smoke expectations without weakening route authentication checks.

**Step 3: Verify**

Run:

```powershell
rg -n "/reports/(rent-roll|unit-performance|property-performance|income-expense|lease-expiry|vacancy-risk|maintenance-cost|missing-data|people-readiness)" src config scripts
npm run test:ui-coverage
```

Expected: `rg` has no unintended product links; coverage PASS.

**Step 4: Commit**

```powershell
git add src config scripts
git commit -m "refactor: route retired reports to operations"
```

### Task 6: Add one safe import action over staging and commit

**Files:**

- Modify: `src/features/imports/actions.ts`
- Modify: `src/features/imports/actions.test.ts`

**Step 1: Write failing server-action tests**

Add `importReadyRowsAction` tests proving:

- invalid payloads stop before a run is created;
- the action stages validated rows first;
- it commits only ready rows through the existing per-domain RPC paths;
- blocked rows remain recorded in `import_rows`;
- partial failure summaries are returned without claiming full success;
- a zero-ready-row run stays staged and returns an actionable error.

Run:

```powershell
npx vitest run src/features/imports/actions.test.ts
```

Expected: FAIL because the combined action does not exist.

**Step 2: Implement the composition**

Extract internal stage/commit helpers from the existing exported actions. Keep `stageImportRunAction` and `commitStagedImportRunAction` for compatibility, and add:

```ts
export async function importReadyRowsAction(
  state: ImportReadyRowsState,
  formData: FormData,
): Promise<ImportReadyRowsState>
```

Return both validation and commit summaries in one state while preserving organization scoping and revalidation.

**Step 3: Run focused tests**

Run the command from Step 1.

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/features/imports/actions.ts src/features/imports/actions.test.ts
git commit -m "feat: import ready rows in one safe action"
```

### Task 7: Collapse Import into one progressive vertical flow

**Files:**

- Modify: `src/features/imports/components/import-preview-screen.tsx`
- Modify: `src/features/imports/components/import-preview-screen.test.tsx`

**Step 1: Write failing interaction tests**

Cover:

- one compact import-type select with all four domains;
- template link and dropzone in the first section;
- automatic/saved mappings with the mapping details closed when complete and open when required fields are missing;
- one status line in the form `X ready, Y need attention`;
- one preview table with inline row issues;
- exactly one primary action labelled `Import X ready rows`;
- no type-card grid, guide, step bar, four-stat grid, separate consequence panel, cleanup queue, or separate “Save preview” control;
- `Past imports` is a collapsed disclosure by default.

Run:

```powershell
npx vitest run src/features/imports/components/import-preview-screen.test.tsx
```

Expected: FAIL against the current expanded workflow.

**Step 2: Implement the progressive UI**

- Switch to `importReadyRowsAction`.
- Keep error-row CSV/fix-template links inside a `Rows needing attention` disclosure.
- Keep full column mapping inside a `Column mapping` disclosure; auto-open it only for missing required mappings.
- Preserve the existing preview-row component and inline issue text.
- Keep run history content unchanged but place it inside `<details>`.

**Step 3: Run focused tests**

Run the command from Step 1.

Expected: PASS.

**Step 4: Commit**

```powershell
git add src/features/imports
git commit -m "refactor: simplify import workflow"
```

### Task 8: Update product documentation and run the release-quality verification set

**Files:**

- Modify: `docs/current-state.md`
- Modify: `docs/engineering-rules.md`
- Modify: `docs/verification.md` only if commands or screenshot evidence requirements changed

**Step 1: Update implemented-state documentation**

Document:

- the exact three-report boundary;
- the operational destinations for retired reports;
- Owner Statement export blocking until authoritative balances exist;
- PDF and XLSX export;
- the compact import surface and unchanged staged/RPC safety boundary.

**Step 2: Run static and focused checks**

```powershell
npm run lint
npx tsc --noEmit
npm run test:ui-copy
npm run test:ui-coverage
npm test
npm run build
```

Expected: all commands PASS. Fix regressions at their source; do not relax assertions merely to obtain green output.

**Step 3: Confirm the diff is scoped**

```powershell
git status --short
git diff --check
git diff --stat origin/main...HEAD
```

Expected: only report/import implementation, tests, dependencies, and current-state documentation are changed.

**Step 4: Commit**

```powershell
git add docs src config scripts package.json package-lock.json
git commit -m "docs: record minimal reports and import workflow"
```

### Task 9: Verify authenticated UI, capture screenshots, and upload evidence

**Files:**

- Create locally: `artifacts/report-import-simplification/reports-desktop.png`
- Create locally: `artifacts/report-import-simplification/import-desktop.png`
- Create locally if useful: mobile screenshots for verification only

**Step 1: Start the verified local stack**

Use the checkout-local environment without printing secrets, start the existing Supabase stack if needed, then run the built app on an unused localhost port.

**Step 2: Exercise authenticated flows**

Verify:

- `/reports/unit-profit-loss`
- `/reports/owner-statement`
- `/reports/management-fees`
- `/import`
- one retired report route and one legacy query redirect
- desktop and mobile widths, keyboard-visible disclosures, and absence of horizontal page overflow.

**Step 3: Capture and inspect evidence**

Capture the Reports workspace and Import flow at desktop width. Open each image locally and confirm that it shows authenticated app content, readable data, and no loading/error overlay.

**Step 4: Upload to Drive**

Upload both PNG files to the existing Nestory folder:

```text
1_-eBEZk7PTN-5ivkqBvZtT6pIndcRsGw
```

Use clear names containing `2026-07-30`, then read back file metadata and web links to verify the upload.

**Step 5: Final handoff**

Report:

- exact branch and HEAD SHA;
- verification commands and outcomes;
- any honest environment limitation;
- Drive links for both screenshots;
- the explicit Owner Statement balance/export limitation.
