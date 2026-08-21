import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  adminDownload,
  adminFrom,
  adminRpc,
  adminUpload,
  markReceiptPublicationFailed,
  publishTenantInvoiceArtifact,
  publishTenantReceiptArtifact,
  requireCurrentRentRetryContext,
  requireFinanceCorrectionContext,
  requireFinanceOperationContext,
  requireSuperAdminContext,
  requireFinanceReviewContext,
  requireFinanceReversalContext,
  requireFinanceSubmissionContext,
  requireHistoricalRentRecoveryContext,
  requireLeaseConfigurationContext,
  revalidatePath,
  rpc,
} = vi.hoisted(() => ({
  adminDownload: vi.fn(),
  adminFrom: vi.fn(),
  adminRpc: vi.fn(),
  adminUpload: vi.fn(),
  markReceiptPublicationFailed: vi.fn(),
  publishTenantInvoiceArtifact: vi.fn(),
  publishTenantReceiptArtifact: vi.fn(),
  requireCurrentRentRetryContext: vi.fn(),
  requireFinanceCorrectionContext: vi.fn(),
  requireFinanceOperationContext: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  requireFinanceReviewContext: vi.fn(),
  requireFinanceReversalContext: vi.fn(),
  requireFinanceSubmissionContext: vi.fn(),
  requireHistoricalRentRecoveryContext: vi.fn(),
  requireLeaseConfigurationContext: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({
  requireCurrentRentRetryContext,
  requireFinanceCorrectionContext,
  requireFinanceOperationContext,
  requireSuperAdminContext,
  requireFinanceReviewContext,
  requireFinanceReversalContext,
  requireFinanceSubmissionContext,
  requireHistoricalRentRecoveryContext,
  requireLeaseConfigurationContext,
}));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));
vi.mock("@/lib/db/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: adminRpc,
    storage: { from: adminFrom },
  }),
}));
vi.mock("@/features/finance-operations/documents/commercial-document-artifacts", () => ({
  markReceiptPublicationFailed,
  publishTenantInvoiceArtifact,
  publishTenantReceiptArtifact,
}));

import {
  confirmOwnerCollectionAction,
  createManualTenantChargeAction,
  publishTenantInvoicePdfAction,
  recordOwnerPaymentAction,
  recordTenantInvoicePaymentAction,
  recordWithdrawalAction,
  recoverLeaseRentPeriodAction,
  recoverRentGenerationExceptionAction,
  reverseOwnerCollectionConfirmationAction,
  reverseTenantInvoicePaymentAction,
  reverseExpenseAction,
  reviewExpenseAction,
  retryTenantReceiptPdfAction,
  saveLeaseBillingAction,
  submitExpenseAction,
} from "@/features/finance-operations/actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const exceptionId = "00000000-0000-4000-8000-000000000002";
const leaseId = "00000000-0000-4000-8000-000000000006";
const propertyId = "00000000-0000-4000-8000-000000000003";
const sourceId = "00000000-0000-4000-8000-000000000004";
const submissionId = "00000000-0000-4000-8000-000000000005";
const actorId = "00000000-0000-4000-8000-000000000007";
const evidenceDocumentId = "00000000-0000-4000-8000-000000000008";
const evidenceObjectId = "00000000-0000-4000-8000-000000000009";
const foreignOrganizationId = "00000000-0000-4000-8000-000000000012";
const foreignInvoiceId = "00000000-0000-4000-8000-000000000013";

describe("rent generation recovery action", () => {
  beforeEach(() => {
    adminDownload.mockReset();
    adminFrom.mockReset();
    adminRpc.mockReset();
    adminUpload.mockReset();
    requireCurrentRentRetryContext.mockReset();
    requireFinanceOperationContext.mockReset();
    requireSuperAdminContext.mockReset();
    requireFinanceReviewContext.mockReset();
    requireFinanceReversalContext.mockReset();
    requireFinanceSubmissionContext.mockReset();
    requireHistoricalRentRecoveryContext.mockReset();
    requireLeaseConfigurationContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireLeaseConfigurationContext.mockResolvedValue({ organizationId });
    requireCurrentRentRetryContext.mockResolvedValue({ organizationId });
    requireFinanceOperationContext.mockResolvedValue({ organizationId });
    requireFinanceSubmissionContext.mockResolvedValue({ organizationId, userId: actorId });
    requireHistoricalRentRecoveryContext.mockResolvedValue({ organizationId });
    requireFinanceReviewContext.mockResolvedValue({ organizationId });
    requireFinanceReversalContext.mockResolvedValue({ organizationId });
  });

  it("adds a manual tenant charge through the canonical checked invoice RPC", async () => {
    requireLeaseConfigurationContext.mockResolvedValue({ organizationId });
    rpc.mockResolvedValueOnce({
      data: { invoiceId: sourceId, leaseId, lineId: submissionId },
      error: null,
    });
    const formData = new FormData();
    formData.set("amount", "75.50");
    formData.set("billingPeriod", "2026-08");
    formData.set("chargeType", "utilities");
    formData.set("description", "Water bill");
    formData.set("dueDate", "2026-08-20");
    formData.set("idempotencyKey", "manual-charge-v1");
    formData.set("leaseId", leaseId);

    await expect(createManualTenantChargeAction({}, formData)).resolves.toMatchObject({
      message: "Charge added.",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("create_manual_tenant_charge", {
      p_amount: 75.5,
      p_billing_period_start: "2026-08-01",
      p_charge_type: "utilities",
      p_description: "Water bill",
      p_due_date: "2026-08-20",
      p_idempotency_key: "manual-charge-v1",
      p_lease_id: leaseId,
      p_organization_id: organizationId,
    });
  });

  it("uses the current-rent retry context and retries only the selected exception", async () => {
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
    expect(requireCurrentRentRetryContext).toHaveBeenCalledOnce();
    expect(requireLeaseConfigurationContext).not.toHaveBeenCalled();
    expect(requireSuperAdminContext).not.toHaveBeenCalled();
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
    expect(requireHistoricalRentRecoveryContext).toHaveBeenCalledOnce();
    expect(requireLeaseConfigurationContext).not.toHaveBeenCalled();
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
    expect(requireCurrentRentRetryContext).not.toHaveBeenCalled();
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

  it("rejects lease billing when explicit fee choices are missing", async () => {
    const formData = new FormData();
    formData.set("billingRecipientKind", "individual");
    formData.set("billingRecipientPersonId", actorId);
    formData.set("collectionRoute", "through_ips");
    formData.set("effectiveFrom", "2026-08-11");
    formData.set("idempotencyKey", "billing-test-key");
    formData.set("leaseId", leaseId);
    formData.set("managementFeeMode", "percentage");
    formData.set("managementFeeValue", "10");

    await expect(saveLeaseBillingAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });
    expect(requireLeaseConfigurationContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps explicit lease billing fee choices to authoritative booleans", async () => {
    rpc.mockResolvedValue({ data: "billing-1", error: null });
    const formData = new FormData();
    formData.set("billingRecipientKind", "individual");
    formData.set("billingRecipientPersonId", actorId);
    formData.set("chargeManagementFeeWhenActive", "yes");
    formData.set("collectionRoute", "through_ips");
    formData.set("effectiveFrom", "2026-08-11");
    formData.set("fullManagementFeeDuringProration", "no");
    formData.set("idempotencyKey", "billing-test-key");
    formData.set("leaseId", leaseId);
    formData.set("managementFeeMode", "percentage");
    formData.set("managementFeeValue", "10");

    await expect(saveLeaseBillingAction({}, formData)).resolves.toMatchObject({
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "set_lease_billing_term",
      expect.objectContaining({
        p_charge_management_fee_when_active: true,
        p_full_management_fee_during_proration: false,
      }),
    );
  });
});

describe("ordinary finance operation actions", () => {
  beforeEach(() => {
    requireFinanceCorrectionContext.mockReset();
    requireFinanceOperationContext.mockReset();
    requireFinanceReversalContext.mockReset();
    requireSuperAdminContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireFinanceOperationContext.mockResolvedValue({ organizationId });
    requireFinanceCorrectionContext.mockResolvedValue({ organizationId });
    requireFinanceReversalContext.mockResolvedValue({ organizationId });
    adminFrom.mockReturnValue({
      download: adminDownload,
      upload: adminUpload,
    });
    adminUpload.mockResolvedValue({ data: {}, error: null });
    adminDownload.mockResolvedValue({
      data: new Blob(["paid-cost-receipt"], { type: "application/pdf" }),
      error: null,
    });
    adminRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => ({
      data:
        name === "get_paid_cost_evidence_object"
          ? {
              content_type: "application/pdf",
              metadata_size_bytes: 17,
              storage_object_id: evidenceObjectId,
              storage_object_version: "paid-cost-object-v1",
            }
          : {
              content_sha256:
                "ce67cf246af90faa45cd4b6cde1627da5683d1dbfa53ed5f7ca8a2805543be0d",
              document_id: evidenceDocumentId,
              size_bytes: 17,
              status: "registered",
              storage_path: args.p_storage_path,
            },
      error: null,
    }));
    rpc.mockResolvedValue({ data: "operation-id", error: null });
  });

  it.each([
    [recordTenantInvoicePaymentAction, tenantPaymentForm(), "record_tenant_invoice_payment"],
    [confirmOwnerCollectionAction, ownerCollectionForm(), "confirm_owner_collected_rent"],
    [recordOwnerPaymentAction, ownerPaymentForm(), "record_owner_invoice_payment"],
    [recordWithdrawalAction, withdrawalForm(), "record_owner_distribution"],
  ] as const)(
    "uses operation authority for %s",
    async (action, formData, rpcName) => {
      await expect(action({}, formData)).resolves.toMatchObject({ status: "success" });
      expect(requireFinanceOperationContext).toHaveBeenCalledOnce();
      expect(requireSuperAdminContext).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledWith(rpcName, expect.objectContaining({
        p_organization_id: organizationId,
      }));
    },
  );

  it("records a withdrawal through the explicit-owner authoritative command", async () => {
    await expect(recordWithdrawalAction({}, withdrawalForm())).resolves.toMatchObject({
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("record_owner_distribution", {
      p_amount: "50.00",
      p_currency: "USD",
      p_distribution_date: "2026-08-09",
      p_idempotency_key: "owner-withdrawal-1",
      p_organization_id: organizationId,
      p_owner_person_id: sourceId,
      p_property_id: propertyId,
      p_reference: "Owner transfer",
    });
  });

  it.each([
    ["65", "65.00"],
    ["65.5", "65.50"],
    ["900719925474.09", "900719925474.09"],
  ])(
    "preserves owner invoice payment %s as canonical decimal text",
    async (input, expected) => {
      const formData = ownerPaymentForm();
      formData.set("amount", input);

      await expect(recordOwnerPaymentAction({}, formData)).resolves.toMatchObject({
        status: "success",
      });
      expect(rpc).toHaveBeenCalledWith("record_owner_invoice_payment", {
        p_amount: expected,
        p_idempotency_key: "owner-payment-1",
        p_organization_id: organizationId,
        p_owner_invoice_id: submissionId,
        p_received_date: "2026-08-09",
        p_reference: "Owner transfer",
      });
    },
  );

  it.each(["65.001", "6.5e1", " 65.00 ", "01.00"])(
    "rejects noncanonical owner invoice payment input %s before authorization",
    async (input) => {
      const formData = ownerPaymentForm();
      formData.set("amount", input);

      await expect(recordOwnerPaymentAction({}, formData)).resolves.toMatchObject({
        status: "error",
      });
      expect(requireFinanceOperationContext).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("rejects an over-scale owner distribution before authorization", async () => {
    const formData = withdrawalForm();
    formData.set("amount", "50.001");

    await expect(recordWithdrawalAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });
    expect(requireFinanceOperationContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [reverseTenantInvoicePaymentAction, "reverse_tenant_invoice_payment"],
    [reverseOwnerCollectionConfirmationAction, "reverse_owner_collection_confirmation"],
  ] as const)(
    "uses guarded ordinary-correction authority for %s",
    async (action, rpcName) => {
      await expect(action({}, settlementReversalForm())).resolves.toMatchObject({
        status: "success",
      });
      expect(requireFinanceCorrectionContext).toHaveBeenCalledOnce();
      expect(requireFinanceReversalContext).not.toHaveBeenCalled();
      expect(rpc).toHaveBeenCalledWith(rpcName, expect.objectContaining({
        p_organization_id: organizationId,
      }));
    },
  );
});

describe("tenant commercial document publication actions", () => {
  const publishedInvoice = {
    artifactId: "00000000-0000-4000-8000-000000000010",
    documentNumber: "INV-2026-0042",
    href: "/api/finance/documents/00000000-0000-4000-8000-000000000010",
  };
  const publishedReceipt = {
    artifactId: "00000000-0000-4000-8000-000000000011",
    documentNumber: "RCT-2026-0042",
    href: "/api/finance/documents/00000000-0000-4000-8000-000000000011",
  };

  beforeEach(() => {
    markReceiptPublicationFailed.mockReset();
    publishTenantInvoiceArtifact.mockReset();
    publishTenantReceiptArtifact.mockReset();
    requireFinanceOperationContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireFinanceOperationContext.mockResolvedValue({ organizationId });
    rpc.mockResolvedValue({ data: submissionId, error: null });
    publishTenantInvoiceArtifact.mockResolvedValue(publishedInvoice);
    publishTenantReceiptArtifact.mockResolvedValue(publishedReceipt);
  });

  it("publishes a valid tenant invoice with the current organization context", async () => {
    await expect(publishTenantInvoicePdfAction({}, invoicePublicationForm())).resolves.toEqual({
      artifactHref: publishedInvoice.href,
      artifactId: publishedInvoice.artifactId,
      message: "Invoice published.",
      publicationStatus: "published",
      status: "success",
    });
    expect(requireFinanceOperationContext).toHaveBeenCalledOnce();
    expect(publishTenantInvoiceArtifact).toHaveBeenCalledWith({
      client: expect.anything(),
      invoiceId: exceptionId,
      organizationId,
      publicationInput: {
        contactEmail: "billing@ips.example",
        contactPhone: "+855 12 345 678",
        note: "Include the invoice number.",
        paymentInstructions: "Bank transfer to IPS operating account.",
      },
    });
  });

  it("rejects invalid invoice publication fields before authorization", async () => {
    const formData = invoicePublicationForm();
    formData.set("contactEmail", "not-an-email");
    formData.set("paymentInstructions", "no");

    await expect(publishTenantInvoicePdfAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });
    expect(requireFinanceOperationContext).not.toHaveBeenCalled();
    expect(publishTenantInvoiceArtifact).not.toHaveBeenCalled();
  });

  it("rejects undeclared invoice publication fields before authorization", async () => {
    const formData = invoicePublicationForm();
    formData.set("organizationId", foreignOrganizationId);
    formData.set("record_tenant_invoice_payment", submissionId);

    await expect(publishTenantInvoicePdfAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });
    expect(requireFinanceOperationContext).not.toHaveBeenCalled();
    expect(publishTenantInvoiceArtifact).not.toHaveBeenCalled();
  });

  it("does not publish when finance context rejects the request", async () => {
    requireFinanceOperationContext.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(
      publishTenantInvoicePdfAction({}, invoicePublicationForm()),
    ).rejects.toThrow("Forbidden");
    expect(publishTenantInvoiceArtifact).not.toHaveBeenCalled();
  });

  it("delegates a foreign invoice organization check to the publisher", async () => {
    const formData = invoicePublicationForm();
    formData.set("invoiceId", foreignInvoiceId);
    publishTenantInvoiceArtifact.mockRejectedValueOnce(
      new Error("Tenant Invoice source is unavailable."),
    );

    await expect(publishTenantInvoicePdfAction({}, formData)).resolves.toEqual({
      message: "Invoice PDF unavailable.",
      status: "error",
    });
    expect(publishTenantInvoiceArtifact).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: foreignInvoiceId,
      organizationId,
    }));
  });

  it("returns the publisher's existing invoice artifact on duplicate publication", async () => {
    const existingArtifact = { ...publishedInvoice };
    publishTenantInvoiceArtifact
      .mockResolvedValueOnce(publishedInvoice)
      .mockResolvedValueOnce(existingArtifact);

    await expect(publishTenantInvoicePdfAction({}, invoicePublicationForm())).resolves.toMatchObject({
      artifactId: publishedInvoice.artifactId,
      publicationStatus: "published",
    });
    await expect(publishTenantInvoicePdfAction({}, invoicePublicationForm())).resolves.toMatchObject({
      artifactHref: existingArtifact.href,
      artifactId: existingArtifact.artifactId,
      publicationStatus: "published",
    });
    expect(publishTenantInvoiceArtifact).toHaveBeenCalledTimes(2);
  });

  it("returns a concise invoice publication failure without internal details", async () => {
    publishTenantInvoiceArtifact.mockRejectedValueOnce(
      new Error("Storage request failed with service-role-secret"),
    );

    await expect(publishTenantInvoicePdfAction({}, invoicePublicationForm())).resolves.toEqual({
      message: "Invoice PDF unavailable.",
      status: "error",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/finance");
  });

  it("publishes the receipt for the payment UUID returned by financial authority", async () => {
    rpc.mockResolvedValueOnce({ data: submissionId, error: null });

    await expect(recordTenantInvoicePaymentAction({}, tenantPaymentForm())).resolves.toEqual({
      artifactHref: publishedReceipt.href,
      artifactId: publishedReceipt.artifactId,
      message: "Payment recorded.",
      paymentId: submissionId,
      publicationStatus: "published",
      status: "success",
    });
    expect(publishTenantReceiptArtifact).toHaveBeenCalledWith({
      client: expect.anything(),
      organizationId,
      paymentId: submissionId,
    });
    expect(markReceiptPublicationFailed).not.toHaveBeenCalled();
  });

  it("uses the replayed payment UUID for an idempotent payment receipt", async () => {
    rpc.mockResolvedValueOnce({ data: evidenceDocumentId, error: null });

    await recordTenantInvoicePaymentAction({}, tenantPaymentForm());

    expect(publishTenantReceiptArtifact).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: evidenceDocumentId,
    }));
  });

  it("keeps a committed payment successful when receipt publication fails", async () => {
    publishTenantReceiptArtifact.mockRejectedValueOnce(
      new Error("storage failure with signed-url-token"),
    );

    await expect(recordTenantInvoicePaymentAction({}, tenantPaymentForm())).resolves.toEqual({
      message: "Payment recorded. Receipt unavailable.",
      paymentId: submissionId,
      publicationStatus: "failed",
      status: "success",
    });
    expect(markReceiptPublicationFailed).toHaveBeenCalledWith(
      expect.anything(),
      organizationId,
      submissionId,
      "storage_unavailable",
    );
  });

  it("keeps a committed payment successful when receipt failure marking also fails", async () => {
    publishTenantReceiptArtifact.mockRejectedValueOnce(new Error("provider failed"));
    markReceiptPublicationFailed.mockRejectedValueOnce(new Error("marker failed"));

    await expect(recordTenantInvoicePaymentAction({}, tenantPaymentForm())).resolves.toEqual({
      message: "Payment recorded. Receipt unavailable.",
      paymentId: submissionId,
      publicationStatus: "failed",
      status: "success",
    });
  });

  it("does not publish or mark a receipt when payment authority fails", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "payment rejected" } });

    const result = await recordTenantInvoicePaymentAction({}, tenantPaymentForm());

    expect(result).toMatchObject({
      status: "error",
    });
    expect(result).not.toHaveProperty("paymentId");
    expect(publishTenantReceiptArtifact).not.toHaveBeenCalled();
    expect(markReceiptPublicationFailed).not.toHaveBeenCalled();
  });

  it("never publishes a receipt for a direct owner collection", async () => {
    await expect(confirmOwnerCollectionAction({}, ownerCollectionForm())).resolves.toMatchObject({
      status: "success",
    });
    expect(publishTenantReceiptArtifact).not.toHaveBeenCalled();
    expect(markReceiptPublicationFailed).not.toHaveBeenCalled();
  });

  it("returns an already-published receipt for its original payment without finance authority", async () => {
    const formData = new FormData();
    formData.set("paymentId", submissionId);
    const existingArtifact = { ...publishedReceipt };
    publishTenantReceiptArtifact.mockResolvedValueOnce(existingArtifact);

    await expect(retryTenantReceiptPdfAction({}, formData)).resolves.toEqual({
      artifactHref: existingArtifact.href,
      artifactId: existingArtifact.artifactId,
      message: "Receipt published.",
      publicationStatus: "published",
      status: "success",
    });
    expect(requireFinanceOperationContext).toHaveBeenCalledOnce();
    expect(publishTenantReceiptArtifact).toHaveBeenCalledWith({
      client: expect.anything(),
      organizationId,
      paymentId: submissionId,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid receipt retry before authorization", async () => {
    const formData = new FormData();
    formData.set("paymentId", "not-a-payment");

    await expect(retryTenantReceiptPdfAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });
    expect(requireFinanceOperationContext).not.toHaveBeenCalled();
    expect(publishTenantReceiptArtifact).not.toHaveBeenCalled();
  });

  it("rejects undeclared receipt retry fields before authorization", async () => {
    const formData = new FormData();
    formData.set("paymentId", submissionId);
    formData.set("organizationId", foreignOrganizationId);
    formData.set("p_allocations", JSON.stringify([{ lineId: exceptionId, amount: 100 }]));

    await expect(retryTenantReceiptPdfAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });
    expect(requireFinanceOperationContext).not.toHaveBeenCalled();
    expect(publishTenantReceiptArtifact).not.toHaveBeenCalled();
  });

  it("does not retry a receipt when finance context rejects the request", async () => {
    const formData = new FormData();
    formData.set("paymentId", submissionId);
    requireFinanceOperationContext.mockRejectedValueOnce(new Error("Forbidden"));

    await expect(retryTenantReceiptPdfAction({}, formData)).rejects.toThrow("Forbidden");
    expect(publishTenantReceiptArtifact).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a concise error when receipt retry publication fails", async () => {
    const formData = new FormData();
    formData.set("paymentId", submissionId);
    publishTenantReceiptArtifact.mockRejectedValueOnce(
      new Error("provider failure with token"),
    );

    await expect(retryTenantReceiptPdfAction({}, formData)).resolves.toEqual({
      message: "Receipt PDF unavailable.",
      status: "error",
    });
    expect(markReceiptPublicationFailed).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/finance");
  });
});

describe("expense approval actions", () => {
  beforeEach(() => {
    requireFinanceReviewContext.mockReset();
    requireFinanceReversalContext.mockReset();
    requireFinanceSubmissionContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireFinanceSubmissionContext.mockResolvedValue({ organizationId, userId: actorId });
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
    formData.set(
      "evidenceFile",
      new File(["paid-cost-receipt"], "receipt-42.pdf", {
        type: "application/pdf",
      }),
    );

    await expect(submitExpenseAction({}, formData)).resolves.toEqual({
      message: "Paid cost submitted for Finance review.",
      status: "success",
    });
    expect(requireFinanceSubmissionContext).toHaveBeenCalledOnce();
    expect(requireFinanceReviewContext).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("submit_expense", {
      p_currency: "USD",
      p_customer_category: "cleaning",
      p_expense_date: "2026-08-08",
      p_idempotency_key: "expense-submit-1",
      p_internal_cost_amount: "200.00",
      p_internal_markup_amount: "20.00",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_reconciliation_source_id: sourceId,
      p_reference: "Receipt 42",
      p_responsibility: "owner",
      p_source_id: null,
      p_source_type: "general",
      p_supporting_document_id: evidenceDocumentId,
      p_tenant_invoice_id: null,
      p_unit_id: null,
      p_vendor_label: "Sokha Repairs",
      p_vendor_person_id: null,
    });
    expect(adminUpload).toHaveBeenCalledOnce();
    expect(adminRpc).toHaveBeenCalledWith(
      "get_paid_cost_evidence_object",
      expect.objectContaining({
        p_actor_id: actorId,
        p_organization_id: organizationId,
        p_property_id: propertyId,
      }),
    );
    expect(adminRpc).toHaveBeenCalledWith(
      "register_paid_cost_evidence_verified",
      expect.objectContaining({
        p_actor_id: actorId,
        p_content_type: "application/pdf",
        p_file_name: "receipt-42.pdf",
        p_organization_id: organizationId,
        p_property_id: propertyId,
        p_size_bytes: 17,
        p_storage_object_id: evidenceObjectId,
        p_storage_object_version: "paid-cost-object-v1",
      }),
    );
  });

  it("rejects a paid cost without a retained evidence file before authorization", async () => {
    rpc.mockResolvedValue({ data: submissionId, error: null });
    const formData = new FormData();
    formData.set("category", "cleaning");
    formData.set("expenseDate", "2026-08-08");
    formData.set("idempotencyKey", "paid-cost-missing-file");
    formData.set("internalCost", "200.00");
    formData.set("internalMarkup", "0.00");
    formData.set("propertyId", propertyId);
    formData.set("reconciliationSourceId", sourceId);
    formData.set("reference", "Receipt 42");
    formData.set("responsibility", "owner");
    formData.set("tenantInvoiceId", "");
    formData.set("unitId", "");
    formData.set("vendorLabel", "Sokha Repairs");
    await expect(submitExpenseAction({}, formData)).resolves.toEqual({
      message: "Choose a receipt evidence file.",
      status: "error",
    });
    expect(requireFinanceSubmissionContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
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
    formData.set(
      "evidenceFile",
      new File(["paid-cost-receipt"], "receipt-42.pdf", {
        type: "application/pdf",
      }),
    );

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
      message: "Paid cost approved and recorded.",
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

  it("uses paid-cost language for a completed rejection", async () => {
    rpc.mockResolvedValue({ data: submissionId, error: null });
    const formData = expenseDecisionForm("reject", "Receipt does not match");

    await expect(reviewExpenseAction({}, formData)).resolves.toEqual({
      message: "Paid cost rejected.",
      status: "success",
    });
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
      message: "Paid cost reversed.",
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

function tenantPaymentForm() {
  const formData = ownerCollectionForm();
  formData.set("reconciliationSourceId", sourceId);
  return formData;
}

function invoicePublicationForm() {
  const formData = new FormData();
  formData.set("contactEmail", "billing@ips.example");
  formData.set("contactPhone", "+855 12 345 678");
  formData.set("invoiceId", exceptionId);
  formData.set("note", "Include the invoice number.");
  formData.set("paymentInstructions", "Bank transfer to IPS operating account.");
  return formData;
}

function ownerCollectionForm() {
  const formData = new FormData();
  formData.set("amount", "100");
  formData.set("idempotencyKey", "finance-operation-1");
  formData.set("invoiceId", exceptionId);
  formData.set("reference", "Receipt 42");
  formData.set("settlementDate", "2026-08-09");
  return formData;
}

function ownerPaymentForm() {
  const formData = new FormData();
  formData.set("amount", "65");
  formData.set("idempotencyKey", "owner-payment-1");
  formData.set("ownerInvoiceId", submissionId);
  formData.set("receivedDate", "2026-08-09");
  formData.set("reference", "Owner transfer");
  return formData;
}

function withdrawalForm() {
  const formData = new FormData();
  formData.set("amount", "50");
  formData.set("idempotencyKey", "owner-withdrawal-1");
  formData.set("ownerPersonId", sourceId);
  formData.set("propertyId", propertyId);
  formData.set("reference", "Owner transfer");
  formData.set("withdrawalDate", "2026-08-09");
  return formData;
}

function settlementReversalForm() {
  const formData = new FormData();
  formData.set("idempotencyKey", "settlement-reversal-1");
  formData.set("reason", "Duplicate settlement");
  formData.set("reversalDate", "2026-08-09");
  formData.set("settlementId", submissionId);
  return formData;
}
