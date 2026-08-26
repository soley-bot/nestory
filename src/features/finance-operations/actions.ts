"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { canonicalizeOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import {
  requireCurrentRentRetryContext,
  requireFinanceCorrectionContext,
  requireFinanceOperationContext,
  requireFinanceReviewContext,
  requireFinanceReversalContext,
  requireFinanceSubmissionContext,
  requireHistoricalRentRecoveryContext,
  requirePermission,
  requireSuperAdminContext,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  preparePaidCostEvidence,
  validatePaidCostEvidenceFile,
} from "@/features/finance-operations/paid-cost-evidence";
import {
  markReceiptPublicationFailed,
  publishTenantInvoiceArtifact,
  publishTenantReceiptArtifact,
} from "@/features/finance-operations/documents/commercial-document-artifacts";
import type { Json } from "@/types/database";
import type { FinanceOperationsActionState } from "@/features/finance-operations/finance-operations.types";
import {
  leaseBillingRuleSchema,
  readLeaseBillingRuleInput,
  toLeaseBillingRulePayload,
} from "@/features/leases/lease-billing-rule-input";

// PostgreSQL accepts UUID-shaped identifiers regardless of their version nibble.
// The seeded demo records intentionally use deterministic, non-v4 UUIDs.
const uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "Choose a valid record.",
  );
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const amount = z.coerce.number().positive("Enter an amount greater than zero.");
const authoritativeOwnerAmount = z.string().transform((value, context) => {
  try {
    const canonical = canonicalizeOwnerOpeningAmount(value);
    if (canonical === "0.00") {
      context.addIssue({
        code: "custom",
        message: "Enter an amount greater than zero.",
      });
      return z.NEVER;
    }
    return canonical;
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Enter a valid exact amount.",
    });
    return z.NEVER;
  }
});
const authoritativeNonnegativeAmount = z.string().transform((value, context) => {
  try {
    return canonicalizeOwnerOpeningAmount(value);
  } catch (error) {
    context.addIssue({
      code: "custom",
      message: error instanceof Error ? error.message : "Enter a valid exact amount.",
    });
    return z.NEVER;
  }
});
const billingSchema = leaseBillingRuleSchema.and(
  z.object({
    expectedCurrentBillingRuleId: z.preprocess(
      (value) => value || null,
      z.string().trim().min(1).nullable(),
    ),
    idempotencyKey: z.string().min(8),
    leaseId: uuid,
  }),
);

const recoverRentSchema = z.object({ exceptionId: uuid });
const recoverLeaseRentPeriodSchema = z.object({
  billingPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Choose a historical rent month."),
  leaseId: uuid,
});

const financeCategoryCode = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,63}$/, "Choose a valid Finance category.");
const financeCategoryNamespace = z.enum(["owner_expense", "tenant_billing"]);
const ownerExpenseReportingGroup = z.enum([
  "vendor_bill",
  "maintenance",
  "utilities",
  "supplies",
  "other",
]);
const tenantBillingReportingGroup = z.enum([
  "utility_reimbursement",
  "parking",
  "late_fee",
  "service_fee",
  "other",
]);
const financeCategoryReportingGroup = z.union([
  ownerExpenseReportingGroup,
  tenantBillingReportingGroup,
]);
const createFinanceCategorySchema = z
  .object({
    displayLabel: z.string().trim().min(2).max(80),
    namespace: financeCategoryNamespace,
    reportingGroup: financeCategoryReportingGroup,
  })
  .superRefine((value, context) => {
    const valid =
      value.namespace === "owner_expense"
        ? ownerExpenseReportingGroup.safeParse(value.reportingGroup).success
        : tenantBillingReportingGroup.safeParse(value.reportingGroup).success;
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Choose a reporting group for the selected category type.",
        path: ["reportingGroup"],
      });
    }
  });
const updateFinanceCategorySchema = z.object({
  categoryId: uuid,
  displayLabel: z.string().trim().min(2).max(80),
  reportingGroup: financeCategoryReportingGroup,
});
const archiveFinanceCategorySchema = z.object({
  archived: z.enum(["true", "false"]).transform((value) => value === "true"),
  categoryId: uuid,
});

const manualTenantChargeSchema = z
  .object({
    amount,
    billingPeriod: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "Choose a month."),
    chargeType: financeCategoryCode,
    description: z.string().trim().max(240),
    dueDate: date,
    idempotencyKey: z.string().min(8),
    leaseId: uuid,
  })
  .superRefine((data, context) => {
    if (data.chargeType === "other" && !data.description) {
      context.addIssue({
        code: "custom",
        message: "Describe the Other charge.",
        path: ["description"],
      });
    }
  });

const invoiceSettlementSchema = z.object({
  amount,
  idempotencyKey: z.string().min(8),
  invoiceId: uuid,
  reference: z.string().trim().max(160),
  settlementDate: date,
});

const paymentSchema = invoiceSettlementSchema.extend({
  reconciliationSourceId: uuid,
});

const invoicePublicationSchema = z.object({
  contactEmail: z.string().trim().email().max(180),
  contactPhone: z.string().trim().min(3).max(60),
  invoiceId: uuid,
  note: z.string().trim().max(500),
  paymentInstructions: z.string().trim().min(3).max(1200),
}).strict();

const receiptPublicationRetrySchema = z.object({ paymentId: uuid }).strict();

function formDataWithoutActionMetadata(formData: FormData) {
  return Object.fromEntries(
    Array.from(formData.entries()).filter(
      ([key]) => !key.startsWith("$ACTION_"),
    ),
  );
}
const RECEIPT_PUBLICATION_FAILURE_CATEGORY = "storage_unavailable";

const settlementReversalSchema = z.object({
  idempotencyKey: z.string().min(8),
  reason: z.string().trim().min(3).max(500),
  reversalDate: date,
  settlementId: uuid,
});

const expenseSchema = z.object({
  category: financeCategoryCode,
  expenseDate: date,
  idempotencyKey: z.string().min(8),
  internalCost: authoritativeOwnerAmount,
  internalMarkup: authoritativeNonnegativeAmount,
  propertyId: uuid,
  reconciliationSourceId: uuid,
  reference: z
    .string()
    .trim()
    .min(1, "Enter a receipt or payment reference.")
    .max(160),
  responsibility: z.enum(["owner", "tenant"]),
  tenantInvoiceId: z.preprocess((value) => value || null, uuid.nullable()),
  unitId: z.preprocess((value) => value || null, uuid.nullable()),
  vendorLabel: z.string().trim().min(2).max(120),
});

const expenseReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  idempotencyKey: z.string().min(8),
  reason: z
    .string()
    .trim()
    .max(500)
    .refine((value) => value.length === 0 || value.length >= 3, {
      message: "Review notes must contain at least 3 characters.",
    }),
  reconciliationSourceId: z.preprocess(
    (value) => value || null,
    uuid.nullable(),
  ),
  submissionId: uuid,
});

const expenseReversalSchema = z.object({
  idempotencyKey: z.string().min(8),
  reason: z.string().trim().min(3).max(500),
  reversalDate: date,
  submissionId: uuid,
});

const ownerPaymentSchema = z.object({
  amount: authoritativeOwnerAmount,
  idempotencyKey: z.string().min(8),
  ownerInvoiceId: uuid,
  receivedDate: date,
  reference: z.string().trim().max(160),
});

const withdrawalSchema = z.object({
  amount: authoritativeOwnerAmount,
  idempotencyKey: z.string().min(8),
  ownerPersonId: uuid,
  propertyId: uuid,
  reference: z.string().trim().min(1).max(160),
  withdrawalDate: date,
});

export async function saveLeaseBillingAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = billingSchema.safeParse({
    ...readLeaseBillingRuleInput(formData),
    expectedCurrentBillingRuleId: formData.get(
      "expectedCurrentBillingRuleId",
    ),
    idempotencyKey: formData.get("idempotencyKey"),
    leaseId: formData.get("leaseId"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const context = await requirePermission("leases.change_terms");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_lease_billing_rules", {
    p_billing_rule: toLeaseBillingRulePayload(parsed.data),
    p_expected_current_billing_rule_id:
      parsed.data.expectedCurrentBillingRuleId as string,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_lease_id: parsed.data.leaseId,
    p_organization_id: context.organizationId,
  });
  if (error) return backendActionError();
  revalidateFinance();
  return { message: "Lease billing rules saved.", status: "success" };
}

export async function recoverRentGenerationExceptionAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = recoverRentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireCurrentRentRetryContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "recover_rent_generation_exception",
    {
      p_exception_id: parsed.data.exceptionId,
      p_organization_id: context.organizationId,
    },
  );
  if (error) {
    return {
      message: "We could not retry this rent month. Review its setup and try again.",
      status: "error",
    };
  }

  const result = asActionResult(data);
  if (result?.status === "failed") {
    return {
      message:
        typeof result.message === "string"
          ? result.message
          : "Review the lease rent setup and try again.",
      status: "error",
    };
  }

  revalidateFinance();
  return { message: "Rent generation retried.", status: "success" };
}

export async function recoverLeaseRentPeriodAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = recoverLeaseRentPeriodSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireHistoricalRentRecoveryContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recover_lease_rent_period", {
    p_billing_period_start: `${parsed.data.billingPeriod}-01`,
    p_lease_id: parsed.data.leaseId,
    p_organization_id: context.organizationId,
  });
  if (error) return backendActionError();

  const result = asActionResult(data);
  if (result?.status === "failed") {
    return {
      message:
        typeof result.message === "string"
          ? result.message
          : "Review the lease rent setup and try again.",
      status: "error",
    };
  }

  revalidateFinance();
  return { message: "Historical rent month generated.", status: "success" };
}

export async function createManualTenantChargeAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = manualTenantChargeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const context = await requirePermission("finance.record_payments");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_manual_tenant_charge", {
    p_amount: parsed.data.amount,
    p_billing_period_start: `${parsed.data.billingPeriod}-01`,
    p_charge_type: parsed.data.chargeType,
    p_description: parsed.data.description,
    p_due_date: parsed.data.dueDate,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_lease_id: parsed.data.leaseId,
    p_organization_id: context.organizationId,
  });
  if (error) return backendActionError();
  revalidateFinance();
  revalidatePath(`/leases/${parsed.data.leaseId}`);
  return { message: "Charge added.", status: "success" };
}

export async function createFinanceCategoryAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = createFinanceCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_finance_category", {
    p_display_label: parsed.data.displayLabel,
    p_namespace: parsed.data.namespace,
    p_organization_id: context.organizationId,
    p_reporting_group: parsed.data.reportingGroup,
  });
  if (error) return backendActionError();
  revalidateFinance();
  return {
    message:
      parsed.data.namespace === "owner_expense"
        ? "Owner expense category added."
        : "Tenant billing category added.",
    status: "success",
  };
}

export async function updateFinanceCategoryAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = updateFinanceCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_finance_category", {
    p_category_id: parsed.data.categoryId,
    p_display_label: parsed.data.displayLabel,
    p_organization_id: context.organizationId,
    p_reporting_group: parsed.data.reportingGroup,
  });
  if (error) return backendActionError();
  revalidateFinance();
  return { message: "Finance category renamed.", status: "success" };
}

export async function setFinanceCategoryArchivedAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = archiveFinanceCategorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_finance_category_archived", {
    p_archived: parsed.data.archived,
    p_category_id: parsed.data.categoryId,
    p_organization_id: context.organizationId,
  });
  if (error) return backendActionError();
  revalidateFinance();
  return {
    message: parsed.data.archived
      ? "Finance category archived."
      : "Finance category restored.",
    status: "success",
  };
}

export async function recordTenantInvoicePaymentAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  const allocations = parseAllocations(formData);
  const { data, error } = await supabase.rpc("record_tenant_invoice_payment", {
    p_allocations: allocations.length > 0 ? (allocations as Json) : null,
    p_amount: parsed.data.amount,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_invoice_id: parsed.data.invoiceId,
    p_organization_id: context.organizationId,
    p_received_date: parsed.data.settlementDate,
    p_reconciliation_source_id: parsed.data.reconciliationSourceId,
    p_reference: parsed.data.reference,
  });
  if (error) return backendActionError();
  const paymentId =
    typeof data === "string" && uuid.safeParse(data).success ? data : null;
  if (!paymentId) {
    revalidateTenantPayment();
    return receiptUnavailableState();
  }

  try {
    const artifact = await publishTenantReceiptArtifact({
      actorId: context.userId,
      client: supabase,
      organizationId: context.organizationId,
      paymentId,
    });
    revalidateTenantPayment();
    return {
      artifactHref: artifact.href,
      artifactId: artifact.artifactId,
      message: "Payment recorded.",
      paymentId,
      publicationStatus: "published",
      status: "success",
    };
  } catch (error) {
    try {
      await markReceiptPublicationFailed(
        supabase,
        context.organizationId,
        paymentId,
        RECEIPT_PUBLICATION_FAILURE_CATEGORY,
      );
    } catch {
      // Receipt failure persistence must not change the committed payment result.
    }
    revalidateTenantPayment();
    unstable_rethrow(error);
    return receiptUnavailableState(paymentId);
  }
}

export async function publishTenantInvoicePdfAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = invoicePublicationSchema.safeParse(
    formDataWithoutActionMetadata(formData),
  );
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  try {
    const artifact = await publishTenantInvoiceArtifact({
      actorId: context.userId,
      client: supabase,
      invoiceId: parsed.data.invoiceId,
      organizationId: context.organizationId,
      publicationInput: {
        contactEmail: parsed.data.contactEmail,
        contactPhone: parsed.data.contactPhone,
        note: parsed.data.note || null,
        paymentInstructions: parsed.data.paymentInstructions,
      },
    });
    revalidateFinance();
    return {
      artifactHref: artifact.href,
      artifactId: artifact.artifactId,
      message: "Invoice published.",
      publicationStatus: "published",
      status: "success",
    };
  } catch (error) {
    unstable_rethrow(error);
    revalidateFinance();
    return { message: "Invoice PDF unavailable.", status: "error" };
  }
}

export async function retryTenantReceiptPdfAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = receiptPublicationRetrySchema.safeParse(
    formDataWithoutActionMetadata(formData),
  );
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  try {
    const artifact = await publishTenantReceiptArtifact({
      actorId: context.userId,
      client: supabase,
      organizationId: context.organizationId,
      paymentId: parsed.data.paymentId,
    });
    revalidateFinance();
    return {
      artifactHref: artifact.href,
      artifactId: artifact.artifactId,
      message: "Receipt published.",
      publicationStatus: "published",
      status: "success",
    };
  } catch (error) {
    unstable_rethrow(error);
    revalidateFinance();
    return { message: "Receipt PDF unavailable.", status: "error" };
  }
}

export async function confirmOwnerCollectionAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = invoiceSettlementSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  const allocations = parseAllocations(formData);
  const { error } = await supabase.rpc("confirm_owner_collected_rent", {
    p_allocations: allocations.length > 0 ? (allocations as Json) : null,
    p_amount: parsed.data.amount,
    p_confirmed_date: parsed.data.settlementDate,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_invoice_id: parsed.data.invoiceId,
    p_organization_id: context.organizationId,
    p_reference: parsed.data.reference,
  });
  if (error) return backendActionError();
  revalidateFinance();
  return { message: "Owner collection confirmed.", status: "success" };
}

export async function reverseTenantInvoicePaymentAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = settlementReversalSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireFinanceCorrectionContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reverse_tenant_invoice_payment", {
    p_idempotency_key: parsed.data.idempotencyKey,
    p_organization_id: context.organizationId,
    p_payment_id: parsed.data.settlementId,
    p_reason: parsed.data.reason,
    p_reversal_date: parsed.data.reversalDate,
  });
  if (error) return backendActionError();
  revalidateFinance();
  return { message: "Tenant payment reversed.", status: "success" };
}

export async function reverseOwnerCollectionConfirmationAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = settlementReversalSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireFinanceCorrectionContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc(
    "reverse_owner_collection_confirmation",
    {
      p_confirmation_id: parsed.data.settlementId,
      p_idempotency_key: parsed.data.idempotencyKey,
      p_organization_id: context.organizationId,
      p_reason: parsed.data.reason,
      p_reversal_date: parsed.data.reversalDate,
    },
  );
  if (error) return backendActionError();
  revalidateFinance();
  return { message: "Owner collection reversed.", status: "success" };
}

export async function submitExpenseAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const evidenceFile = formData.get("evidenceFile");
  const evidenceError = validatePaidCostEvidenceFile(evidenceFile);
  if (evidenceError) return actionError(evidenceError);
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  if (parsed.data.responsibility === "tenant" && !parsed.data.tenantInvoiceId) {
    return actionError("Choose the tenant invoice for this charge.");
  }
  const context = await requireFinanceSubmissionContext();
  const supabase = await createSupabaseServerClient();
  let evidenceDocumentId: string;
  try {
    const evidence = await preparePaidCostEvidence({
      actorId: context.userId,
      file: evidenceFile as File,
      idempotencyKey: parsed.data.idempotencyKey,
      organizationId: context.organizationId,
      propertyId: parsed.data.propertyId,
      requestClient: supabase,
    });
    evidenceDocumentId = evidence.documentId;
  } catch (error) {
    unstable_rethrow(error);
    return actionError("Receipt evidence could not be verified. Try again.");
  }
  const { error } = await supabase.rpc("submit_expense", {
    p_currency: "USD",
    p_customer_category: parsed.data.category,
    p_expense_date: parsed.data.expenseDate,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_internal_cost_amount: parsed.data.internalCost,
    p_internal_markup_amount: parsed.data.internalMarkup,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_reconciliation_source_id: parsed.data.reconciliationSourceId,
    p_reference: parsed.data.reference || null,
    p_responsibility: parsed.data.responsibility,
    p_source_id: null,
    p_source_type: "general",
    p_supporting_document_id: evidenceDocumentId,
    p_tenant_invoice_id: parsed.data.tenantInvoiceId,
    p_unit_id: parsed.data.unitId,
    p_vendor_label: parsed.data.vendorLabel,
    p_vendor_person_id: null,
  });
  if (error) return backendActionError();
  revalidateFinance();
  return {
    message: "Paid cost submitted for Finance review.",
    status: "success",
  };
}

export async function reviewExpenseAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = expenseReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  if (parsed.data.decision === "reject" && parsed.data.reason.length < 3) {
    return actionError("Enter a rejection reason.");
  }

  const context = await requireFinanceReviewContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_expense", {
    p_decision: parsed.data.decision,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_organization_id: context.organizationId,
    p_reason: parsed.data.reason || null,
    p_reconciliation_source_id: parsed.data.reconciliationSourceId,
    p_submission_id: parsed.data.submissionId,
  });
  if (error) return expenseWorkflowError(error.message);
  revalidateFinance();
  return {
    message:
      parsed.data.decision === "approve"
        ? "Paid cost approved and recorded."
        : "Paid cost rejected.",
    status: "success",
  };
}

export async function reverseExpenseAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = expenseReversalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireFinanceReversalContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reverse_expense", {
    p_idempotency_key: parsed.data.idempotencyKey,
    p_organization_id: context.organizationId,
    p_reason: parsed.data.reason,
    p_reversal_date: parsed.data.reversalDate,
    p_submission_id: parsed.data.submissionId,
  });
  if (error) return expenseWorkflowError(error.message);
  revalidateFinance();
  return { message: "Paid cost reversed.", status: "success" };
}

export async function recordOwnerPaymentAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = ownerPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_owner_invoice_payment", {
    p_amount: parsed.data.amount,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_organization_id: context.organizationId,
    p_owner_invoice_id: parsed.data.ownerInvoiceId,
    p_received_date: parsed.data.receivedDate,
    p_reference: parsed.data.reference,
  });
  if (error) return backendActionError();
  revalidateFinance();
  return { message: "Owner invoice payment recorded.", status: "success" };
}

export async function recordWithdrawalAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = withdrawalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_owner_distribution", {
    p_amount: parsed.data.amount,
    p_currency: "USD",
    p_distribution_date: parsed.data.withdrawalDate,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_organization_id: context.organizationId,
    p_owner_person_id: parsed.data.ownerPersonId,
    p_property_id: parsed.data.propertyId,
    p_reference: parsed.data.reference,
  });
  if (error) return backendActionError();
  revalidateFinance();
  return { message: "Owner distribution recorded.", status: "success" };
}

function parseAllocations(formData: FormData) {
  const allocations: { amount: number; lineId: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (
      !key.startsWith("allocation:") ||
      typeof value !== "string" ||
      value.trim() === ""
    )
      continue;
    const lineId = key.slice("allocation:".length);
    const parsedAmount = Number(value);
    if (
      uuid.safeParse(lineId).success &&
      Number.isFinite(parsedAmount) &&
      parsedAmount > 0
    ) {
      allocations.push({ amount: parsedAmount, lineId });
    }
  }
  return allocations;
}

function validationError(error: z.ZodError): FinanceOperationsActionState {
  return actionError(
    error.issues[0]?.message ?? "Check the form and try again.",
  );
}

function receiptUnavailableState(paymentId?: string): FinanceOperationsActionState {
  return {
    message: "Payment recorded. Receipt unavailable.",
    ...(paymentId ? { paymentId } : {}),
    publicationStatus: "failed",
    status: "success",
  };
}

function actionError(message: string): FinanceOperationsActionState {
  return { message: simplifyDatabaseMessage(message), status: "error" };
}

function backendActionError(): FinanceOperationsActionState {
  return actionError("We could not complete this Finance action. Try again.");
}

function simplifyDatabaseMessage(message: string) {
  return message
    .replace(/^.*?: /, "")
    .replace(/_/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function revalidateFinance() {
  for (const path of [
    "/finance",
    "/rent-income",
    "/bills-expenses",
    "/balances",
    "/reports/monthly-owner-activity",
    "/properties",
  ]) {
    revalidatePath(path);
  }
}

function revalidateTenantPayment() {
  revalidateFinance();
  revalidatePath("/leases");
  revalidatePath("/timeline");
}

function expenseWorkflowError(message: string) {
  if (message.includes("period is locked")) {
    return actionError(
      "This paid-cost month is locked. Super Admin must unlock it before approval.",
    );
  }
  if (message.includes("already settled this charge")) {
    return actionError(
      "This customer charge has already been settled. Use a separate correction.",
    );
  }
  return backendActionError();
}

function asActionResult(
  value: Json | null,
): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : null;
}
