import { describe, expect, it } from "vitest";
import { loadMonthlyRentGaps } from "./monthly-rent-completeness";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { ReportsViewQuery } from "../reports.types";

const context: ScopedFinanceContext = {
  properties: [{ id: "p1", code: "SYN-0001", name: "Example", archived_at: null }], units: [], people: [], owner_assignments: [], billing_terms: [],
  leases: [{ id: "l1", property_id: "p1", unit_id: null, primary_tenant_person_id: "t1", tenant_name: "Tenant", status: "active", lease_start_date: "2025-10-01", lease_end_date: "2026-09-30", monthly_rent_amount: 600, archived_at: null }],
  terms: [{ lease_id: "l1", start_date: "2025-10-01", end_date: "2026-09-30", rent_amount: 600 }],
};
const period = { start: "2026-10-01", end: "2026-10-31" };
const viewQuery = { propertyId: "all", unitId: "all", ownerPersonId: "all" } as ReportsViewQuery;
const invoice = { id: "i1", lease_id: "l1", property_id: "p1", billing_period_start: period.start };
function client(invoices: unknown[] = [], lines: { invoice_id: string; id?: string }[] = [], count?: number) {
  return { from: (table: string) => {
    const data = table === "tenant_invoice_balances" ? invoices : lines.map((line, index) => ({ id: `line-${String(index).padStart(4, "0")}`, ...line }));
    const query = { select: () => query, eq: () => query, in: () => query, order: () => query,
      range: async (from: number, to: number) => ({ data: data.slice(from, to + 1), error: null, count: count ?? data.length }) };
    return query;
  } } as unknown as Parameters<typeof loadMonthlyRentGaps>[0]["supabase"];
}
const load = (supabase = client(), input = context, scope = viewQuery) => loadMonthlyRentGaps({ supabase, organizationId: "org", context: input, viewQuery: scope, period });
describe("monthly rent completeness", () => {
  it.each(["active", "notice_given", "ended", "terminated"])("checks historical rent after a later renewal (%s)", async status => {
    for (const month of ["09", "10"]) {
      const reportPeriod = { start: `2026-${month}-01`, end: `2026-${month}-${month === "09" ? "30" : "31"}` };
      const renewalStart = month === "09" ? "2026-10-01" : "2026-11-01";
      const input = { ...context, leases: [{ ...context.leases[0], status, lease_start_date: renewalStart, lease_end_date: "2027-10-31" }], terms: [
        { ...context.terms[0], end_date: reportPeriod.end },
        { ...context.terms[0], start_date: renewalStart, end_date: "2027-10-31" },
      ] };
      const historicalInvoice = { ...invoice, billing_period_start: reportPeriod.start };
      const read = (supabase = client()) => loadMonthlyRentGaps({ supabase, organizationId: "org", context: input, viewQuery, period: reportPeriod });
      expect(await read()).toHaveLength(1);
      expect(await read(client([historicalInvoice], [{ invoice_id: "i1" }]))).toEqual([]);
      expect((await read(client([historicalInvoice, { ...historicalInvoice, id: "i2" }], [{ invoice_id: "i1" }, { invoice_id: "i2" }])))[0].cells.issue).toContain("Multiple issued rent invoices");
    }
  });
  it("excludes leases whose authoritative history begins after the month", async () => {
    expect(await load(client(), { ...context,
      leases: [{ ...context.leases[0], lease_start_date: "2026-11-01" }],
      terms: [{ ...context.terms[0], start_date: "2026-11-01", end_date: "2027-10-31" }],
    })).toEqual([]);
  });
  it("does not charge a zero-rent historical month because a later renewal has rent", async () => {
    expect(await load(client(), { ...context,
      leases: [{ ...context.leases[0], lease_start_date: "2026-11-01" }],
      terms: [
        { ...context.terms[0], end_date: period.end, rent_amount: 0 },
        { ...context.terms[0], start_date: "2026-11-01", end_date: "2027-10-31" },
      ],
    })).toEqual([]);
  });
  it.each(["active", "notice_given", "ended", "terminated"])("retains positive rent earlier in a month before a zero-rent renewal (%s)", async status => {
    const input = { ...context, leases: [{ ...context.leases[0], status }], terms: [
      { ...context.terms[0], end_date: "2026-10-14" },
      { ...context.terms[0], start_date: "2026-10-15", end_date: "infinity", rent_amount: 0 },
    ] };
    expect(await load(client(), input)).toHaveLength(1);
    expect(await load(client([invoice], [{ invoice_id: "i1" }]), input)).toEqual([]);
  });
  it("excludes a fully zero-rent month even when earlier history had positive rent", async () => {
    expect(await load(client(), { ...context, terms: [
      context.terms[0],
      { ...context.terms[0], start_date: "2026-10-01", end_date: "infinity", rent_amount: 0 },
    ] })).toEqual([]);
  });
  it("flags active missing setup when its only term starts after the report month", async () => {
    expect(await load(client(), { ...context, terms: [
      { ...context.terms[0], start_date: "2026-11-01", end_date: "infinity", rent_amount: 0 },
    ] })).toHaveLength(1);
  });

  it("excludes a zero-rent term while retaining missing-term setup issues", async () => {
    expect(await load(client(), { ...context, terms: [{ ...context.terms[0], rent_amount: 0 }] })).toEqual([]);
    expect(await load(client(), { ...context, terms: [] })).toHaveLength(1);
  });
  it("blocks duplicate issued rent invoices for the same month", async () => {
    const rows = await load(client([invoice, { ...invoice, id: "i2" }], [{ invoice_id: "i1" }, { invoice_id: "i2" }]));
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.issue).toContain("Multiple issued rent invoices");
  });
  it("flags an expired active term without relying on a generation exception", async () => {
    const rows = await load();
    expect(rows).toHaveLength(1);
    expect(rows[0].cells.issue).toContain("Rent term ended 2026-09-30");
    expect(rows[0].nextActionHref).toBe("/leases/l1?section=rent");
    expect(rows[0]).not.toHaveProperty("amounts");
  });
  it("does not call missing billing zero rent when a valid term covers the month", async () => {
    const rows = await load(client(), { ...context, terms: [{ ...context.terms[0], end_date: "2027-09-30" }] });
    expect(rows[0].cells.issue).toContain("Monthly rent invoice is missing");
    expect(rows[0].cells.issue).not.toContain("ended");
  });
  it("requires an issued month invoice with a rent line", async () => {
    expect(await load(client([invoice], []))).toHaveLength(1);
    expect(await load(client([invoice], [{ invoice_id: "i1" }]))).toEqual([]);
    expect(await load(client([{ ...invoice, billing_period_start: "2026-09-01" }], [{ invoice_id: "i1" }]))).toHaveLength(1);
  });
  it("honors property, unit and owner scope", async () => {
    for (const change of [{ propertyId: "p2" }, { unitId: "u2" }, { ownerPersonId: "o2" }]) expect(await load(client(), context, { ...viewQuery, ...change })).toEqual([]);
  });
  it("does not treat ended non-overlapping or archived leases as current missing rent", async () => {
    expect(await load(client(), { ...context, leases: [{ ...context.leases[0], status: "terminated" }] })).toEqual([]);
    expect(await load(client(), { ...context, leases: [{ ...context.leases[0], archived_at: "2026-10-01" }] })).toEqual([]);
  });
  it("retains historical ended lease obligations when authoritative terms overlap the month", async () => {
    expect(await load(client(), { ...context, leases: [{ ...context.leases[0], status: "ended" }], terms: [{ ...context.terms[0], end_date: "2026-10-15" }] })).toHaveLength(1);
  });
  it("fails closed on incomplete invoice sources", async () => {
    await expect(load(client([], [], 1))).rejects.toThrow("complete monthly rent invoices");
  });
});
