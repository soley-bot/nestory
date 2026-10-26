import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createCappedReadHarness } from "./financial-capped-read.test-fixture";
import { getPropertyDetail } from "./properties";
import { getUnitDetail } from "@/features/units/data/units";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/features/activity/recent-change-targets", () => ({ resolveRecentChangeTargets: async () => [] }));
beforeEach(() => vi.mocked(createSupabaseServerClient).mockReset());
afterEach(() => vi.useRealTimers());

describe("detail maintenance counts", () => {
  it.each(["property", "unit"])("uses workspace midnight for %s overdue counts and the shared default when omitted", async kind => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T17:30:00Z"));
    const scope = { organization_id: "org", property_id: "property", unit_id: "unit", archived_at: null };
    const { client, reads } = createCappedReadHarness({
      properties: [{ ...scope, id: "property", name: "Property", code: "P", status: "active", property_type: "Apartment" }],
      units: [{ ...scope, id: "unit", unit_number: "1", status: "vacant" }],
      property_owners: [{ ...scope, id: "owner-link", person_id: "owner", is_primary: true, ended_on: null, started_on: "2026-01-01", ownership_percent: 100 }],
      people: [{ ...scope, id: "owner", display_name: "Owner" }],
      current_leases: [{ ...scope, id: "lease", tenant_name: "Tenant", status: "active", monthly_rent_amount: 100, monthly_rent_currency: "USD", lease_start_date: "2026-01-01", lease_end_date: "2027-01-01" }],
      ledger_entries: [{ ...scope, id: "income", transaction_date: "2026-10-23", direction: "income", category: "rent", amount: 100, currency: "USD", description: null }],
      tasks: [{ ...scope, id: "task", status: "open", due_date: "2026-10-23", title: "Repair", category: "repair", priority: "normal" }],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    for (const [operationalTimezone, expected] of [["Asia/Phnom_Penh", 1], ["UTC", 0], [undefined, 1]] as const) {
      const result = kind === "property"
        ? await getPropertyDetail("org", "property", { operationalTimezone })
        : await getUnitDetail("org", "unit", { operationalTimezone });
      expect(result?.counts.overdueMaintenanceCases).toBe(expected);
      expect(result?.financialGeneration).toBe(2);
      const action = result && ("nextAction" in result ? result.nextAction : result.repairAction);
      expect(action?.label).toBe(expected ? "Review overdue issue" : "Review open issue");
    }
    expect(reads.flatMap(read => read.filters.filter(filter => filter.method === "lt" && filter.column === "due_date")).map(filter => filter.value)).toEqual(["2026-10-24", "2026-10-23", "2026-10-24"]);
  });
  it.each(["property", "unit"])("counts all %s cases independently of the preview", async kind => {
    const scope = { organization_id: "org", property_id: "property", unit_id: "unit", archived_at: null };
    const closed = Array.from({ length: 50 }, (_, index) => ({ ...scope, id: `closed-${index}`, status: "completed", due_date: "1999-01-01", title: "Closed", category: "repair", priority: "normal" }));
    const open = Array.from({ length: 1001 }, (_, index) => ({ ...closed[0], id: `open-${index}`, status: "open", due_date: "2000-01-01" }));
    const { client, reads } = createCappedReadHarness({
      properties: [{ ...scope, id: "property", name: "Property", code: "P", status: "active", property_type: "Apartment" }],
      units: [{ ...scope, id: "unit", unit_number: "1", status: "vacant" }],
      tasks: [...closed, ...open, { ...open[0], id: "future", due_date: "9999-01-01" }, { ...open[0], id: "undated", due_date: null }, { ...open[0], id: "archived", archived_at: "2001-01-01" }, { ...open[0], id: "foreign", organization_id: "other" }, { ...open[0], id: "other-scope", property_id: "other", unit_id: "other" }],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = kind === "property" ? await getPropertyDetail("org", "property") : await getUnitDetail("org", "unit");
    expect(result?.counts).toMatchObject({ maintenanceCases: 1053, openMaintenanceCases: 1003, overdueMaintenanceCases: 1001 });
    expect(result?.healthIndicators.find(row => row.id === "open-maintenance")?.label).toBe("Maintenance overdue");
    expect(result?.recentMaintenanceCases.length).toBeLessThanOrEqual(8);
    expect(reads.filter(read => read.table === "tasks" && read.select === "id").every(read => read.returnedRows === 0)).toBe(true);
  });

  it("fails closed when an authoritative count is unavailable", async () => {
    const { client } = createCappedReadHarness({ properties: [{ id: "property", organization_id: "org" }] }, { transformResult(read, result) {
      return read.table === "tasks" && read.select === "id" ? { ...result, count: null } : result;
    } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    await expect(getPropertyDetail("org", "property")).rejects.toThrow("Exact count unavailable");
  });
});
