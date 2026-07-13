import { describe, expect, it, vi } from "vitest";
import { getBillsExpensesScreenData } from "./bills-expenses";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getBillsExpensesScreenData", () => {
  it("derives the remaining payment from existing settlement allocations", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        finance_expense_items: [
          { count: 1, data: [] },
          {
            data: [
              {
                amount: 200,
                archived_at: null,
                category: "Repair",
                company_loss_amount: 0,
                currency: "USD",
                description: null,
                due_date: "2026-07-31",
                economic_scope: "property_expense",
                expense_type: "maintenance",
                id: "expense-1",
                invoice_date: "2026-07-01",
                ledger_entry_id: null,
                organization_id: "org-1",
                owner_bill_status: "not_billable",
                owner_reimbursable_amount: 0,
                owner_reimbursed_amount: 0,
                paid_date: null,
                property_id: "property-1",
                reference: "INV-200",
                status: "approved",
                unit_id: null,
                vendor_label: "Repair Vendor",
                vendor_person_id: null,
              },
            ],
          },
        ],
        finance_payment_allocations: [
          {
            data: [
              {
                amount: 50,
                expense_item_id: "expense-1",
                finance_payments: { reversal_of_id: null },
              },
            ],
          },
        ],
        people: [{ data: [] }],
        properties: [
          {
            data: [{ code: "HOME", id: "property-1", name: "Home" }],
          },
        ],
        units: [{ data: [] }],
      }),
    );

    const result = await getBillsExpensesScreenData("org-1", {
      expenseType: "maintenance",
      month: "2026-07",
      page: 1,
      pageSize: 25,
      propertyId: "all",
      query: "",
      status: "all",
      unitId: "all",
    });

    expect(result.expenseItems[0]).toMatchObject({
      amount: 200,
      amountPaid: 50,
      amountPaidDisplay: { primary: "USD 50.00" },
      outstandingAmount: 150,
      outstandingAmountDisplay: { primary: "USD 150.00" },
    });
    expect(queryFilters).toContainEqual(["expense_type", "maintenance"]);
  });
});

const queryFilters: Array<[string, unknown]> = [];

type SupabaseResult = {
  count?: number | null;
  data?: unknown[];
  error?: { message: string } | null;
};

function createSupabaseStub(results: Record<string, SupabaseResult[]>) {
  const queues = Object.fromEntries(
    Object.entries(results).map(([table, tableResults]) => [table, [...tableResults]]),
  );

  return {
    from: vi.fn((table: string) =>
      createQuery(queues[table]?.shift() ?? { data: [] }),
    ),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

function createQuery(result: SupabaseResult) {
  const query = {
    eq: (column: string, value: unknown) => { queryFilters.push([column, value]); return query; },
    gte: () => query,
    in: () => query,
    is: () => query,
    limit: () => query,
    lt: () => query,
    or: () => query,
    order: () => query,
    range: () => query,
    select: () => query,
    then: (
      onFulfilled: (value: SupabaseResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        count: result.count ?? null,
        data: result.data ?? [],
        error: result.error ?? null,
      }).then(onFulfilled, onRejected),
  };

  return query;
}
