import { describe, expect, it, vi } from "vitest";
import { getRentIncomeScreenData } from "./rent-income";
import { createSupabaseServerClient } from "@/lib/db/server";
import { parseRentIncomeSearchParams } from "@/features/rent-income/rent-income.filters";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

describe("getRentIncomeScreenData", () => {
  it("loads an archived focused obligation ahead of conflicting list filters", async () => {
    const incomeItemId = "4f7ea031-33bb-4c4f-96cb-b1f90d5019cf";
    const supabase = createQueryTrackingSupabase([
      {
        amount_due: 500,
        amount_received: 500,
        archived_at: "2026-07-20T00:00:00.000Z",
        currency: "USD",
        description: "Historical rent",
        due_date: "2026-05-01",
        id: incomeItemId,
        income_type: "rent",
        lease_id: null,
        ledger_entry_id: null,
        organization_id: "org-1",
        payer_label: "Historical tenant",
        payer_person_id: null,
        property_id: "property-history",
        received_date: "2026-05-03",
        reference: "MAY-RENT",
        status: "posted",
        unit_id: null,
      },
    ]);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    const result = await getRentIncomeScreenData(
      "org-1",
      parseRentIncomeSearchParams({
        archiveState: "all",
        incomeItemId,
        incomeType: "late_fee",
        month: "2026-07",
        propertyId: "11111111-1111-4111-8111-111111111111",
        status: "open",
      }),
    );

    expect(result.incomeItems).toHaveLength(1);
    expect(result.incomeItems[0]).toMatchObject({
      archivedAt: "2026-07-20T00:00:00.000Z",
      id: incomeItemId,
    });
    expect(supabase.incomeCalls).not.toContainEqual({
      args: ["archived_at", null],
      method: "is",
    });
    expect(supabase.incomeCalls).not.toContainEqual({
      args: ["status", "open"],
      method: "eq",
    });
  });

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
    expect(supabase.incomeCalls).not.toContainEqual({
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

  it("preserves an archived cash-account label for receipt history", async () => {
    const incomeItemId = "4f7ea031-33bb-4c4f-96cb-b1f90d5019cf";
    const sourceId = "81644791-4098-4bc0-87b9-2e02e1c842fb";
    const supabase = createQueryTrackingSupabase(
      [
        {
          amount_due: 500,
          amount_received: 500,
          archived_at: null,
          currency: "USD",
          description: null,
          due_date: "2026-07-01",
          id: incomeItemId,
          income_type: "rent",
          lease_id: null,
          ledger_entry_id: null,
          organization_id: "org-1",
          payer_label: "Historical tenant",
          payer_person_id: null,
          property_id: "property-1",
          received_date: "2026-07-05",
          reference: "JULY-RENT",
          status: "received",
          unit_id: null,
        },
      ],
      {
        finance_receipt_allocation_journals: [],
        finance_receipt_allocations: [
          {
            amount: 500,
            id: "allocation-1",
            income_item_id: incomeItemId,
            ledger_entry_id: "ledger-1",
            organization_id: "org-1",
            publication_source_class: "legacy_cash_non_publishable",
            receipt_id: "receipt-1",
            reconciliation_source_id: sourceId,
            reversal_of_allocation_id: null,
            settlement_basis: "pre_cutover_uninvoiced",
          },
        ],
        finance_receipts: [
          {
            id: "receipt-1",
            organization_id: "org-1",
            received_date: "2026-07-05",
            reference: "BANK-500",
            reversal_of_id: null,
          },
        ],
        financial_reconciliation_sources: [
          {
            archived_at: "2026-07-20T00:00:00.000Z",
            code: "BANK",
            currency: "USD",
            display_name: "Operating",
            id: sourceId,
            organization_id: "org-1",
            property_id: "property-1",
          },
        ],
      },
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(supabase.client);

    const result = await getRentIncomeScreenData(
      "org-1",
      parseRentIncomeSearchParams({ month: "2026-07" }),
    );

    expect(result.reconciliationSources).toContainEqual({
      archivedAt: "2026-07-20T00:00:00.000Z",
      currency: "USD",
      id: sourceId,
      label: "BANK · Operating",
      propertyId: "property-1",
    });
    expect(result.incomeItems[0]?.receipts[0]?.reconciliationSourceLabel).toBe(
      "BANK · Operating",
    );
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
      archiveState: "active",
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

function createQueryTrackingSupabase(
  incomeRows: IncomeTestRow[],
  additionalRows: Record<string, IncomeTestRow[]> = {},
) {
  const incomeCalls: QueryCall[] = [];
  const rowsByTable: Record<string, IncomeTestRow[]> = {
    ...additionalRows,
    finance_income_items: incomeRows,
  };

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
        const data = (rowsByTable[table] ?? []).filter((row) =>
          matchesFilters(row, filters),
        );
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
