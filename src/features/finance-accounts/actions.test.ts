import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireFinanceContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireFinanceContext: mocks.requireFinanceContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import {
  createFinanceAccountAction,
  setFinanceAccountArchivedAction,
  updateFinanceAccountAction,
} from "@/features/finance-accounts/actions";

const initialState = {};
const organizationId = "10000000-0000-4000-8000-000000000001";
const accountId = "20000000-0000-4000-8000-000000000001";

describe("Finance account actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinanceContext.mockResolvedValue({ organizationId });
    mocks.rpc.mockResolvedValue({ data: accountId, error: null });
  });

  it("creates an expense account enabled for lease credits through the checked RPC", async () => {
    const state = await createFinanceAccountAction(initialState, accountForm({
      accountClass: "expense",
      accountSubtype: "expense",
      displayName: "Landscaping",
      description: "Routine grounds care",
      useForLeaseCredits: "on",
    }));

    expect(state).toEqual({ message: "Account added.", status: "success" });
    expect(mocks.requireFinanceContext).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("create_finance_account", {
      p_account_class: "expense",
      p_account_number: null,
      p_account_subtype: "expense",
      p_description: "Routine grounds care",
      p_display_name: "Landscaping",
      p_organization_id: organizationId,
      p_parent_account_id: null,
      p_property_id: null,
      p_use_for_lease_charges: false,
      p_use_for_lease_credits: true,
      p_use_for_lease_deposits: false,
    });
    expect(mocks.revalidatePath.mock.calls).toEqual([
      ["/finance/accounts"],
      ["/bills-expenses"],
      ["/rent-income"],
    ]);
  });

  it("rejects an expense account enabled for lease charges before it reaches the RPC", async () => {
    const state = await createFinanceAccountAction(initialState, accountForm({
      accountClass: "expense",
      accountSubtype: "expense",
      displayName: "Landscaping",
      useForLeaseCharges: "on",
    }));

    expect(state).toEqual({
      fieldErrors: { useForLeaseCharges: ["Lease charges use an Income account."] },
      status: "error",
    });
    expect(mocks.requireFinanceContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps a duplicate account name open for correction", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate" } });

    const state = await createFinanceAccountAction(initialState, accountForm({
      accountClass: "expense",
      accountSubtype: "expense",
      displayName: "Landscaping",
    }));

    expect(state).toEqual({
      fieldErrors: { displayName: ["Use a unique account name."] },
      status: "error",
    });
  });

  it("returns a field error when the checked hierarchy boundary rejects a grandchild", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: {
      code: "23514", message: "Accounts support only one level of sub-accounts",
    } });
    const state = await updateFinanceAccountAction(initialState, accountForm({
      accountClass: "expense", accountSubtype: "expense", accountId,
      displayName: "Root", parentAccountId: "30000000-0000-4000-8000-000000000001",
    }));
    expect(state).toEqual({ status: "error", fieldErrors: {
      parentAccountId: ["Move this account's sub-accounts before choosing a parent."],
    } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("updates editable account details through the checked RPC", async () => {
    const state = await updateFinanceAccountAction(initialState, accountForm({
      accountClass: "income",
      accountId,
      accountNumber: "4100",
      accountSubtype: "income",
      displayName: "Rental income",
      parentAccountId: "30000000-0000-4000-8000-000000000001",
      useForLeaseCharges: "on",
    }));

    expect(state).toEqual({ message: "Account updated.", status: "success" });
    expect(mocks.rpc).toHaveBeenCalledWith("update_finance_account", {
      p_account_id: accountId,
      p_account_number: "4100",
      p_description: null,
      p_display_name: "Rental income",
      p_organization_id: organizationId,
      p_parent_account_id: "30000000-0000-4000-8000-000000000001",
      p_property_id: null,
      p_use_for_lease_charges: true,
      p_use_for_lease_credits: false,
      p_use_for_lease_deposits: false,
    });
  });

  it("archives an account through the checked lifecycle RPC", async () => {
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("archived", "true");
    formData.set("replacementAccountId", "30000000-0000-4000-8000-000000000001");

    const state = await setFinanceAccountArchivedAction(initialState, formData);

    expect(state).toEqual({ message: "Account made inactive.", status: "success" });
    expect(mocks.rpc).toHaveBeenCalledWith("set_finance_account_archived", {
      p_account_id: accountId,
      p_archived: true,
      p_organization_id: organizationId,
      p_replacement_account_id: "30000000-0000-4000-8000-000000000001",
    });
  });

  it("sends an explicit null replacement when making an account inactive without one", async () => {
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("archived", "true");

    await setFinanceAccountArchivedAction(initialState, formData);

    expect(mocks.rpc).toHaveBeenCalledWith("set_finance_account_archived", {
      p_account_id: accountId,
      p_archived: true,
      p_organization_id: organizationId,
      p_replacement_account_id: null,
    });
  });

  it("explains when an account needs a replacement before it can be made inactive", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "55000", message: "Choose a replacement default before making this account inactive" },
    });
    const formData = new FormData();
    formData.set("accountId", accountId);
    formData.set("archived", "true");

    const state = await setFinanceAccountArchivedAction(initialState, formData);

    expect(state).toEqual({
      fieldErrors: { replacementAccountId: ["Choose a replacement default before making this account inactive."] },
      status: "error",
    });
  });

  it("rethrows an unexpected database error without replacing it", async () => {
    const unexpectedError = { code: "XX000", message: "Unexpected database failure" };
    mocks.rpc.mockResolvedValue({ data: null, error: unexpectedError });

    await expect(
      createFinanceAccountAction(initialState, accountForm({
        accountClass: "expense",
        accountSubtype: "expense",
        displayName: "Landscaping",
      })),
    ).rejects.toBe(unexpectedError);
  });
});

function accountForm(values: Record<string, string> = {}) {
  const formData = new FormData();
  const defaults: Record<string, string> = {
    accountClass: "asset",
    accountNumber: "",
    accountSubtype: "bank",
    description: "",
    displayName: "Operating account",
    parentAccountId: "",
    propertyId: "",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...values })) {
    formData.set(key, value);
  }
  return formData;
}
