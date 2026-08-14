import { describe, expect, it, vi } from "vitest";
import { getPropertyPortfolioSummary } from "@/features/properties/data/property-portfolio-summary";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getPropertyPortfolioSummary", () => {
  it("counts the active portfolio and derives units without a current lease", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        current_leases: { count: 41 },
        properties: { count: 17 },
        units: { count: 50 },
      }),
    );

    await expect(getPropertyPortfolioSummary("org-1")).resolves.toEqual({
      activeProperties: 17,
      totalUnits: 50,
      unitsWithoutCurrentLease: 9,
    });
  });
});

type SupabaseResult = {
  count: number;
  error?: { message: string } | null;
};

function createSupabaseStub(results: Record<string, SupabaseResult>) {
  return {
    from: vi.fn((table: string) => createQuery(results[table]!)),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

function createQuery(result: SupabaseResult) {
  const chain = () => query;
  const query = {
    eq: chain,
    in: chain,
    is: chain,
    neq: chain,
    not: chain,
    select: chain,
    then: (
      onFulfilled: (value: SupabaseResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ ...result, error: result.error ?? null }).then(onFulfilled, onRejected),
  };

  return query;
}
