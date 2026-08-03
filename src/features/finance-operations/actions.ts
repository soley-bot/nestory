"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminContext } from "@/lib/auth/context";
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

const generateInvoiceSchema = z.object({
  billingPeriodStart: date,
  idempotencyKey: z.string().min(8),
  issueDate: date,
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
  reference: z.string().trim().max(160),
  responsibility: z.enum(["owner", "tenant"]),
  tenantInvoiceId: z.preprocess((value) => value || null, uuid.nullable()),
  unitId: z.preprocess((value) => value || null, uuid.nullable()),
  vendorLabel: z.string().trim().min(2).max(120),
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

  const context = await requireAdminContext();
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

export async function generateTenantInvoiceAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = generateInvoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("generate_tenant_rent_invoice", {
    p_billing_period_start: parsed.data.billingPeriodStart,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_issue_date: parsed.data.issueDate,
    p_lease_id: parsed.data.leaseId,
    p_organization_id: context.organizationId,
  });
  if (error) return actionError(error.message);
  revalidateFinance();
  return { message: "Rent invoice created.", status: "success" };
}

export async function recordTenantInvoicePaymentAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireAdminContext();
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
  const context = await requireAdminContext();
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

export async function recordIpsExpenseAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  if (parsed.data.responsibility === "tenant" && !parsed.data.tenantInvoiceId) {
    return actionError("Choose the tenant invoice for this charge.");
  }
  const context = await requireAdminContext();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_ips_paid_expense", {
    p_customer_category: parsed.data.category,
    p_expense_date: parsed.data.expenseDate,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_internal_cost_amount: parsed.data.internalCost,
    p_internal_markup_amount: parsed.data.internalMarkup,
    p_organization_id: context.organizationId,
    p_property_id: parsed.data.propertyId,
    p_reference: parsed.data.reference,
    p_responsibility: parsed.data.responsibility,
    p_supporting_document_id: null,
    p_tenant_invoice_id: parsed.data.tenantInvoiceId,
    p_unit_id: parsed.data.unitId,
    p_vendor_label: parsed.data.vendorLabel,
    p_vendor_person_id: null,
  });
  if (error) return actionError(error.message);
  revalidateFinance();
  return { message: "Expense recorded.", status: "success" };
}

export async function recordOwnerPaymentAction(
  _state: FinanceOperationsActionState,
  formData: FormData,
): Promise<FinanceOperationsActionState> {
  const parsed = ownerPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationError(parsed.error);
  const context = await requireAdminContext();
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
  const context = await requireAdminContext();
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
    "/reports/owner-activity",
    "/properties",
  ]) {
    revalidatePath(path);
  }
}
