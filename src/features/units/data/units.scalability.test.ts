import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createCappedReadHarness, type CappedReadRow } from "@/lib/db/complete-read.test-fixture";
import { parseUnitSearchParams } from "@/features/units/unit.filters";
import { getUnitDetail, getUnitPropertyOptions, getUnitsScreenData } from "./units";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/features/activity/recent-change-targets", () => ({ resolveRecentChangeTargets: async () => [] }));
const organizationId = "synthetic-org";
const scope = { organization_id: organizationId, archived_at: null };
const id = (prefix: string, index: number) => `${prefix}-${String(index).padStart(6, "0")}`;
const property = (index: number): CappedReadRow => ({ ...scope, id: id("property", index), code: id("P", index), name: "Portfolio", property_type: "Apartment", status: "active", owner: null, address: null });
const unit = (index: number, propertyId: unknown): CappedReadRow => ({ ...scope, id: id("unit", index), property_id: propertyId, unit_number: String(index), status: "vacant", current_rent_amount: index, current_rent_currency: "USD", floor: null, size_sqm: null, bedroom_count: null, bathroom_count: null });
const lease = (index: number, unitId: unknown, status = "active"): CappedReadRow => ({ ...scope, id: id("lease", index), unit_id: unitId, property_id: id("property", 1), status, tenant_name: "Tenant", primary_tenant_person_id: null, lease_start_date: "2025-01-01", lease_end_date: "2027-01-01", monthly_rent_amount: 100, monthly_rent_currency: "USD" });

beforeEach(() => vi.mocked(createSupabaseServerClient).mockReset());

describe("complete unit registers under API row caps", () => {
  it("searches and filters occupancy beyond unit 1000 using current lease evidence", async () => {
    const units = Array.from({ length: 1205 }, (_, index) => unit(index, id("property", index)));
    const target = units.at(-1)!;
    const { client, reads } = createCappedReadHarness({
      properties: Array.from({ length: 1205 }, (_, index) => property(index)),
      units: [...units, { ...target, id: "foreign-unit", organization_id: "other-org" }],
      current_leases: [lease(1, target.id), { ...lease(2, units[0].id), organization_id: "other-org" }],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getUnitsScreenData(organizationId, parseUnitSearchParams({ query: "1204", occupancy: "occupied", page: "999" }));
    expect(result.units.map(row => row.id)).toEqual([target.id]);
    expect(result.pagination).toMatchObject({ totalCount: 1, page: 1 });
    expect(result.units[0].hasActiveLease).toBe(true);
    expect(reads.every(read => read.filters.some(filter => filter.column === "organization_id" && filter.value === organizationId))).toBe(true);
    expect(reads.flatMap(read => read.filters.filter(filter => filter.method === "in")).every(filter => (filter.value as unknown[]).length <= 75)).toBe(true);
  });
  it("keeps tied rent sorting stable and returns the complete final page", async () => {
    const units = Array.from({ length: 1004 }, (_, index) => ({ ...unit(index, id("property", 1)), unit_number: "Same", current_rent_amount: 10 })).reverse();
    const { client } = createCappedReadHarness({ properties: [property(1)], units });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getUnitsScreenData(organizationId, parseUnitSearchParams({ sort: "rent_desc", page: "101" }));
    expect(result.pagination).toMatchObject({ totalCount: 1004, page: 101, from: 1001, to: 1004 });
    expect(result.units.map(row => row.id)).toEqual(Array.from({ length: 4 }, (_, index) => id("unit", 1000 + index)));
  });
  it("reads dense lease/history batches and finds quieter units' latest timeline context", async () => {
    const units = [unit(1, id("property", 1)), unit(2, id("property", 1))];
    const leases = Array.from({ length: 1001 }, (_, index) => lease(index, units[0].id, "ended"));
    leases.push({ ...lease(1001, units[1].id), lease_start_date: "2024-01-01" });
    const events = Array.from({ length: 1201 }, (_, index) => ({ ...scope, id: id("event", index), unit_id: units[0].id, event_date: "2026-01-01", event_type: "inspection", title: "Busy unit", description: null, cost_amount: null, cost_currency: null }));
    events.push({ ...events[0], id: "older-event", unit_id: units[1].id, event_date: "2025-01-01", title: "Quiet needle" });
    const ledger = Array.from({ length: 6001 }, (_, index) => ({ ...scope, id: id("entry", index), unit_id: units[1].id, transaction_date: "2026-01-01", direction: "income", category: "rent", amount: 1, currency: "USD" }));
    const { client } = createCappedReadHarness({ properties: [property(1)], units, current_leases: leases, timeline_events: events, ledger_entries: [...ledger, { ...ledger[0], id: "foreign-ledger", organization_id: "other-org", amount: 999999 }] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getUnitsScreenData(organizationId, parseUnitSearchParams({ query: "Quiet needle", occupancy: "occupied", sort: "net_desc" }));
    expect(result.units).toHaveLength(1);
    expect(result.units[0]).toMatchObject({ id: units[1].id, hasActiveLease: true, ledgerNetUsd: 6001, latestTimelineEvent: { title: "Quiet needle" } });
    const missing = await getUnitsScreenData(organizationId, parseUnitSearchParams({ leaseStatus: "missing" }));
    expect(missing.units.map(row => row.id)).toEqual([units[0].id]);
  });
  it("returns all property options under a lower configured API cap", async () => {
    const { client } = createCappedReadHarness({ properties: Array.from({ length: 1001 }, (_, index) => property(index)) }, { apiRowCap: 137 });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    expect(await getUnitPropertyOptions(organizationId)).toHaveLength(1001);
  });
  it.each(["error", "count"])("rejects a later unit page %s", async failure => {
    const { client } = createCappedReadHarness({ properties: [property(1)], units: Array.from({ length: 1001 }, (_, index) => unit(index, id("property", 1))) }, { transformResult(read, result) {
      if (read.table === "units" && (read.range?.[0] ?? 0) > 0) return failure === "error" ? { ...result, error: { message: "Synthetic page failure" } } : { ...result, count: 1002 };
      return result;
    } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    await expect(getUnitsScreenData(organizationId, parseUnitSearchParams({ sort: "rent_desc" }))).rejects.toThrow();
  });
  it("keeps full unit detail ledger totals and its twelve recent entries", async () => {
    const target = unit(1, id("property", 1));
    const ledger = Array.from({ length: 6001 }, (_, index) => ({ ...scope, id: id("entry", index), property_id: target.property_id, unit_id: target.id, transaction_date: "2026-01-01", direction: "income", category: "rent", amount: 1, currency: "USD", description: null }));
    const { client } = createCappedReadHarness({ properties: [property(1)], units: [target], ledger_entries: [...ledger, { ...ledger[0], id: "foreign-ledger", organization_id: "other-org", amount: 999999 }] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getUnitDetail(organizationId, String(target.id));
    expect(result?.ledgerNetUsd).toBe(6001);
    expect(result?.counts.ledgerEntries).toBe(6001);
    expect(result?.recentLedgerEntries).toHaveLength(12);
    expect(result?.recentLedgerEntries[0].id).toBe(id("entry", 6000));
  });
  it.each(["missing data", "missing count", "short page", "changing count"])("fails closed for a paged register with %s", async failure => {
    const { client } = createCappedReadHarness({ properties: [property(1)], units: Array.from({ length: 12 }, (_, index) => unit(index, id("property", 1))) }, { transformResult(read, result) {
      if (read.table !== "units") return result;
      if (failure === "missing data") return { ...result, data: null, count: 0 };
      if (failure === "missing count") return { ...result, count: null };
      if (failure === "short page") return { ...result, data: result.data?.slice(0, 1) ?? [] };
      return read.range?.[0] === 10 ? { ...result, count: 13 } : result;
    } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    await expect(getUnitsScreenData(organizationId, parseUnitSearchParams(failure === "changing count" ? { page: "999" } : {}))).rejects.toThrow();
  });
});
