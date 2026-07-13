import { describe, expect, it, vi } from "vitest";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getOverviewScreenData", () => {
  it("marks a brand new workspace as not yet set up", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({ tasks: { count: 0, data: [] } }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.workspaceSetup).toEqual({
      activeLeaseCount: 0,
      hasAnyOperatingData: false,
      ledgerEntryCount: 0,
      peopleCount: 0,
      propertyCount: 0,
      unitCount: 0,
    });
    expect(data.quickActions[0]).toEqual({
      href: "/import",
      label: "Import data",
    });
  });

  it("surfaces open maintenance work as a dashboard attention item", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({ tasks: { count: 2, data: [] } }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.attentionItems).toContainEqual({
      count: 2,
      helper: "Open cases",
      href: "/maintenance?review=open",
      label: "Open maintenance",
      tone: "warning",
    });
    expect(data.attentionTotal).toBe(2);
    expect(data.dashboardSummary.actionHref).toBe("#focus-now");
    expect(data.workspaceSetup.hasAnyOperatingData).toBe(true);
  });

  it("links missing lease tenant records to the lease repair view", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        leases: {
          data: [
            {
              lease_end_date: "2099-01-01",
              primary_tenant_person_id: null,
              unit_id: null,
            },
          ],
        },
        tasks: { count: 0, data: [] },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.attentionItems).toContainEqual({
      count: 1,
      helper: "No People tenant link",
      href: "/leases?status=current&tenantStatus=missing",
      label: "Leases missing tenant link",
      tone: "warning",
    });
    expect(data.dashboardSummary.actionHref).toBe(
      "/leases?status=current&tenantStatus=missing",
    );
  });

  it("loads selected-month property cash performance from settlement events", async () => {
    const queryCalls: QueryCall[] = [];
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        finance_expense_items: {
          data: [
            {
              amount: 300,
              category: "Maintenance",
              company_loss_amount: 0,
              currency: "USD",
              economic_scope: "property_expense",
              expense_type: "maintenance",
              id: "expense-1",
              invoice_date: "2026-07-04",
              owner_bill_status: "not_billable",
              owner_reimbursable_amount: 0,
              owner_reimbursed_amount: 0,
              property_id: "prop-1",
              status: "paid",
              vendor_label: "Vendor 1",
            },
            {
              amount: 100,
              category: "Utilities",
              company_loss_amount: 0,
              currency: "USD",
              economic_scope: "property_expense",
              expense_type: "utilities",
              id: "expense-2",
              invoice_date: "2026-07-05",
              owner_bill_status: "not_billable",
              owner_reimbursable_amount: 0,
              owner_reimbursed_amount: 0,
              property_id: "prop-1",
              status: "paid",
              vendor_label: "Vendor 2",
            },
            {
              amount: 60.6,
              category: "Tax",
              company_loss_amount: 0,
              currency: "USD",
              economic_scope: "property_expense",
              expense_type: "tax",
              id: "expense-3",
              invoice_date: "2026-07-06",
              owner_bill_status: "not_billable",
              owner_reimbursable_amount: 0,
              owner_reimbursed_amount: 0,
              property_id: "prop-1",
              status: "paid",
              vendor_label: "Vendor 3",
            },
          ],
        },
        finance_income_items: {
          data: [
            {
              amount_due: 1400,
              amount_received: 1400,
              currency: "USD",
              due_date: "2026-07-01",
              id: "income-rent",
              income_type: "rent",
              property_id: "prop-1",
              status: "paid",
            },
            {
              amount_due: 112,
              amount_received: 112,
              currency: "USD",
              due_date: "2026-07-01",
              id: "income-fee",
              income_type: "management_fee",
              property_id: "prop-1",
              status: "paid",
            },
          ],
        },
        finance_payment_allocations: {
          data: [
            paymentAllocation("payment-allocation-1", "expense-1", 300, "2026-07-04"),
            paymentAllocation("payment-allocation-2", "expense-2", 100, "2026-07-05"),
            paymentAllocation("payment-allocation-3", "expense-3", 60.6, "2026-07-06"),
          ],
        },
        finance_receipt_allocations: {
          data: [
            receiptAllocation("receipt-allocation-1", "income-rent", 1400),
            receiptAllocation("receipt-allocation-2", "income-fee", 112),
          ],
        },
        lease_deposit_events: {
          data: [
            {
              amount: 1400,
              event_date: "2026-06-20",
              event_type: "received",
              id: "deposit-event-1",
              property_id: "prop-1",
              reversal_of_id: null,
            },
            {
              amount: 200,
              event_date: "2026-06-21",
              event_type: "refunded",
              id: "deposit-event-2",
              property_id: "prop-1",
              reversal_of_id: null,
            },
            {
              amount: 200,
              event_date: "2026-06-22",
              event_type: "reversed",
              id: "deposit-event-3",
              property_id: "prop-1",
              reversal_of_id: "deposit-event-2",
              reversed_event: { event_type: "refunded" },
            },
          ],
        },
        properties: {
          data: [{ code: "CTR", id: "prop-1", name: "Central Residence" }],
        },
        tasks: { count: 0, data: [] },
        units: {
          data: [{ id: "unit-1", property_id: "prop-1", status: "occupied" }],
        },
      }, queryCalls),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      {
        financeView: "collections",
        lens: "all",
        month: "2026-07",
        propertyId: "prop-1",
        review: "all",
      },
    );

    expect(data.propertyPerformance.rows[0]).toMatchObject({
      cashExpensesAmount: 572.6,
      cashIncomeAmount: 1400,
      netCashAmount: 827.4,
      propertyId: "prop-1",
      securityDepositHeldAmount: 1400,
    });
    expect(data.propertyPerformance.summary.managementFeeEarnedAmount).toBe(112);
    expect(data).not.toHaveProperty("companyFinance");
    expect(queryCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ args: ["id", "prop-1"], method: "eq", table: "properties" }),
        expect.objectContaining({ args: ["finance_receipts.property_id", "prop-1"], method: "eq", table: "finance_receipt_allocations" }),
        expect.objectContaining({ args: ["finance_income_items.property_id", "prop-1"], method: "eq", table: "finance_receipt_allocations" }),
        expect.objectContaining({ args: ["finance_payments.property_id", "prop-1"], method: "eq", table: "finance_payment_allocations" }),
        expect.objectContaining({ args: ["finance_expense_items.property_id", "prop-1"], method: "eq", table: "finance_payment_allocations" }),
        expect.objectContaining({ args: ["property_id", "prop-1"], method: "eq", table: "lease_deposit_events" }),
        expect.objectContaining({ args: ["income_item_id", ["income-rent", "income-fee"]], method: "in", table: "finance_receipt_allocations" }),
        expect.objectContaining({ args: ["finance_receipts.received_date", "2026-08-01"], method: "lt", table: "finance_receipt_allocations" }),
      ]),
    );
  });

  it("loads every page of due obligations and open-bill blockers", async () => {
    const dueItems = Array.from({ length: 1_001 }, (_, index) => ({
      amount_due: 1,
      due_date: "2026-07-01",
      id: `income-${index}`,
      income_type: "rent",
      property_id: "prop-1",
    }));
    const openBills = Array.from({ length: 1_001 }, (_, index) => ({
      economic_scope: "property_expense",
      expense_type: "maintenance",
      id: `bill-${index}`,
      property_id: "prop-1",
    }));
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        finance_expense_items: { data: openBills },
        finance_income_items: { data: dueItems },
        properties: {
          data: [{ code: "CTR", id: "prop-1", name: "Central Residence" }],
        },
        tasks: { count: 0, data: [] },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      {
        financeView: "collections",
        lens: "all",
        month: "2026-07",
        propertyId: "all",
        review: "all",
      },
    );

    expect(data.propertyPerformance.rows[0].arrearsAmount).toBe(1_001);
    expect(data.attentionItems).toContainEqual(
      expect.objectContaining({ count: 1_001, label: "Open property bills" }),
    );
  });
});

type SupabaseResult = {
  count?: number | null;
  data?: unknown[];
  error?: { message: string } | null;
};

type QueryCall = {
  args: unknown[];
  method: string;
  table: string;
};

function createSupabaseStub(
  results: Record<string, SupabaseResult>,
  calls?: QueryCall[],
) {
  return {
    from: vi.fn((table: string) =>
      createQuery(results[table] ?? { data: [] }, table, calls),
    ),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

function receiptAllocation(id: string, incomeItemId: string, amount: number) {
  return {
    amount,
    finance_receipts: {
      received_date: "2026-07-03",
      reversal_of_id: null,
    },
    id,
    income_item_id: incomeItemId,
  };
}

function paymentAllocation(
  id: string,
  expenseItemId: string,
  amount: number,
  paidDate: string,
) {
  return {
    amount,
    expense_item_id: expenseItemId,
    finance_expense_items: {
      economic_scope: "property_expense",
      expense_type: "property_cost",
      id: expenseItemId,
      ledger_entry_id: null,
      property_id: "prop-1",
    },
    finance_payments: { paid_date: paidDate, reversal_of_id: null },
    id,
  };
}

function createQuery(result: SupabaseResult, table = "", calls?: QueryCall[]) {
  const chain = (method: string) => (...args: unknown[]) => {
    calls?.push({ args, method, table });
    return query;
  };
  const query = {
    eq: chain("eq"),
    gte: chain("gte"),
    in: chain("in"),
    is: chain("is"),
    limit: chain("limit"),
    lt: chain("lt"),
    neq: chain("neq"),
    or: chain("or"),
    order: chain("order"),
    range: (from: number, to: number) => {
      calls?.push({ args: [from, to], method: "range", table });
      return Promise.resolve({
        count: result.count ?? null,
        data: (result.data ?? []).slice(from, to + 1),
        error: result.error ?? null,
      });
    },
    select: chain("select"),
    then: (
      onFulfilled: (value: SupabaseResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        count: result.count ?? null,
        data: (result.data ?? []).slice(0, 1_000),
        error: result.error ?? null,
      }).then(onFulfilled, onRejected),
  };

  return query;
}
