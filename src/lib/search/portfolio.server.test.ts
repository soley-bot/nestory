import { describe, expect, it } from "vitest";
import { loadPortfolioSearch } from "./portfolio.server";
import { createCappedReadHarness } from "@/lib/db/complete-read.test-fixture";

type Row = Record<string, unknown>;
function clientFor(tables: Record<string, Row[]>, fail = "") {
  return createCappedReadHarness(tables, { transformResult: (read, result) => read.table === fail ? { ...result, error: { message: "unavailable" } } : result });
}
describe("portfolio search context", () => {
  it("reads beyond the first response page and keeps owner links within the organization", async () => {
    const common = {organization_id: "org1", archived_at: null};
    const {client, reads} = clientFor({
      properties: [{...common, id: "p1", code: "PM-1", name: "North", owner: null}],
      units: Array.from({length: 501}, (_, i) => ({...common, id: `u${i}`, property_id: "p1", unit_number: `Suite ${i}`})),
      property_owners: [
        {...common, id: "o1", property_id: "p1", person_id: "person1", ended_on: null, person: {display_name: "Current Owner", legal_name: "Legal Name"}},
        {...common, id: "o2", property_id: "p1", person_id: "person2", ended_on: "2025-01-01", person: {display_name: "Former Owner"}},
        {...common, organization_id: "other", id: "o3", property_id: "p1", person_id: "person3", ended_on: null, person: {display_name: "Other Company"}},
      ],
    });
    const portfolio = await loadPortfolioSearch(client as never, "org1");
    expect(portfolio.matchesProperty("Suite 500 Legal", "p1")).toBe(true);
    expect(portfolio.matchesProperty("Former", "p1")).toBe(false);
    expect(portfolio.matchesProperty("Other", "p1")).toBe(false);
    expect(portfolio.ownerIds("Suite 500")).toEqual(["person1"]);
    expect(reads.every(read => read.filters.some(filter => filter.column === "organization_id" && filter.value === "org1"))).toBe(true);
    expect(reads.some(read => read.table === "units" && read.range?.[0] === 500)).toBe(true);
  });
  it("reports unavailable owner context instead of silently claiming there are no matches", async () => {
    const {client} = clientFor({}, "property_owners");
    await expect(loadPortfolioSearch(client as never, "org1")).rejects.toThrow("Could not load");
  });
  it("reads more than 10000 units even when the API returns fewer rows than requested", async () => {
    const common = { organization_id: "org1", archived_at: null };
    const { client } = createCappedReadHarness({
      properties: [{ ...common, id: "p1", code: "P1", name: "North", owner: null }],
      units: Array.from({ length: 10001 }, (_, index) => ({ ...common, id: `unit-${String(index).padStart(6, "0")}`, property_id: "p1", unit_number: `Suite ${index}` })),
    }, { apiRowCap: 137 });
    const portfolio = await loadPortfolioSearch(client as never, "org1");
    expect(portfolio.matchesProperty("Suite 10000", "p1")).toBe(true);
  });
  it("rejects a changing count on a later search context page", async () => {
    const { client } = createCappedReadHarness({ units: Array.from({ length: 501 }, (_, index) => ({ organization_id: "org1", id: `unit-${String(index).padStart(6, "0")}`, property_id: "p1", unit_number: String(index) })) }, {
      transformResult: (read, result) => read.table === "units" && (read.range?.[0] ?? 0) > 0 ? { ...result, count: 502 } : result,
    });
    await expect(loadPortfolioSearch(client as never, "org1")).rejects.toThrow("count changed");
  });
});
