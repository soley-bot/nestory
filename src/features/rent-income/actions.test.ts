import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireAdminContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireAdminContext: mocks.requireAdminContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import { recordRentIncomePaymentAction } from "./actions";

describe("recordRentIncomePaymentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminContext.mockResolvedValue({ organizationId: "org-1" });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("records a receipt event with the submitted property cash details", async () => {
    const formData = new FormData();
    formData.set("incomeItemId", "11111111-1111-4111-8111-111111111111");
    formData.set("amountReceived", "125.50");
    formData.set("receivedDate", "2026-07-10");
    formData.set("reference", "RENT-125");

    const result = await recordRentIncomePaymentAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_receipt", {
      p_amount: 125.5,
      p_income_item_id: "11111111-1111-4111-8111-111111111111",
      p_organization_id: "org-1",
      p_received_date: "2026-07-10",
      p_reference: "RENT-125",
    });
    expect(result).toEqual({ message: "Receipt recorded.", status: "success" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/overview");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/rent-income");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reports");
  });
});
