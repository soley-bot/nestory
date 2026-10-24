import { beforeEach, describe, expect, it, vi } from "vitest";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ from }) }));
vi.mock("@/lib/search/portfolio.server", () => ({ loadPortfolioSearch: vi.fn() }));
vi.mock("@/features/photos/data/photos", () => ({
  getAssetPhotosForScope: async () => [],
  getPropertyPhotoThumbnailUrls: async () => new Map(),
}));
vi.mock("@/features/activity/recent-change-targets", () => ({ resolveRecentChangeTargets: async () => [] }));
import { getPropertyDetail, getPropertySummaries } from "./properties";

const property = {
  id: "10000000-0000-4000-8000-000000000001", name: "Property", code: "PROP", property_type: "House",
  address: null, owner: null, status: "active", edit_version: "20000000-0000-4000-8000-000000000001",
};
const owner = {
  id: "owner-link", property_id: property.id, person_id: "owner", is_primary: true,
  ownership_percent: 100, started_on: "2026-01-01", ended_on: null, archived_at: null,
};

function query(result: Promise<unknown>) {
  const countedResult = result.then(value => {
    const response = value as { data: unknown };
    return { ...response, count: Array.isArray(response.data) ? response.data.length : 0 };
  });
  const chain = {
    select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain),
    in: vi.fn(() => chain), not: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    maybeSingle: () => result,
    then: countedResult.then.bind(countedResult),
  };
  return chain;
}

beforeEach(() => from.mockReset());

describe("property editor snapshot reads", () => {
  it("reads ownership only after the detail's property version has arrived", async () => {
    let resolveProperty!: (result: unknown) => void;
    const propertyRead = new Promise((resolve) => { resolveProperty = resolve; });
    from.mockImplementation((table) => query(table === "properties" ? propertyRead : Promise.resolve({
      data: table === "property_owners" ? [owner] : table === "people" ? [{ id: "owner", display_name: "Owner" }] : [],
      error: null,
    })));
    const request = getPropertyDetail("organization", property.id);
    await Promise.resolve();
    expect(from).toHaveBeenCalledWith("properties");
    expect(from).not.toHaveBeenCalledWith("property_owners");
    resolveProperty({ data: property, error: null });
    const detail = await request;
    expect(detail?.editVersion).toBe(property.edit_version);
    expect(detail?.formValues).toMatchObject({ ownerPersonId: "owner", ownerStartedOn: "2026-01-01", ownershipPercent: "100.000" });
  });

  it("does not reuse pre-filter ownership with a newer property snapshot", async () => {
    let ownerReads = 0;
    from.mockImplementation((table) => {
      const data = table === "properties" ? [property]
        : table === "property_owners" ? (++ownerReads === 1 ? [] : [owner])
          : table === "people" ? [{ id: "owner", display_name: "Owner" }] : [];
      return query(Promise.resolve({ data, error: null }));
    });
    expect(await getPropertySummaries("organization", { ownerStatus: "missing" })).toEqual([]);
    expect(ownerReads).toBe(2);
  });
});
