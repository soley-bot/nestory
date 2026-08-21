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
    expect(data.propertyOptions).toEqual([
      { label: "CTR / Central Residence", value: "prop-1" },
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
              property_id: "prop-1",
              unit_id: null,
            },
          ],
        },
        properties: {
          data: [
            {
              code: "CTR",
              id: "prop-1",
              name: "Central Residence",
              rental_structure: "single_space",
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

  it("counts only leases with an operational property and unit", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        current_leases: {
          data: [
            {
              id: "lease-1",
              lease_end_date: "2099-01-01",
              monthly_rent_amount: 900,
              monthly_rent_currency: "USD",
              primary_tenant_person_id: "person-1",
              property_id: "prop-1",
              unit_id: "unit-1",
            },
            {
              id: "archived-lease",
              lease_end_date: "2099-01-01",
              monthly_rent_amount: 1500,
              monthly_rent_currency: "USD",
              primary_tenant_person_id: "person-2",
              property_id: "archived-property",
              unit_id: "archived-unit",
            },
            {
              id: "inactive-lease",
              lease_end_date: "2099-01-01",
              monthly_rent_amount: 1200,
              monthly_rent_currency: "USD",
              primary_tenant_person_id: "person-3",
              property_id: "inactive-property",
              unit_id: null,
            },
          ],
        },
        properties: {
          data: [
            {
              code: "CTR",
              id: "prop-1",
              name: "Central Residence",
              rental_structure: "multi_unit",
              status: "active",
            },
            {
              code: "OLD",
              id: "inactive-property",
              name: "Inactive House",
              rental_structure: "single_space",
              status: "inactive",
            },
          ],
        },
        units: {
          data: [
            {
              id: "unit-1",
              property_id: "prop-1",
              status: "occupied",
            },
            {
              id: "inactive-unit",
              property_id: "inactive-property",
              status: "vacant",
            },
          ],
        },
        lease_terms: {
          data: [
            {
              lease_id: "lease-1",
              payment_frequency: "monthly",
              rent_amount: 900,
              rent_currency: "USD",
              status: "active",
            },
          ],
        },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.metrics.find((metric) => metric.label === "Active leases")?.value).toBe("1");
    expect(data.metrics.find((metric) => metric.label === "Occupancy")?.value).toBe("100%");
    expect(data.workspaceSetup.unitCount).toBe(1);
    expect(data.attentionItems.find((item) => item.id === "vacant-units")).toBeUndefined();
    expect(data.attentionItems).toContainEqual(
      expect.objectContaining({
        count: 2,
        id: "lease-scope-review",
        label: "Leases need placement review",
      }),
    );
    expect(
      (data as unknown as { expectedRent: { leaseCount: number; monthly: { primary: string } } })
        .expectedRent,
    ).toMatchObject({
      leaseCount: 1,
      monthly: { primary: "USD 900.00" },
    });
  });

  it("excludes non-monthly terms from the monthly expected-rent forecast", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        current_leases: {
          data: [
            {
              id: "monthly-lease",
              lease_end_date: "2099-01-01",
              monthly_rent_amount: 900,
              monthly_rent_currency: "USD",
              primary_tenant_person_id: "person-1",
              property_id: "prop-1",
              unit_id: "unit-1",
            },
            {
              id: "quarterly-lease",
              lease_end_date: "2099-01-01",
              monthly_rent_amount: 3000,
              monthly_rent_currency: "USD",
              primary_tenant_person_id: "person-2",
              property_id: "prop-1",
              unit_id: "unit-2",
            },
          ],
        },
        lease_terms: {
          data: [
            {
              lease_id: "monthly-lease",
              payment_frequency: "monthly",
              rent_amount: 900,
              rent_currency: "USD",
              status: "active",
            },
            {
              lease_id: "quarterly-lease",
              payment_frequency: "quarterly",
              rent_amount: 3000,
              rent_currency: "USD",
              status: "active",
            },
            {
              lease_id: "quarterly-lease",
              payment_frequency: "monthly",
              rent_amount: 8000,
              rent_currency: "USD",
              status: "draft",
            },
          ],
        },
        properties: {
          data: [
            {
              code: "CTR",
              id: "prop-1",
              name: "Central Residence",
              rental_structure: "multi_unit",
              status: "active",
            },
          ],
        },
        units: {
          data: [
            { id: "unit-1", property_id: "prop-1", status: "occupied" },
            { id: "unit-2", property_id: "prop-1", status: "occupied" },
          ],
        },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.expectedRent).toMatchObject({
      leaseCount: 1,
      monthly: { primary: "USD 900.00" },
    });
  });

  it("returns no cash-flow points when the ledger has no activity", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(createSupabaseStub());

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(data.ledgerFlow).toEqual([]);
  });

  it("builds the six-month cash-flow series from ledger entries", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      createSupabaseStub({
        ledger_entries: {
          data: [
            {
              amount: "2045.00",
              currency: "USD",
              direction: "income",
              property_id: "prop-1",
              transaction_date: "2026-08-02",
            },
            {
              amount: "615.00",
              currency: "USD",
              direction: "expense",
              property_id: "prop-1",
              transaction_date: "2026-08-03",
            },
          ],
        },
      }),
    );

    const data = await getOverviewScreenData(
      "11111111-1111-4111-8111-111111111111",
      {
        financeView: "collections",
        lens: "all",
        month: "2026-08",
        propertyId: "all",
        review: "all",
      },
    );

    expect(data.ledgerFlow).toEqual([
      { expense: 0, href: "/ledger?dateFrom=2026-03-01&dateTo=2026-03-31&sort=date_desc", income: 0, label: "Mar", net: 0 },
      { expense: 0, href: "/ledger?dateFrom=2026-04-01&dateTo=2026-04-30&sort=date_desc", income: 0, label: "Apr", net: 0 },
      { expense: 0, href: "/ledger?dateFrom=2026-05-01&dateTo=2026-05-31&sort=date_desc", income: 0, label: "May", net: 0 },
      { expense: 0, href: "/ledger?dateFrom=2026-06-01&dateTo=2026-06-30&sort=date_desc", income: 0, label: "Jun", net: 0 },
      { expense: 0, href: "/ledger?dateFrom=2026-07-01&dateTo=2026-07-31&sort=date_desc", income: 0, label: "Jul", net: 0 },
      {
        expense: 615,
        href: "/ledger?dateFrom=2026-08-01&dateTo=2026-08-31&sort=date_desc",
        income: 2045,
        label: "Aug",
        net: 1430,
      },
    ]);
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
    lte: chain,
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
