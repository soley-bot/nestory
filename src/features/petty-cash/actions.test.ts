import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  requireFinancePettyCashContext: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireFinancePettyCashContext: mocks.requireFinancePettyCashContext,
  requireSuperAdminContext: mocks.requireSuperAdminContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ rpc: mocks.rpc })),
}));

import {
  createPettyCashAccountAction,
  createPettyCashEntryAction,
  openNextPettyCashPeriodAction,
  postPettyCashEntryAction,
  updatePettyCashEntryAction,
  voidPettyCashEntryAction,
} from "@/features/petty-cash/actions";

const accountId = "11111111-1111-4111-8111-111111111111";
const periodId = "22222222-2222-4222-8222-222222222222";
const entryId = "33333333-3333-4333-8333-333333333333";
const personId = "44444444-4444-4444-8444-444444444444";
const propertyId = "55555555-5555-4555-8555-555555555555";
const nextPropertyId = "66666666-6666-4666-8666-666666666666";

describe("petty cash actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinancePettyCashContext.mockResolvedValue({
      organizationId: "org-1",
    });
    mocks.requireSuperAdminContext.mockResolvedValue({ organizationId: "org-1" });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  it("creates an account with an optional Staff custodian", async () => {
    const formData = new FormData();
    formData.set("accountNumber", "pm-cash-02");
    formData.set("name", "Front desk cash");
    formData.set("floatAmount", "500");
    formData.set("custodianPersonId", personId);

    await createPettyCashAccountAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith("create_petty_cash_account", {
      p_account_number: "pm-cash-02",
      p_custodian_person_id: personId,
      p_float_amount: 500,
      p_name: "Front desk cash",
      p_organization_id: "org-1",
    });
  });

  it("sends only the linked Person ID and leaves snapshot derivation to SQL", async () => {
    const formData = makeEntryFormData();
    formData.set("counterpartyMode", "linked");
    formData.set("counterpartyPersonId", personId);
    formData.set("supplier", "Browser supplied wrong name");

    const result = await createPettyCashEntryAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_petty_cash_entry",
      expect.objectContaining({
        p_counterparty_person_id: personId,
        p_idempotency_key: "petty-entry-request-0001",
        p_supplier: null,
      }),
    );
    expect(result.status).toBe("success");
    expect(mocks.requireFinancePettyCashContext).toHaveBeenCalledOnce();
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
  });

  it("lets Finance authority post an existing entry without structural authority", async () => {
    const formData = new FormData();
    formData.set("entryId", entryId);

    await expect(postPettyCashEntryAction({}, formData)).resolves.toEqual({
      message: "Petty cash expense posted to ledger.",
      status: "success",
    });

    expect(mocks.requireFinancePettyCashContext).toHaveBeenCalledOnce();
    expect(mocks.requireSuperAdminContext).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("post_petty_cash_entry", {
      p_entry_id: entryId,
      p_organization_id: "org-1",
    });
  });

  it("retains Super Admin authority for account, correction, void, and rollover commands", async () => {
    const accountForm = new FormData();
    accountForm.set("accountNumber", "pm-cash-02");
    accountForm.set("name", "Front desk cash");
    accountForm.set("floatAmount", "500");
    accountForm.set("custodianPersonId", personId);
    await createPettyCashAccountAction({}, accountForm);

    const updateForm = makeEntryFormData();
    updateForm.set("entryId", entryId);
    await updatePettyCashEntryAction({}, updateForm);

    const voidForm = new FormData();
    voidForm.set("entryId", entryId);
    voidForm.set("voidReason", "Duplicate receipt");
    await voidPettyCashEntryAction({}, voidForm);

    const rolloverForm = new FormData();
    rolloverForm.set("accountId", accountId);
    rolloverForm.set("periodId", periodId);
    rolloverForm.set("advanceAmount", "100");
    await openNextPettyCashPeriodAction({}, rolloverForm);

    expect(mocks.requireSuperAdminContext).toHaveBeenCalledTimes(4);
    expect(mocks.requireFinancePettyCashContext).not.toHaveBeenCalled();
  });

  it("requires and sends a transaction-time external party name", async () => {
    const formData = makeEntryFormData();
    formData.set("counterpartyMode", "external");
    formData.set("supplier", "Walk-in locksmith");

    await createPettyCashEntryAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith(
      "create_petty_cash_entry",
      expect.objectContaining({
        p_counterparty_person_id: null,
        p_supplier: "Walk-in locksmith",
      }),
    );

    formData.set("supplier", "");
    const invalid = await createPettyCashEntryAction({}, formData);
    expect(invalid.fieldErrors?.supplier).toEqual([
      "Enter the external party name.",
    ]);
  });

  it("revalidates both previous and next property contexts after editing", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        entry_id: entryId,
        previous_property_id: propertyId,
        previous_unit_id: null,
        property_id: nextPropertyId,
        unit_id: null,
      },
      error: null,
    });
    const formData = makeEntryFormData();
    formData.set("entryId", entryId);
    formData.set("propertyId", nextPropertyId);
    formData.set("counterpartyMode", "linked");
    formData.set("counterpartyPersonId", personId);

    await updatePettyCashEntryAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith(
      "update_petty_cash_entry",
      expect.objectContaining({
        p_entry_id: entryId,
        p_organization_id: "org-1",
        p_property_id: nextPropertyId,
      }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/properties/${propertyId}`,
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/properties/${nextPropertyId}`,
    );
  });

  it("requires a reason and calls the dedicated void RPC", async () => {
    const formData = new FormData();
    formData.set("entryId", entryId);
    formData.set("voidReason", "Duplicate receipt");

    const result = await voidPettyCashEntryAction({}, formData);

    expect(mocks.rpc).toHaveBeenCalledWith("void_petty_cash_entry", {
      p_entry_id: entryId,
      p_organization_id: "org-1",
      p_reason: "Duplicate receipt",
    });
    expect(result.status).toBe("success");
  });
});

function makeEntryFormData() {
  const formData = new FormData();
  formData.set("accountId", accountId);
  formData.set("amount", "125.50");
  formData.set("category", "Repairs");
  formData.set("clearDate", "");
  formData.set("companyLossAmount", "0");
  formData.set("counterpartyMode", "external");
  formData.set("counterpartyPersonId", "");
  formData.set("description", "Replace lock");
  formData.set("economicScope", "property_expense");
  formData.set("entryKind", "expense");
  formData.set("invoiceDate", "2026-07-10");
  formData.set("idempotencyKey", "petty-entry-request-0001");
  formData.set("ownerBillStatus", "not_billable");
  formData.set("ownerReimbursableAmount", "0");
  formData.set("ownerReimbursedAmount", "0");
  formData.set("periodId", periodId);
  formData.set("propertyId", propertyId);
  formData.set("receiptReference", "R-125");
  formData.set("remark", "");
  formData.set("status", "cleared");
  formData.set("supplier", "Walk-in locksmith");
  formData.set("unitId", "");
  return formData;
}
