import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireClose: vi.fn(),
  requireReopen: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireOwnerCloseContext: mocks.requireClose,
  requireOwnerMonthReopenContext: mocks.requireReopen,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import {
  closeOwnerMonthAction,
  recordOwnerCloseCorrectionAction,
  reopenOwnerMonthAction,
} from "@/features/owner-close/actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const seriesId = "00000000-0000-4000-8000-000000000004";
const revisionId = "00000000-0000-4000-8000-000000000005";

describe("owner close checked actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireClose.mockResolvedValue({ organizationId });
    mocks.requireReopen.mockResolvedValue({ organizationId });
    mocks.rpc.mockResolvedValue({ data: { status: "completed" }, error: null });
  });

  it("closes one exact scope through Super Admin close authority", async () => {
    await closeOwnerMonthAction(form({
      closeReason: "Reviewed against the August bank reconciliation",
      currency: "USD",
      idempotencyKey: "owner-close-august-r1",
      monthStart: "2026-08-01",
      ownerPersonId: ownerId,
      propertyId,
    }));

    expect(mocks.requireClose).toHaveBeenCalledOnce();
    expect(mocks.requireReopen).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("close_owner_month", {
      p_close_reason: "Reviewed against the August bank reconciliation",
      p_currency: "USD",
      p_idempotency_key: "owner-close-august-r1",
      p_month_start: "2026-08-01",
      p_organization_id: organizationId,
      p_owner_person_id: ownerId,
      p_property_id: propertyId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balances");
  });

  it("reopens the immutable revision through distinct Super Admin authority", async () => {
    await reopenOwnerMonthAction(form({
      idempotencyKey: "owner-reopen-august-r2",
      reopenReason: "Late paid cost belongs to the locked August owner month",
      seriesId,
    }));

    expect(mocks.requireReopen).toHaveBeenCalledOnce();
    expect(mocks.requireClose).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("reopen_owner_month", {
      p_idempotency_key: "owner-reopen-august-r2",
      p_organization_id: organizationId,
      p_owner_close_series_id: seriesId,
      p_reopen_reason: "Late paid cost belongs to the locked August owner month",
    });
  });

  it("preserves a signed exact decimal and evidence on the checked correction", async () => {
    await recordOwnerCloseCorrectionAction(form({
      component: "ips_held_owner_cash",
      effectiveDate: "2026-08-31",
      evidenceSha256: "a".repeat(64),
      idempotencyKey: "owner-close-correction-august-r2",
      reason: "Record bank charge discovered after revision one",
      revisionId,
      signedAmount: "-900719925474.09",
      sourceReference: "BANK-ADVICE-2026-08-31-001",
    }));

    expect(mocks.requireReopen).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("record_owner_close_correction", {
      p_component: "ips_held_owner_cash",
      p_effective_date: "2026-08-31",
      p_evidence_sha256: "a".repeat(64),
      p_idempotency_key: "owner-close-correction-august-r2",
      p_organization_id: organizationId,
      p_owner_close_revision_id: revisionId,
      p_reason: "Record bank charge discovered after revision one",
      p_signed_amount: "-900719925474.09",
      p_source_reference: "BANK-ADVICE-2026-08-31-001",
    });
  });

  it("rejects rounded, zero, and noncanonical corrections before authority", async () => {
    for (const signedAmount of ["1.001", "0", "1e3"]) {
      await expect(recordOwnerCloseCorrectionAction(form({
        component: "ips_due_to_owner",
        effectiveDate: "2026-08-31",
        evidenceSha256: "b".repeat(64),
        idempotencyKey: "owner-close-correction-invalid",
        reason: "Invalid amount must never reach the database",
        revisionId,
        signedAmount,
        sourceReference: "BANK-ADVICE-INVALID",
      }))).rejects.toThrow();
    }

    expect(mocks.requireReopen).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
