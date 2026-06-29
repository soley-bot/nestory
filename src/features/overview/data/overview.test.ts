import { describe, expect, it, vi } from "vitest";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getOverviewScreenData", () => {
  it("surfaces open maintenance work as a dashboard attention item", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub([
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { count: 2, data: [] },
        { data: [] },
      ]),
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
  });
});

type SupabaseResult = {
  count?: number | null;
  data?: unknown[];
  error?: { message: string } | null;
};

function createSupabaseStub(results: SupabaseResult[]) {
  const queue = [...results];

  return {
    from: vi.fn(() => createQuery(queue.shift() ?? { data: [] })),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

function createQuery(result: SupabaseResult) {
  const query = {
    eq: () => query,
    gte: () => query,
    in: () => query,
    is: () => query,
    limit: () => query,
    lt: () => query,
    neq: () => query,
    or: () => query,
    order: () => query,
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
