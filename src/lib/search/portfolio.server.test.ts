import { describe, expect, it } from "vitest";
import { loadPortfolioSearch } from "./portfolio.server";

type Row = Record<string, unknown>;
function clientFor(tables: Record<string, Row[]>, fail = "") {
  const reads: {table: string; from: number; to: number; organization: unknown}[] = [];
  return { reads, client: { from(table: string) {
    const filters: [string, unknown][] = [];
    const builder = {
      select: () => builder,
      order: () => builder,
      eq(column: string, value: unknown) { filters.push([column, value]); return builder; },
      is(column: string, value: unknown) { filters.push([column, value]); return builder; },
      async range(from: number, to: number) {
        reads.push({table, from, to, organization: filters.find(([column]) => column === "organization_id")?.[1]});
        return {data: (tables[table] ?? []).filter(row => filters.every(([column, value]) => row[column] === value)).slice(from, to + 1), error: table === fail ? {message: "unavailable"} : null};
      },
    };
    return builder;
  } } };
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
    expect(reads.every(read => read.organization === "org1")).toBe(true);
    expect(reads.some(read => read.table === "units" && read.from === 500)).toBe(true);
  });
  it("reports unavailable owner context instead of silently claiming there are no matches", async () => {
    const {client} = clientFor({}, "property_owners");
    await expect(loadPortfolioSearch(client as never, "org1")).rejects.toThrow("Could not load");
  });
});
