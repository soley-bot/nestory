import { describe, expect, it, vi } from "vitest";
import { getMonthlyOwnerActivityReport } from "./monthly-owner-activity-report";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { ReportsViewQuery } from "../reports.types";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

const context: ScopedFinanceContext = {
  properties: [{ id: "p1", code: "P1", name: "First", archived_at: null }],
  units: [], leases: [], terms: [], billing_terms: [], people: [], owner_assignments: [],
};
const viewQuery: ReportsViewQuery = {
  month: "2026-09", report: "monthly-owner-activity", propertyId: "all", unitId: "all",
  ownerPersonId: "all", peopleArchiveState: "active", peopleView: "relationship", status: "all",
};
const row = (id: string) => ({ organization_id: "org", property_id: "p1", event_date: "2026-09-15",
  category: "rent_income", label: "Rent", amount: "0.01", balance_effect: "0.01",
  source_type: "tenant_invoice_payment", source_id: id });
type Row = ReturnType<typeof row>;
type Result = { data: Row[] | null; count: number | null; error: { message: string } | null };

function harness(page: (from: number, to: number) => Result) {
  const calls: unknown[][] = [];
  const client = { from(table: string) {
    calls.push(["from", table]);
    let start = 0, end = 999;
    const query = {
      select(...args: unknown[]) { calls.push(["select", ...args]); return query; },
      eq(...args: unknown[]) { calls.push(["eq", ...args]); return query; },
      in(...args: unknown[]) { calls.push(["in", ...args]); return query; },
      gte(...args: unknown[]) { calls.push(["gte", ...args]); return query; },
      lte(...args: unknown[]) { calls.push(["lte", ...args]); return query; },
      order(...args: unknown[]) { calls.push(["order", ...args]); return query; },
      range(from: number, to: number) { start = from; end = to; calls.push(["range", from, to]); return query; },
      then(resolve: (value: Result) => unknown) { return Promise.resolve(page(start, end)).then(resolve); },
    };
    return query;
  } };
  return { calls, load: () => getMonthlyOwnerActivityReport({ organizationId: "org", viewQuery,
    financeContext: context, supabase: client as never }) };
}

describe("monthly owner activity complete source loading", () => {
  it.each([0, 1, 499, 500, 501, 1000, 1001, 5001])("loads %i rows through capped pages with tenant and date scope", async count => {
    const h = harness((from, to) => ({ count, error: null,
      data: Array.from({ length: Math.max(0, Math.min(count, from + 137, to + 1) - from) },
        (_, index) => row(String(from + index).padStart(6, "0"))) }));
    const report = await h.load();
    expect(report.rows[0]?.sourceCount ?? 0).toBe(count);
    expect(report.summary[0].value).toBe(`USD ${(count / 100).toFixed(2)}`);
    expect(h.calls.filter(call => call[0] === "range").map(call => call[1])).toEqual(
      count === 0 ? [0] : Array.from({ length: Math.ceil(count / 137) }, (_, index) => index * 137));
    expect(h.calls).toContainEqual(["eq", "organization_id", "org"]);
    expect(h.calls).toContainEqual(["in", "property_id", ["p1"]]);
    expect(h.calls).toContainEqual(["gte", "event_date", "2026-09-01"]);
    expect(h.calls).toContainEqual(["lte", "event_date", "2026-09-30"]);
  });

  it.each([
    ["unknown count", () => ({ data: [], count: null, error: null })],
    ["missing data", () => ({ data: null, count: 0, error: null })],
    ["count changed", (from: number) => ({ data: [row(String(from))], count: from ? 3 : 2, error: null })],
    ["empty page", (from: number) => ({ data: from ? [] : [row("a")], count: 2, error: null })],
    ["later failure", (from: number) => from ? { data: null, count: null, error: { message: "denied" } } : { data: [row("a")], count: 2, error: null }],
    ["duplicate", () => ({ data: [row("a"), row("a")], count: 2, error: null })],
    ["out of order", () => ({ data: [row("b"), row("a")], count: 2, error: null })],
    ["over limit", () => ({ data: [], count: 100_001, error: null })],
    ["foreign tenant", () => ({ data: [{ ...row("a"), organization_id: "foreign" }], count: 1, error: null })],
    ["foreign property", () => ({ data: [{ ...row("a"), property_id: "foreign" }], count: 1, error: null })],
    ["foreign month", () => ({ data: [{ ...row("a"), event_date: "2026-10-01" }], count: 1, error: null })],
  ] satisfies [string, (from: number, to: number) => Result][]) ("fails closed on %s", async (_name, page) => {
    await expect(harness(page).load()).rejects.toThrow();
  });
});
