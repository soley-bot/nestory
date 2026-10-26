import { beforeEach, describe, expect, it, vi } from "vitest";
const { readBoundary } = vi.hoisted(() => ({ readBoundary: vi.fn() }));
vi.mock("@/lib/finance/financial-write-context.server", () => ({ withFinancialReadContext: readBoundary }));
beforeEach(() => { vi.clearAllMocks(); readBoundary.mockReset(); readBoundary.mockImplementation(async (_org, read) => read({ generation: 2, financial_start_date: null })); });
const { createSupabaseServerClient } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
import { getHistoricalRentCorrectionCandidates } from "@/features/leases/data/leases";

describe("issued fee correction candidates", () => {
  it("does not read correction sources when the financial snapshot is unavailable", async () => {
    readBoundary.mockRejectedValueOnce(new Error("Financial reporting is paused"));
    await expect(getHistoricalRentCorrectionCandidates("org", "lease")).rejects.toThrow("paused");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
  it("limits historical candidates to the verified financial start date", async () => {
    readBoundary.mockImplementationOnce(async (_org, read) => read({ generation: 2, financial_start_date: "2026-10-01" }));
    const gte = vi.fn(() => query);
    const query = { select: () => query, eq: () => query, lte: () => query, gte, order: () => query, range: async () => ({ data: [], error: null }) };
    createSupabaseServerClient.mockResolvedValue({ from: () => query });
    expect(await getHistoricalRentCorrectionCandidates("org", "lease")).toEqual([]);
    expect(gte).toHaveBeenCalledWith("billing_period_start", "2026-10-01");
  });

  it("loads 1201 periods, complete fees and late corrections without crossing lease or organization scope", async () => {
    const invoices = Array.from({ length: 1201 }, (_, index) => ({
      id: `invoice-${String(index).padStart(4, "0")}`, organization_id: "org", lease_id: "lease", lifecycle: "issued",
      invoice_number: `INV-${index}`, billing_period_start: "2026-09-01", billing_period_end: "2026-09-30",
      due_date: "2026-09-05", currency: "USD", payment_status: "unpaid", paid_through_ips: 0, collected_by_owner: 0,
    }));
    const tables: Record<string, Array<Record<string, unknown>>> = {
      tenant_invoice_balances: [...invoices, { ...invoices[0], id: "foreign-lease", lease_id: "other" }, { ...invoices[0], id: "foreign-org", organization_id: "other" }],
      tenant_invoice_lines: invoices.map(invoice => ({ id: `line-${invoice.id}`, organization_id: "org", invoice_id: invoice.id, line_type: "rent", amount: 100, reversal_of_id: null, supersedes_line_id: null })),
      tenant_invoice_corrections: Array.from({ length: 1001 }, (_, index) => ({ id: `correction-${index}`, organization_id: "org", tenant_invoice_id: index === 1000 ? invoices[1200].id : invoices[0].id, action: index === 1000 ? "historical_rent" : "management_fee" })),
      management_fee_occurrences: [...Array.from({ length: 1001 }, (_, index) => ({ id: `fee-${index}`, organization_id: "org", tenant_invoice_id: invoices[0].id, amount: 1 })), { id: "foreign-fee", organization_id: "other", tenant_invoice_id: invoices[0].id, amount: 9000 }],
    };
    const requestedBatchSizes: number[] = [];
    createSupabaseServerClient.mockResolvedValue({ from: (table: string) => {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const orders: Array<[string, boolean]> = [];
      let bounds = [0, 999];
      const query = {
        select: () => query,
        eq: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query; },
        is: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query; },
        in: (field: string, values: unknown[]) => { requestedBatchSizes.push(values.length); filters.push(row => values.includes(row[field])); return query; },
        lte: (field: string, value: string) => { filters.push(row => String(row[field]) <= value); return query; },
        order: (field: string, options?: { ascending?: boolean }) => { orders.push([field, options?.ascending !== false]); return query; },
        range: (from: number, to: number) => { bounds = [from, to]; return query; },
        then: (resolve: (result: unknown) => unknown) => {
          const rows = tables[table].filter(row => filters.every(matches => matches(row))).sort((a, b) => {
            for (const [field, ascending] of orders) {
              const order = String(a[field]).localeCompare(String(b[field]));
              if (order) return ascending ? order : -order;
            }
            return 0;
          });
          return Promise.resolve({ data: rows.slice(bounds[0], Math.min(bounds[1] + 1, bounds[0] + 1000)), error: null }).then(resolve);
        },
      };
      return query;
    } });
    const result = await getHistoricalRentCorrectionCandidates("org", "lease", { rentBusinessDate: "2026-10-01" });
    expect(result).toHaveLength(1200);
    expect(result[0]).toMatchObject({ invoiceId: invoices[0].id, originalManagementFeeAmount: 1001, managementFeeCorrected: true });
    expect(result.some(candidate => candidate.invoiceId === invoices[1200].id)).toBe(false);
    expect(Math.max(...requestedBatchSizes)).toBeLessThanOrEqual(100);
  });

  it("retains fee-corrected periods for rent correction while excluding rent-corrected periods", async () => {
    const periodStart = `${new Date().toISOString().slice(0, 7)}-01`;
    const queries: Record<string, { field: string; op: string; value: unknown }[]> = {};
    const invoices = ["missing", "fee", "fee-corrected", "corrected"].map((id) => ({
      id, invoice_number: id, billing_period_start: periodStart, billing_period_end: "2099-12-31",
      due_date: `${periodStart.slice(0, 7)}-05`, currency: "USD", payment_status: "paid",
      paid_through_ips: 1450, collected_by_owner: 0,
    }));
    const tables: Record<string, unknown[]> = {
      tenant_invoice_balances: invoices,
      tenant_invoice_lines: invoices.map(({ id }) => ({ id: `line-${id}`, invoice_id: id, amount: 1450 })),
      tenant_invoice_corrections: [
        { tenant_invoice_id: "corrected", action: "historical_rent" },
        { tenant_invoice_id: "fee-corrected", action: "management_fee" },
      ],
      management_fee_occurrences: [{ tenant_invoice_id: "fee", amount: 100 }, { tenant_invoice_id: "fee", amount: -40 }],
    };
    createSupabaseServerClient.mockResolvedValue({ from: (table: string) => {
      queries[table] = [];
      let bounds = [0, 999];
      const query = {
        select: () => query, order: () => query,
        range: (from: number, to: number) => { bounds = [from, to]; return query; },
        eq: (field: string, value: unknown) => { queries[table].push({ field, op: "eq", value }); return query; },
        is: () => query,
        in: (field: string, value: unknown) => { queries[table].push({ field, op: "in", value }); return query; },
        lte: (field: string, value: unknown) => { queries[table].push({ field, op: "lte", value }); return query; },
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: tables[table].slice(bounds[0], bounds[1] + 1), error: null }).then(resolve),
      };
      return query;
    } });
    const candidates = await getHistoricalRentCorrectionCandidates("org", "lease");
    expect(candidates.map(({ invoiceId, originalManagementFeeAmount }) => ({ invoiceId, originalManagementFeeAmount }))).toEqual([
      { invoiceId: "missing", originalManagementFeeAmount: 0 }, { invoiceId: "fee", originalManagementFeeAmount: 60 },
      { invoiceId: "fee-corrected", originalManagementFeeAmount: 0 },
    ]);
    expect(candidates.find((candidate) => candidate.invoiceId === "fee-corrected")?.managementFeeCorrected).toBe(true);
    expect(candidates.find((candidate) => candidate.invoiceId === "missing")?.managementFeeCorrected).toBe(false);
    expect(queries.tenant_invoice_balances).toContainEqual({ field: "billing_period_start", op: "lte", value: expect.any(String) });
    expect(queries.tenant_invoice_corrections).toContainEqual({ field: "action", op: "in", value: ["historical_rent", "management_fee"] });
  });

  it("excludes non-scheduled invoices from the delegated current-period editor", async () => {
    const invoices = ["scheduled", "manual"].map((id) => ({
      id, invoice_number: id, billing_period_start: "2026-09-01", billing_period_end: "2026-09-30",
      due_date: "2026-09-05", currency: "USD", payment_status: "unpaid",
      paid_through_ips: 0, collected_by_owner: 0,
    }));
    const tables: Record<string, unknown[]> = {
      tenant_invoice_balances: invoices,
      tenant_invoices: [{ id: "scheduled" }],
      tenant_invoice_lines: invoices.map(({ id }) => ({ id: `line-${id}`, invoice_id: id, amount: 1450 })),
      tenant_invoice_corrections: [],
      management_fee_occurrences: [],
    };
    createSupabaseServerClient.mockResolvedValue({ from: (table: string) => {
      let bounds = [0, 999];
      const query = {
        select: () => query, order: () => query, eq: () => query, is: () => query,
        range: (from: number, to: number) => { bounds = [from, to]; return query; },
        in: () => query, lte: () => query, gte: () => query,
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: tables[table].slice(bounds[0], bounds[1] + 1), error: null }).then(resolve),
      };
      return query;
    } });

    const candidates = await getHistoricalRentCorrectionCandidates("org", "lease", {
      currentPeriodOnly: true,
      rentBusinessDate: "2026-09-30",
    });

    expect(candidates.map((candidate) => candidate.invoiceId)).toEqual(["scheduled"]);
  });
});
