import { describe, expect, it } from "vitest";
import { createCappedReadHarness } from "@/lib/db/complete-read.test-fixture";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import { parseReportSearchParams } from "../reports.filters";
import { loadMonthlyRentGaps } from "./monthly-rent-completeness";

const period = { start: "2026-10-01", end: "2026-10-31" };
const viewQuery = parseReportSearchParams({ report: "monthly-owner-activity", month: "2026-10" });
const key = (prefix: string, index: number) => `${prefix}-${String(index).padStart(4, "0")}`;

function fixture(size: number, propertyCount = 1) {
  const properties = Array.from({ length: propertyCount }, (_, index) => ({
    id: key("property", index), code: key("SYN", index), name: "Synthetic property", archived_at: null,
  }));
  const leases = Array.from({ length: size }, (_, index) => ({
    id: key("lease", index), property_id: properties[index % propertyCount].id, unit_id: null,
    primary_tenant_person_id: key("tenant", index), tenant_name: key("Tenant", index), status: "active",
    lease_start_date: "2026-01-01", lease_end_date: "2026-12-31", monthly_rent_amount: 600, archived_at: null,
  }));
  const context: ScopedFinanceContext = {
    properties, leases, units: [], people: [], owner_assignments: [], billing_terms: [],
    terms: leases.map(lease => ({ lease_id: lease.id, start_date: lease.lease_start_date, end_date: lease.lease_end_date, rent_amount: 600 })),
  };
  const invoices = leases.map((lease, index) => ({
    id: key("invoice", index), organization_id: "org", lease_id: lease.id,
    property_id: lease.property_id, billing_period_start: period.start, lifecycle: "issued",
  }));
  const lines = invoices.flatMap(invoice => Array.from({ length: 6 }, (_, index) => ({
    id: `${invoice.id}-line-${index}`, organization_id: "org", invoice_id: invoice.id, line_type: "rent",
  })));
  return { context, tables: { tenant_invoice_balances: invoices, tenant_invoice_lines: lines } };
}

function load(client: ReturnType<typeof createCappedReadHarness>["client"], context: ScopedFinanceContext) {
  return loadMonthlyRentGaps({
    supabase: client as unknown as Parameters<typeof loadMonthlyRentGaps>[0]["supabase"],
    organizationId: "org", context, viewQuery, period,
  });
}

describe("complete monthly rent source reads", () => {
  it("reads past server caps for invoices and multiple rent lines per invoice", async () => {
    const { context, tables } = fixture(601);
    const harness = createCappedReadHarness({
      ...tables,
      tenant_invoice_balances: [
        ...tables.tenant_invoice_balances,
        { ...tables.tenant_invoice_balances[0], id: "foreign-invoice", organization_id: "other-org" },
        { ...tables.tenant_invoice_balances[0], id: "draft-invoice", lifecycle: "draft" },
        { ...tables.tenant_invoice_balances[0], id: "old-invoice", billing_period_start: "2026-09-01" },
      ],
    }, { apiRowCap: 137 });

    expect(await load(harness.client, context)).toEqual([]);
    for (const table of Object.keys(tables)) {
      const reads = harness.reads.filter(read => read.table === table);
      expect(reads.some(read => read.range![0] > 500)).toBe(true);
      expect(reads.every(read => read.returnedRows! <= 137)).toBe(true);
      expect(reads.every(read => read.filters.some(filter => filter.column === "organization_id" && filter.value === "org"))).toBe(true);
      expect(reads.every(read => read.orders.some(order => order.column === "id" && order.ascending))).toBe(true);
    }
  });

  it("bounds property and invoice ID filters across a large property scope", async () => {
    const { context, tables } = fixture(201, 201);
    const harness = createCappedReadHarness(tables, { apiRowCap: 29 });
    expect(await load(harness.client, context)).toEqual([]);
    for (const column of ["property_id", "invoice_id"]) {
      const filters = harness.reads.flatMap(read => read.filters).filter(filter => filter.method === "in" && filter.column === column);
      expect(filters.every(filter => (filter.value as string[]).length <= 100)).toBe(true);
      expect(new Set(filters.flatMap(filter => filter.value as string[]))).toHaveProperty("size", 201);
    }
  });

  it.each(["tenant_invoice_balances", "tenant_invoice_lines"])("rejects missing counts in %s", async table => {
    const { context, tables } = fixture(2);
    const harness = createCappedReadHarness(tables, {
      transformResult: (read, result) => read.table === table ? { ...result, count: null } : result,
    });
    await expect(load(harness.client, context)).rejects.toThrow("exact row count");
  });

  it.each(["tenant_invoice_balances", "tenant_invoice_lines"])("rejects count drift between pages in %s", async table => {
    const { context, tables } = fixture(3);
    const harness = createCappedReadHarness(tables, {
      apiRowCap: 1,
      transformResult: (read, result) => read.table === table && read.range![0] > 0 ? { ...result, count: result.count! + 1 } : result,
    });
    await expect(load(harness.client, context)).rejects.toThrow("row count changed");
  });

  it.each(["tenant_invoice_balances", "tenant_invoice_lines"])("rejects repeated identities between pages in %s", async table => {
    const { context, tables } = fixture(3);
    const harness = createCappedReadHarness(tables, {
      apiRowCap: 1,
      transformResult: (read, result) => read.table === table && read.range![0] > 0
        ? { ...result, data: [{ ...result.data![0], id: tables[table as keyof typeof tables][0].id }] } : result,
    });
    await expect(load(harness.client, context)).rejects.toThrow("repeated row identity");
  });

  it("rejects rent lines outside the requested invoice batch", async () => {
    const { context, tables } = fixture(1);
    const harness = createCappedReadHarness(tables, {
      transformResult: (read, result) => read.table === "tenant_invoice_lines"
        ? { ...result, data: result.data!.map(line => ({ ...line, invoice_id: "outside-invoice" })) } : result,
    });
    await expect(load(harness.client, context)).rejects.toThrow("outside the requested invoice scope");
  });
});
