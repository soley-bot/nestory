import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, requireHistoricalRentRecoveryContext, revalidatePath } = vi.hoisted(() => ({ rpc: vi.fn(), requireHistoricalRentRecoveryContext: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireHistoricalRentRecoveryContext }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
import { correctFeePaymentDateAction, listFeePaymentDateCandidatesAction, previewFeePaymentDateCorrectionAction } from "./fee-payment-date-actions";

const allocationId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const input = { allocationId, paymentDate: "2026-09-09" };
const preview = { allocationId, oldDate: "2026-09-01", newDate: input.paymentDate, amount: 48.33, canApply: true, blockers: [], previewHash: "a".repeat(64), cashChangeOnEarlierDate: -48.33, currentBalanceChange: 0 };
const correction = { ...input, previewHash: preview.previewHash, reason: "Actual bank transfer date", idempotencyKey: "33333333-3333-4333-8333-333333333333" };

describe("fee payment date actions", () => {
  beforeEach(() => { vi.clearAllMocks(); requireHistoricalRentRecoveryContext.mockResolvedValue({ organizationId }); });

  it("loads candidates through the recovery permission boundary and organization", async () => {
    rpc.mockResolvedValue({ data: [{ allocationId, invoiceNumber: "INV-1", amount: 48.33, paymentDate: "2026-09-01", feeDate: "2026-09-01" }], error: null });
    expect((await listFeePaymentDateCandidatesAction(allocationId)).candidates).toHaveLength(1);
    expect(requireHistoricalRentRecoveryContext).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("list_fee_payment_date_candidates", { p_organization_id: organizationId, p_lease_id: allocationId });
  });

  it.each(["2026-02-30", "2026-13-01", "2026-2-02", "invalid"])("rejects invalid actual date %s before calling the database", async (paymentDate) => {
    expect((await previewFeePaymentDateCorrectionAction({ ...input, paymentDate })).status).toBe("error");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an output for another date or a contradictory preview", async () => {
    for (const data of [{ ...preview, newDate: "2026-09-10" }, { ...preview, currentBalanceChange: Number.NaN }, { ...preview, canApply: true, blockers: ["closed_period"] }]) {
      rpc.mockResolvedValue({ data, error: null });
      expect((await previewFeePaymentDateCorrectionAction(input)).status).toBe("error");
    }
  });

  it("retains the actual cash reconciliation effect", async () => {
    rpc.mockResolvedValue({ data: { ...preview, currentBalanceChange: 900 }, error: null });
    expect((await previewFeePaymentDateCorrectionAction(input)).preview?.currentBalanceChange).toBe(900);
  });

  it("retains blockers in a valid rejected preview", async () => {
    rpc.mockResolvedValue({ data: { ...preview, canApply: false, blockers: ["closed_period"] }, error: null });
    expect(await previewFeePaymentDateCorrectionAction(input)).toMatchObject({ status: "preview", preview: { canApply: false, blockers: ["closed_period"] } });
  });

  it("requires reason, preview hash and idempotency key", async () => {
    for (const values of [{ ...correction, reason: "" }, { ...correction, previewHash: "" }, { ...correction, idempotencyKey: "invalid" }]) {
      expect((await correctFeePaymentDateAction(values)).status).toBe("error");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the recovery permission check rejects", async () => {
    requireHistoricalRentRecoveryContext.mockRejectedValue(new Error("Forbidden"));
    await expect(correctFeePaymentDateAction(correction)).rejects.toThrow("Forbidden");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes reviewed inputs unchanged and refreshes records only after verified success", async () => {
    rpc.mockResolvedValue({ data: { correctionId: allocationId }, error: null });
    expect((await correctFeePaymentDateAction(correction)).status).toBe("success");
    expect(rpc).toHaveBeenCalledWith("correct_fee_payment_date", { p_organization_id: organizationId, p_allocation_id: allocationId, p_payment_date: input.paymentDate, p_reason: correction.reason, p_preview_hash: correction.previewHash, p_idempotency_key: correction.idempotencyKey });
    expect(revalidatePath).toHaveBeenCalledWith("/leases/[leaseId]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/properties/[propertyId]", "layout");
  });

  it("returns a stale preview error without refreshing records", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "stale_preview" } });
    expect(await correctFeePaymentDateAction(correction)).toMatchObject({ status: "error", message: expect.stringContaining("Preview the correction again") });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["financial_month_locked", "financial month affected"],
    ["fee_payment_date_owner_period_closed", "financial month affected"],
    ["fee_payment_date_would_underfund_owner_cash", "insufficient owner cash"],
    ["fee_payment_date_in_future", "today's business date"],
    ["fee_payment_date_owner_mismatch", "Check the ownership dates"],
    ["fee_payment_allocation_not_correctable", "choose an eligible settlement"],
    ["fee_payment_date_sources_changed", "Preview the correction again"],
    ["privileged_email_step_up_required", "Verify this signed-in session by email"],
  ])("explains database rejection %s", async (code, expected) => {
    rpc.mockResolvedValue({ data: null, error: { message: code } });
    expect(await correctFeePaymentDateAction(correction)).toMatchObject({ status: "error", message: expect.stringContaining(expected) });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
