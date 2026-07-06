import { describe, expect, it, vi } from "vitest";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getOverviewScreenData", () => {
  it("marks a brand new workspace as not yet set up", async () => {
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
        { count: 0, data: [] },
        { data: [] },
      ]),
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
    expect(data.workspaceSetup.hasAnyOperatingData).toBe(true);
  });

  it("links missing lease tenant records to the lease repair view", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub([
        { data: [] },
        { data: [] },
        {
          data: [
            {
              lease_end_date: "2099-01-01",
              primary_tenant_person_id: null,
              unit_id: null,
            },
          ],
        },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { count: 0, data: [] },
        { data: [] },
      ]),
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
