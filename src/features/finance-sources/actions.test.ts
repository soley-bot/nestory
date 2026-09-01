import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireSuperAdminContext: mocks.requireSuperAdminContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import {
  archiveFinanceSourceAction,
  createFinanceSourceAction,
  restoreFinanceSourceAction,
  updateFinanceSourceAction,
} from "@/features/finance-sources/actions";

describe("Finance source actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdminContext.mockResolvedValue({
      organizationId: "10000000-0000-4000-8000-000000000001",
    });
    mocks.rpc.mockResolvedValue({ data: "source-1", error: null });
  });

  it("creates a normalized organization-pooled source through the checked RPC", async () => {
    const formData = new FormData();
    formData.set("code", "  operating_bank  ");
    formData.set("displayName", "Operating bank");
    formData.set("sourceKind", "bank");
    formData.set("scopeKind", "organization_pooled");
    formData.set("maskedReference", "Ending 4821");

    await expect(createFinanceSourceAction({}, formData)).resolves.toEqual({
      message: "Funding source added.",
      status: "success",
    });
    expect(mocks.requireSuperAdminContext).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_financial_reconciliation_source",
      {
        p_code: "OPERATING_BANK",
        p_currency: "USD",
        p_display_name: "Operating bank",
        p_masked_reference: "Ending 4821",
        p_organization_id: "10000000-0000-4000-8000-000000000001",
        p_property_id: undefined,
        p_scope_kind: "organization_pooled",
        p_source_kind: "bank",
      },
    );
  });

  it("requires a property for a property-dedicated source before authorization", async () => {
    const formData = new FormData();
    formData.set("code", "PROPERTY_BANK");
    formData.set("displayName", "Property bank");
    formData.set("sourceKind", "bank");
    formData.set("scopeKind", "property_dedicated");

    await expect(createFinanceSourceAction({}, formData)).resolves.toEqual({
      fieldErrors: { propertyId: ["Choose the dedicated property."] },
      status: "error",
    });
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("renames only the editable label and masked reference", async () => {
    const formData = sourceForm();
    formData.set("displayName", "Main operating account");
    formData.set("maskedReference", "Ending 9910");

    await expect(updateFinanceSourceAction({}, formData)).resolves.toEqual({
      message: "Funding source details updated.",
      status: "success",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_financial_reconciliation_source_label",
      {
        p_display_name: "Main operating account",
        p_masked_reference: "Ending 9910",
        p_organization_id: "10000000-0000-4000-8000-000000000001",
        p_source_id: "20000000-0000-4000-8000-000000000001",
      },
    );
  });

  it.each([
    [archiveFinanceSourceAction, "archive_financial_reconciliation_source", "Funding source archived."],
    [restoreFinanceSourceAction, "restore_financial_reconciliation_source", "Funding source restored."],
  ] as const)("uses checked lifecycle authority", async (action, rpcName, message) => {
    await expect(action({}, sourceForm())).resolves.toEqual({
      message,
      status: "success",
    });
    expect(mocks.requireSuperAdminContext).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith(rpcName, {
      p_organization_id: "10000000-0000-4000-8000-000000000001",
      p_source_id: "20000000-0000-4000-8000-000000000001",
    });
  });
});

function sourceForm() {
  const formData = new FormData();
  formData.set("sourceId", "20000000-0000-4000-8000-000000000001");
  return formData;
}
