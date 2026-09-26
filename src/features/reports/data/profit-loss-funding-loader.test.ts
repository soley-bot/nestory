import { describe, expect, it, vi } from "vitest";
import { loadProfitLossFunding } from "./profit-loss-funding-loader";

function harness({ rows = 501, failure = false } = {}) {
  const calls: unknown[][] = [];
  const client = { from(table: string) {
    let start = 0;
    let end = 0;
    const query = {
      select(...args: unknown[]) { calls.push([table, "select", ...args]); return query; },
      eq(...args: unknown[]) { calls.push([table, "eq", ...args]); return query; },
      lt(...args: unknown[]) { calls.push([table, "lt", ...args]); return query; },
      gte() { return query; }, lte() { return query; },
      order(...args: unknown[]) { calls.push([table, "order", ...args]); return query; },
      range(from: number, to: number) { start = from; end = to; calls.push([table, "range", from, to]); return query; },
      then(resolve: (result: unknown) => unknown) {
        return Promise.resolve(resolve(table === "owner_cash_events" ? {
          count: rows, error: failure ? { message: "failed" } : null,
          data: Array.from({ length: Math.max(0, Math.min(end + 1, rows) - start) }, (_, i) => ({ id: `c${start + i}`, property_id: "p1", unit_id: "u1", event_date: "2026-09-01", amount: "0.01" })),
        } : { error: null, data: [{ property_id: "p1", unit_id: null, event_date: "2026-08-01", category: "owner_contribution", balance_effect: "-93.00", source_type: "owner_contribution", source_id: "prior" }] }));
      },
    };
    return query;
  } };
  return { calls, client };
}
const options = {
  organizationId: "org", propertyIds: ["p1", "other"], period: { start: "2026-09-01", end: "2026-09-30" },
  financeContext: { units: [{ id: "u1", property_id: "p1" }] } as never,
  viewQuery: { unitId: "u1" } as never,
};
describe("P&L funding source loader", () => {
  it("loads every contribution page and reads the last prior cumulative balance in database order", async () => {
    const { calls, client } = harness();
    const result = await loadProfitLossFunding({ ...options, supabase: client as never });
    expect(result).toMatchObject({ contributionCents: BigInt(501), remainingBalanceCents: BigInt(-9300) });
    expect(calls).toContainEqual(["owner_cash_events", "range", 500, 999]);
    expect(calls).toContainEqual(["property_account_entries", "range", 0, 0]);
    expect(calls).toContainEqual(["property_account_entries", "lt", "event_date", "2026-09-01"]);
    expect(calls.filter(call => call[0] === "property_account_entries" && call[1] === "order").map(call => call[2])).toEqual(["event_date", "created_at", "source_type", "source_id"]);
    expect(calls.filter(call => call[1] === "eq" && call[2] === "property_id").every(call => call[3] === "p1")).toBe(true);
    expect(calls).toContainEqual(["owner_cash_events", "eq", "organization_id", "org"]);
    expect(calls).toContainEqual(["property_account_entries", "eq", "organization_id", "org"]);
  });
  it("fails closed on a source error", async () => {
    await expect(loadProfitLossFunding({ ...options, supabase: harness({ failure: true }).client as never })).rejects.toThrow(/complete P&L/);
  });
  it("does not read other properties for an empty scope", async () => {
    const from = vi.fn();
    await loadProfitLossFunding({ ...options, propertyIds: [], supabase: { from } as never });
    expect(from).not.toHaveBeenCalled();
  });
});
