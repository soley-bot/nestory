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

  it("counts no-role people the same way as the People no-role filter", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub([
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        {
          data: [
            {
              id: "person-with-inactive-role",
              primary_email: null,
              primary_phone: null,
            },
            {
              id: "person-without-role",
              primary_email: null,
              primary_phone: null,
            },
          ],
        },
        {
          data: [
            {
              person_id: "person-with-inactive-role",
              role: "tenant",
              status: "inactive",
            },
          ],
        },
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
      helper: "Needs tenant, owner, vendor, or staff role",
      href: "/people?status=no_role",
      label: "People without role",
      tone: "danger",
    });
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
