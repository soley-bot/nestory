import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireAdminContext: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    const query = {
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      maybeSingle: mocks.maybeSingle,
      select: vi.fn(() => query),
    };
    return { from: vi.fn(() => query), rpc: mocks.rpc };
  }),
}));

import {
  recordRentIncomePaymentAction,
  reverseRentIncomeReceiptAction,
} from "./actions";

describe("recordRentIncomePaymentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminContext.mockResolvedValue({ organizationId: "org-1" });
    mocks.rpc.mockResolvedValue({
      data: { outstanding_balance_after: 275 },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        property_id: "property-1",
        unit_id: "unit-1",
      },
      error: null,
    });
  });

  it("records a receipt event with the submitted property cash details", async () => {
    const formData = new FormData();
    formData.set("incomeItemId", "11111111-1111-4111-8111-111111111111");
    formData.set("amountReceived", "125.50");
    formData.set("receivedDate", "2026-07-10");
    formData.set("reference", "RENT-125");
    formData.set(
      "reconciliationSourceId",
      "22222222-2222-4222-8222-222222222222",
    );
    formData.set("idempotencyKey", "receipt-attempt-1");

    const result = await recordRentIncomePaymentAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_receipt_v2", {
      p_amount: 125.5,
      p_idempotency_key: "receipt-attempt-1",
      p_income_item_id: "11111111-1111-4111-8111-111111111111",
      p_organization_id: "org-1",
      p_reconciliation_source_id:
        "22222222-2222-4222-8222-222222222222",
      p_received_date: "2026-07-10",
      p_reference: "RENT-125",
    });
    expect(result).toEqual({
      message:
        "Receipt recorded and projected. The remaining balance can still accept another receipt.",
      status: "success",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/overview");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/rent-income");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reports");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/timeline");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/property-timeline");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/financial-timeline");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/properties/property-1",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/units/unit-1");
  });

  it("lets the checked RPC resolve a retry after compatibility balance changes", async () => {
    mocks.rpc.mockResolvedValue({
      data: { outstanding_balance_after: 0 },
      error: null,
    });

    const formData = new FormData();
    formData.set("incomeItemId", "11111111-1111-4111-8111-111111111111");
    formData.set("amountReceived", "400");
    formData.set("receivedDate", "2026-07-10");
    formData.set("reference", "RENT-FULL");
    formData.set(
      "reconciliationSourceId",
      "22222222-2222-4222-8222-222222222222",
    );
    formData.set("idempotencyKey", "receipt-retry-lost-response");

    const result = await recordRentIncomePaymentAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_receipt_v2", {
      p_amount: 400,
      p_idempotency_key: "receipt-retry-lost-response",
      p_income_item_id: "11111111-1111-4111-8111-111111111111",
      p_organization_id: "org-1",
      p_reconciliation_source_id:
        "22222222-2222-4222-8222-222222222222",
      p_received_date: "2026-07-10",
      p_reference: "RENT-FULL",
    });
    expect(result).toEqual({
      message:
        "Receipt recorded and projected. The income balance is fully settled.",
      status: "success",
    });
  });

  it("reverses one exact receipt with a required reason and idempotency key", async () => {
    const formData = new FormData();
    formData.set("receiptId", "33333333-3333-4333-8333-333333333333");
    formData.set("reversalDate", "2026-07-12");
    formData.set("reason", "Payment returned");
    formData.set(
      "reconciliationSourceId",
      "22222222-2222-4222-8222-222222222222",
    );
    formData.set("idempotencyKey", "reversal-attempt-1");
    formData.set("propertyId", "44444444-4444-4444-8444-444444444444");
    formData.set("unitId", "55555555-5555-4555-8555-555555555555");

    const result = await reverseRentIncomeReceiptAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith("reverse_finance_receipt_v2", {
      p_idempotency_key: "reversal-attempt-1",
      p_organization_id: "org-1",
      p_reason: "Payment returned",
      p_receipt_id: "33333333-3333-4333-8333-333333333333",
      p_reconciliation_source_id:
        "22222222-2222-4222-8222-222222222222",
      p_reversal_date: "2026-07-12",
    });
    expect(result).toEqual({
      message: "Receipt reversed with linked Ledger and journal evidence.",
      status: "success",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/properties/44444444-4444-4444-8444-444444444444",
    );
  });
});
