import { describe, expect, it, vi } from "vitest";
import { needsBoundedSearch, readBoundedSearch } from "./bounded-register";
import { createPortfolioSearch } from "./portfolio";
import type { createSupabaseServerClient } from "@/lib/db/server";

const properties = Array.from({ length: 1200 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  code: `A-${index}`, name: "Apartment", ownerNames: ["Shared Owner"],
}));
const portfolio = createPortfolioSearch(properties, []);
const groups = portfolio.groups("shared roof", ["title"]);
const rows = Array.from({ length: 10000 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  property_id: properties[index % properties.length].id, title: index % 2 ? "Roof" : "Other",
}));
function database(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async (...args: unknown[]) => { void args; return { data, error }; });
  return { client: { rpc } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>,
    entity: "timeline" as const, organizationId: "org", filters: { archive_state: "active" }, sort: "date_desc", rpc };
}

describe("bounded register search", () => {
  it("keeps short URL queries on the existing database path", async () => {
    const result = { data: [{ id: "row" }], error: null, count: 1 }, source = database(null);
    const fetch = vi.fn(async () => result);
    expect(await readBoundedSearch(['title.ilike."%roof%"'], fetch, 20, 39, source)).toBe(result);
    expect(fetch).toHaveBeenCalledWith(20, 39, ['title.ilike."%roof%"']);
    expect(source.rpc).not.toHaveBeenCalled();
  });
  it("counts 10000 source rows in the database and hydrates only the late matching page", async () => {
    const matches = rows.filter(row => row.title === "Roof"), selected = matches.slice(4990, 5000);
    const source = database({ ids: selected.map(row => row.id), total_count: matches.length });
    const fetch = vi.fn(async () => ({ data: selected, error: null, count: selected.length }));
    expect(needsBoundedSearch(groups)).toBe(true);
    expect(await readBoundedSearch(groups, fetch, 4990, 4999, source)).toEqual({ data: selected, error: null, count: 5000 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(0, 9, [`id.in.(${selected.map(row => JSON.stringify(row.id)).join(",")})`]);
    expect(source.rpc).toHaveBeenCalledExactlyOnceWith("get_bounded_register_page", {
      p_organization_id: "org", p_entity: "timeline", p_filters: { archive_state: "active" }, p_sort: "date_desc", p_offset: 4990, p_limit: 10,
      p_groups: [[{ field: "title", operator: "ilike", value: "%shared%" }, { field: "property_id", operator: "in", value: properties.map(property => property.id) }], [{ field: "title", operator: "ilike", value: "%roof%" }]],
    });
  });
  it("preserves escaped text and linked/null alternatives in structured groups", async () => {
    const source = database({ ids: [rows[0].id], total_count: 1 });
    const literal = portfolio.groups('50%_,(quoted)"', ["title"])[0];
    await readBoundedSearch([groups[0], `${literal},id.in.(${rows[0].id}),unit_id.not.is.null`], async () => ({ data: [rows[0]], error: null, count: 1 }), 0, 19, source);
    expect(source.rpc.mock.calls[0]).toEqual(["get_bounded_register_page", expect.objectContaining({ p_groups: expect.arrayContaining([[
      { field: "title", operator: "ilike", value: '%50\\%\\_,(quoted)"%' }, { field: "id", operator: "in", value: [rows[0].id] }, { field: "unit_id", operator: "not.is", value: null },
    ]]) })]);
  });
  it("does not perform an unfiltered hydration when no rows match", async () => {
    const fetch = vi.fn();
    expect(await readBoundedSearch(groups, fetch, 0, 19, database({ ids: [], total_count: 0 }))).toEqual({ data: [], count: 0, error: null });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("accepts a complete clamped final page", async () => {
    const fetch = vi.fn(async () => ({ data: [rows[0]], error: null, count: 1 }));
    expect((await readBoundedSearch(groups, fetch, 9990, 9999, database({ ids: [rows[0].id], total_count: 5001 }))).count).toBe(5001);
  });
  it("bounds hydration URLs as well as the requested 100-row page", async () => {
    const selected = rows.slice(0, 100);
    const source = database({ ids: selected.map(row => row.id), total_count: 10000 });
    const fetch = vi.fn(async (_from: number, _to: number, filters: string[]) => {
      const ids: string[] = JSON.parse(`[${filters[0].slice(7, -1)}]`);
      const data = selected.filter(row => ids.includes(row.id));
      return { data, error: null, count: data.length };
    });
    expect((await readBoundedSearch(groups, fetch, 0, 99, source)).data).toEqual(selected);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([, to, filters]) => to === 49 && !needsBoundedSearch(filters))).toBe(true);
  });
  it.each([50, 100])("completes a %i-row selected page through a seven-row API cap", async pageSize => {
    const selected = rows.slice(0, pageSize);
    const source = database({ ids: selected.map(row => row.id), total_count: 10000 });
    const fetch = vi.fn(async (from: number, to: number, filters: string[]) => {
      const ids: string[] = JSON.parse(`[${filters[0].slice(7, -1)}]`);
      const matches = selected.filter(row => ids.includes(row.id));
      return { data: matches.slice(from, Math.min(to + 1, from + 7)), count: matches.length, error: null };
    });
    expect(await readBoundedSearch(groups, fetch, 0, pageSize - 1, source)).toEqual({ data: selected, count: 10000, error: null });
    expect(fetch).toHaveBeenCalledTimes(pageSize / 50 * 8);
    expect(fetch.mock.calls.every(([, , filters]) => !needsBoundedSearch(filters))).toBe(true);
  });
  it("rejects a changed count on a capped hydration continuation", async () => {
    const selected = rows.slice(0, 10);
    const fetch = vi.fn(async (from: number) => ({ data: selected.slice(from, from + 7), count: from ? 9 : 10, error: null }));
    await expect(readBoundedSearch(groups, fetch, 0, 9, database({ ids: selected.map(row => row.id), total_count: 10 }))).rejects.toThrow(/changed/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([{ ids: [rows[0].id, rows[0].id], total_count: 2 }, { ids: [rows[0].id], total_count: 10 }, { ids: ["-".repeat(36)], total_count: 1 }, { ids: [], total_count: -1 }, { ids: [], total_count: 1.1 }, null])("rejects invalid pages: %j", async data => {
    const fetch = vi.fn();
    await expect(readBoundedSearch(groups, fetch, 0, 19, database(data))).rejects.toThrow(/Invalid|incomplete/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed if page identities disappear or change before hydration", async () => {
    for (const data of [[rows[1]], []]) await expect(readBoundedSearch(groups, async () => ({ data, error: null, count: data.length }), 0, 19, database({ ids: [rows[0].id], total_count: 1 }))).rejects.toThrow(/changed/);
  });
  it("rejects a hydration count that changes even when its one visible identity matches", async () => {
    await expect(readBoundedSearch(groups, async () => ({ data: [rows[0]], error: null, count: 2 }), 0, 19,
      database({ ids: [rows[0].id], total_count: 1 }))).rejects.toThrow(/changed/);
  });
  it("preserves hydration errors and fails search errors before reading rows", async () => {
    const error = { data: null, error: { message: "scope failed" }, count: null };
    expect(await readBoundedSearch(groups, async () => error, 0, 19, database({ ids: [rows[0].id], total_count: 1 }))).toBe(error);
    const fetch = vi.fn();
    await expect(readBoundedSearch(groups, fetch, 0, 19, database(null, { message: "scope failed" }))).rejects.toThrow("scope failed");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["secret.ilike.*", "title.like.*", "title.not.is.false", 'title.ilike."unterminated', "id.in.(nested(x))"])("rejects unsupported grammar: %s", async condition => {
    const source = database(null);
    await expect(readBoundedSearch([...groups, condition], vi.fn(), 0, 19, source)).rejects.toThrow(/Invalid|Unsupported/);
    expect(source.rpc).not.toHaveBeenCalled();
  });
});
