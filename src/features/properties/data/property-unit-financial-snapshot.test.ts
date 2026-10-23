import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ from, rpc }) }));
vi.mock("@/features/photos/data/photos", () => ({
  getAssetPhotosForScope: async () => [],
  getPropertyPhotoThumbnailUrls: async () => new Map(),
  getUnitPhotoThumbnailUrls: async () => new Map(),
}));
vi.mock("@/features/activity/recent-change-targets", () => ({ resolveRecentChangeTargets: async () => [] }));
import { getPropertiesScreenData, getPropertyDetail, getPropertySummaries } from "./properties";
import { getUnitDetail, getUnitsScreenData } from "@/features/units/data/units";

const context = { generation: 2, status: "open", financial_start_date: "2026-10-01", enforced: true };
const property = { id: "property", name: "Synthetic property", code: "SYN", property_type: "House", address: null, owner: null, status: "active", archived_at: null, rental_structure: "multi_unit" };
const unit = { id: "unit", property_id: property.id, unit_number: "1A", status: "vacant", archived_at: null, current_rent_amount: 500, current_rent_currency: "USD", property };

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  rpc.mockImplementation(async (name) => ({ data: name === "get_financial_write_context" ? context : { context, source_revision: "4" }, error: null }));
  from.mockImplementation((table) => {
    const rows = table === "properties" ? [property] : table === "units" ? [unit] : [];
    const result = { data: rows, count: rows.length, error: null };
    const chain = {
      select: () => chain, eq: () => chain, is: () => chain, in: () => chain,
      not: () => chain, order: () => chain, limit: () => chain, range: () => chain,
      maybeSingle: async () => ({ ...result, data: rows[0] ?? null }),
      then: Promise.resolve(result).then.bind(Promise.resolve(result)),
    };
    return chain;
  });
});

const readers = [
  ["property register", () => getPropertiesScreenData("org")],
  ["property summary", () => getPropertySummaries("org")],
  ["property detail", () => getPropertyDetail("org", "property")],
  ["unit register", () => getUnitsScreenData("org")],
  ["unit detail", () => getUnitDetail("org", "unit")],
] as const;

describe("property and unit financial snapshots", () => {
  it.each(readers)("rejects %s before querying financial sources when frozen", async (_name, read) => {
    const frozen = { ...context, status: "frozen" };
    rpc.mockResolvedValue({ data: { context: frozen, source_revision: "4" } });
    rpc.mockImplementation(async (name) => ({ data: name === "get_financial_write_context" ? frozen : { context: frozen, source_revision: "4" } }));
    await expect(read()).rejects.toThrow("paused");
    expect(from).not.toHaveBeenCalled();
  });

  it.each(readers)("rejects %s when sources change while its related records load", async (_name, read) => {
    let checks = 0;
    rpc.mockImplementation(async (name) => ({ data: name === "get_financial_write_context" ? context : { context, source_revision: String(++checks + 3) } }));
    await expect(read()).rejects.toThrow("changed while");
    expect(from).toHaveBeenCalled();
  });

  it("stamps property/unit list payloads and detail records with the verified generation", async () => {
    const properties = await getPropertiesScreenData("org");
    const units = await getUnitsScreenData("org");
    expect(properties.financialGeneration).toBe(2);
    expect(properties.properties[0].financialGeneration).toBe(2);
    expect(units.financialGeneration).toBe(2);
    expect(units.units[0].financialGeneration).toBe(2);
    expect((await getPropertyDetail("org", "property"))?.financialGeneration).toBe(2);
    expect((await getUnitDetail("org", "unit"))?.financialGeneration).toBe(2);
  });
});
