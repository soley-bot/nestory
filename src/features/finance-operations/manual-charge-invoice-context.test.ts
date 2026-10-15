import { beforeEach, expect, it, vi } from "vitest";
import { requirePermission } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { loadManualChargeInvoiceContext } from "./manual-charge-invoice-context";

vi.mock("@/lib/auth/context", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));
const leaseId = "10000000-0000-0000-0000-000000000001";
const invoiceId = "20000000-0000-0000-0000-000000000001";
const row = { id: invoiceId, organization_id: "org", lease_id: leaseId, billing_period_start: "2026-08-01", invoice_number: "OLD-PAID-INVOICE", due_date: "2026-08-25", payment_status: "paid" };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requirePermission).mockResolvedValue({ organizationId: "org" } as never); });
function client(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  vi.mocked(createSupabaseServerClient).mockResolvedValue({ from: vi.fn().mockReturnValue(query) } as never);
  return query;
}
it("finds a paid off-page invoice independently of register filters and inherits its due date", async () => {
  const query = client(row);
  await expect(loadManualChargeInvoiceContext({ leaseId, billingPeriod: "2026-08" })).resolves.toEqual({ id: invoiceId, invoiceNumber: "OLD-PAID-INVOICE", dueDate: "2026-08-25" });
  expect(requirePermission).toHaveBeenCalledWith("finance.record_payments");
  expect(query.eq.mock.calls).toEqual([["organization_id", "org"], ["lease_id", leaseId], ["billing_period_start", "2026-08-01"]]);
  expect(query.maybeSingle).toHaveBeenCalledOnce();
});
it("distinguishes a verified absent invoice from a failed lookup", async () => {
  client(null);
  await expect(loadManualChargeInvoiceContext({ leaseId, billingPeriod: "2026-08" })).resolves.toBeNull();
  client(null, { message: "timeout" });
  await expect(loadManualChargeInvoiceContext({ leaseId, billingPeriod: "2026-08" })).rejects.toThrow("Could not check");
});
it.each([{ ...row, id: "bad-id" }, { ...row, organization_id: "foreign" }, { ...row, lease_id: "another-lease" }, { ...row, billing_period_start: "2026-09-01" }, { ...row, due_date: "bad-date" }, { ...row, payment_status: "voided" }])("rejects mismatched or unavailable context %#", async data => {
  client(data);
  await expect(loadManualChargeInvoiceContext({ leaseId, billingPeriod: "2026-08" })).rejects.toThrow();
});
