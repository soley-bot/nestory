import { describe, expect, it, vi } from "vitest";
import { getPropertiesScreenData } from "@/features/properties/data/properties";
import { getUnitsScreenData } from "@/features/units/data/units";
import { parseUnitSearchParams } from "@/features/units/unit.filters";
import { parsePropertySearchParams, PROPERTY_PAGE_SIZE_OPTIONS } from "@/features/properties/property.filters";
import { parseMaintenanceSearchParams } from "@/features/maintenance/maintenance.filters";
import { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/features/photos/data/photos", () => ({
  getUnitPhotoThumbnailUrls: vi.fn(async () => new Map()),
  getPropertyPhotoThumbnailUrls: vi.fn(async () => new Map()),
  getAssetPhotosForScope: vi.fn(),
}));

function fixture({ empty = false, error = false, properties = false, wait = Promise.resolve() } = {}) {
  const reads: { table: string; filters: [string, unknown][]; ids: string[]; range?: number[]; rows?: number }[] = [];
  const rows = Array.from({ length: empty ? 0 : 120 }, (_, index) => ({
    id: `unit-${index}`, property_id: "property-1", unit_number: String(index),
    status: index % 2 ? "occupied" : "vacant", archived_at: null,
    current_rent_amount: null, current_rent_currency: "USD", floor: null,
    size_sqm: null, bedroom_count: null, bathroom_count: null,
    property: { id: "property-1", code: "P1", name: "Synthetic property" },
  }));
  const client = { from(table: string) {
    const read: (typeof reads)[number] = { table, filters: [], ids: [] };
    reads.push(read);
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { read.filters.push([key, value]); return query; },
      is() { return query; }, not() { return query; }, order() { return query; }, limit() { return query; },
      in(key: string, values: string[]) { if (key === "unit_id") read.ids = values; return query; },
      range(from: number, to: number) { read.range = [from, to]; return query; },
      async then(resolve: (value: unknown) => unknown) {
        if (table !== (properties ? "properties" : "units")) return resolve({ data: [], error: null });
        await wait;
        let data = properties ? rows.map(row => ({ ...row, id: row.id.replace("unit", "property"), name: "Synthetic property", code: row.unit_number, property_type: "Apartment", owner: null, address: null, registered_date: null, rental_structure: "units", acquisition_date: null, notes: null })) : rows;
        const status = read.filters.find(([key]) => key === "status")?.[1];
        if (status) data = data.filter(row => row.status === status);
        const count = data.length;
        if (read.range) data = data.slice(read.range[0], read.range[1] + 1);
        read.rows = data.length;
        return resolve({ data, count, error: error ? { message: "Synthetic failure" } : null });
      },
    };
    return query;
  } };
  return { reads, client: client as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>> };
}

describe("visible list loading", () => {
  it("defaults all three registers to ten and preserves explicit sizes", () => {
    for (const parse of [parseUnitSearchParams, parsePropertySearchParams, parseMaintenanceSearchParams]) {
      expect(parse({}).pageSize).toBe(10);
      for (const size of [10, 25, 50, 100]) expect(parse({ pageSize: String(size) }).pageSize).toBe(size);
      expect(parse({ pageSize: "999" }).pageSize).toBe(10);
    }
    expect(PROPERTY_PAGE_SIZE_OPTIONS).toContain(10);
  });

  it("measures the former 50-row default against the ten-row initial database range", async () => {
    for (const size of [50, 10]) {
      const stub = fixture();
      vi.mocked(createSupabaseServerClient).mockResolvedValue(stub.client);
      const result = await getUnitsScreenData("synthetic-org", size === 50 ? parseUnitSearchParams({ pageSize: "50" }) : parseUnitSearchParams({}));
      expect(result.units).toHaveLength(size);
      expect(result.pagination.totalCount).toBe(120);
      expect(stub.reads[0].range).toEqual([0, size - 1]);
      expect(stub.reads[0].rows).toBe(size);
      expect(stub.reads).toHaveLength(6);
      const relations = stub.reads.filter(read => read.ids.length);
      expect(relations.length).toBeGreaterThan(0);
      expect(relations.every(read => read.ids.length === size)).toBe(true);
      expect(stub.reads.every(read => read.filters.some(([key, value]) => key === "organization_id" && value === "synthetic-org"))).toBe(true);
      expect(relations).toHaveLength(4);
    }
  });

  it("ranges properties before hydrating their summaries", async () => {
    for (const size of [50, 10]) {
      const stub = fixture({ properties: true });
      vi.mocked(createSupabaseServerClient).mockResolvedValue(stub.client);
      const result = await getPropertiesScreenData("synthetic-org", size === 50 ? parsePropertySearchParams({ pageSize: "50" }) : parsePropertySearchParams({}));
      expect(result.properties).toHaveLength(size);
      expect(result.pagination.totalCount).toBe(120);
      expect(stub.reads[0].range).toEqual([0, size - 1]);
      expect(stub.reads[0].rows).toBe(size);
    }
  });

  it("keeps filtered totals, page bounds and relationship scope", async () => {
    const stub = fixture();
    vi.mocked(createSupabaseServerClient).mockResolvedValue(stub.client);
    const result = await getUnitsScreenData("synthetic-org", parseUnitSearchParams({ status: "vacant", page: "2" }));
    expect(result.pagination).toMatchObject({ page: 2, from: 11, to: 20, totalCount: 60, totalPages: 6 });
    expect(result.units.map(row => row.id)).toEqual(Array.from({ length: 10 }, (_, index) => `unit-${20 + index * 2}`));
    expect(stub.reads[0].range).toEqual([10, 19]);
  });

  it("does no relationship reads for an empty result", async () => {
    const stub = fixture({ empty: true });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(stub.client);
    const result = await getUnitsScreenData("synthetic-org");
    expect(result.units).toEqual([]);
    expect(result.pagination).toMatchObject({ from: 0, to: 0, totalCount: 0 });
    expect(stub.reads).toHaveLength(1);
  });

  it("propagates errors and allows a fresh retry", async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture({ error: true }).client);
    await expect(getUnitsScreenData("synthetic-org")).rejects.toThrow("Synthetic failure");
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fixture().client);
    expect((await getUnitsScreenData("synthetic-org")).units).toHaveLength(10);
  });

  it("keeps pending and newer filtered requests independent when the older result finishes last", async () => {
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(createSupabaseServerClient).mockResolvedValueOnce(fixture({ wait }).client).mockResolvedValueOnce(fixture().client);
    const oldRequest = getUnitsScreenData("synthetic-org");
    let settled = false;
    void oldRequest.then(() => { settled = true; });
    const newer = await getUnitsScreenData("synthetic-org", parseUnitSearchParams({ status: "occupied" }));
    expect(settled).toBe(false);
    expect(newer.pagination.totalCount).toBe(60);
    release();
    expect((await oldRequest).pagination.totalCount).toBe(120);
    expect(newer.units.every(row => row.statusValue === "occupied")).toBe(true);
  });
});
