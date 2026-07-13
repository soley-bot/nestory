import { describe, expect, it, vi } from "vitest";
import { getRentIncomeScreenData } from "./rent-income";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

describe("getRentIncomeScreenData", () => {
  it("applies the management-fee family as a server-side income type filter", async () => {
    const inCalls: Array<[string, unknown[]]> = [];
    const query = () => {
      const chain = {
        eq: () => chain, gte: () => chain, is: () => chain, limit: () => chain,
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
      incomeScope: "management-fees", month: "2026-07", page: 1, pageSize: 25,
      propertyId: "all", query: "", status: "all", unitId: "all",
    });

    expect(inCalls).toContainEqual(["income_type", ["management_fee", "leasing_commission", "service_fee", "maintenance_markup"]]);
  });
});
