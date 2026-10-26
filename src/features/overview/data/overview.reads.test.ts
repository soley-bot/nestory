import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOverviewScreenData } from "@/features/overview/data/overview";
import { createSupabaseServerClient } from "@/lib/db/server";
import { withFinancialReadContext } from "@/lib/finance/financial-write-context.server";
import { createOverviewFixture, fixtureOrganizationId, type OverviewFixtureResult } from "./overview.test-fixture";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({ withFinancialReadContext: vi.fn() }));

const query = { financeView: "collections", lens: "all", month: "2026-10", propertyId: "all", review: "all" } as const;
const property = { id: "property-1", code: "ONE", name: "One", rental_structure: "multi_unit" };

describe("overview complete scoped reads", () => {
  beforeEach(() => {
    vi.mocked(withFinancialReadContext).mockImplementation(async (_organizationId, read) => read({ generation: 0, status: "open", financial_start_date: null, enforced: false }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T18:00:00.000Z")); // Oct 15 in Cambodia.
  });
  afterEach(() => vi.useRealTimers());

  it("rejects an unverifiable financial session before loading dashboard amounts", async () => {
    vi.mocked(createSupabaseServerClient).mockClear();
    vi.mocked(withFinancialReadContext).mockRejectedValueOnce(new Error("Financial data changed"));
    await expect(getOverviewScreenData(fixtureOrganizationId, query)).rejects.toThrow("Financial data changed");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("starts dashboard cash history at the reset cutoff without inventing empty historical or future months", async () => {
    vi.mocked(withFinancialReadContext).mockImplementationOnce(async (_organizationId, read) => read({ generation: 3, status: "open", financial_start_date: "2026-10-01", enforced: true }));
    const fixture = createOverviewFixture({ ledger_entries: { data: [
      { id: "old", direction: "expense", amount: 2000, currency: "USD", transaction_date: "2026-09-30" },
      { id: "current", direction: "income", amount: 75, currency: "USD", transaction_date: "2026-10-02" },
    ] } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);
    const result = await getOverviewScreenData(fixtureOrganizationId, query);
    expect(result.financialGeneration).toBe(3);
    expect(result.workspaceSetup.ledgerEntryCount).toBe(1);
    expect(result.ledgerFlow).toHaveLength(1);
    expect(result.ledgerFlow[0]).toMatchObject({ label: "Oct", income: 75, expense: 0 });
    for (const request of fixture.requests.filter((request) => request.table === "ledger_entries")) {
      expect(request.filters).toContainEqual({ column: "transaction_date", operator: "gte", value: "2026-10-01" });
    }
    expect(withFinancialReadContext).toHaveBeenCalledWith(fixtureOrganizationId, expect.any(Function), "2026-10-01");
  });

  it("includes every row beyond 1,000 under a lower server cap and isolates organizations", async () => {
    const many = Array.from({ length: 1_005 }, (_, index) => String(index).padStart(5, "0"));
    const tables: Record<string, OverviewFixtureResult> = {
      properties: { data: many.map((id) => ({ ...property, id, code: "SAME" })) },
      units: { data: many.map((id) => ({ id, property_id: id, status: "occupied" })) },
      current_leases: { data: many.map((id) => ({ id, property_id: id, unit_id: id, lease_end_date: "2026-11-01", primary_tenant_person_id: id })) },
      lease_terms: { data: many.map((id) => ({ id, lease_id: id, payment_frequency: "monthly", rent_amount: 0.01, rent_currency: "USD" })) },
      people: { data: many.map((id) => ({ id, primary_email: `${id}@example.test` })) },
      person_roles: { data: many.map((id) => ({ id, person_id: id, role: "tenant" })) },
      property_owners: { data: many.map((id) => ({ id, property_id: id, is_primary: true })) },
      documents: { data: many.map((id) => ({ id, property_id: id })) },
      tasks: { data: many.map((id) => ({ id, property_id: id, title: id, due_date: null, priority: "urgent", status: "pending" })) },
      ledger_entries: { data: many.flatMap((id) => [
        { id: `income-${id}`, property_id: id, transaction_date: "2026-10-01", direction: "income", amount: 0.1, currency: "USD" },
        { id: `expense-${id}`, property_id: id, transaction_date: "2026-10-01", direction: "expense", amount: 0.01, currency: "USD" },
      ]) },
    };
    for (const table of Object.values(tables)) {
      const first = table.data?.[0] as Record<string, unknown>;
      table.data?.push(
        { ...first, id: "foreign", organization_id: "another-organization" },
        { ...first, id: "archived", archived_at: "2026-10-01T00:00:00Z" },
      );
    }
    const fixture = createOverviewFixture(tables, 137);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    const data = await getOverviewScreenData(fixtureOrganizationId, query);

    expect(data.workspaceSetup).toMatchObject({ activeLeaseCount: 1_005, ledgerEntryCount: 2_010, peopleCount: 1_005, propertyCount: 1_005, unitCount: 1_005 });
    expect(data.propertyOptions).toHaveLength(1_005);
    expect(data.occupancyByProperty).toHaveLength(1_005);
    expect(data.metrics.find((metric) => metric.label === "Occupancy")?.value).toBe("100%");
    expect(data.metrics.find((metric) => metric.label === "People")?.value).toBe("1005 / 1005 tenants");
    expect(data.metrics.find((metric) => metric.label === "Ledger net")?.value).toEqual({ primary: "USD 90.45" });
    expect(data.expectedRent).toEqual({ leaseCount: 1_005, monthly: { primary: "USD 10.05" } });
    expect(data.ledgerFlow.at(-1)).toMatchObject({ income: 100.5, expense: 10.05, net: 90.45 });
    expect(data.recordsByProperty.reduce((sum, row) => sum + row.documentCount, 0)).toBe(1_005);
    expect(data.recordsByProperty.every((row) => row.ownerLinked)).toBe(true);
    expect(data.maintenanceByProperty.reduce((sum, row) => sum + row.openCount, 0)).toBe(1_005);
    expect(data.leaseRiskCount).toBe(1_005);
    expect(data.attentionItems.find((item) => item.id === "open-maintenance")?.count).toBe(1_005);
    for (const request of fixture.requests) {
      expect(request.filters).toContainEqual({ column: "organization_id", operator: "eq", value: fixtureOrganizationId });
      if (request.from !== undefined) expect(request.orders.at(-1)).toEqual({ column: "id", ascending: true });
    }
    // The property-picker and overview share one sequence of pages.
    expect(fixture.requests.filter((request) => request.table === "properties" && request.from === 0)).toHaveLength(1);
    expect(fixture.requests.some((request) => request.table === "person_contacts")).toBe(false);
  });

  it("scopes property rows and rent terms while keeping all property-picker options", async () => {
    const leases = Array.from({ length: 105 }, (_, index) => ({
      id: `lease-${index}`, property_id: "property-1", unit_id: null,
      lease_end_date: "2027-10-01", primary_tenant_person_id: "person-1",
    }));
    const fixture = createOverviewFixture({
      properties: { data: [{ ...property, rental_structure: "single_space" }, { ...property, id: "property-2", code: "TWO", rental_structure: "single_space" }] },
      current_leases: { data: [...leases, { ...leases[0], id: "unrelated-lease", property_id: "property-2" }] },
      lease_terms: { data: [
        ...leases.map((lease) => ({ lease_id: lease.id, payment_frequency: "monthly", rent_amount: 11, rent_currency: "USD" })),
        ...Array.from({ length: 1_005 }, () => ({ lease_id: "unrelated-lease", payment_frequency: "monthly", rent_amount: 999, rent_currency: "USD" })),
      ] },
      documents: { data: [{ property_id: "property-1" }, { property_id: "property-2" }, { property_id: null }] },
      ledger_entries: { data: [
        { property_id: "property-1", transaction_date: "2026-10-01", direction: "income", amount: 12, currency: "USD" },
        { property_id: "property-2", transaction_date: "2026-10-01", direction: "income", amount: 1_000, currency: "USD" },
      ] },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);

    const data = await getOverviewScreenData(fixtureOrganizationId, { ...query, propertyId: "property-1" });

    expect(data.propertyOptions).toHaveLength(2);
    expect(data.workspaceSetup).toMatchObject({ activeLeaseCount: 105, propertyCount: 1, ledgerEntryCount: 1 });
    expect(data.expectedRent).toEqual({ leaseCount: 105, monthly: { primary: "USD 1,155.00" } });
    expect(data.ledgerFlow.at(-1)?.income).toBe(12);
    expect(data.recordsByProperty[0].documentCount).toBe(1);
    const termRequests = fixture.requests.filter((request) => request.table === "lease_terms");
    expect(termRequests.reduce((sum, request) => sum + request.returnedRows, 0)).toBe(105);
    expect(termRequests.every((request) => request.filters.some((filter) => filter.column === "lease_id" && filter.operator === "in" && (filter.value as string[]).length <= 100))).toBe(true);
    for (const table of ["units", "current_leases", "ledger_entries", "property_owners", "tasks", "documents"]) {
      expect(fixture.requests.filter((request) => request.table === table).every((request) => request.filters.some((filter) => filter.column === "property_id" && filter.value === "property-1"))).toBe(true);
    }
  });

  it("loads supplemental contacts only when primary contacts are unusable and ignores archived people's roles", async () => {
    const people = Array.from({ length: 1_005 }, (_, index) => ({ id: `person-${index}`, primary_email: index < 1_003 ? "valid@example.test" : "   " }));
    const fixture = createOverviewFixture({
      people: { data: [...people, { id: "archived-person", archived_at: "2026-01-01" }] },
      person_contacts: { data: [
        ...people.map((person) => ({ person_id: person.id, email: "extra@example.test" })),
        { person_id: "archived-person", email: "archived@example.test" },
      ] },
      person_roles: { data: [...people.map((person) => ({ person_id: person.id, role: "tenant" })), { person_id: "archived-person", role: "tenant" }] },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);
    const data = await getOverviewScreenData(fixtureOrganizationId, query);
    expect(data.attentionItems.some((item) => item.id === "missing-contact-details")).toBe(false);
    expect(data.metrics.find((metric) => metric.label === "People")?.value).toBe("1005 / 1005 tenants");
    expect(fixture.requests.filter((request) => request.table === "person_contacts").reduce((sum, request) => sum + request.returnedRows, 0)).toBe(2);
  });

  it("counts current large expenses independently of chart month, with business-date bounds", async () => {
    const fixture = createOverviewFixture({ ledger_entries: { data: [
      { transaction_date: "2026-09-15", direction: "expense", amount: 1_000 },
      { transaction_date: "2026-10-15", direction: "expense", amount: 1_100 },
      { transaction_date: "2026-09-14", direction: "expense", amount: 1_200 },
      { transaction_date: "2026-10-16", direction: "expense", amount: 1_300 },
      { transaction_date: "2026-10-15", direction: "expense", amount: 999.99 },
      { transaction_date: "2026-10-15", direction: "income", amount: 2_000 },
      { transaction_date: "2026-10-15", direction: "expense", amount: 3_000, archived_at: "2026-10-15" },
      { transaction_date: "2026-10-15", direction: "expense", amount: 4_000, organization_id: "other" },
    ] } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);
    const data = await getOverviewScreenData(fixtureOrganizationId, { ...query, month: "2025-01" });
    expect(data.ledgerFlow).toEqual([]);
    expect(data.attentionItems.find((item) => item.id === "large-recent-expenses")?.count).toBe(2);
    expect(fixture.requests.filter((request) => request.table === "ledger_entries").reduce((sum, request) => sum + request.returnedRows, 0)).toBe(0);
  });

  it("does not render partial totals when a later page fails or an exact count is unavailable", async () => {
    const fixture = createOverviewFixture({ ledger_entries: {
      data: Array.from({ length: 501 }, () => ({ transaction_date: "2026-10-01", amount: 1, direction: "income", currency: "USD" })),
      error: { message: "later page failed" }, errorAtFrom: 500,
    } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);
    await expect(getOverviewScreenData(fixtureOrganizationId, query)).rejects.toThrow("later page failed");
    vi.mocked(createSupabaseServerClient).mockResolvedValue(createOverviewFixture({ ledger_entries: { count: null } }).client);
    await expect(getOverviewScreenData(fixtureOrganizationId, query)).rejects.toThrow("exact count is missing");
  });

  it("measures bounded transfer for a long-lived synthetic portfolio", async () => {
    const fixture = createOverviewFixture({
      properties: { data: [property, { ...property, id: "property-2", code: "TWO" }] },
      ledger_entries: { data: [
        ...Array.from({ length: 20_000 }, () => ({ property_id: "property-1", transaction_date: "2020-01-01", direction: "income", amount: 1, currency: "USD" })),
        ...Array.from({ length: 1_005 }, () => ({ property_id: "property-1", transaction_date: "2026-10-01", direction: "income", amount: 1, currency: "USD" })),
      ] },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);
    const data = await getOverviewScreenData(fixtureOrganizationId, query);
    const measured = {
      requests: fixture.requests.length,
      rows: fixture.requests.reduce((sum, request) => sum + request.returnedRows, 0),
      ledgerRows: fixture.requests.filter((request) => request.table === "ledger_entries").reduce((sum, request) => sum + request.returnedRows, 0),
    };
    console.info("overview synthetic request/row counts (not latency)", measured);
    expect(data.workspaceSetup.ledgerEntryCount).toBe(21_005);
    expect(data.ledgerFlow.at(-1)?.income).toBe(1_005);
    expect(measured.ledgerRows).toBe(1_005);
    expect(measured.rows).toBe(1_007);
    expect(measured.requests).toBeLessThan(25);
  });
});
