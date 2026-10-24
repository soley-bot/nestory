import { describe, expect, it } from "vitest";
import { createCappedReadHarness, type CappedReadRow } from "./complete-read.test-fixture";

describe("capped read harness column access", () => {
  it.each(["value", "relation(value)"])("preserves every filter for %s", async column => {
    const { client } = createCappedReadHarness({ rows: [null, 1, 2, 3].map((value, id) => ({ id, value, relation: { value } })) });
    const query = () => client.from("rows").select("*", { count: "exact" });
    const ids = async (read: ReturnType<typeof query>) => (await read).data?.map(row => row.id);
    expect(await ids(query().eq(column, 2))).toEqual([2]);
    expect(await ids(query().neq(column, 2))).toEqual([0, 1, 3]);
    expect(await ids(query().is(column, null))).toEqual([0]);
    expect(await ids(query().in(column, [1, 3]))).toEqual([1, 3]);
    expect(await ids(query().not(column, "in", "(1,3)"))).toEqual([0, 2]);
    expect(await ids(query().not(column, "is", null))).toEqual([1, 2, 3]);
    expect(await ids(query().gte(column, 2))).toEqual([2, 3]);
    expect(await ids(query().lte(column, 1))).toEqual([0, 1]);
    expect(await ids(query().gt(column, 2))).toEqual([3]);
    expect(await ids(query().lt(column, 1))).toEqual([0]);
  });

  it.each([
    { ascending: true, nullsFirst: true, expected: ["missing", "null", "a", "b", "high"] },
    { ascending: false, nullsFirst: false, expected: ["high", "a", "b", "null", "missing"] },
  ])("preserves relation ordering and null placement ($ascending, $nullsFirst)", async ({ ascending, nullsFirst, expected }) => {
    const { client } = createCappedReadHarness({ rows: [
      { id: "b", relation: { value: 1 } }, { id: "null", relation: { value: null } },
      { id: "high", relation: { value: 2 } }, { id: "missing" }, { id: "a", relation: { value: 1 } },
    ] });
    const result = await client.from("rows").select("*").order("relation(value)", { ascending, nullsFirst }).order("id");
    expect(result.data?.map(row => row.id)).toEqual(expected);
  });

  it("reads current table contents on each await and preserves transformed page metadata", async () => {
    const tables: Record<string, CappedReadRow[]> = { rows: [{ id: "a", scope: "ours" }, { id: "foreign", scope: "theirs" }] };
    let transforms = 0;
    const { client, reads } = createCappedReadHarness(tables, { apiRowCap: 1, transformResult(_read, result) {
      transforms++;
      return { ...result, data: result.data?.map(row => ({ ...row, transformed: transforms })) ?? null };
    } });
    const query = client.from("rows").select("*", { count: "exact" }).eq("scope", "ours").order("id").range(0, 9);
    expect(await query).toEqual({ data: [{ id: "a", scope: "ours", transformed: 1 }], count: 1, error: null });
    tables.rows[0].scope = "theirs";
    tables.rows.push({ id: "b", scope: "ours" }, { id: "c", scope: "ours" });
    expect(await query).toEqual({ data: [{ id: "b", scope: "ours", transformed: 2 }], count: 2, error: null });
    tables.rows = [{ id: "d", scope: "ours" }];
    expect(await query).toEqual({ data: [{ id: "d", scope: "ours", transformed: 3 }], count: 1, error: null });
    expect(reads).toHaveLength(3);
    expect(reads[2]).toMatchObject({ filters: [{ method: "eq", column: "scope", value: "ours" }], returnedRows: 1, count: 1 });
  });

  it("preserves joined property sorting, exact counts, limits, and head reads", async () => {
    const tables = { rows: [{ id: "a", property_id: "p1" }, { id: "b", property_id: "p2" }], properties: [{ id: "p1", rank: 2 }, { id: "p2", rank: 1 }] };
    const { client } = createCappedReadHarness(tables);
    const query = () => client.from("rows").select("*,property:properties!inner(*)", { count: "exact" }).order("property(rank)");
    expect(await query().limit(1).maybeSingle()).toEqual({ data: { id: "b", property_id: "p2", property: { id: "p2", rank: 1 } }, count: 2, error: null });
    tables.properties[0].rank = 0;
    expect((await query().range(0, 0)).data?.[0].id).toBe("a");
    expect(await client.from("rows").select("*", { count: "exact", head: true })).toEqual({ data: [], count: 2, error: null });
  });
});
