"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requireSuperAdminContext,
  requireFinanceReviewContext,
  requireFinanceReversalContext,
  requireFinanceSubmissionContext,
  requireLeaseConfigurationContext,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { Json } from "@/types/database";
import type { FinanceOperationsActionState } from "@/features/finance-operations/finance-operations.types";

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
const optionalAmount = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.coerce.number().nonnegative().nullable(),
);

const billingSchema = z.object({
  billingRecipientKind: z.enum(["individual", "company"]),
  billingRecipientPersonId: uuid,
  chargeManagementFeeWhenActive: z.coerce.boolean(),
  collectionRoute: z.enum(["through_ips", "direct_to_owner"]),
  effectiveFrom: date,
  finalPeriodProratedAmount: optionalAmount,
  firstPeriodProratedAmount: optionalAmount,
  fullManagementFeeDuringProration: z.coerce.boolean(),
  idempotencyKey: z.string().min(8),
  leaseId: uuid,
  managementFeeMode: z.enum(["flat", "percentage"]),
  managementFeeValue: z.coerce.number().nonnegative(),
  supersedesBillingTermId: z.preprocess(
    (value) => value || null,
    uuid.nullable(),
  ),
});

const recoverRentSchema = z.object({ exceptionId: uuid });
const recoverLeaseRentPeriodSchema = z.object({
  billingPeriod: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Choose a historical rent month."),
  leaseId: uuid,
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

const expenseSchema = z.object({
  category: z.enum(["cleaning", "utility", "repairs_maintenance", "other"]),
  expenseDate: date,
  idempotencyKey: z.string().min(8),
  internalCost: amount,
  internalMarkup: z.coerce.number().nonnegative(),
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
  amount,
  idempotencyKey: z.string().min(8),
  ownerInvoiceId: uuid,
  receivedDate: date,
  reference: z.string().trim().max(160),
});

const withdrawalSchema = z.object({
  amount,
  idempotencyKey: z.string().min(8),
  propertyId: uuid,
  reference: z.string().trim().max(160),
  withdrawalDate: date,
});

export async function saveLeaseBillingAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = billingSchema.safeParse({
    billingRecipientKind: formData.get("billingRecipientKind"),
    billingRecipientPersonId: formData.get("billingRecipientPersonId"),
    chargeManagementFeeWhenActive:
      formData.get("chargeManagementFeeWhenActive") === "on",
    collectionRoute: formData.get("collectionRoute"),
    effectiveFrom: formData.get("effectiveFrom"),
    finalPeriodProratedAmount: formData.get("finalPeriodProratedAmount"),
    firstPeriodProratedAmount: formData.get("firstPeriodProratedAmount"),
    fullManagementFeeDuringProration:
      formData.get("fullManagementFeeDuringProration") === "on",
    idempotencyKey: formData.get("idempotencyKey"),
    leaseId: formData.get("leaseId"),
    managementFeeMode: formData.get("managementFeeMode"),
    managementFeeValue: formData.get("managementFeeValue"),
    supersedesBillingTermId: formData.get("supersedesBillingTermId"),
  });
  if (!parsed.success) return validationError(parsed.error);

  const context = await requireLeaseConfigurationContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_lease_billing_term", {
    p_billing_recipient_kind: parsed.data.billingRecipientKind,
    p_billing_recipient_person_id: parsed.data.billingRecipientPersonId,
    p_charge_management_fee_when_active:
      parsed.data.chargeManagementFeeWhenActive,
    p_collection_route: parsed.data.collectionRoute,
    p_effective_from: parsed.data.effectiveFrom,
    p_final_period_prorated_amount: parsed.data.finalPeriodProratedAmount,
    p_first_period_prorated_amount: parsed.data.firstPeriodProratedAmount,
    p_full_management_fee_during_proration:
      parsed.data.fullManagementFeeDuringProration,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_lease_id: parsed.data.leaseId,
    p_management_fee_mode: parsed.data.managementFeeMode,
    p_management_fee_value: parsed.data.managementFeeValue,
    p_organization_id: context.organizationId,
    p_supersedes_billing_term_id: parsed.data.supersedesBillingTermId,
  });
  if (error) return actionError(error.message);
  revalidateFinance();
  return { message: "Lease billing is active.", status: "success" };
}

export async function recoverRentGenerationExceptionAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = recoverRentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireLeaseConfigurationContext();
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

  const context = await requireLeaseConfigurationContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recover_lease_rent_period", {
    p_billing_period_start: `${parsed.data.billingPeriod}-01`,
    p_lease_id: parsed.data.leaseId,
    p_organization_id: context.organizationId,
  });
  if (error) return actionError(error.message);

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

export async function recordTenantInvoicePaymentAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const allocations = parseAllocations(formData);
  const { error } = await supabase.rpc("record_tenant_invoice_payment", {
    p_allocations: allocations.length > 0 ? (allocations as Json) : null,
    p_amount: parsed.data.amount,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_invoice_id: parsed.data.invoiceId,
    p_organization_id: context.organizationId,
    p_received_date: parsed.data.settlementDate,
    p_reconciliation_source_id: parsed.data.reconciliationSourceId,
    p_reference: parsed.data.reference,
  });
  if (error) return actionError(error.message);
  revalidateFinance();
  return { message: "Payment recorded.", status: "success" };
}

export async function confirmOwnerCollectionAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = invoiceSettlementSchema.safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireSuperAdminContext();
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
  if (error) return actionError(error.message);
  revalidateFinance();
  return { message: "Owner collection confirmed.", status: "success" };
}

export async function submitExpenseAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  if (parsed.data.responsibility === "tenant" && !parsed.data.tenantInvoiceId) {
    return actionError("Choose the tenant invoice for this charge.");
  }
  const context = await requireFinanceSubmissionContext();
  const supabase = await createSupabaseServerClient();
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
    p_supporting_document_id: null,
    p_tenant_invoice_id: parsed.data.tenantInvoiceId,
    p_unit_id: parsed.data.unitId,
    p_vendor_label: parsed.data.vendorLabel,
    p_vendor_person_id: null,
  });
  if (error) return actionError(error.message);
  revalidateFinance();
  return {
    message: "Expense submitted for Finance review.",
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
        ? "Expense approved and recorded."
        : "Expense rejected.",
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
  return { message: "Expense reversed.", status: "success" };
}

export async function recordOwnerPaymentAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = ownerPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_owner_invoice_payment", {
    p_amount: parsed.data.amount,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_organization_id: context.organizationId,
    p_owner_invoice_id: parsed.data.ownerInvoiceId,
    p_received_date: parsed.data.receivedDate,
    p_reference: parsed.data.reference,
  });
  if (error) return actionError(error.message);
  revalidateFinance();
  return { message: "Owner payment recorded.", status: "success" };
}

export async function recordWithdrawalAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = withdrawalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_property_withdrawal", {
    p_amount: parsed.data.amount,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_reference: parsed.data.reference,
    p_withdrawal_date: parsed.data.withdrawalDate,
  });
  if (error) return actionError(error.message);
  revalidateFinance();
  return { message: "Withdrawal recorded.", status: "success" };
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

function actionError(message: string): FinanceOperationsActionState {
  return { message: simplifyDatabaseMessage(message), status: "error" };
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

function expenseWorkflowError(message: string) {
  if (message.includes("period is locked")) {
    return actionError(
      "This expense month is locked. Super Admin must reopen it before approval.",
    );
  }
  if (message.includes("already settled this charge")) {
    return actionError(
      "This customer charge has already been settled. Use a separate correction.",
    );
  }
  return actionError(message);
}

function asActionResult(
  value: Json | null,
): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json | undefined>)
    : null;
}
