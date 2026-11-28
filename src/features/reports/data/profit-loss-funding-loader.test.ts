import { describe, expect, it, vi } from "vitest";
import { loadProfitLossFunding } from "./profit-loss-funding-loader";
import { createCappedReadHarness } from "@/lib/db/complete-read.test-fixture";
import { PILOT_ORGANIZATION_ID } from "@/lib/pilot-organization";

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
          data: Array.from({ length: Math.max(0, Math.min(end + 1, rows) - start) }, (_, i) => ({ id: `c${String(start + i).padStart(6, "0")}`, property_id: "p1", unit_id: "u1", event_date: "2026-09-01", amount: "0.01" })),
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
  it("carries the selected Pilot unit's closing balance into the next opening, including collections once", async () => {
    const property = { organization_id: PILOT_ORGANIZATION_ID, property_id: "p1" };
    const entry = (source_type: string, source_id: string, event_date: string, balance_effect: string, unit_id: string | null = "u1") =>
      ({ ...property, source_type, source_id, category: source_type, event_date, balance_effect, unit_id });
    const h = createCappedReadHarness({
      property_account_entries: [
        entry("owner_contribution", "fund", "2026-10-01", "615.38", null),
        entry("tenant_invoice_payment", "received", "2026-10-14", "600.00"),
        entry("management_fee_occurrence", "oct-fee", "2026-10-01", "-60.00"),
        entry("ips_expense_responsibility", "cleaning", "2026-10-31", "-55.00"),
        entry("tenant_invoice_payment", "sibling", "2026-10-31", "250.00", "u2"),
        entry("management_fee_occurrence", "nov-fee", "2026-11-01", "-60.00"),
        entry("tenant_invoice_payment", "later-collection", "2026-12-01", "600.00"),
      ],
      owner_cash_events: [{ ...property, id: "fund", unit_id: "u1", currency: "USD", event_type: "owner_contribution", reversal_of_id: null }],
    }, { apiRowCap: 2 });
    const load = (start: string, end: string) => loadProfitLossFunding({ ...options, organizationId: PILOT_ORGANIZATION_ID,
      financeContext: { units: [{ id: "u1", property_id: "p1" }, { id: "u2", property_id: "p1" }] } as never,
      supabase: h.client as never, period: { start, end } });
    const october = await load("2026-10-01", "2026-10-31");
    const november = await load("2026-11-01", "2026-11-30");
    expect(october).toMatchObject({ remainingBalanceCents: BigInt(0), contributionCents: BigInt(61538),
      accountPeriod: { start: "2026-10-01", end: "2026-10-31", closingBalanceCents: BigInt(110038) } });
    expect(november.remainingBalanceCents).toBe(october.accountPeriod?.closingBalanceCents);
    expect(november).toMatchObject({ contributionCents: BigInt(0), accountPeriod: { closingBalanceCents: BigInt(104038) } });
  });
  it("uses both cumulative snapshots for a single-unit property, across the end of the year", async () => {
    const property = { organization_id: PILOT_ORGANIZATION_ID, property_id: "p1", unit_id: null };
    const h = createCappedReadHarness({ property_account_entries: [
      { ...property, event_date: "2026-11-30", source_type: "owner_contribution", source_id: "fund", running_balance: "125.00" },
      { ...property, event_date: "2026-12-31", source_type: "property_withdrawal", source_id: "paid", running_balance: "25.00" },
      { ...property, event_date: "2027-01-01", source_type: "owner_expense", source_id: "cost", running_balance: "-5.00" },
    ] }, { transformResult: (read, result) => read.select?.includes("balance_effect:running_balance")
      ? { ...result, data: result.data?.map(row => ({ ...row, balance_effect: row.running_balance })) ?? null } : result });
    const load = (start: string, end: string) => loadProfitLossFunding({
      ...options, organizationId: PILOT_ORGANIZATION_ID, supabase: h.client as never, period: { start, end } });
    expect(await load("2026-12-01", "2026-12-31")).toMatchObject({
      remainingBalanceCents: BigInt(12500), accountPeriod: { closingBalanceCents: BigInt(2500) } });
    expect(await load("2027-01-01", "2027-01-31")).toMatchObject({
      remainingBalanceCents: BigInt(2500), accountPeriod: { closingBalanceCents: BigInt(-500) } });
    expect(await load("2027-02-01", "2027-02-28")).toMatchObject({
      remainingBalanceCents: BigInt(-500), accountPeriod: { closingBalanceCents: BigInt(-500) } });
  });
  it.each([
    { scenario: "linked full reversal", linked: "cost", amount: "45.00", date: "2026-10-02", expected: BigInt(115538) },
    { scenario: "unrelated equal amount", linked: "other-cost", amount: "45.00", date: "2026-10-02", expected: null },
    { scenario: "partial reversal", linked: "cost", amount: "40.00", date: "2026-10-02", expected: null },
    { scenario: "adjustment from another property", linked: "cost", amount: "45.00", date: "2026-10-02", sourceProperty: "p2", expected: null },
    { scenario: "reversal after the opening date", linked: "cost", amount: "45.00", date: "2026-11-01", expected: null },
  ])("handles an unassigned owner expense in a Pilot unit opening balance: $scenario", async ({ linked, amount, date, sourceProperty, expected }) => {
    const property = { organization_id: PILOT_ORGANIZATION_ID, property_id: "p1" };
    const entry = { ...property, event_date: "2026-10-01", unit_id: null };
    const h = createCappedReadHarness({
      property_account_entries: [
        { ...entry, source_type: "owner_contribution", source_id: "funding", category: "owner_contribution", balance_effect: "615.38" },
        { ...entry, unit_id: "u1", source_type: "tenant_invoice_payment", source_id: "payment", category: "rent_income", balance_effect: "600.00" },
        { ...entry, unit_id: "u1", source_type: "management_fee_occurrence", source_id: "fee", category: "management_fee_expense", balance_effect: "-60.00" },
        { ...entry, event_date: "2026-10-02", source_type: "ips_expense_responsibility", source_id: "cost", category: "owner_expense", balance_effect: "-45.00" },
        { ...entry, event_date: date, source_type: "expense_customer_adjustment", source_id: "credit", category: "owner_expense_reversal", balance_effect: amount },
      ],
      expense_customer_adjustments: [{ ...property, property_id: sourceProperty ?? property.property_id, id: "credit", responsibility: "owner", currency: "USD", responsibility_id: linked }],
      owner_cash_events: [{ ...entry, id: "funding", unit_id: "u1", amount: "615.38", currency: "USD", event_type: "owner_contribution", reversal_of_id: null }],
    }, { apiRowCap: 2 });
    const result = await loadProfitLossFunding({ ...options, organizationId: PILOT_ORGANIZATION_ID,
      financeContext: { units: [{ id: "u1", property_id: "p1" }, { id: "u2", property_id: "p1" }] } as never,
      period: { start: "2026-11-01", end: "2026-11-30" }, supabase: h.client as never });
    expect(result.remainingBalanceCents).toBe(expected);
    expect(result.accountPeriod?.closingBalanceCents).toBe(date === "2026-11-01" ? BigInt(115538) : expected);
    expect(result.contributionCents).toBe(BigInt(0));
  });
  it("totals 36,000 prior unit entries and 36,000 contributions through a 137-row cap", async () => {
    const id = (index: number) => String(index).padStart(6, "0");
    const h = createCappedReadHarness({
      property_account_entries: Array.from({ length: 36_000 }, (_, index) => ({
        organization_id: "org", property_id: "p1", unit_id: "u1", event_date: "2026-08-01",
        category: "owner_expense", balance_effect: "-0.01", source_type: "ips_expense_responsibility", source_id: id(index),
      })),
      owner_cash_events: Array.from({ length: 36_000 }, (_, index) => ({
        id: id(index), organization_id: "org", property_id: "p1", unit_id: "u1", event_date: "2026-09-01",
        amount: "0.01", currency: "USD", event_type: "owner_contribution", reversal_of_id: null,
      })),
    }, { apiRowCap: 137 });
    const result = await loadProfitLossFunding({ ...options, financeContext: {
      units: [{ id: "u1", property_id: "p1" }, { id: "u2", property_id: "p1" }],
    } as never, supabase: h.client as never });
    expect(result).toMatchObject({ contributionCents: BigInt(36_000), remainingBalanceCents: BigInt(-36_000) });
    for (const read of h.reads) {
      expect(read.filters).toContainEqual({ method: "eq", column: "organization_id", value: "org" });
      expect(read.filters).toContainEqual({ method: "eq", column: "property_id", value: "p1" });
    }
  }, 20_000);
  it.each(["complete", "missing source", "over limit", "dense contributions"])("resolves prior contribution units across every activity page (%s)", async scenario => {
    const calls: unknown[][] = [];
    const history = Array.from({ length: 501 }, (_, i) => ({ property_id: "p1", unit_id: i === 500 ? null : "u1", event_date: "2026-08-01", category: i === 500 ? "owner_contribution" : "owner_expense", balance_effect: i === 500 ? "682.00" : "-1.00", source_type: i === 500 ? "owner_contribution" : "ips_expense_responsibility", source_id: `s${String(i).padStart(6, "0")}` }));
    if (scenario === "dense contributions") for (const row of history) {
      row.unit_id = null;
      row.source_type = "owner_contribution";
      row.balance_effect = "1.00";
    }
    const client = { from(table: string) {
      let start = 0, end = 0;
      let sourceLookup = false;
      let sourceIds: string[] = [];
      const query = {
        select(...args: unknown[]) { calls.push([table, "select", ...args]); return query; },
        eq(...args: unknown[]) { calls.push([table, "eq", ...args]); return query; },
        lt() { return query; }, gte() { return query; }, lte() { return query; }, order() { return query; },
        in(...args: unknown[]) { sourceLookup = true; sourceIds = args[1] as string[]; calls.push([table, "in", ...args]); return query; },
        range(from: number, to: number) { start = from; end = to; calls.push([table, "range", from, to]); return query; },
        then(resolve: (result: unknown) => unknown) {
          return Promise.resolve(resolve(table === "property_account_entries" ? { error: null, count: scenario === "over limit" ? 100001 : history.length, data: history.slice(start, end + 1).map(row => ({ ...row })) } : { error: null, count: sourceLookup && scenario !== "missing source" ? sourceIds.length : 0, data: sourceLookup && scenario !== "missing source" ? sourceIds.slice(start, end + 1).map(id => ({ id, unit_id: "u1", reversal_of_id: null })) : [] }));
        },
      };
      return query;
    } };
    const result = loadProfitLossFunding({ ...options, financeContext: { units: [{ id: "u1", property_id: "p1" }, { id: "u2", property_id: "p1" }] } as never, supabase: client as never });
    if (scenario === "over limit") await expect(result).rejects.toThrow(/100000/);
    else if (scenario === "missing source") await expect(result).rejects.toThrow(/resolve unit contribution/);
    else {
      expect(await result).toMatchObject({ remainingBalanceCents: BigInt(scenario === "dense contributions" ? 50100 : 18200) });
      expect(calls.filter(call => call[1] === "in").every(call => (call[3] as string[]).length <= 100)).toBe(true);
      expect(calls).toContainEqual(["property_account_entries", "range", 500, 500]);
      expect(calls).toContainEqual(["owner_cash_events", "in", "id", ["s000500"]]);
      expect(calls).toContainEqual(["owner_cash_events", "eq", "property_id", "p1"]);
    }
  });
  it("loads every contribution page and reads the last prior cumulative balance in database order", async () => {
    const { calls, client } = harness();
    const result = await loadProfitLossFunding({ ...options, supabase: client as never });
    expect(result).toMatchObject({ contributionCents: BigInt(501), remainingBalanceCents: BigInt(-9300) });
    expect(result.accountPeriod).toBeUndefined();
    expect(calls).toContainEqual(["owner_cash_events", "range", 500, 500]);
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
