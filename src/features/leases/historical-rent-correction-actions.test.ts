import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireHistoricalRentRecoveryContext, revalidatePath, rpc } =
  vi.hoisted(() => ({
    requireHistoricalRentRecoveryContext: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireHistoricalRentRecoveryContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

import {
  applyHistoricalRentCorrectionAction,
  previewHistoricalRentCorrectionAction,
} from "@/features/leases/historical-rent-correction-actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const invoiceId = "11111111-1111-4111-8111-111111111111";

describe("historical rent correction actions", () => {
  beforeEach(() => {
    requireHistoricalRentRecoveryContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireHistoricalRentRecoveryContext.mockResolvedValue({ organizationId });
  });

  it("previews through the Super Admin recovery boundary", async () => {
    rpc.mockResolvedValue({
      data: {
        blockers: [],
        canApply: true,
        correctedDueDate: "2026-08-10",
        correctedDueDay: 10,
        correctedRentAmount: 850,
        immutableEvidence: { invoiceHeaderRetained: true },
        invoiceId,
        invoiceNumber: "INV-202608-ABC",
        managementFeeDelta: -5,
        originalDueDate: "2026-08-05",
        originalDueDay: 5,
        originalManagementFeeAmount: 90,
        originalRentAmount: 900,
        previewHash: "a".repeat(64),
        projectedTenantCreditAmount: 50,
        rentDelta: -50,
      },
      error: null,
    });

    await expect(
      previewHistoricalRentCorrectionAction({}, correctionForm()),
    ).resolves.toMatchObject({
      preview: { canApply: true, projectedTenantCreditAmount: 50 },
      status: "preview",
    });
    expect(requireHistoricalRentRecoveryContext).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "preview_historical_rent_correction",
      {
        p_corrected_due_day: 10,
        p_corrected_rent_amount: 850,
        p_invoice_id: invoiceId,
        p_organization_id: organizationId,
      },
    );
  });

  it("applies only the exact preview hash and revalidates financial views", async () => {
    rpc.mockResolvedValue({
      data: { correctionId: "22222222-2222-4222-8222-222222222222" },
      error: null,
    });

    const form = correctionForm();
    form.set("previewHash", "a".repeat(64));
    await expect(
      applyHistoricalRentCorrectionAction({}, form),
    ).resolves.toMatchObject({
      message: "Historical rent corrected. Issued evidence was retained.",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("correct_historical_rent", {
      p_corrected_due_day: 10,
      p_corrected_rent_amount: 850,
      p_idempotency_key: "historical-rent:12345678",
      p_invoice_id: invoiceId,
      p_organization_id: organizationId,
      p_preview_hash: "a".repeat(64),
      p_reason: "Signed Lease evidence confirms the historical correction.",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/ledger");
    expect(revalidatePath).toHaveBeenCalledWith("/reports");
  });

  it("returns explicit reopen guidance from database blockers", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        details: '[{"code":"historical_rent_owner_close_reopen_required"}]',
        message: "historical_rent_correction_blocked",
      },
    });

    const form = correctionForm();
    form.set("previewHash", "a".repeat(64));
    await expect(
      applyHistoricalRentCorrectionAction({}, form),
    ).resolves.toMatchObject({
      message: expect.stringContaining("Reopen every affected Owner Close month"),
      status: "error",
    });
  });
});

function correctionForm() {
  const form = new FormData();
  form.set("correctedDueDay", "10");
  form.set("correctedRentAmount", "850.00");
  form.set("idempotencyKey", "historical-rent:12345678");
  form.set("invoiceId", invoiceId);
  form.set("reason", "Signed Lease evidence confirms the historical correction.");
  return form;
}
