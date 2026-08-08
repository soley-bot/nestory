import { describe, expect, it, vi } from "vitest";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("getOverviewScreenData", () => {
  it("marks a brand new workspace as not yet set up", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(createSupabaseStub());

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
    expect(data.quickActions[0]).toEqual({ href: "/import", label: "Import data" });
  });

  it("surfaces open maintenance work without finance calculations", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        properties: {
          data: [{ code: "CTR", id: "prop-1", name: "Central Residence" }],
        },
        tasks: {
          data: [
            {
              due_date: "2026-07-01",
              id: "task-1",
              priority: "urgent",
              property_id: "prop-1",
              status: "pending",
              title: "Leaking pipe",
            },
          ],
        },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.attentionItems).toContainEqual(
      expect.objectContaining({
        count: 1,
        href: "/maintenance?review=open",
        id: "open-maintenance",
        label: "Open maintenance",
      }),
    );
    expect(data.maintenanceByProperty).toEqual([
      expect.objectContaining({
        label: "CTR / Central Residence",
        openCount: 1,
        urgentCount: 1,
      }),
    ]);
  });

  it("links missing lease tenants to the lease repair view", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        current_leases: {
          data: [
            {
              lease_end_date: "2099-01-01",
              primary_tenant_person_id: null,
              unit_id: null,
            },
          ],
        },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.attentionItems).toContainEqual(
      expect.objectContaining({
        count: 1,
        href: "/leases?status=current&tenantStatus=missing",
        id: "missing-tenant-links",
      }),
    );
  });
});

type SupabaseResult = {
  count?: number | null;
  data?: unknown[];
  error?: { message: string } | null;
};

function createSupabaseStub(results: Record<string, SupabaseResult> = {}) {
  return {
    from: vi.fn((table: string) => createQuery(results[table] ?? { data: [] })),
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>;
}

function createQuery(result: SupabaseResult) {
  const chain = () => query;
  const query = {
    eq: chain,
    gte: chain,
    in: chain,
    is: chain,
    limit: chain,
    lt: chain,
    neq: chain,
    or: chain,
    order: chain,
    range: (from: number, to: number) =>
      Promise.resolve({
        count: result.count ?? null,
        data: (result.data ?? []).slice(from, to + 1),
        error: result.error ?? null,
      }),
    select: chain,
    then: (
      onFulfilled: (value: SupabaseResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        count: result.count ?? null,
        data: (result.data ?? []).slice(0, 1_000),
        error: result.error ?? null,
      }).then(onFulfilled, onRejected),
  };

  return query;
}
