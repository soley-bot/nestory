import { describe, expect, it, vi } from "vitest";
import { getRentIncomeScreenData } from "./rent-income";
import { createSupabaseServerClient } from "@/lib/db/server";
import { parseRentIncomeSearchParams } from "@/features/rent-income/rent-income.filters";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

describe("getRentIncomeScreenData", () => {
  it("loads a prior-period obligation by validated focused ID without weakening record scope", async () => {
    const incomeItemId = "4f7ea031-33bb-4c4f-96cb-b1f90d5019cf";
    const propertyId = "74d58dfd-198d-407e-a3e6-35f68f671a1b";
    const supabase = createQueryTrackingSupabase([
      {
        amount_due: 1_000,
        amount_received: 1_000,
        archived_at: null,
        currency: "USD",
        description: "June rent received in July",
        due_date: "2026-06-01",
        id: incomeItemId,
        income_type: "rent",
        lease_id: null,
        ledger_entry_id: null,
        organization_id: "org-1",
        payer_label: "Tenant One",
        payer_person_id: null,
        property_id: propertyId,
        received_date: "2026-07-03",
        reference: "JULY-RECEIPT",
        status: "received",
        unit_id: null,
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    const result = await getRentIncomeScreenData(
      "org-1",
      parseRentIncomeSearchParams({
        incomeItemId,
        month: "2026-07",
        propertyId,
      }),
    );

    expect(result.incomeItems).toHaveLength(1);
    expect(result.incomeItems[0]).toMatchObject({
      dueDate: "2026-06-01",
      id: incomeItemId,
      receivedDate: "2026-07-03",
    });
    expect(supabase.incomeCalls).toContainEqual({
      args: ["id", incomeItemId],
      method: "eq",
    });
    expect(supabase.incomeCalls).toContainEqual({
      args: ["organization_id", "org-1"],
      method: "eq",
    });
    expect(supabase.incomeCalls).toContainEqual({
      args: ["property_id", propertyId],
      method: "eq",
    });
    expect(supabase.incomeCalls).toContainEqual({
      args: ["archived_at", null],
      method: "is",
    });
  });

  it("keeps due-date month filtering for ordinary list views", async () => {
    const supabase = createQueryTrackingSupabase([]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    await getRentIncomeScreenData(
      "org-1",
      parseRentIncomeSearchParams({ month: "2026-07" }),
    );

    expect(supabase.incomeCalls).toContainEqual({
      args: ["due_date", "2026-07-01"],
      method: "gte",
    });
    expect(supabase.incomeCalls).toContainEqual({
      args: ["due_date", "2026-08-01"],
      method: "lt",
    });
  });

  it("composes the management-company group and individual income type filters", async () => {
    const inCalls: Array<[string, unknown[]]> = [];
    const eqCalls: Array<[string, unknown]> = [];
    const query = () => {
      const chain = {
        eq: (column: string, value: unknown) => { eqCalls.push([column, value]); return chain; }, gte: () => chain, is: () => chain, limit: () => chain,
        lt: () => chain, or: () => chain, order: () => chain, range: () => chain,
        select: () => chain,
        in: (column: string, values: unknown[]) => { inCalls.push([column, values]); return chain; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ count: 0, data: [], error: null }).then(resolve),
      };
      return chain;
    };
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      from: vi.fn(() => query()),
      rpc: vi.fn(async () => ({ data: [], error: null })),
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);

    await getRentIncomeScreenData("org-1", {
      incomeGroup: "management-company", incomeType: "service_fee", month: "2026-07", page: 1, pageSize: 25,
      propertyId: "all", query: "", status: "all", unitId: "all",
    });

    expect(inCalls).toContainEqual(["income_type", ["management_fee", "leasing_commission", "service_fee", "maintenance_markup"]]);
    expect(eqCalls).toContainEqual(["income_type", "service_fee"]);
  });
});

type QueryCall = {
  args: unknown[];
  method: string;
};

type IncomeTestRow = Record<string, unknown>;

function createQueryTrackingSupabase(incomeRows: IncomeTestRow[]) {
  const incomeCalls: QueryCall[] = [];

  const from = vi.fn((table: string) => {
    const filters: QueryCall[] = [];
    const chain = {
      eq: (column: string, value: unknown) => addFilter("eq", column, value),
      gte: (column: string, value: unknown) => addFilter("gte", column, value),
      in: (column: string, values: unknown[]) => addFilter("in", column, values),
      is: (column: string, value: unknown) => addFilter("is", column, value),
      limit: () => chain,
      lt: (column: string, value: unknown) => addFilter("lt", column, value),
      or: () => chain,
      order: () => chain,
      range: () => chain,
      select: () => chain,
      then: (resolve: (value: unknown) => unknown) => {
        const data =
          table === "finance_income_items"
            ? incomeRows.filter((row) => matchesFilters(row, filters))
            : [];
        return Promise.resolve({ count: data.length, data, error: null }).then(
          resolve,
        );
      },
    };

    function addFilter(method: string, ...args: unknown[]) {
      const call = { args, method };
      filters.push(call);
      if (table === "finance_income_items") incomeCalls.push(call);
      return chain;
    }

    return chain;
  });

  return {
    client: {
      from,
      rpc: vi.fn(async () => ({ data: [], error: null })),
    } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    incomeCalls,
  };
}

function matchesFilters(row: IncomeTestRow, filters: QueryCall[]) {
  return filters.every(({ args: [column, value], method }) => {
    const actual = row[String(column)];
    if (method === "eq" || method === "is") return actual === value;
    if (method === "gte") return String(actual) >= String(value);
    if (method === "lt") return String(actual) < String(value);
    if (method === "in") return (value as unknown[]).includes(actual);
    return true;
  });
}
