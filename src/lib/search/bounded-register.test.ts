import { describe, expect, it, vi } from "vitest";
import { needsBoundedSearch, readBoundedSearch } from "./bounded-register";
import { createPortfolioSearch } from "./portfolio";

const properties = Array.from({ length: 1200 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  code: `A-${index}`, name: "Apartment", ownerNames: ["Shared Owner"],
}));
const portfolio = createPortfolioSearch(properties, []);

describe("bounded register search", () => {
  it("keeps short queries in the database", async () => {
    const result = { data: [{ id: "row" }], error: null, count: 1 };
    const fetch = vi.fn(async () => result);
    expect(await readBoundedSearch(['title.ilike."%roof%"'], fetch, 20, 39)).toBe(result);
    expect(fetch).toHaveBeenCalledWith(20, 39, ['title.ilike."%roof%"']);
  });

  it("counts every broad portfolio match and pages after filtering, preserving source order", async () => {
    const rows = properties.map((property, index) => ({ id: `row-${index}`, property_id: property.id, title: index % 2 ? "Roof" : "Other" }));
    const groups = portfolio.groups("shared roof", ["title"]);
    expect(needsBoundedSearch(groups)).toBe(true);
    const fetch = vi.fn(async (from: number, to: number, filters: string[]) => {
      expect(filters).toEqual([]);
      expect(to - from).toBeLessThan(500);
      return { data: rows.slice(from, to + 1), error: null, count: rows.length };
    });
    const result = await readBoundedSearch(groups, fetch, 550, 559);
    expect(result.count).toBe(600);
    expect(result.data.map(row => row.id)).toEqual(Array.from({ length: 10 }, (_, index) => `row-${1101 + index * 2}`));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("preserves exact, null, linked-ID and escaped text alternatives", async () => {
    const broad = portfolio.groups("shared", ["title"])[0];
    const rows = [
      { property_id: properties[0].id, id: "linked", title: "other", amount: 0, unit_id: null },
      { property_id: properties[0].id, id: "literal", title: '50%_,(quoted)"', amount: 0, unit_id: null },
      { property_id: properties[0].id, id: "amount", title: "other", amount: 20, unit_id: null },
      { property_id: properties[0].id, id: "unit", title: "other", amount: 0, unit_id: "unit" },
      { property_id: properties[0].id, id: "excluded", title: "50anything", amount: 0, unit_id: null },
    ];
    const literal = portfolio.groups('50%_,(quoted)"', ["title"])[0];
    const result = await readBoundedSearch([broad, `${literal},id.in.(linked),amount.eq.20,unit_id.not.is.null`], async () => ({ data: rows, count: 5, error: null }), 0, 20);
    expect(result.data.map(row => row.id)).toEqual(["linked", "literal", "amount", "unit"]);
  });

  it("returns database errors without a partial count", async () => {
    const error = { data: null, error: { message: "scope failed" }, count: null };
    expect(await readBoundedSearch(portfolio.groups("shared", ["title"]), async () => error, 0, 19)).toBe(error);
  });
});
