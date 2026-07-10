# Overview Property Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the company-accounting-oriented Overview with a neutral, table-first property performance workspace backed by cash settlement events and consistent Portfolio, Property finance, Leasing, Maintenance, and Records lenses.

**Architecture:** Preserve the authenticated App Router page and stable lens URL values, but move query normalization into an Overview filter module, move cash calculations into a pure property-performance module, and split the oversized screen into focused header, scorecard, lens, and property-detail components. Add organization-scoped receipt, payment, allocation, and deposit-event tables through an additive Supabase migration; current aggregate finance columns remain compatibility values while Overview reads settlement events.

**Tech Stack:** Next.js 16.2.9 App Router, React 19.2.7, TypeScript 5, Tailwind CSS 4 semantic tokens, Supabase/Postgres with RLS and RPC write boundaries, Vitest/Testing Library, pgTAP, Playwright.

## Global Constraints

- Read `PROJECT_RULES.md`, `docs/engineering-rules.md`, `docs/verification.md`, and `node_modules/next/dist/docs/app/api-reference/file-conventions/page.md` before implementation.
- Nestory accounts for managed properties, not the management company's internal business accounts.
- Cash basis is the default reporting mode; obligations and settlement events remain separate.
- Security deposits and owner contributions never count as property operating income.
- Management fees are property expenses plus lightweight earned, received, and outstanding metrics; do not calculate management-company profit.
- Keep stable lens values `all`, `finance`, `leasing`, `maintenance`, and `records`; display `all` as Portfolio and `finance` as Property finance.
- Use existing semantic color, spacing, and typography tokens. Do not copy hard-coded colors from the brainstorming mockup.
- Use shared primitives from `src/components/ui`; keep the desktop surface dense, neutral, and viewport-aware.
- Keep every business record organization-scoped and RLS-protected.
- Do not destructively remove the existing accounting kernel in this implementation.
- Create the migration with `npx supabase migration new overview_property_cash_events`; do not invent it directly.

---

## File Map

### Create

- `src/features/overview/overview.filters.ts` — normalize lens, finance subview, month, property, and review URL state.
- `src/features/overview/overview.filters.test.ts` — URL and legacy-value coverage.
- `src/features/overview/property-performance.ts` — pure cash-basis property calculations.
- `src/features/overview/property-performance.test.ts` — cash, arrears, fees, deposits, and ranking coverage.
- `src/features/overview/components/overview-header.tsx` — brand-neutral controls and lens navigation.
- `src/features/overview/components/property-scorecard.tsx` — desktop table and mobile cards.
- `src/features/overview/components/property-performance-detail.tsx` — selected-property cash explanation.
- `src/features/overview/components/portfolio-workspace.tsx` — Portfolio metric, scorecard, attention, and detail composition.
- `src/features/overview/components/property-finance-workspace.tsx` — Property finance subview composition.
- `src/features/overview/components/overview-lens-workspace.tsx` — consistent Leasing, Maintenance, and Records composition.
- `supabase/tests/overview_property_cash_events_test.sql` — event, RLS, backfill, and RPC proof.
- CLI-created `supabase/migrations/*_overview_property_cash_events.sql` — additive settlement-event schema.

### Modify

- `src/app/(dashboard)/overview/page.tsx`
- `src/features/overview/overview.types.ts`
- `src/features/overview/data/overview.ts`
- `src/features/overview/data/overview.test.ts`
- `src/features/overview/components/overview-screen.tsx`
- `src/features/overview/components/overview-screen.test.tsx`
- `src/features/rent-income/actions.ts`
- `src/features/bills-expenses/actions.ts`
- `src/types/database.ts`
- `src/types/database.generated.ts`
- `docs/current-state.md`
- `docs/engineering-rules.md`

---

### Task 1: Normalize Overview URL State

**Files:**
- Create: `src/features/overview/overview.filters.ts`
- Create: `src/features/overview/overview.filters.test.ts`
- Modify: `src/features/overview/overview.types.ts`
- Modify: `src/app/(dashboard)/overview/page.tsx`

**Interfaces:**
- Produces: `parseOverviewSearchParams(params, currentDate?) => OverviewViewQuery`
- Produces: `getOverviewMonthScope(month) => { from: string; before: string }`
- Produces: `OverviewFinanceView = "collections" | "expenses" | "management-fees" | "owner-statements" | "transactions"`
- Produces: `OverviewReview = "all" | "negative" | "arrears" | "bills" | "statement-blocked"`

- [ ] **Step 1: Write the failing URL tests**

```ts
import { describe, expect, it } from "vitest";
import { getOverviewMonthScope, parseOverviewSearchParams } from "@/features/overview/overview.filters";

describe("parseOverviewSearchParams", () => {
  it("defaults to the current month and Portfolio", () => {
    expect(parseOverviewSearchParams({}, new Date("2026-07-10T00:00:00+07:00"))).toEqual({
      financeView: "collections",
      lens: "all",
      month: "2026-07",
      propertyId: "all",
      review: "all",
    });
  });

  it.each([
    ["company-pnl", "finance", "collections"],
    ["owner-receivables", "finance", "management-fees"],
    ["ledger", "finance", "transactions"],
    ["property-ranking", "all", "collections"],
  ] as const)("maps legacy %s links", (financeView, lens, expectedView) => {
    expect(parseOverviewSearchParams({ financeView, lens: "finance" }, new Date("2026-07-10"))).toMatchObject({
      financeView: expectedView,
      lens,
    });
  });

  it("normalizes invalid values and builds an exclusive month range", () => {
    expect(parseOverviewSearchParams({ month: "2026-13", propertyId: "bad" }, new Date("2026-07-10"))).toMatchObject({ month: "2026-07", propertyId: "all" });
    expect(getOverviewMonthScope("2026-12")).toEqual({ before: "2027-01-01", from: "2026-12-01" });
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm run test -- src/features/overview/overview.filters.test.ts`

Expected: FAIL because `overview.filters.ts` does not exist.

- [ ] **Step 3: Implement exact parsing and type changes**

Use `getFirstSearchParam` and `getUuidOrAllSearchParam` from `src/lib/validation/search-params.ts`, the strict month pattern `/^(\d{4})-(0[1-9]|1[0-2])$/`, and the legacy map proven above.

```ts
export type OverviewViewQuery = {
  financeView: OverviewFinanceView;
  lens: OverviewLens;
  month: string;
  propertyId: string;
  review: OverviewReview;
};

export function parseOverviewSearchParams(
  params: Record<string, SearchParamValue>,
  currentDate = new Date(),
): OverviewViewQuery {
  const legacyView = getFirstSearchParam(params.financeView);
  const financeView = normalizeFinanceView(legacyView);
  return {
    financeView,
    lens: legacyView === "property-ranking" ? "all" : normalizeOverviewLens(params.lens),
    month: parseMonth(params.month, currentDate),
    propertyId: getUuidOrAllSearchParam(params.propertyId),
    review: parseReview(params.review),
  };
}
```

Change the page to parse once:

```tsx
const query = parseOverviewSearchParams(await searchParams);
const data = await getOverviewScreenData(context.organizationId, query);
return <OverviewScreen data={data} query={query} />;
```

- [ ] **Step 4: Verify and commit**

Run: `npm run test -- src/features/overview/overview.filters.test.ts && npx tsc --noEmit`

Expected: PASS.

```powershell
git add -- 'src/features/overview/overview.filters.ts' 'src/features/overview/overview.filters.test.ts' 'src/features/overview/overview.types.ts' 'src/app/(dashboard)/overview/page.tsx'
git commit -m "refactor: define overview property filters"
```

---

### Task 2: Add Event-Based Property Cash Records

**Files:**
- Create: `supabase/tests/overview_property_cash_events_test.sql`
- Create via CLI: `supabase/migrations/*_overview_property_cash_events.sql`
- Modify: `src/types/database.generated.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces tables: `finance_receipts`, `finance_receipt_allocations`, `finance_payments`, `finance_payment_allocations`, `lease_deposit_events`.
- Produces RPCs: `record_finance_receipt`, `record_finance_payment`.
- Preserves `record_finance_income_payment` as a one-item compatibility wrapper.

- [ ] **Step 1: Write the failing pgTAP test**

Create a 24-assertion test proving the five tables, organization foreign keys, RLS, positive amounts, allocation uniqueness, compatibility backfill, deposit separation, and cross-organization rejection.

```sql
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(24);
SELECT has_table('public', 'finance_receipts', 'finance_receipts exists');
SELECT has_table('public', 'finance_receipt_allocations', 'receipt allocations exist');
SELECT has_table('public', 'finance_payments', 'finance_payments exists');
SELECT has_table('public', 'finance_payment_allocations', 'payment allocations exist');
SELECT has_table('public', 'lease_deposit_events', 'deposit events exist');
SELECT policies_are('public', 'finance_receipts', ARRAY['Admins can manage finance receipts']);
SELECT policies_are('public', 'finance_payments', ARRAY['Admins can manage finance payments']);
SELECT policies_are('public', 'lease_deposit_events', ARRAY['Admins can manage lease deposit events']);
SELECT has_column('public', 'finance_receipts', 'reversal_of_id');
SELECT has_column('public', 'finance_payments', 'reversal_of_id');
SELECT has_column('public', 'lease_deposit_events', 'event_type');
SELECT col_type_is('public', 'finance_receipts', 'amount', 'numeric(14,2)');
SELECT col_type_is('public', 'finance_payments', 'amount', 'numeric(14,2)');
SELECT col_not_null('public', 'finance_receipt_allocations', 'organization_id');
SELECT col_not_null('public', 'finance_payment_allocations', 'organization_id');
SELECT has_index('public', 'finance_receipts', 'finance_receipts_org_date_idx');
SELECT has_index('public', 'finance_payments', 'finance_payments_org_date_idx');

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
INSERT INTO public.finance_income_items (
  id, organization_id, property_id, income_type, payer_label, due_date,
  amount_due, amount_received, currency, status, created_by, updated_by
) VALUES (
  'a1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'rent', 'Cash event tenant', '2026-07-01', 500, 0, 'USD', 'open',
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);
INSERT INTO public.finance_expense_items (
  id, organization_id, property_id, expense_type, vendor_label, invoice_date,
  amount, currency, category, status, economic_scope, owner_bill_status,
  owner_reimbursable_amount, owner_reimbursed_amount, company_loss_amount,
  created_by, updated_by
) VALUES (
  'b1000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'maintenance', 'Cash event vendor', '2026-07-01', 200, 'USD', 'Repair',
  'approved', 'property_expense', 'not_billable', 0, 0, 0,
  '00000000-0000-0000-0000-000000000101',
  '00000000-0000-0000-0000-000000000101'
);

SELECT lives_ok(
  $$SELECT public.record_finance_receipt(
    '00000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001', 100, '2026-07-10', 'TEST-RECEIPT'
  )$$,
  'receipt RPC records a settlement'
);
SELECT is((SELECT count(*) FROM public.finance_receipt_allocations WHERE income_item_id = 'a1000000-0000-0000-0000-000000000001'), 1::bigint, 'receipt allocation created');
SELECT is((SELECT amount_received FROM public.finance_income_items WHERE id = 'a1000000-0000-0000-0000-000000000001'), 100::numeric, 'income compatibility amount derived');

SELECT lives_ok(
  $$SELECT public.record_finance_payment(
    '00000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001', 50, '2026-07-10', 'TEST-PAYMENT'
  )$$,
  'payment RPC records a settlement'
);
SELECT is((SELECT count(*) FROM public.finance_payment_allocations WHERE expense_item_id = 'b1000000-0000-0000-0000-000000000001'), 1::bigint, 'payment allocation created');
SELECT throws_ok(
  $$SELECT public.record_finance_receipt(
    '00000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001', 999999, '2026-07-10', 'OVER'
  )$$,
  'P0001', 'Receipt allocation exceeds open balance', 'over-allocation rejected'
);
SELECT is((SELECT count(*) FROM public.lease_deposit_events WHERE organization_id = '00000000-0000-0000-0000-000000000001'), 0::bigint, 'finance receipt does not create deposit event');
SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: Prove the test fails and create the migration through the CLI**

Run:

```powershell
npm run supabase:start
npx supabase test db --local supabase/tests/overview_property_cash_events_test.sql
npx supabase migration new overview_property_cash_events
```

Expected: the test fails before migration; the CLI prints the migration path.

- [ ] **Step 3: Add the exact table shape**

Each event table uses `numeric(14, 2)`, `currency_code`, organization/property foreign keys, audit fields, and an optional `reversal_of_id`. Each allocation has a unique event/obligation pair and a positive amount. The deposit table uses event types `received`, `applied`, `retained`, `refunded`, `reversed`.

```sql
CREATE TABLE public.finance_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  received_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  payer_label text NOT NULL CHECK (length(trim(payer_label)) > 0),
  reference text,
  reversal_of_id uuid UNIQUE REFERENCES public.finance_receipts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.finance_receipt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  receipt_id uuid NOT NULL REFERENCES public.finance_receipts(id) ON DELETE RESTRICT,
  income_item_id uuid NOT NULL REFERENCES public.finance_income_items(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (receipt_id, income_item_id)
);
```

Add these exact remaining tables:

```sql
CREATE TABLE public.finance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  paid_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  payee_label text NOT NULL CHECK (length(trim(payee_label)) > 0),
  reference text,
  reversal_of_id uuid UNIQUE REFERENCES public.finance_payments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE public.finance_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.finance_payments(id) ON DELETE RESTRICT,
  expense_item_id uuid NOT NULL REFERENCES public.finance_expense_items(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (payment_id, expense_item_id)
);

CREATE TABLE public.lease_deposit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  lease_deposit_id uuid NOT NULL REFERENCES public.lease_deposits(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('received', 'applied', 'retained', 'refunded', 'reversed')),
  event_date date NOT NULL,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency public.currency_code NOT NULL DEFAULT 'USD',
  reference text,
  reversal_of_id uuid UNIQUE REFERENCES public.lease_deposit_events(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
```

Add organization/date indexes and five RLS policies using `app_private.is_org_admin(organization_id)` for both `USING` and `WITH CHECK`.

- [ ] **Step 4: Add transactional RPCs and deterministic backfill**

Both RPCs are `SECURITY INVOKER`, lock the target obligation with `FOR UPDATE`, verify organization/property/currency, reject over-allocation, insert event and allocation, and then derive compatibility columns.

```sql
CREATE OR REPLACE FUNCTION public.record_finance_receipt(
  p_organization_id uuid,
  p_income_item_id uuid,
  p_amount numeric,
  p_received_date date,
  p_reference text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  target public.finance_income_items%ROWTYPE;
  receipt_id uuid;
  allocated numeric;
BEGIN
  SELECT * INTO target FROM public.finance_income_items
  WHERE id = p_income_item_id AND organization_id = p_organization_id
    AND archived_at IS NULL AND status <> 'void' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Income item not found'; END IF;
  SELECT coalesce(sum(amount), 0) INTO allocated
  FROM public.finance_receipt_allocations WHERE income_item_id = target.id;
  IF p_amount <= 0 OR allocated + p_amount > target.amount_due THEN
    RAISE EXCEPTION 'Receipt allocation exceeds open balance';
  END IF;
  INSERT INTO public.finance_receipts (
    organization_id, property_id, received_date, amount, currency, payer_label, reference, created_by
  ) VALUES (
    p_organization_id, target.property_id, p_received_date, p_amount,
    target.currency, target.payer_label, p_reference, auth.uid()
  ) RETURNING id INTO receipt_id;
  INSERT INTO public.finance_receipt_allocations (
    organization_id, receipt_id, income_item_id, amount, created_by
  ) VALUES (p_organization_id, receipt_id, target.id, p_amount, auth.uid());
  UPDATE public.finance_income_items
  SET amount_received = allocated + p_amount,
      received_date = p_received_date,
      status = CASE WHEN allocated + p_amount = amount_due THEN 'received' ELSE 'partially_received' END,
      updated_by = auth.uid()
  WHERE id = target.id;
  RETURN receipt_id;
END;
$$;
```

Add the payment RPC:

```sql
CREATE OR REPLACE FUNCTION public.record_finance_payment(
  p_organization_id uuid,
  p_expense_item_id uuid,
  p_amount numeric,
  p_paid_date date,
  p_reference text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  target public.finance_expense_items%ROWTYPE;
  payment_id uuid;
  allocated numeric;
BEGIN
  SELECT * INTO target FROM public.finance_expense_items
  WHERE id = p_expense_item_id AND organization_id = p_organization_id
    AND archived_at IS NULL AND status <> 'void' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense item not found'; END IF;
  SELECT coalesce(sum(amount), 0) INTO allocated
  FROM public.finance_payment_allocations WHERE expense_item_id = target.id;
  IF p_amount <= 0 OR allocated + p_amount > target.amount THEN
    RAISE EXCEPTION 'Payment allocation exceeds open balance';
  END IF;
  INSERT INTO public.finance_payments (
    organization_id, property_id, paid_date, amount, currency, payee_label, reference, created_by
  ) VALUES (
    p_organization_id, target.property_id, p_paid_date, p_amount,
    target.currency, target.vendor_label, p_reference, auth.uid()
  ) RETURNING id INTO payment_id;
  INSERT INTO public.finance_payment_allocations (
    organization_id, payment_id, expense_item_id, amount, created_by
  ) VALUES (p_organization_id, payment_id, target.id, p_amount, auth.uid());
  UPDATE public.finance_expense_items
  SET paid_date = CASE WHEN allocated + p_amount = amount THEN p_paid_date ELSE paid_date END,
      status = CASE WHEN allocated + p_amount = amount THEN 'paid' ELSE status END,
      updated_by = auth.uid()
  WHERE id = target.id;
  RETURN payment_id;
END;
$$;
```

Backfill populated legacy rows using deterministic references formed as `'BACKFILL-INCOME-' || id::text` and `'BACKFILL-EXPENSE-' || id::text`, guarded by `NOT EXISTS` on allocation target IDs.

- [ ] **Step 5: Verify schema, regenerate types, and commit**

Run:

```powershell
npm run db:reset
npm run db:lint
npx supabase test db --local supabase/tests/overview_property_cash_events_test.sql
npm run db:types
npx tsc --noEmit
```

Expected: PASS; generated types contain five tables and two RPCs.

```powershell
git add -- 'supabase/migrations' 'supabase/tests/overview_property_cash_events_test.sql' 'src/types/database.generated.ts' 'src/types/database.ts'
git commit -m "feat: add property cash settlement events"
```

---

### Task 3: Route Finance Mutations Through Settlement Events

**Files:**
- Modify: `src/features/rent-income/actions.ts`
- Modify: `src/features/bills-expenses/actions.ts`
- Test: `supabase/tests/overview_property_cash_events_test.sql`

**Interfaces:**
- Consumes: `record_finance_receipt` and `record_finance_payment` from Task 2.
- Produces: existing server actions writing independent settlement events while preserving revalidation.

- [ ] **Step 1: Add failing compatibility assertions**

Extend pgTAP to assert the legacy `record_finance_income_payment` wrapper creates exactly one receipt/allocation and `record_finance_payment` marks the expense compatibility row paid without creating management-company cost data.

- [ ] **Step 2: Run pgTAP and verify failure**

Run: `npx supabase test db --local supabase/tests/overview_property_cash_events_test.sql`

Expected: FAIL until the wrapper and payment RPC satisfy the assertions.

- [ ] **Step 3: Switch the receipt action and copy**

Keep existing zod validation. Call the event RPC and return property-accounting language:

```ts
const { error } = await supabase.rpc("record_finance_receipt", {
  p_amount: Number(parsed.data.amountReceived),
  p_income_item_id: parsed.data.incomeItemId,
  p_organization_id: context.organizationId,
  p_received_date: parsed.data.receivedDate,
  p_reference: parsed.data.reference || null,
});

return error
  ? { message: financeIncomeErrorMessage(error.message), status: "error" }
  : { message: "Receipt recorded.", status: "success" };
```

- [ ] **Step 4: Switch the expense action and copy**

Preserve bill approval. Replace the normal operator label “Post to ledger” with “Record payment”; call `record_finance_payment` with the outstanding amount and paid date. Keep `/overview`, `/bills-expenses`, `/rent-income`, property, unit, and report revalidation. Do not add company-cost inputs.

- [ ] **Step 5: Verify and commit**

Run: `npm run test -- src/features/rent-income src/features/bills-expenses && npx supabase test db --local supabase/tests/overview_property_cash_events_test.sql && npx tsc --noEmit`

Expected: PASS.

```powershell
git add -- 'src/features/rent-income/actions.ts' 'src/features/bills-expenses/actions.ts' 'supabase/tests/overview_property_cash_events_test.sql'
git commit -m "refactor: record property cash events"
```

---

### Task 4: Build Pure Property Performance Calculations

**Files:**
- Create: `src/features/overview/property-performance.ts`
- Create: `src/features/overview/property-performance.test.ts`
- Modify: `src/features/overview/overview.types.ts`

**Interfaces:**
- Produces: `buildOverviewPropertyPerformance(input, review?): OverviewPropertyPerformance`
- Produces: `OverviewPropertyPerformanceRow`, `OverviewPortfolioSummary`, `OverviewStatementReadiness`.
- Consumed by: Tasks 5–7.

- [ ] **Step 1: Write failing cash-basis tests**

```ts
it("calculates owner cash without deposits or owner contributions", () => {
  const result = buildOverviewPropertyPerformance(fixture({
    incomeItems: [rentDue(1400), depositDue(1400), ownerContribution(500), managementFee(112)],
    receiptAllocations: [rentReceipt(1400), depositReceipt(1400), ownerReceipt(500), feeReceipt(112)],
    expenseItems: [paidExpense("cleaning", 50), paidExpense("building", 327.6), paidExpense("repairs", 83)],
  }));
  expect(result.rows[0]).toMatchObject({
    cashExpensesAmount: 572.6,
    cashIncomeAmount: 1400,
    managementFeeEarnedAmount: 112,
    managementFeeOutstandingAmount: 0,
    netCashAmount: 827.4,
    securityDepositHeldAmount: 1400,
  });
});

it("uses charge allocations for collection rate and arrears", () => {
  const result = buildOverviewPropertyPerformance(fixture({
    incomeItems: [rentDue(1000), rentDue(400)],
    receiptAllocations: [rentReceipt(900)],
  }));
  expect(result.rows[0].collectionRate).toBe(64);
  expect(result.rows[0].arrearsAmount).toBe(500);
  expect(result.rows[0].status).toBe("arrears");
});

it("filters and ranks negative properties", () => {
  const result = buildOverviewPropertyPerformance(twoPropertyFixture(), "negative");
  expect(result.rows.map((row) => row.propertyId)).toEqual(["loss-property"]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test -- src/features/overview/property-performance.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Define exact result types**

```ts
export type OverviewPropertyPerformanceRow = {
  arrears: MoneyDisplayValue;
  arrearsAmount: number;
  cashExpenses: MoneyDisplayValue;
  cashExpensesAmount: number;
  cashIncome: MoneyDisplayValue;
  cashIncomeAmount: number;
  collectionRate: number;
  href: string;
  label: string;
  managementFeeEarned: MoneyDisplayValue;
  managementFeeEarnedAmount: number;
  managementFeeOutstandingAmount: number;
  netCash: MoneyDisplayValue;
  netCashAmount: number;
  propertyId: string;
  securityDepositHeldAmount: number;
  statementBlockers: number;
  status: "healthy" | "attention" | "arrears" | "loss";
  unitCount: number;
};

export type OverviewStatementReadiness = {
  blockedCount: number;
  readyCount: number;
  totalCount: number;
};

export type OverviewPortfolioSummary = {
  arrearsAmount: number;
  cashExpensesAmount: number;
  cashIncomeAmount: number;
  collectionRate: number;
  managementFeeEarnedAmount: number;
  managementFeeOutstandingAmount: number;
  netCashAmount: number;
  statementReadiness: OverviewStatementReadiness;
};
```

- [ ] **Step 4: Implement the pure calculation**

Use maps keyed by `property_id`. Sum raw numbers before formatting. Exclude `security_deposit`, `owner_contribution`, and fee-type income from property cash income. Count received management-fee allocations as property cash expenses. Exclude `owner_payout` and company-scoped expense rows from operating expenses. Calculate collection rate from rent charges due in the selected month and allocations against those charges. Sort losses and weak properties first, with property label as a stable tie-breaker.

- [ ] **Step 5: Verify and commit**

Run: `npm run test -- src/features/overview/property-performance.test.ts && npx tsc --noEmit`

Expected: PASS.

```powershell
git add -- 'src/features/overview/property-performance.ts' 'src/features/overview/property-performance.test.ts' 'src/features/overview/overview.types.ts'
git commit -m "feat: calculate property cash performance"
```

---

### Task 5: Load Real Overview Property Performance

**Files:**
- Modify: `src/features/overview/data/overview.ts`
- Modify: `src/features/overview/data/overview.test.ts`

**Interfaces:**
- Consumes: `OverviewViewQuery` and `buildOverviewPropertyPerformance`.
- Produces: `getOverviewScreenData(organizationId, query): Promise<OverviewScreenData>` with `propertyPerformance` instead of `companyFinance`.

- [ ] **Step 1: Replace the company P&L test with a failing property-cash test**

Build a Supabase stub containing one property, rent charge, receipt allocation, three property payments, one management fee, and one deposit event.

```ts
expect(data.propertyPerformance.rows[0]).toMatchObject({
  cashExpensesAmount: 572.6,
  cashIncomeAmount: 1400,
  netCashAmount: 827.4,
  propertyId: "prop-1",
  securityDepositHeldAmount: 1400,
});
expect(data.propertyPerformance.summary.managementFeeEarnedAmount).toBe(112);
expect(data).not.toHaveProperty("companyFinance");
```

- [ ] **Step 2: Run the data test and verify failure**

Run: `npm run test -- src/features/overview/data/overview.test.ts`

Expected: FAIL because the loader still returns `companyFinance`.

- [ ] **Step 3: Query exact period and property scope**

Use `getOverviewMonthScope(query.month)`. Query active properties, obligations, receipt allocations joined to receipt dates, payment allocations joined to payment dates, deposit events, leases, units, owners, open maintenance, documents, and recent activity. Apply `propertyId` at the query boundary when not `all`. Limit settlement rows to the selected month plus open obligations needed for arrears; do not load unbounded history.

- [ ] **Step 4: Compose screen data and exact attention links**

Replace company summary builders with `buildOverviewPropertyPerformance`. Preserve occupancy, lease endings, maintenance, record readiness, onboarding, and recent changes. Add attention items for negative net cash, arrears, open bills, missing receipts, and statement blockers with URL-backed filtered destinations.

- [ ] **Step 5: Verify and commit**

Run: `npm run test -- src/features/overview && npx tsc --noEmit`

Expected: PASS.

```powershell
git add -- 'src/features/overview/data/overview.ts' 'src/features/overview/data/overview.test.ts'
git commit -m "feat: load overview property performance"
```

---

### Task 6: Build the Neutral Portfolio Scorecard

**Files:**
- Create: `src/features/overview/components/overview-header.tsx`
- Create: `src/features/overview/components/property-scorecard.tsx`
- Create: `src/features/overview/components/property-performance-detail.tsx`
- Create: `src/features/overview/components/portfolio-workspace.tsx`
- Create: `src/features/overview/components/property-finance-workspace.tsx`
- Modify: `src/features/overview/components/overview-screen.test.tsx`

**Interfaces:**
- Consumes: `OverviewViewQuery`, `OverviewPropertyPerformanceRow`, `Badge`, and `MoneyDisplay`.
- Produces: accessible Portfolio UI with URL-backed property selection.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<OverviewScreen data={operatingWorkspaceData} query={portfolioQuery} />);
expect(screen.getByRole("heading", { name: "Property performance" })).toBeTruthy();
expect(screen.getByRole("link", { name: /Satomi Dimitroff-Guorguieff/ }).getAttribute("href"))
  .toBe("/overview?month=2026-07&propertyId=prop-1");
expect(screen.getByText("USD 827.40")).toBeTruthy();
expect(screen.getByText("Cash basis")).toBeTruthy();
expect(screen.queryByText("Company P&L")).toBeNull();
```

Also assert the mobile card markup exposes the same values through labels without depending on viewport emulation.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm run test -- src/features/overview/components/overview-screen.test.tsx`

Expected: FAIL on the new heading and links.

- [ ] **Step 3: Implement the neutral header**

Use only `bg-background`, `bg-surface`, `border-border`, `text-foreground`, `text-foreground-muted`, and semantic Badge tones. Display Portfolio and Property finance while retaining stable lens URL values. Build links with `URLSearchParams` so month and property state survive lens changes.

- [ ] **Step 4: Implement scorecard and selected-property detail**

Desktop columns are Property, Collected, Income, Expenses, Net cash, Management fee, Budget, Status. When no budget exists, display `Not set`; never fabricate zero variance. Mobile cards show the same facts in a definition list. The selected state uses existing surface/border tokens, not a hard-coded brand color.

The detail component lists cash categories with filtered source links and shows deposit held separately. Build the ready action with `new URLSearchParams({ month: query.month, propertyId: row.propertyId })` and link it to `/reports/owner-statement`.

Create `PortfolioWorkspace` to compose the five-metric strip, `PropertyScorecard`, attention/readiness aside, and `PropertyPerformanceDetail`. Create `PropertyFinanceWorkspace` with URL-backed Collections, Expenses, Management fees, Owner statements, and Property transactions links; reuse the scorecard for Collections and focused operational lists for the other subviews.

- [ ] **Step 5: Verify and commit**

Run: `npm run test -- src/features/overview/components/overview-screen.test.tsx && npm run lint -- 'src/features/overview/components/*.tsx' && npx tsc --noEmit`

Expected: PASS.

```powershell
git add -- 'src/features/overview/components/overview-header.tsx' 'src/features/overview/components/property-scorecard.tsx' 'src/features/overview/components/property-performance-detail.tsx' 'src/features/overview/components/portfolio-workspace.tsx' 'src/features/overview/components/property-finance-workspace.tsx' 'src/features/overview/components/overview-screen.test.tsx'
git commit -m "feat: add property performance scorecard"
```

---

### Task 7: Redesign All Lenses Consistently

**Files:**
- Create: `src/features/overview/components/overview-lens-workspace.tsx`
- Modify: `src/features/overview/components/overview-screen.tsx`
- Modify: `src/features/overview/components/overview-screen.test.tsx`

**Interfaces:**
- Consumes: screen data and Portfolio components from Tasks 5–6.
- Produces: consistent Portfolio, Property finance, Leasing, Maintenance, and Records screens.

- [ ] **Step 1: Add failing lens tests**

```ts
expect(screen.getByRole("link", { name: "Portfolio" })).toBeTruthy();
expect(screen.getByRole("link", { name: "Property finance" })).toBeTruthy();
expect(screen.queryByText("Company P&L")).toBeNull();
expect(screen.queryByText("Company costs")).toBeNull();
expect(screen.queryByText("Journal health")).toBeNull();
```

Render each lens and assert its primary queue: property cash for Portfolio, collections/expenses/fees/statements/transactions for Property finance, vacancy and expiries for Leasing, work and paid maintenance cost for Maintenance, and statement blockers for Records.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test -- src/features/overview/components/overview-screen.test.tsx`

Expected: FAIL until the shared lens workspace is used.

- [ ] **Step 3: Compose the new screen**

Keep onboarding and setup progress. Use:

```tsx
return (
  <main className="min-h-screen bg-background px-4 py-3 sm:px-5">
    <OverviewHeader data={data} query={query} />
    {query.lens === "all" ? (
      <PortfolioWorkspace data={data} query={query} />
    ) : query.lens === "finance" ? (
      <PropertyFinanceWorkspace data={data} query={query} />
    ) : (
      <OverviewLensWorkspace data={data} query={query} />
    )}
  </main>
);
```

Every nonfinance lens renders a metric strip, primary ranked queue/table, attention/readiness aside, and supporting evidence. Existing charts appear below the primary work surface.

- [ ] **Step 4: Remove company-accounting branches**

Delete Company P&L breakdown, company property ranking, owner receivables table, company metric branches, company summary copy, and unused imports. Keep onboarding, `MoneyDisplay`, occupancy/lease charts, attention items, and quick actions where used.

- [ ] **Step 5: Verify and commit**

Run: `npm run test -- src/features/overview && npm run lint -- 'src/features/overview/**/*.{ts,tsx}' && npx tsc --noEmit`

Expected: PASS with no company-accounting copy or dead imports.

```powershell
git add -- 'src/features/overview/components/overview-lens-workspace.tsx' 'src/features/overview/components/overview-screen.tsx' 'src/features/overview/components/overview-screen.test.tsx'
git commit -m "feat: align overview operating lenses"
```

---

### Task 8: Document and Verify End to End

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/engineering-rules.md`
- Verify: all files changed in Tasks 1–7.

**Interfaces:**
- Consumes: completed implementation.
- Produces: durable product boundary and verified handoff.

- [ ] **Step 1: Update current-state documentation**

```md
- `/overview` provides cash-basis property performance with Portfolio, Property finance,
  Leasing, Maintenance, and Records lenses. Portfolio ranks properties by cash income,
  paid property expenses, net cash, collection rate, arrears, management fees, and
  reporting readiness.
```

Document settlement-event tables in the property-finance family. State that the accounting kernel is retained for compatibility pending a separate retirement decision and is not a product-facing company-accounting feature.

- [ ] **Step 2: Update engineering rules**

```md
- Keep property obligations separate from settlement events. Cash reporting uses receipt
  and payment dates; future accrual reporting uses charge and invoice dates.
- Security deposits and owner contributions do not count as property operating income.
- Do not add management-company payroll, overhead, P&L, general-ledger, tax, or ERP UI.
```

- [ ] **Step 3: Run the complete automated proof chain**

```powershell
npm run db:reset
npm run db:lint
npx supabase test db --local supabase/tests
npm run db:types
git diff --exit-code -- src/types/database.generated.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Expected: every command PASS and generated types remain clean.

- [ ] **Step 4: Run authenticated browser verification**

Start `npm run dev` and verify `/overview` at desktop and mobile widths.

Desktop proof:

- Scorecard appears above supporting charts.
- Period, property, review, and finance subview URLs survive reload and back/forward.
- Negative, arrears, and statement-blocked filters lead to real rows.
- Property links open full records; row selection preserves Overview context.
- Deposits remain separate from income.
- Missing budgets display `Not set`.
- No Company P&L, journal, or general-ledger controls appear.

Mobile proof:

- Property cards replace the wide table.
- Metrics wrap without document-level horizontal scrolling.
- Attention and detail remain keyboard- and touch-usable.

- [ ] **Step 5: Inspect, commit docs, and report evidence**

```powershell
git status --short
git diff --check
git diff --stat
git add -- 'docs/current-state.md' 'docs/engineering-rules.md'
git commit -m "docs: record property accounting overview"
```

Expected: only intentional files are changed and the worktree is clean after commit.

---

## Completion Evidence

The final handoff must report:

- Migration filename created by the Supabase CLI.
- Settlement-event and allocation pgTAP results.
- Overview focused test results.
- Full lint, typecheck, test, and build results.
- Authenticated desktop and mobile browser results.
- Files and commits created.
- Any remaining compatibility dependency on the accounting kernel.
- Explicit confirmation that QuickBooks integration, company accounting, and production budget entry were not added.
