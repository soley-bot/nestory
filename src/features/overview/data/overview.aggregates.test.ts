import { describe, expect, it, vi } from "vitest";
import { createOverviewFixture, fixtureOrganizationId } from "./overview.test-fixture";
import { getOverviewScreenData } from "./overview";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({
  withFinancialReadContext: vi.fn(async (_id, read) => read({ generation: 7, financial_start_date: null })),
}));

describe("overview database summaries", () => {
  it("transfers aggregate buckets and six attention records instead of 1205 tasks and 10005 ledger entries", async () => {
    const fixture = createOverviewFixture({
      properties: { data: [{ id: "property-1", code: "P1", name: "Large portfolio", rental_structure: "multi_unit" }] },
      tasks: { data: Array.from({ length: 1205 }, (_, i) => ({ id: `task-${i}`, property_id: "property-1", status: "pending", priority: "high", title: `Task ${i}`, due_date: "2026-10-01" })) },
      ledger_entries: { data: Array.from({ length: 10005 }, () => ({ property_id: "property-1", transaction_date: "2026-10-01", amount: 1, currency: "USD", direction: "income" })) },
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture.client);
    const data = await getOverviewScreenData(fixtureOrganizationId, { financeView: "collections", lens: "all", month: "2026-10", propertyId: "all", review: "all" });
    expect(data.maintenanceByProperty[0]).toMatchObject({ openCount: 1205, urgentCount: 1205 });
    expect(data.maintenanceByProperty[0].cases).toHaveLength(6);
    expect(data.ledgerFlow.at(-1)?.income).toBe(10005);
    expect(data.financialGeneration).toBe(7);
    expect(fixture.requests.filter(request => ["tasks", "ledger_entries", "units", "current_leases", "people", "person_roles", "person_contacts", "documents", "property_owners", "lease_terms"].includes(request.table))).toEqual([]);
  });
});
