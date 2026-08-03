# Finance UX First Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two existing Finance staff workspaces with the approved laptop-first, table-first interaction model while preserving every current financial write boundary.

**Architecture:** This slice is presentation-only. It reuses the existing Rent & Income and Bills & Expenses loaders, actions, RPCs, URLs, and authoritative records, but replaces split inspectors and side drawers with a full-width table plus one centered modal at a time. Unsupported owner balances, direct-owner collection, tenant invoices, management-fee calculation, and new financial writes remain absent until their dedicated authority and migration slices.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, existing Nestory UI primitives, Vitest, authenticated browser QA.

## Global Constraints

- Desktop/laptop is the primary target: validate at `1440x900` and keep the workspace usable at `1280px` width.
- Keep the existing global Nestory sidebar and command bar.
- Finance uses a compact operational table, one compact totals line, and a centered modal or dedicated page; no split inspector, side drawer, or stat-card grid.
- Reuse current server actions and RPCs. This slice creates no database migration because it adds no financial authority or persisted field.
- Keep exact-money display, organization scope, URL-backed filters, focus return, keyboard activation, and direct record links.
- Run the two focused component suites during implementation and one consolidated lint, typecheck, and build gate before integration.

---

### Task 1: Lock the approved laptop-first boundary

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-ips-finance-workflow-simplification-design.md`
- Modify: `docs/implementation/owner-close/97-ratified-final-sequence.md`
- Modify: `docs/implementation/owner-close/README.md`
- Modify: `docs/current-state.md`
- Create: `docs/superpowers/plans/2026-08-03-finance-ux-first-slice.md`

**Interfaces:**
- Consumes: the approved Finance domain and wireframes.
- Produces: an explicit implementation boundary stating that this slice changes presentation only and does not authorize new owner, invoice, fee, or collection-route writes.

- [x] **Step 1: Update the UX target for the existing application shell**

Record that the global sidebar remains unchanged, Finance local navigation stays horizontal, and the primary verification target is laptop width.

- [x] **Step 2: Record unsupported runtime behavior plainly**

Keep direct-owner collection, owner balances, customer invoices, and management-fee calculation out of this slice instead of simulating them with generic finance records.

- [x] **Step 3: Run documentation checks**

Run: `git diff --check`

Expected: exit `0` with no whitespace errors.

- [ ] **Step 4: Commit the authority and plan checkpoint**

```bash
git add docs/implementation/owner-close/96-tenant-billing-reconciliation.md docs/implementation/owner-close/97-ratified-final-sequence.md docs/superpowers/specs/2026-07-30-ips-finance-workflow-simplification-design.md docs/superpowers/plans/2026-08-03-finance-ux-first-slice.md
git commit -m "docs(finance): approve laptop-first implementation slice"
```

### Task 2: Simplify the Rent workspace

**Files:**
- Modify: `src/features/finance/components/finance-workspace-navigation.tsx`
- Modify: `src/features/rent-income/components/rent-income-screen.tsx`
- Modify: `src/features/rent-income/components/rent-income-screen.test.tsx`

**Interfaces:**
- Consumes: `RentIncomeItem`, `RentIncomeSummary`, existing create/payment/reversal/void actions, and `Modal`.
- Produces: a full-width Rent table and one `ModalState` union for detail, create, record-payment, reversal, and void states.

- [ ] **Step 1: Change the focused tests to the new interaction contract**

Assert that the page is titled `Rent`, the navigation uses short labels, the totals are one compact line, selecting a row opens one centered dialog, opening a cash action replaces the detail dialog, and closing returns focus to the row action.

- [ ] **Step 2: Run the Rent screen test and confirm the old UI fails**

Run: `npm run test -- src/features/rent-income/components/rent-income-screen.test.tsx`

Expected: failures for the old title, summary cards, and drawer labels.

- [ ] **Step 3: Replace split and drawer state with modal state**

Use one union:

```ts
type ModalState =
  | { item: RentIncomeItem; mode: "detail" }
  | { mode: "create" }
  | { item: RentIncomeItem; mode: "payment" }
  | { item: RentIncomeItem; mode: "reverse"; receipt: RentIncomeReceipt }
  | { item: RentIncomeItem; mode: "void" };
```

Render the list directly in the remaining workspace height. Row click, Enter, Space, and the preview button open `detail`. Actions close that detail and open the next modal so only one dialog exists.

- [ ] **Step 4: Replace the card strip with a compact totals line**

Keep Expected, Received, Outstanding, Open, and Overdue visible as inline labeled values. Do not infer held cash or owner balances.

- [ ] **Step 5: Shorten visible operator language**

Use `Rent`, `Add charge`, `Paid`, `Balance`, `Open`, and `Overdue`. Keep accounting evidence inside the record dialog only where it affects a decision.

- [ ] **Step 6: Run the focused Rent suite**

Run: `npm run test -- src/features/rent-income/components/rent-income-screen.test.tsx`

Expected: all tests pass.

- [ ] **Step 7: Commit the Rent slice**

```bash
git add src/features/finance/components/finance-workspace-navigation.tsx src/features/rent-income/components/rent-income-screen.tsx src/features/rent-income/components/rent-income-screen.test.tsx
git commit -m "feat(finance): simplify rent workspace flow"
```

### Task 3: Simplify the Expenses workspace

**Files:**
- Modify: `src/features/bills-expenses/components/bills-expenses-screen.tsx`
- Modify: `src/features/bills-expenses/components/bills-expenses-screen.test.tsx`

**Interfaces:**
- Consumes: `BillsExpenseItem`, `BillsExpensesSummary`, existing create/approve/payment/void actions, and `Modal`.
- Produces: a full-width Expenses table and one `ModalState` union for detail, create, approve, payment, and void states.

- [ ] **Step 1: Change focused tests to the new interaction contract**

Assert that the page is titled `Expenses`, one compact totals line replaces cards, the table remains full width, and detail/action forms use a single centered dialog with focus return.

- [ ] **Step 2: Run the Expenses screen test and confirm the old UI fails**

Run: `npm run test -- src/features/bills-expenses/components/bills-expenses-screen.test.tsx`

Expected: failures for old drawer and summary-grid behavior.

- [ ] **Step 3: Replace split and drawer state with modal state**

Use one union:

```ts
type ModalState =
  | { item: BillsExpenseItem; mode: "detail" }
  | { mode: "create" }
  | { item: BillsExpenseItem; mode: "approve" | "payment" | "void" };
```

Keep the current action payloads and RPCs unchanged.

- [ ] **Step 4: Replace the card strip with a compact totals line**

Show Draft, Approved, Overdue, Unposted, and Posted without presenting unsupported owner-account math.

- [ ] **Step 5: Simplify labels without weakening meaning**

Use `Expenses`, `Add expense`, `Paid`, `Remaining`, `Responsible`, and `Recovery` where current data supports them. Keep legacy company-advance and owner-billing fields in the detail/action modal, not the main table.

- [ ] **Step 6: Run the focused Expenses suite**

Run: `npm run test -- src/features/bills-expenses/components/bills-expenses-screen.test.tsx`

Expected: all tests pass.

- [ ] **Step 7: Commit the Expenses slice**

```bash
git add src/features/bills-expenses/components/bills-expenses-screen.tsx src/features/bills-expenses/components/bills-expenses-screen.test.tsx
git commit -m "feat(finance): simplify expenses workspace flow"
```

### Task 4: Verify, compare, and integrate

**Files:**
- Create: `design-qa.md`
- Modify: `docs/current-state.md`
- Modify: `config/ui-route-coverage.json` only if route evidence changes.

**Interfaces:**
- Consumes: the accepted wireframe export and the rendered authenticated Rent and Expenses routes.
- Produces: focused test evidence, one browser QA record, a design comparison report, and an integration-ready branch.

- [ ] **Step 1: Run the consolidated focused test gate once**

Run:

```bash
npm run test -- src/features/rent-income/components/rent-income-screen.test.tsx src/features/bills-expenses/components/bills-expenses-screen.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run the static and production gate once**

Run:

```bash
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 3: Capture authenticated laptop evidence**

Open `/rent-income` and `/bills-expenses` at `1440x900`, test row detail, one primary action, close/focus return, filters, and the absence of horizontal document overflow. Check the browser console for application errors.

- [ ] **Step 4: Compare the rendered screens with the accepted wireframe**

Place the source wireframe and each rendered route capture in the same visual comparison input. Record typography, spacing, colors, icon/assets, copy, interaction, and any deliberate deviations in `design-qa.md`. The final result must be `passed` before integration.

- [ ] **Step 5: Commit the verification checkpoint**

```bash
git add design-qa.md docs/current-state.md
git commit -m "docs(finance): record first-slice verification"
```

- [ ] **Step 6: Review exact branch scope and integrate**

Confirm the feature branch is clean, `origin/main` has not moved unexpectedly, and only the planned files changed. Merge the branch into `main`, rerun the focused test gate on the merged result, push `main`, and prove `main...origin/main` is `0 0`.
