import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdminContext,
  requireFinanceReviewContext,
  requireFinanceReversalContext,
  requireFinanceSubmissionContext,
  requireLeaseConfigurationContext,
  revalidatePath,
  rpc,
} = vi.hoisted(() => ({
  requireAdminContext: vi.fn(),
  requireFinanceReviewContext: vi.fn(),
  requireFinanceReversalContext: vi.fn(),
  requireFinanceSubmissionContext: vi.fn(),
  requireLeaseConfigurationContext: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireAdminContext,
  requireFinanceReviewContext,
  requireFinanceReversalContext,
  requireFinanceSubmissionContext,
  requireLeaseConfigurationContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

import {
  recoverLeaseRentPeriodAction,
  recoverRentGenerationExceptionAction,
  reverseExpenseAction,
  reviewExpenseAction,
  submitExpenseAction,
} from "@/features/finance-operations/actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const exceptionId = "00000000-0000-4000-8000-000000000002";
const leaseId = "00000000-0000-4000-8000-000000000006";
const propertyId = "00000000-0000-4000-8000-000000000003";
const sourceId = "00000000-0000-4000-8000-000000000004";
const submissionId = "00000000-0000-4000-8000-000000000005";

describe("rent generation recovery action", () => {
  beforeEach(() => {
    requireAdminContext.mockReset();
    requireFinanceReviewContext.mockReset();
    requireFinanceReversalContext.mockReset();
    requireFinanceSubmissionContext.mockReset();
    requireLeaseConfigurationContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireLeaseConfigurationContext.mockResolvedValue({ organizationId });
    requireFinanceSubmissionContext.mockResolvedValue({ organizationId });
    requireFinanceReviewContext.mockResolvedValue({ organizationId });
    requireFinanceReversalContext.mockResolvedValue({ organizationId });
  });

  it("uses the lease-configuration context and retries only the selected exception", async () => {
    rpc.mockResolvedValue({
      data: { invoiceId: "invoice-1", status: "generated" },
      error: null,
    });
    const formData = new FormData();
    formData.set("exceptionId", exceptionId);

    await expect(
      recoverRentGenerationExceptionAction({}, formData),
    ).resolves.toEqual({
      message: "Rent generation retried.",
      status: "success",
    });
    expect(requireLeaseConfigurationContext).toHaveBeenCalledOnce();
    expect(requireAdminContext).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("recover_rent_generation_exception", {
      p_exception_id: exceptionId,
      p_organization_id: organizationId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/rent-income");
  });

  it("returns the database-approved safe message when setup still blocks rent", async () => {
    rpc.mockResolvedValue({
      data: {
        code: "billing_recipient_invalid",
        message: "Select an active billing recipient for the lease.",
        status: "failed",
      },
      error: null,
    });
    const formData = new FormData();
    formData.set("exceptionId", exceptionId);

    await expect(
      recoverRentGenerationExceptionAction({}, formData),
    ).resolves.toEqual({
      message: "Select an active billing recipient for the lease.",
      status: "error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("generates only the selected historical lease month", async () => {
    rpc.mockResolvedValue({
      data: { invoiceId: "invoice-1", status: "generated" },
      error: null,
    });
    const formData = new FormData();
    formData.set("billingPeriod", "2026-07");
    formData.set("leaseId", leaseId);

    await expect(recoverLeaseRentPeriodAction({}, formData)).resolves.toEqual({
      message: "Historical rent month generated.",
      status: "success",
    });
    expect(requireLeaseConfigurationContext).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("recover_lease_rent_period", {
      p_billing_period_start: "2026-07-01",
      p_lease_id: leaseId,
      p_organization_id: organizationId,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/rent-income");
  });

  it("rejects an invalid recovery month before authorization", async () => {
    const formData = new FormData();
    formData.set("billingPeriod", "July 2026");
    formData.set("leaseId", leaseId);

    await expect(
      recoverLeaseRentPeriodAction({}, formData),
    ).resolves.toMatchObject({
      message: "Choose a historical rent month.",
      status: "error",
    });
    expect(requireLeaseConfigurationContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid exception identity before authorization or RPC access", async () => {
    const formData = new FormData();
    formData.set("exceptionId", "not-a-record");

    await expect(
      recoverRentGenerationExceptionAction({}, formData),
    ).resolves.toMatchObject({ status: "error" });
    expect(requireLeaseConfigurationContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("expense approval actions", () => {
  beforeEach(() => {
    requireFinanceReviewContext.mockReset();
    requireFinanceReversalContext.mockReset();
    requireFinanceSubmissionContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireFinanceSubmissionContext.mockResolvedValue({ organizationId });
    requireFinanceReviewContext.mockResolvedValue({ organizationId });
    requireFinanceReversalContext.mockResolvedValue({ organizationId });
  });

  it("submits evidence through the Finance Member capability without recording money", async () => {
    rpc.mockResolvedValue({ data: submissionId, error: null });
    const formData = new FormData();
    formData.set("category", "cleaning");
    formData.set("expenseDate", "2026-08-08");
    formData.set("idempotencyKey", "expense-submit-1");
    formData.set("internalCost", "200");
    formData.set("internalMarkup", "20");
    formData.set("propertyId", propertyId);
    formData.set("reconciliationSourceId", sourceId);
    formData.set("reference", "Receipt 42");
    formData.set("responsibility", "owner");
    formData.set("tenantInvoiceId", "");
    formData.set("unitId", "");
    formData.set("vendorLabel", "Sokha Repairs");

    await expect(submitExpenseAction({}, formData)).resolves.toEqual({
      message: "Expense submitted for Finance review.",
      status: "success",
    });
    expect(requireFinanceSubmissionContext).toHaveBeenCalledOnce();
    expect(requireFinanceReviewContext).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("submit_expense", {
      p_currency: "USD",
      p_customer_category: "cleaning",
      p_expense_date: "2026-08-08",
      p_idempotency_key: "expense-submit-1",
      p_internal_cost_amount: 200,
      p_internal_markup_amount: 20,
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_reconciliation_source_id: sourceId,
      p_reference: "Receipt 42",
      p_responsibility: "owner",
      p_source_id: null,
      p_source_type: "general",
      p_supporting_document_id: null,
      p_tenant_invoice_id: null,
      p_unit_id: null,
      p_vendor_label: "Sokha Repairs",
      p_vendor_person_id: null,
    });
  });

  it("rejects an expense without a receipt reference before authorization", async () => {
    const formData = new FormData();
    formData.set("category", "cleaning");
    formData.set("expenseDate", "2026-08-08");
    formData.set("idempotencyKey", "expense-submit-no-evidence");
    formData.set("internalCost", "200");
    formData.set("internalMarkup", "0");
    formData.set("propertyId", propertyId);
    formData.set("reconciliationSourceId", sourceId);
    formData.set("reference", "");
    formData.set("responsibility", "owner");
    formData.set("tenantInvoiceId", "");
    formData.set("unitId", "");
    formData.set("vendorLabel", "Sokha Repairs");

    await expect(submitExpenseAction({}, formData)).resolves.toEqual({
      message: "Enter a receipt or payment reference.",
      status: "error",
    });
    expect(requireFinanceSubmissionContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses Finance Manager review authority for approval", async () => {
    rpc.mockResolvedValue({ data: submissionId, error: null });
    const formData = expenseDecisionForm("approve", "Reviewed receipt");

    await expect(reviewExpenseAction({}, formData)).resolves.toEqual({
      message: "Expense approved and recorded.",
      status: "success",
    });
    expect(requireFinanceReviewContext).toHaveBeenCalledOnce();
    expect(requireFinanceSubmissionContext).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("review_expense", {
      p_decision: "approve",
      p_idempotency_key: "expense-review-1",
      p_organization_id: organizationId,
      p_reason: "Reviewed receipt",
      p_reconciliation_source_id: null,
      p_submission_id: submissionId,
    });
  });

  it("passes the funding source selected for maintenance approval", async () => {
    rpc.mockResolvedValue({ data: submissionId, error: null });
    const formData = expenseDecisionForm("approve", "Reviewed receipt");
    formData.set("reconciliationSourceId", sourceId);

    await expect(reviewExpenseAction({}, formData)).resolves.toMatchObject({
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "review_expense",
      expect.objectContaining({ p_reconciliation_source_id: sourceId }),
    );
  });

  it("rejects a too-short optional approval note before database access", async () => {
    const formData = expenseDecisionForm("approve", "ok");

    await expect(reviewExpenseAction({}, formData)).resolves.toEqual({
      message: "Review notes must contain at least 3 characters.",
      status: "error",
    });
    expect(requireFinanceReviewContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires a rejection reason before authorization or database access", async () => {
    const formData = expenseDecisionForm("reject", "");

    await expect(reviewExpenseAction({}, formData)).resolves.toEqual({
      message: "Enter a rejection reason.",
      status: "error",
    });
    expect(requireFinanceReviewContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reserves reversal for the Super Admin capability", async () => {
    rpc.mockResolvedValue({ data: submissionId, error: null });
    const formData = new FormData();
    formData.set("idempotencyKey", "expense-reverse-1");
    formData.set("reason", "Duplicate payment");
    formData.set("reversalDate", "2026-08-08");
    formData.set("submissionId", submissionId);

    await expect(reverseExpenseAction({}, formData)).resolves.toEqual({
      message: "Expense reversed.",
      status: "success",
    });
    expect(requireFinanceReversalContext).toHaveBeenCalledOnce();
    expect(requireFinanceReviewContext).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("reverse_expense", {
      p_idempotency_key: "expense-reverse-1",
      p_organization_id: organizationId,
      p_reason: "Duplicate payment",
      p_reversal_date: "2026-08-08",
      p_submission_id: submissionId,
    });
  });
});

function expenseDecisionForm(decision: "approve" | "reject", reason: string) {
  const formData = new FormData();
  formData.set("decision", decision);
  formData.set("idempotencyKey", "expense-review-1");
  formData.set("reason", reason);
  formData.set("submissionId", submissionId);
  return formData;
}
