import { describe, expect, it, vi } from "vitest";
const { createSupabaseServerClient } = vi.hoisted(() => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
import { getHistoricalRentCorrectionCandidates } from "@/features/leases/data/leases";

describe("issued fee correction candidates", () => {
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
      const query = {
        select: () => query, order: () => query,
        eq: (field: string, value: unknown) => { queries[table].push({ field, op: "eq", value }); return query; },
        is: () => query,
        in: (field: string, value: unknown) => { queries[table].push({ field, op: "in", value }); return query; },
        lte: (field: string, value: unknown) => { queries[table].push({ field, op: "lte", value }); return query; },
        then: (resolve: (value: unknown) => void) => Promise.resolve({ data: tables[table], error: null }).then(resolve),
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
});
