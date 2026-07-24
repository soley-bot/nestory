import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBillsExpensesScreenData } from "./bills-expenses";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getPersonSelectOptions } from "@/features/people/data/person-options";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/features/people/data/person-options", () => ({
  getPersonSelectOptions: vi.fn(),
}));

describe("getBillsExpensesScreenData", () => {
  beforeEach(() => {
    vi.mocked(getPersonSelectOptions).mockReset();
    vi.mocked(getPersonSelectOptions).mockResolvedValue([]);
  });

  it("loads the Known vendor selector from the authoritative active Vendor boundary", async () => {
    vi.mocked(getPersonSelectOptions).mockResolvedValue([
      {
        archived: false,
        description: "Vendor · acme@example.com",
        id: "vendor-1",
        label: "Acme Repairs",
        roles: ["vendor"],
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        finance_expense_items: [
          { count: 0, data: [] },
          { data: [] },
        ],
        finance_payment_allocations: [{ data: [] }],
        properties: [{ data: [] }],
        units: [{ data: [] }],
      }),
    );

    const result = await getBillsExpensesScreenData("org-1", {
      archiveState: "active",
      dateBasis: "invoice",
      expenseItemId: "all",
      expenseType: "all",
      month: "2026-07",
      page: 1,
      pageSize: 25,
      propertyId: "all",
      query: "",
      status: "all",
      unitId: "all",
    });

    expect(getPersonSelectOptions).toHaveBeenCalledWith({
      organizationId: "org-1",
      roles: ["vendor"],
    });
    expect(result.vendorOptions).toEqual([
      { id: "vendor-1", label: "Acme Repairs" },
    ]);
  });

  it("loads one archived focused expense without applying list date or status filters", async () => {
    queryFilters.length = 0;
    queryDateFilters.length = 0;
    const expenseItemId = "11111111-1111-4111-8111-111111111111";
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        finance_expense_items: [
          { count: 1, data: [] },
          {
            data: [
              {
                amount: 200,
                archived_at: "2026-07-20T00:00:00.000Z",
                category: "Repair",
                company_loss_amount: 0,
                currency: "USD",
                description: null,
                due_date: "2026-05-31",
                economic_scope: "property_expense",
                expense_type: "maintenance",
                id: expenseItemId,
                invoice_date: "2026-05-01",
                ledger_entry_id: null,
                organization_id: "org-1",
                owner_bill_status: "not_billable",
                owner_reimbursable_amount: 0,
                owner_reimbursed_amount: 0,
                paid_date: null,
                property_id: "property-1",
                reference: "INV-HISTORY",
                status: "approved",
                unit_id: null,
                vendor_label: "Historical vendor",
                vendor_person_id: null,
              },
            ],
          },
        ],
        finance_payment_allocations: [{ data: [] }],
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
      archiveState: "all",
      dateBasis: "paid",
      expenseItemId,
      expenseType: "utilities",
      month: "2026-07",
      page: 1,
      pageSize: 25,
      propertyId: "all",
      query: "",
      status: "paid",
      unitId: "all",
    });

    expect(result.expenseItems).toHaveLength(1);
    expect(result.expenseItems[0]).toMatchObject({
      archivedAt: "2026-07-20T00:00:00.000Z",
      id: expenseItemId,
    });
    expect(queryFilters).toContainEqual(["id", expenseItemId]);
    expect(queryFilters).toContainEqual(["organization_id", "org-1"]);
    expect(queryFilters).not.toContainEqual(["status", "paid"]);
    expect(queryDateFilters).toEqual([]);
  });

  it("derives the remaining payment from existing settlement allocations", async () => {
    queryDateFilters.length = 0;
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
      archiveState: "active",
      dateBasis: "invoice",
      expenseItemId: "all",
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

  it("shows July partial payment events even when the June invoice is not finally paid", async () => {
    const expense = { amount: 200, archived_at: null, category: "Repair", company_loss_amount: 0, currency: "USD", description: null, due_date: "2026-06-30", economic_scope: "property_expense", expense_type: "maintenance", id: "expense-1", invoice_date: "2026-06-01", ledger_entry_id: null, organization_id: "org-1", owner_bill_status: "not_billable", owner_reimbursable_amount: 0, owner_reimbursed_amount: 0, paid_date: null, property_id: "property-1", reference: "INV-1", status: "approved", unit_id: null, vendor_label: "Repair Vendor", vendor_person_id: null };
    const supabase = createSupabaseStub({ people: [{ data: [] }], properties: [{ data: [{ code: "HOME", id: "property-1", name: "Home" }] }], units: [{ data: [] }] }, {
      get_finance_payment_drilldown: { data: [{ expense, payment_id: "payment-july", paid_date: "2026-07-10", allocation_amount: 50, payment_reference: "PAY-JULY", reversal_of_id: null, total_count: 1, scoped_amount: 50 }] },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase);

    const result = await getBillsExpensesScreenData("org-1", {
      archiveState: "active", dateBasis: "paid", expenseItemId: "all", expenseType: "maintenance", month: "2026-07", page: 1,
      pageSize: 25, propertyId: "property-1", query: "", status: "paid", unitId: "all",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("get_finance_payment_drilldown", expect.objectContaining({ p_paid_from: "2026-07-01", p_paid_before: "2026-08-01", p_expense_type: "maintenance", p_status: "paid" }));
    expect(result.expenseItems[0]).toMatchObject({ id: "payment-july:expense-1", amount: 50, amountPaid: 50, paidDate: "2026-07-10", status: "approved" });
    expect(result.pagination.totalCount).toBe(1);
    expect(result.summary.postedTotal).toEqual({ primary: "USD 50.00" });
  });

  it("clamps an out-of-range paid page without losing exact count or summary", async () => {
    const expense = { amount: 200, archived_at: null, category: "Repair", company_loss_amount: 0, currency: "USD", description: null, due_date: null, economic_scope: "property_expense", expense_type: "maintenance", id: "expense-1", invoice_date: "2026-06-01", ledger_entry_id: null, organization_id: "org-1", owner_bill_status: "not_billable", owner_reimbursable_amount: 0, owner_reimbursed_amount: 0, paid_date: null, property_id: "property-1", reference: "INV-1", status: "approved", unit_id: null, vendor_label: "Vendor", vendor_person_id: null };
    const event = { expense, payment_id: "payment-1", paid_date: "2026-07-10", allocation_amount: 50, payment_reference: "PAY-1", reversal_of_id: null, total_count: 1, scoped_amount: 50 };
    const supabase = createSupabaseStub({ people: [{ data: [] }], properties: [{ data: [{ code: "HOME", id: "property-1", name: "Home" }] }], units: [{ data: [] }] }, { get_finance_payment_drilldown: [{ data: [] }, { data: [event] }, { data: [event] }] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase);
    const result = await getBillsExpensesScreenData("org-1", { archiveState: "active", dateBasis: "paid", expenseItemId: "all", expenseType: "all", month: "2026-07", page: 9, pageSize: 25, propertyId: "all", query: "", status: "paid", unitId: "all" });
    expect(result.pagination).toMatchObject({ page: 1, totalCount: 1 });
    expect(result.expenseItems).toHaveLength(1);
    expect(result.summary.postedTotal).toEqual({ primary: "USD 50.00" });
  });
});

const queryFilters: Array<[string, unknown]> = [];
const queryDateFilters: Array<[string, string, unknown]> = [];

type SupabaseResult = {
  count?: number | null;
  data?: unknown[];
  error?: { message: string } | null;
};

function createSupabaseStub(results: Record<string, SupabaseResult[]>, rpcResults: Record<string, SupabaseResult | SupabaseResult[]> = {}) {
  const queues = Object.fromEntries(
    Object.entries(results).map(([table, tableResults]) => [table, [...tableResults]]),
  );

  return {
    from: vi.fn((table: string) =>
      createQuery(queues[table]?.shift() ?? { data: [] }),
    ),
    rpc: vi.fn(async (name: string) => {
      const result = rpcResults[name];
      return Array.isArray(result) ? result.shift() ?? { data: [], error: null } : result ?? { data: [], error: null };
    }),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

function createQuery(result: SupabaseResult) {
  const query = {
    eq: (column: string, value: unknown) => { queryFilters.push([column, value]); return query; },
    gte: (column: string, value: unknown) => { queryDateFilters.push(["gte", column, value]); return query; },
    in: () => query,
    is: () => query,
    limit: () => query,
    lt: (column: string, value: unknown) => { queryDateFilters.push(["lt", column, value]); return query; },
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
