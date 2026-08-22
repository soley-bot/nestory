import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCorrection: vi.fn(),
  requireOwnerClose: vi.fn(),
  requireOperation: vi.fn(),
  requireSuperAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireFinanceCorrectionContext: mocks.requireCorrection,
  requireFinanceOperationContext: mocks.requireOperation,
  requireOwnerCloseContext: mocks.requireOwnerClose,
  requireSuperAdminContext: mocks.requireSuperAdmin,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import {
  allocateOwnerEventAction,
  generateOwnerBalancePeriodAction,
  recordOwnerCashEventAction,
  recordOwnerDistributionAction,
  reverseOwnerInvoicePaymentAction,
  reversePropertyWithdrawalAction,
  transferOwnerBalanceComponentAction,
} from "@/features/owner-balances/lifecycle-actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const ownerId = "00000000-0000-4000-8000-000000000003";
const toOwnerId = "00000000-0000-4000-8000-000000000004";
const sourceLineId = "00000000-0000-4000-8000-000000000005";
const paymentId = "00000000-0000-4000-8000-000000000006";
const withdrawalId = "00000000-0000-4000-8000-000000000007";

describe("owner balance lifecycle actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOperation.mockResolvedValue({ organizationId });
    mocks.requireOwnerClose.mockResolvedValue({ organizationId });
    mocks.requireCorrection.mockResolvedValue({ organizationId });
    mocks.requireSuperAdmin.mockResolvedValue({ organizationId });
    mocks.rpc.mockResolvedValue({ data: { status: "completed" }, error: null });
  });

  it("separates source allocation from close-period generation authority", async () => {
    await allocateOwnerEventAction(form({
      idempotencyKey: "allocate-source-0001",
      sourceLineId,
      sourceType: "owner_paid_cost",
    }));
    await generateOwnerBalancePeriodAction(form({
      currency: "USD",
      idempotencyKey: "generate-period-0001",
      monthStart: "2026-08-01",
      ownerPersonId: ownerId,
      propertyId,
    }));

    expect(mocks.requireOperation).toHaveBeenCalledOnce();
    expect(mocks.requireOwnerClose).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "allocate_owner_event", {
      p_idempotency_key: "allocate-source-0001",
      p_organization_id: organizationId,
      p_source_line_id: sourceLineId,
      p_source_type: "owner_paid_cost",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "generate_owner_balance_period", {
      p_currency: "USD",
      p_idempotency_key: "generate-period-0001",
      p_month_start: "2026-08-01",
      p_organization_id: organizationId,
      p_owner_person_id: ownerId,
      p_property_id: propertyId,
    });
  });

  it("passes owner cash and distribution amounts as canonical decimal strings", async () => {
    await recordOwnerCashEventAction(form({
      amount: "900719925474.09",
      currency: "USD",
      eventDate: "2026-08-10",
      eventType: "owner_contribution",
      idempotencyKey: "owner-cash-event-0001",
      ownerPersonId: ownerId,
      propertyId,
      reason: "Owner funded reserve",
    }));
    await recordOwnerDistributionAction(form({
      amount: "40.01",
      currency: "USD",
      distributionDate: "2026-08-20",
      idempotencyKey: "owner-distribution-0001",
      ownerPersonId: ownerId,
      propertyId,
      reference: "BANK-40-01",
    }));

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "record_owner_cash_event", {
      p_amount: "900719925474.09",
      p_currency: "USD",
      p_event_date: "2026-08-10",
      p_event_type: "owner_contribution",
      p_idempotency_key: "owner-cash-event-0001",
      p_organization_id: organizationId,
      p_owner_person_id: ownerId,
      p_property_id: propertyId,
      p_reason: "Owner funded reserve",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "record_owner_distribution", {
      p_amount: "40.01",
      p_currency: "USD",
      p_distribution_date: "2026-08-20",
      p_idempotency_key: "owner-distribution-0001",
      p_organization_id: organizationId,
      p_owner_person_id: ownerId,
      p_property_id: propertyId,
      p_reference: "BANK-40-01",
    });
    expect(mocks.requireOperation).toHaveBeenCalledTimes(2);
  });

  it("uses canCorrectFinance authority for both safe reversal paths", async () => {
    await reverseOwnerInvoicePaymentAction(form({
      idempotencyKey: "reverse-owner-payment-0001",
      ownerPaymentId: paymentId,
      reason: "Duplicate bank receipt",
      reversalDate: "2026-08-21",
    }));
    await reversePropertyWithdrawalAction(form({
      idempotencyKey: "reverse-withdrawal-0001",
      reason: "Bank transfer returned",
      reversalDate: "2026-08-22",
      withdrawalId,
    }));

    expect(mocks.requireCorrection).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "reverse_owner_invoice_payment", {
      p_idempotency_key: "reverse-owner-payment-0001",
      p_organization_id: organizationId,
      p_owner_payment_id: paymentId,
      p_reason: "Duplicate bank receipt",
      p_reversal_date: "2026-08-21",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "reverse_property_withdrawal", {
      p_idempotency_key: "reverse-withdrawal-0001",
      p_organization_id: organizationId,
      p_reason: "Bank transfer returned",
      p_reversal_date: "2026-08-22",
      p_withdrawal_id: withdrawalId,
    });
  });

  it("keeps explicit component transfer behind Super Admin authority and exact evidence", async () => {
    await transferOwnerBalanceComponentAction(form({
      amount: "25.25",
      component: "ips_held_owner_cash",
      currency: "USD",
      effectiveDate: "2026-08-23",
      evidenceReference: "SIGNED-TRANSFER-001",
      evidenceSha256: "a".repeat(64),
      fromOwnerPersonId: ownerId,
      idempotencyKey: "owner-transfer-0001",
      propertyId,
      reason: "Signed beneficial ownership transfer",
      toOwnerPersonId: toOwnerId,
    }));

    expect(mocks.requireSuperAdmin).toHaveBeenCalledOnce();
    expect(mocks.requireOperation).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("transfer_owner_balance_component", {
      p_amount: "25.25",
      p_component: "ips_held_owner_cash",
      p_currency: "USD",
      p_effective_date: "2026-08-23",
      p_evidence_reference: "SIGNED-TRANSFER-001",
      p_evidence_sha256: "a".repeat(64),
      p_from_owner_person_id: ownerId,
      p_idempotency_key: "owner-transfer-0001",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_reason: "Signed beneficial ownership transfer",
      p_to_owner_person_id: toOwnerId,
    });
  });

  it("rejects noncanonical money before resolving authority or invoking an RPC", async () => {
    await expect(recordOwnerCashEventAction(form({
      amount: "1.001",
      currency: "USD",
      eventDate: "2026-08-10",
      eventType: "owner_contribution",
      idempotencyKey: "owner-cash-event-0001",
      ownerPersonId: ownerId,
      propertyId,
      reason: "Owner funded reserve",
    }))).rejects.toThrow(/nonnegative amount/i);

    expect(mocks.requireOperation).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("preserves exact downstream source links from a guarded reversal failure", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        message: `dependent_owner_cash:[{"consumer_source_type":"owner_distribution","consumer_source_id":"${withdrawalId}","consumer_source_line_id":"${withdrawalId}","consumed_amount":"40.01"}]`,
      },
    });

    await expect(reverseOwnerInvoicePaymentAction(form({
      idempotencyKey: "reverse-owner-payment-0001",
      ownerPaymentId: paymentId,
      reason: "Duplicate bank receipt",
      reversalDate: "2026-08-21",
    }))).rejects.toThrow(`dependent_owner_cash`);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the authoritative route only after a checked command succeeds", async () => {
    await allocateOwnerEventAction(form({
      idempotencyKey: "allocate-source-0001",
      sourceLineId,
      sourceType: "owner_paid_cost",
    }));

    expect(mocks.revalidatePath).toHaveBeenCalledWith("/balances");
  });
});

function form(values: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}
