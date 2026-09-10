import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRentReport } from "@/features/reports/data/rent-reports";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { ReportsViewQuery } from "@/features/reports/reports.types";
import type { createSupabaseServerClient } from "@/lib/db/server";

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-10T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("rent reporting", () => {
  it("uses the scoped finance context and effective rent, with no asking-rent fallback for units without leases", async () => {
    const h = harness();
    const report = await getRentReport({
      organizationId: "org",
      viewQuery: query({ report: "rent-roll", month: "2025-01" }),
      supabase: h.client,
    });
    expect(h.rpc).toHaveBeenCalledWith("get_finance_read_context", {
      p_organization_id: "org",
    });
    expect(report.periodLabel).toBe("Current snapshot · 2026-09-10");
    expect(report.rows[0].cells).toMatchObject({
      tenant: "Tenant A",
      rent: "USD 500.25",
      status: "Occupied",
    });
    expect(report.rows[1].cells).toMatchObject({
      tenant: "No current lease",
      rent: "—",
      status: "No current lease",
    });
    expect(
      report.summary.find(
        (metric) => metric.label === "Contracted monthly rent",
      )?.value,
    ).toBe("USD 500.25");
    expect(
      h.calls.some((call) =>
        ["units", "properties", "current_leases"].includes(call.table),
      ),
    ).toBe(false);
  });

  it("filters scope, unit and search before rent totals", async () => {
    const h = harness();
    const report = await getRentReport({
      organizationId: "org",
      viewQuery: query({
        report: "rent-roll",
        propertyId: "p1",
        unitId: "u1",
        query: "tenant a",
      }),
      supabase: h.client,
    });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].propertyId).toBe("p1");
    expect(h.rpc).toHaveBeenCalledWith("get_finance_read_context", {
      p_organization_id: "org",
      p_requested_property_id: "p1",
    });
    const none = await getRentReport({
      organizationId: "org",
      viewQuery: query({ report: "rent-roll", query: "unknown" }),
      supabase: h.client,
    });
    expect(none.rows).toHaveLength(0);
    expect(
      none.summary.find((metric) => metric.label === "Contracted monthly rent")
        ?.value,
    ).toBe("USD 0.00");
  });

  it("uses organization-date terms at timezone rollover rather than database-date current lease boundaries", async () => {
    vi.setSystemTime(new Date("2026-09-30T18:30:00Z"));
    const rollover = context();
    rollover.leases[0].lease_end_date = "2026-09-30";
    rollover.leases[0].monthly_rent_amount = 500.25;
    const h = harness({
      rent_policy_versions: [
        {
          organization_id: "org",
          lifecycle: "approved",
          effective_from: "2026-01-01",
          rent_calculation_timezone: "Asia/Bangkok",
          version_number: 1,
        },
      ],
    });
    const report = await getRentReport({
      organizationId: "org",
      viewQuery: query({ report: "rent-roll" }),
      supabase: h.client,
      financeContext: rollover,
    });
    expect(report.periodLabel).toBe("Current snapshot · 2026-10-01");
    expect(report.rows[0].cells).toMatchObject({
      status: "Occupied",
      rent: "USD 900.00",
      leaseStart: "2026-10-01",
      leaseEnd: "2027-08-31",
    });
  });

  it("rejects unavailable scope and ambiguous effective lease terms", async () => {
    const h = harness();
    await expect(
      getRentReport({
        organizationId: "org",
        viewQuery: query({ unitId: "other-branch-unit" }),
        supabase: h.client,
      }),
    ).rejects.toThrow("selected unit is unavailable");
    await expect(
      getRentReport({
        organizationId: "org",
        viewQuery: query({ propertyId: "other-branch-property" }),
        supabase: h.client,
      }),
    ).rejects.toThrow("selected property is unavailable");
    const ambiguous = context();
    ambiguous.terms.push({ ...ambiguous.terms[0] });
    await expect(
      getRentReport({
        organizationId: "org",
        viewQuery: query({ report: "rent-roll" }),
        supabase: h.client,
        financeContext: ambiguous,
      }),
    ).rejects.toThrow("terms are missing or ambiguous");
  });

  it("filters units without current leases without labeling them physically vacant", async () => {
    const h = harness();
    const report = await getRentReport({
      organizationId: "org",
      viewQuery: query({
        report: "rent-roll",
        transactionStatus: "no-current-lease",
      }),
      supabase: h.client,
    });
    expect(report.rows.map((row) => row.id)).toEqual(["u2"]);
    expect(report.rows[0].cells.status).toBe("No current lease");
    expect(
      report.summary.find(
        (metric) => metric.label === "Contracted monthly rent",
      )?.value,
    ).toBe("USD 0.00");
  });

  it("reports rent-only current collections, partial payments and credit without offsetting another invoice's arrears", async () => {
    const h = harness({
      tenant_invoice_balances: [
        invoice("i1"),
        invoice("i2"),
        invoice("cancelled", { lifecycle: "void" }),
        invoice("old", { issue_date: "2026-08-20" }),
      ],
      tenant_invoice_lines: [
        line("l1", "i1", "1000.00"),
        line("l2", "i2", "100.00"),
        line("utility", "i1", "90.00", { line_type: "utility" }),
        line("void-line", "cancelled", "999.00"),
      ],
      finance_receipt_allocations: [
        receipt("r1", "l1", "300.00"),
        receipt("r2", "l2", "125.00"),
        receipt("r-utility", "utility", "90.00"),
      ],
      owner_collection_confirmation_allocations: [
        {
          id: "owner-paid",
          invoice_line_id: "l1",
          signed_amount: "200.00",
          organization_id: "org",
        },
      ],
    });
    const report = await getRentReport({
      organizationId: "org",
      viewQuery: query(),
      supabase: h.client,
    });
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0].cells).toMatchObject({
      charges: "USD 1,000.00",
      received: "USD 500.00",
      outstanding: "USD 500.00",
      status: "Overdue",
      dueDate: "2026-09-05",
    });
    expect(report.rows[1].cells).toMatchObject({
      charges: "USD 100.00",
      received: "USD 125.00",
      outstanding: "USD 0.00",
      credit: "USD 25.00",
      status: "Credit",
    });
    expect(report.summary.map((metric) => metric.value)).toEqual([
      "USD 1,100.00",
      "USD 625.00",
      "USD 500.00",
      "USD 25.00",
    ]);
    expect(report.description).toContain(
      "not cash received within the date range",
    );
    expect(report.rows[0].sourceLinks.map((link) => link.id)).toEqual([
      "l1",
      "r1",
      "owner-paid",
    ]);
    expect(report.rows[0].amounts?.outstanding).toBe("500.00");
  });

  it("nets signed correction and receipt reversal lineage exactly once", async () => {
    const h = harness({
      tenant_invoice_balances: [invoice("i1")],
      tenant_invoice_lines: [
        line("original", "i1", "1000"),
        line("reversal", "i1", "-1000", { income_item_id: null }),
        line("successor", "i1", "950.01"),
      ],
      finance_receipt_allocations: [
        receipt("p1", "original", "1000"),
        receipt("p2", "original", "-1000"),
        receipt("p3", "successor", "950.01"),
      ],
    });
    const report = await getRentReport({
      organizationId: "org",
      viewQuery: query(),
      supabase: h.client,
    });
    expect(report.rows[0].amounts).toEqual({
      charges: "950.01",
      received: "950.01",
      outstanding: "0.00",
      credit: "0.00",
    });
    expect(report.rows[0].cells.status).toBe("Paid");
  });

  it("applies collection status and text filters before totals", async () => {
    const h = harness({
      tenant_invoice_balances: [invoice("i1"), invoice("i2")],
      tenant_invoice_lines: [
        line("l1", "i1", "10.01"),
        line("l2", "i2", "0.02"),
      ],
      finance_receipt_allocations: [receipt("r1", "l1", "10.01")],
    });
    const report = await getRentReport({
      organizationId: "org",
      viewQuery: query({ transactionStatus: "paid", query: "i1" }),
      supabase: h.client,
    });
    expect(report.rows).toHaveLength(1);
    expect(report.summary[0].value).toBe("USD 10.01");
    expect(report.summary[2].value).toBe("USD 0.00");
  });

  it("keeps archived unit labels for historical issued invoices", async () => {
    const archived = context();
    archived.units[0].archived_at = "2026-09-09";
    const h = harness({
      tenant_invoice_balances: [invoice("i1")],
      tenant_invoice_lines: [line("l1", "i1", "50")],
    });
    const report = await getRentReport({
      organizationId: "org",
      viewQuery: query(),
      supabase: h.client,
      financeContext: archived,
    });
    expect(report.rows[0].cells.unit).toBe("101");
  });

  it("paginates capped responses and batches dependent identifiers without truncating totals", async () => {
    const invoices = Array.from({ length: 501 }, (_, i) =>
      invoice(`i${String(i).padStart(3, "0")}`),
    );
    const h = harness(
      {
        tenant_invoice_balances: invoices,
        tenant_invoice_lines: invoices.map((item) =>
          line(`l-${item.id}`, String(item.id), "0.01"),
        ),
      },
      { pageCap: 75 },
    );
    const report = await getRentReport({
      organizationId: "org",
      viewQuery: query(),
      supabase: h.client,
    });
    expect(report.rows).toHaveLength(501);
    expect(report.summary[0].value).toBe("USD 5.01");
    expect(
      h.calls.filter((call) => call.table === "tenant_invoice_balances"),
    ).toHaveLength(7);
    expect(
      h.calls.every((call) =>
        call.filters.some(
          ([kind, column, value]) =>
            kind === "eq" && column === "organization_id" && value === "org",
        ),
      ),
    ).toBe(true);
  });

  it.each([
    "tenant_invoice_balances",
    "tenant_invoice_lines",
    "finance_receipt_allocations",
    "owner_collection_confirmation_allocations",
    "rent_policy_versions",
  ])("fails closed when %s fails", async (failedTable) => {
    const h = harness(
      {
        tenant_invoice_balances: [invoice("i1")],
        tenant_invoice_lines: [line("l1", "i1", "50")],
      },
      { failedTable },
    );
    await expect(
      getRentReport({
        organizationId: "org",
        viewQuery: query(),
        supabase: h.client,
      }),
    ).rejects.toThrow("source unavailable");
  });

  it("fails closed on unknown counts, source limits and incomplete pages", async () => {
    for (const overrides of [
      { forcedCount: null },
      { forcedCount: 5001 },
      { forcedCount: 2 },
    ]) {
      const h = harness(
        { tenant_invoice_balances: [invoice("i1")] },
        { countTable: "tenant_invoice_balances", ...overrides },
      );
      await expect(
        getRentReport({
          organizationId: "org",
          viewQuery: query(),
          supabase: h.client,
        }),
      ).rejects.toThrow();
    }
  });
});

function query(overrides: Partial<ReportsViewQuery> = {}): ReportsViewQuery {
  return {
    report: "rent-collections",
    month: "2026-09",
    ownerPersonId: "all",
    peopleArchiveState: "active",
    peopleView: "relationship",
    propertyId: "all",
    status: "all",
    unitId: "all",
    ...overrides,
  };
}
function context(): ScopedFinanceContext {
  return {
    properties: [
      { id: "p1", code: "P1", name: "Property A", archived_at: null },
    ],
    units: [
      { id: "u1", property_id: "p1", unit_number: "101", archived_at: null },
      { id: "u2", property_id: "p1", unit_number: "102", archived_at: null },
    ],
    people: [],
    owner_assignments: [],
    billing_terms: [],
    leases: [
      {
        id: "lease1",
        property_id: "p1",
        unit_id: "u1",
        primary_tenant_person_id: "tenant1",
        tenant_name: "Tenant A",
        status: "active",
        lease_start_date: "2026-09-01",
        lease_end_date: "2027-08-31",
        monthly_rent_amount: 900,
        archived_at: null,
      },
    ],
    terms: [
      {
        lease_id: "lease1",
        start_date: "2026-09-01",
        end_date: "2026-09-30",
        rent_amount: 500.25,
      },
      {
        lease_id: "lease1",
        start_date: "2026-10-01",
        end_date: "2027-08-31",
        rent_amount: 900,
      },
    ],
  };
}
type Row = Record<string, unknown>;
function invoice(id: string, overrides: Row = {}): Row {
  return {
    id,
    property_id: "p1",
    unit_id: "u1",
    lease_id: "lease1",
    invoice_number: id,
    recipient_label: "Tenant A",
    issue_date: "2026-09-02",
    due_date: "2026-09-05",
    currency: "USD",
    lifecycle: "issued",
    organization_id: "org",
    ...overrides,
  };
}
function line(
  id: string,
  invoiceId: string,
  amount: string,
  overrides: Row = {},
): Row {
  return {
    id,
    invoice_id: invoiceId,
    income_item_id: id,
    amount,
    line_type: "rent",
    organization_id: "org",
    ...overrides,
  };
}
function receipt(id: string, income: string, amount: string): Row {
  return {
    id,
    income_item_id: income,
    signed_amount: amount,
    organization_id: "org",
  };
}
type Filter = [string, string, unknown];
function harness(
  tables: Record<string, Row[]> = {},
  options: {
    failedTable?: string;
    countTable?: string;
    forcedCount?: number | null;
    pageCap?: number;
  } = {},
) {
  const calls: { table: string; filters: Filter[] }[] = [];
  const rpc = vi.fn(async () => ({ data: context(), error: null }));
  const client = {
    rpc,
    from(table: string) {
      const filters: Filter[] = [];
      const builder = {
        select: () => builder,
        order: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push(["eq", column, value]);
          return builder;
        },
        in: (column: string, value: unknown[]) => {
          filters.push(["in", column, value]);
          return builder;
        },
        is: (column: string, value: unknown) => {
          filters.push(["eq", column, value]);
          return builder;
        },
        gte: (column: string, value: unknown) => {
          filters.push(["gte", column, value]);
          return builder;
        },
        lte: (column: string, value: unknown) => {
          filters.push(["lte", column, value]);
          return builder;
        },
        range: async (from: number, to: number) => {
          calls.push({ table, filters: [...filters] });
          if (options.failedTable === table)
            return {
              data: null,
              count: null,
              error: { message: "source unavailable" },
            };
          const rows = (tables[table] ?? []).filter((row) =>
            filters.every(([kind, column, value]) =>
              kind === "eq"
                ? row[column] === value
                : kind === "in"
                  ? (value as unknown[]).includes(row[column])
                  : kind === "gte"
                    ? String(row[column]) >= String(value)
                    : String(row[column]) <= String(value),
            ),
          );
          return {
            data: rows.slice(
              from,
              Math.min(to + 1, from + (options.pageCap ?? 500)),
            ),
            count:
              options.countTable === table ? options.forcedCount : rows.length,
            error: null,
          };
        },
      };
      return builder;
    },
  };
  return {
    client: client as unknown as Awaited<
      ReturnType<typeof createSupabaseServerClient>
    >,
    calls,
    rpc,
  };
}
