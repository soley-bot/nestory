import { describe, expect, it, vi } from "vitest";
import { getRentIncomeScreenData } from "./rent-income";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

describe("getRentIncomeScreenData", () => {
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
