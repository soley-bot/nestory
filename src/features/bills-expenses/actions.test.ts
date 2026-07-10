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

import { postBillsExpenseItemAction } from "./actions";

describe("postBillsExpenseItemAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminContext.mockResolvedValue({ organizationId: "org-1" });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("records the submitted outstanding property payment", async () => {
    const formData = new FormData();
    formData.set("expenseItemId", "22222222-2222-4222-8222-222222222222");
    formData.set("amount", "150");
    formData.set("paidDate", "2026-07-10");
    formData.set("propertyId", "33333333-3333-4333-8333-333333333333");
    formData.set("reference", "INV-200");
    formData.set("unitId", "44444444-4444-4444-8444-444444444444");

    const result = await postBillsExpenseItemAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith("record_finance_payment", {
      p_amount: 150,
      p_expense_item_id: "22222222-2222-4222-8222-222222222222",
      p_organization_id: "org-1",
      p_paid_date: "2026-07-10",
      p_reference: "INV-200",
    });
    expect(result).toEqual({ message: "Payment recorded.", status: "success" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/overview");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/bills-expenses");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/rent-income");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/reports");
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/properties/33333333-3333-4333-8333-333333333333",
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/units/44444444-4444-4444-8444-444444444444",
    );
  });
});
