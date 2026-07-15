# Trustworthy Owner Statement Calculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ledger-based Owner Statement with a property-cash-kernel statement that validates and allocates effective ownership exactly.

**Architecture:** A pure report-owned module calls `buildPropertyCash`, validates dated ownership rosters, allocates cents, and returns domain rows/evidence/blockers. The Reports loader adapts organization-scoped Supabase records into an internal readiness `TrustedReport`. CSV preserves that report and its exact evidence; a pure recipient selector narrows one ready property/owner row for owner-facing preview, print, and PDF.

**Tech Stack:** Next.js 16.2.9 App Router, TypeScript 5, Supabase/PostgREST, Vitest 4, React 19, generic Nestory CSV/PDF renderers.

## Global Constraints

- Work on `codex/owner-statement-calculation`, never directly on `main`, and never force-push.
- Follow red-green-refactor for every production behavior.
- Use the existing schema and `buildPropertyCash`; do not add a migration or generated database type change.
- Use half-open owner intervals and every relevant non-archived owner link; `is_primary` never overrides allocation.
- Use exact percentage thousandths, integer cents, `BigInt` largest-remainder allocation, and deterministic person/link tie-breaking.
- If any required fact date has an invalid roster, block the entire property/month statement.
- Keep missing contact as a warning; keep blocked property money out of summaries.
- Keep deposits and period-scoped management-fee outstanding disclosure-only.
- Reject Owner Statement unit scope consistently; CSV/PDF return HTTP 400.
- Count ready properties separately from ready owner-recipient statements.
- Keep all-properties Owner Statement as an internal readiness workspace; never offer portfolio PDF or print.
- Require one ready property/owner/month for owner-facing preview, print, and PDF. Return controlled 400 for missing/invalid recipient scope and 409 for blocked properties.
- Do not add ownership editing, finance writes, schema, branding, organization profile, email, snapshots, or Overview changes.

---

## File Map

- Create `src/features/reports/data/owner-statement.ts`: pure kernel invocation, owner readiness, exact allocation, rows, totals, blockers, warnings, and evidence.
- Create `src/features/reports/data/owner-statement.test.ts`: financial, ownership, transfer, deposit, allocation, and determinism matrix.
- Modify `src/features/reports/data/trusted-report.ts`: report-specific organization-scoped loader and `TrustedReport` adapter; remove ledger-based Owner Statement calculation.
- Modify `src/features/reports/data/trusted-report.test.ts`: adapter, blocked-row, summary, source-link, and organization-scope contracts.
- Modify `src/features/reports/reports.types.ts`: optional structured evidence metadata and controlled validation state.
- Modify `src/features/reports/components/reports-filters.tsx` and `reports-screen.tsx`: remove stale Owner Statement unit scope and show actionable validation copy.
- Modify `src/features/reports/data/csv.ts` and `csv.test.ts`: exact evidence serialization and shared totals/blocker behavior.
- Modify `src/features/reports/data/pdf.ts` and `pdf.test.ts`: one-recipient owner-facing PDF with bounded identity and no internal readiness/evidence detail.
- Modify `src/app/api/reports/export/route.ts` and `pdf/route.ts`: controlled 400 for unsupported unit/missing recipient scope and controlled 409 for blocked property PDFs.
- Add focused route tests if no existing route-test harness can cover the 400 contract through lower-level validation tests.

---

### Task 1: Pure Owner Statement Domain Contract

**Files:**
- Create: `src/features/reports/data/owner-statement.ts`
- Create: `src/features/reports/data/owner-statement.test.ts`

**Interfaces:**
- Consumes: `PropertyCashInput`, property rows, owner links, people/contact readiness.
- Produces: `buildOwnerStatement(input): OwnerStatementResult` with ready owner rows, blocked property rows, summary cents/counts, warnings, and exact evidence.

- [ ] Write failing tests for full/partial/reversed receipts and payments, cross-month settlement, earned/received/outstanding fees, contributions, payouts, deposits, and prior-period evidence.
- [ ] Run `npx vitest run src/features/reports/data/owner-statement.test.ts` and verify RED because the module is absent.
- [ ] Implement the smallest kernel-backed fact classification and integer-cent accumulators needed for those tests.
- [ ] Run the focused test and verify GREEN.
- [ ] Add failing tests for null/100 single ownership, exact multi-owner totals, missing/low/high/zero percentages, archive/history/transfer/half-open rules, duplicates, no owner, and contact warnings.
- [ ] Implement exact thousandths parsing and complete-property blocking; rerun GREEN.
- [ ] Add failing tests for deterministic 60/40, one-cent remainder, signed reversal, exact sums, input-order independence, transfer attribution, and period-end deposit allocation.
- [ ] Implement `BigInt` largest remainder and deterministic sorting; rerun GREEN.

### Task 2: Organization-Scoped Loader and TrustedReport Adapter

**Files:**
- Modify: `src/features/reports/data/trusted-report.ts`
- Modify: `src/features/reports/data/trusted-report.test.ts`
- Modify: `src/features/reports/reports.types.ts`

**Interfaces:**
- Consumes: organization ID, property/month filter, finance obligations/allocations/payments/deposit events, owners, people, and contacts.
- Produces: generic Owner Statement `TrustedReport` rows and statement-specific summary metrics.

- [ ] Write failing adapter tests proving one owner/property row, explicit blocked row, no blocked monetary cells, statement-specific summary, and exact evidence metadata.
- [ ] Run the trusted-report test and verify RED against the current ledger implementation.
- [ ] Add report-owned evidence types and replace Owner Statement's ledger source requirement with its cash/ownership loader path.
- [ ] Load every query with `organization_id`, include in-month cash events, due-month obligations plus pre-period settling receipts, all deposit events before period end, and all relevant non-archived owner links.
- [ ] Adapt rows with property/person and supported module-review links only; use `Net owner cash movement` and `Management fees outstanding from this period`.
- [ ] Run trusted-report, property-cash, and owner-statement tests and verify GREEN.

### Task 3: Property-Level Scope Validation

**Files:**
- Modify: `src/features/reports/components/reports-filters.tsx`
- Modify: `src/features/reports/components/reports-screen.tsx`
- Modify: `src/features/reports/report-catalog.ts`
- Modify: `src/features/reports/data/reports.ts`
- Modify: `src/app/api/reports/export/route.ts`
- Modify: `src/app/api/reports/pdf/route.ts`
- Test the smallest existing seams covering link creation, preview validation, and endpoint validation.

**Interfaces:**
- Consumes: `ReportsViewQuery` with `report === "owner-statement"` and `unitId !== "all"`.
- Produces: actionable preview state and controlled export HTTP 400 response.

- [ ] Write failing tests that Owner Statement catalog/filter/export links omit stale `unitId`, preview returns the approved validation copy, and export validation reports status 400.
- [ ] Run focused tests and verify RED.
- [ ] Implement one shared `getReportScopeValidation(viewQuery)` contract used by preview and both export endpoints.
- [ ] Ensure the filter form does not preserve Owner Statement `unitId`; do not broaden direct incoming requests.
- [ ] Run focused tests and verify GREEN.

### Task 4: Internal CSV and Recipient Document Workflow

**Files:**
- Modify: `src/features/reports/data/csv.ts`
- Modify: `src/features/reports/data/csv.test.ts`
- Modify: `src/features/reports/data/pdf.ts`
- Modify: `src/features/reports/data/pdf.test.ts`

**Interfaces:**
- Consumes: calculated Owner Statement `TrustedReport` rows with blockers and structured evidence.
- Produces: internal CSV with exact evidence plus one-recipient preview, print, and PDF documents.

- [ ] Write failing CSV tests for exact evidence type/ID/date/classification/signed/allocated cents and blocked reasons.
- [ ] Write failing PDF and route tests for property/recipient validation, owner isolation, all nine values, blocked 409, and bounded identity.
- [ ] Run CSV/PDF tests and verify RED.
- [ ] Add optional evidence columns only when structured evidence exists; keep spreadsheet formula protection.
- [ ] Keep CSV on the readiness report. Sanitize one ready recipient for PDF/print, omit internal readiness/evidence detail, and do not add branding.
- [ ] Run CSV/PDF/trusted-report tests and verify GREEN.

### Task 5: Verification, Browser QA, and PR

**Files:**
- Review all changed files; no database or generated type files may differ.

**Interfaces:**
- Consumes: completed implementation.
- Produces: verified commit `feat: calculate trustworthy owner statements` and focused PR.

- [ ] Run owner-statement, property-cash, trusted-report, CSV, and PDF tests.
- [ ] Run targeted ESLint, `npx tsc --noEmit`, `npm run test`, `npm run build`, and `git diff --check`.
- [ ] Confirm no migration/generated DB type, ownership write, branding, Overview, or unsupported finance-focus parameter changed.
- [ ] Use a local seeded Admin workspace to smoke all/one property, multiple months, ready/blocked fixtures, CSV, PDF, print, supported review links, and browser console.
- [ ] Commit exactly the approved scope with `feat: calculate trustworthy owner statements`.
- [ ] Push `codex/owner-statement-calculation`, open the focused PR, record checks/QA, and stop without starting later Owner Statement work.
