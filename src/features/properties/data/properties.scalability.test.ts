import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/db/server";
import { createCappedReadHarness, type CappedReadRow } from "@/lib/db/complete-read.test-fixture";
import { parsePropertySearchParams } from "@/features/properties/property.filters";
import { getPropertiesScreenData, getPropertyDetail, getPropertySummaries } from "./properties";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/features/activity/recent-change-targets", () => ({ resolveRecentChangeTargets: async () => [] }));

const organizationId = "synthetic-org";
const scope = { organization_id: organizationId, archived_at: null };
const id = (prefix: string, index: number) => `${prefix}-${String(index).padStart(6, "0")}`;
const property = (index: number): CappedReadRow => ({ ...scope, id: id("property", index), code: id("P", index), name: "Portfolio", property_type: "Apartment", status: "active", owner: null, address: null, rental_structure: "units" });
const unit = (index: number, propertyId: unknown): CappedReadRow => ({ ...scope, id: id("unit", index), property_id: propertyId, unit_number: String(index), status: "vacant" });

beforeEach(() => vi.mocked(createSupabaseServerClient).mockReset());

describe("complete property registers under API row caps", () => {
  it("searches related units and owners beyond property 1000 with exact filtered totals", async () => {
    const properties = Array.from({ length: 1205 }, (_, index) => property(index));
    const target = properties.at(-1)!;
    const { client, reads } = createCappedReadHarness({
      properties: [...properties, { ...property(9999), organization_id: "other-org", name: "Secret" }],
      units: [unit(1, target.id)],
      property_owners: [{ ...scope, id: "owner-link", property_id: target.id, person_id: "person", is_primary: true, ended_on: null, ownership_percent: 100, started_on: "2026-01-01", person: { display_name: "Target Owner", legal_name: null } }],
      people: [{ ...scope, id: "person", display_name: "Target Owner" }],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getPropertiesScreenData(organizationId, parsePropertySearchParams({ query: "Target Owner", sort: "net_desc", page: "999" }));
    expect(result.properties.map(row => row.id)).toEqual([target.id]);
    expect(result.pagination).toMatchObject({ totalCount: 1, page: 1, from: 1, to: 1 });
    expect(reads.every(read => read.filters.some(filter => filter.column === "organization_id" && filter.value === organizationId))).toBe(true);
    expect(reads.filter(read => read.filters.some(filter => filter.method === "in")).every(read => read.filters.filter(filter => filter.method === "in").every(filter => (filter.value as unknown[]).length <= 75))).toBe(true);
  });

  it("counts all units/current leases and sums 36017 ledger rows for one dense property", async () => {
    const target = property(1);
    const units = Array.from({ length: 1201 }, (_, index) => unit(index, target.id));
    const leases = units.map((row, index) => ({ ...scope, id: id("lease", index), property_id: target.id, unit_id: row.id, status: "active" }));
    const ledger = Array.from({ length: 36017 }, (_, index) => ({ ...scope, id: id("entry", index), property_id: target.id, direction: "income", amount: 1, currency: "USD" }));
    const { client } = createCappedReadHarness({
      properties: [target], units, current_leases: leases,
      ledger_entries: [...ledger, { ...ledger[0], id: "other-entry", organization_id: "other-org", amount: 999999 }],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const [result] = await getPropertySummaries(organizationId);
    expect(result).toMatchObject({ units: 1201, occupiedUnits: 1201, currentLeaseCount: 1201, currentLeaseUnitCount: 1201, unitsWithoutCurrentLease: 0, netIncomeUsd: 36017 });
  });

  it("keeps owner exclusion complete when there are more than 1000 primary links", async () => {
    const properties = Array.from({ length: 1002 }, (_, index) => property(index));
    const { client } = createCappedReadHarness({
      properties,
      property_owners: properties.slice(0, -1).map((row, index) => ({ ...scope, id: id("owner", index), property_id: row.id, person_id: "person", is_primary: true, ended_on: null, ownership_percent: 100, started_on: "2026-01-01" })),
      people: [{ ...scope, id: "person", display_name: "Owner" }],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getPropertiesScreenData(organizationId, parsePropertySearchParams({ ownerStatus: "missing" }));
    expect(result.properties.map(row => row.id)).toEqual([properties.at(-1)!.id]);
    expect(result.pagination.totalCount).toBe(1);
  });
  it("evaluates missing leases and negative net from rows after the cap", async () => {
    const target = property(1);
    const units = Array.from({ length: 1201 }, (_, index) => unit(index, target.id));
    const ledger = Array.from({ length: 5001 }, (_, index) => ({ ...scope, id: id("entry", index), property_id: target.id, direction: "income", amount: 1, currency: "USD" }));
    const { client } = createCappedReadHarness({
      properties: [target], units,
      current_leases: units.slice(0, -1).map((row, index) => ({ ...scope, id: id("lease", index), property_id: target.id, unit_id: row.id, status: "active" })),
      ledger_entries: [...ledger, { ...ledger[0], id: "last-expense", direction: "expense", amount: 6001 }],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getPropertiesScreenData(organizationId, parsePropertySearchParams({ leaseStatus: "missing", netStatus: "negative" }));
    expect(result.pagination.totalCount).toBe(1);
    expect(result.properties[0]).toMatchObject({ id: target.id, unitsWithoutCurrentLease: 1, netIncomeUsd: -1000 });
    expect((await getPropertiesScreenData(organizationId, parsePropertySearchParams({ leaseStatus: "current" }))).pagination.totalCount).toBe(0);
  });

  it("keeps derived sorting and tied page boundaries stable after the first thousand", async () => {
    const properties = Array.from({ length: 1004 }, (_, index) => ({ ...property(index), code: "Same", name: "Same" })).reverse();
    const { client } = createCappedReadHarness({ properties });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getPropertiesScreenData(organizationId, parsePropertySearchParams({ sort: "net_desc", page: "101" }));
    expect(result.pagination).toMatchObject({ totalCount: 1004, page: 101, from: 1001, to: 1004 });
    expect(result.properties.map(row => row.id)).toEqual(Array.from({ length: 4 }, (_, index) => id("property", 1000 + index)));
  });

  it("does not mark a property missing photos when a dense neighbor filled the first response", async () => {
    const properties = [property(1), property(2)];
    const photos = Array.from({ length: 1001 }, (_, index) => ({ ...scope, id: id("photo", index), property_id: properties[0].id, unit_id: null, is_cover: false, uploaded_at: "2026-01-01", storage_path: `photo-${index}` }));
    photos.push({ ...photos[0], id: "last-photo", property_id: properties[1].id, uploaded_at: "2025-01-01", storage_path: "last-photo" });
    const { client } = createCappedReadHarness({ properties, asset_photos: photos });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getPropertiesScreenData(organizationId, parsePropertySearchParams({ review: "missing_photos" }));
    expect(result.properties).toEqual([]);
    expect(result.pagination.totalCount).toBe(0);
  });

  it.each(["error", "count"])("fails closed on a later ledger page %s", async (failure) => {
    const target = property(1);
    const { client } = createCappedReadHarness({
      properties: [target], ledger_entries: Array.from({ length: 1001 }, (_, index) => ({ ...scope, id: id("ledger", index), property_id: target.id, amount: 1, currency: "USD", direction: "income" })),
    }, { transformResult(read, result) {
      if (read.table === "ledger_entries" && (read.range?.[0] ?? 0) > 0) return failure === "error" ? { ...result, data: null, error: { message: "Synthetic later page failure" } } : { ...result, count: 1002 };
      return result;
    } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    await expect(getPropertySummaries(organizationId)).rejects.toThrow();
  });
  it("keeps full detail ledger totals while preserving the eight recent entries", async () => {
    const target = property(1);
    const ledger = Array.from({ length: 6001 }, (_, index) => ({ ...scope, id: id("entry", index), property_id: target.id, unit_id: null, transaction_date: "2026-01-01", direction: "income", category: "rent", amount: 1, currency: "USD", description: null }));
    const { client } = createCappedReadHarness({ properties: [target], ledger_entries: [...ledger, { ...ledger[0], id: "foreign-entry", organization_id: "other-org", amount: 999999 }] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    const result = await getPropertyDetail(organizationId, String(target.id));
    expect(result?.netIncomeUsd).toBe(6001);
    expect(result?.counts.ledgerEntries).toBe(6001);
    expect(result?.recentLedgerEntries).toHaveLength(8);
    expect(result?.recentLedgerEntries[0].id).toBe(id("entry", 6000));
  });
  it("carries the relation budget across property ID batches", async () => {
    const properties = Array.from({ length: 76 }, (_, index) => property(index));
    const { client } = createCappedReadHarness({ properties, ledger_entries: properties.map((row, index) => ({ ...scope, id: id("ledger", index), property_id: row.id, amount: 1, currency: "USD", direction: "income" })) }, { transformResult(read, result) {
      return read.table === "ledger_entries" && read.filters.some(filter => filter.method === "in" && Array.isArray(filter.value) && filter.value.includes(properties[75].id)) ? { ...result, count: 99926 } : result;
    } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    await expect(getPropertySummaries(organizationId)).rejects.toThrow("supported 99925 rows");
  });
  it.each(["missing data", "missing count", "short page", "changing count"])("fails closed for a paged register with %s", async failure => {
    const { client } = createCappedReadHarness({ properties: Array.from({ length: 12 }, (_, index) => property(index)) }, { transformResult(read, result) {
      if (read.table !== "properties") return result;
      if (failure === "missing data") return { ...result, data: null, count: 0 };
      if (failure === "missing count") return { ...result, count: null };
      if (failure === "short page") return { ...result, data: result.data?.slice(0, 1) ?? [] };
      return read.range?.[0] === 10 ? { ...result, count: 13 } : result;
    } });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    await expect(getPropertiesScreenData(organizationId, parsePropertySearchParams(failure === "changing count" ? { page: "999" } : {}))).rejects.toThrow();
  });
});
