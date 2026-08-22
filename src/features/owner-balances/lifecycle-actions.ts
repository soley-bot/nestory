"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canonicalizeOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import { OWNER_BALANCE_COMPONENTS } from "@/features/owner-balances/owner-balance.types";
import {
  requireFinanceCorrectionContext,
  requireFinanceOperationContext,
  requireOwnerCloseContext,
  requireSuperAdminContext,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

const uuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Choose a valid record.",
);
const date = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/, "Choose a valid date.");
const firstOfMonth = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-01$/, "Choose the first day of a month.");
const idempotencyKey = z.string().trim().min(8).max(160);
const reason = z.string().trim().min(3).max(500);
const currency = z.literal("USD");
const evidenceHash = z.string().regex(/^[0-9a-f]{64}$/, "Use a lowercase SHA-256 evidence fingerprint.");
const sourceTypes = [
  "tenant_rent_receipt",
  "owner_direct_rent_receipt",
  "management_fee_occurrence",
  "owner_paid_cost",
  "owner_invoice_payment",
  "owner_contribution",
  "owner_reimbursement",
  "owner_distribution",
  "security_deposit_receipt",
  "security_deposit_refund",
  "owner_component_transfer",
  "reversal",
] as const;

const allocateSchema = z.object({
  idempotencyKey,
  sourceLineId: uuid,
  sourceType: z.enum(sourceTypes),
});
const periodSchema = z.object({
  currency,
  idempotencyKey,
  monthStart: firstOfMonth,
  ownerPersonId: uuid,
  propertyId: uuid,
});
const cashEventSchema = z.object({
  amount: z.string(),
  currency,
  eventDate: date,
  eventType: z.enum(["owner_contribution", "owner_reimbursement"]),
  idempotencyKey,
  ownerPersonId: uuid,
  propertyId: uuid,
  reason,
});
const distributionSchema = z.object({
  amount: z.string(),
  currency,
  distributionDate: date,
  idempotencyKey,
  ownerPersonId: uuid,
  propertyId: uuid,
  reference: z.string().trim().min(1).max(240),
});
const ownerPaymentReversalSchema = z.object({
  idempotencyKey,
  ownerPaymentId: uuid,
  reason,
  reversalDate: date,
});
const withdrawalReversalSchema = z.object({
  idempotencyKey,
  reason,
  reversalDate: date,
  withdrawalId: uuid,
});
const transferSchema = z.object({
  amount: z.string(),
  component: z.enum(OWNER_BALANCE_COMPONENTS),
  currency,
  effectiveDate: date,
  evidenceReference: z.string().trim().min(3).max(240),
  evidenceSha256: evidenceHash,
  fromOwnerPersonId: uuid,
  idempotencyKey,
  propertyId: uuid,
  reason,
  toOwnerPersonId: uuid,
}).refine((value) => value.fromOwnerPersonId !== value.toOwnerPersonId, {
  message: "Choose a different destination owner.",
  path: ["toOwnerPersonId"],
});

export async function allocateOwnerEventAction(formData: FormData): Promise<void> {
  const input = parse(allocateSchema, formData);
  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("allocate_owner_event", {
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_source_line_id: input.sourceLineId,
    p_source_type: input.sourceType,
  });
  finish(result.error);
}

export async function generateOwnerBalancePeriodAction(formData: FormData): Promise<void> {
  const input = parse(periodSchema, formData);
  const context = await requireOwnerCloseContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("generate_owner_balance_period", {
    p_currency: input.currency,
    p_idempotency_key: input.idempotencyKey,
    p_month_start: input.monthStart,
    p_organization_id: context.organizationId,
    p_owner_person_id: input.ownerPersonId,
    p_property_id: input.propertyId,
  });
  finish(result.error);
}

export async function recordOwnerCashEventAction(formData: FormData): Promise<void> {
  const input = parse(cashEventSchema, formData);
  const amount = positiveExactAmount(input.amount);
  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("record_owner_cash_event", {
    p_amount: amount,
    p_currency: input.currency,
    p_event_date: input.eventDate,
    p_event_type: input.eventType,
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_owner_person_id: input.ownerPersonId,
    p_property_id: input.propertyId,
    p_reason: input.reason,
  });
  finish(result.error);
}

export async function recordOwnerDistributionAction(formData: FormData): Promise<void> {
  const input = parse(distributionSchema, formData);
  const amount = positiveExactAmount(input.amount);
  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("record_owner_distribution", {
    p_amount: amount,
    p_currency: input.currency,
    p_distribution_date: input.distributionDate,
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_owner_person_id: input.ownerPersonId,
    p_property_id: input.propertyId,
    p_reference: input.reference,
  });
  finish(result.error);
}

export async function reverseOwnerInvoicePaymentAction(formData: FormData): Promise<void> {
  const input = parse(ownerPaymentReversalSchema, formData);
  const context = await requireFinanceCorrectionContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("reverse_owner_invoice_payment", {
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_owner_payment_id: input.ownerPaymentId,
    p_reason: input.reason,
    p_reversal_date: input.reversalDate,
  });
  finish(result.error);
}

export async function reversePropertyWithdrawalAction(formData: FormData): Promise<void> {
  const input = parse(withdrawalReversalSchema, formData);
  const context = await requireFinanceCorrectionContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("reverse_property_withdrawal", {
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_reason: input.reason,
    p_reversal_date: input.reversalDate,
    p_withdrawal_id: input.withdrawalId,
  });
  finish(result.error);
}

export async function transferOwnerBalanceComponentAction(formData: FormData): Promise<void> {
  const input = parse(transferSchema, formData);
  const amount = positiveExactAmount(input.amount);
  const context = await requireSuperAdminContext();
  const supabase = await createSupabaseServerClient();
  const result = await supabase.rpc("transfer_owner_balance_component", {
    p_amount: amount,
    p_component: input.component,
    p_currency: input.currency,
    p_effective_date: input.effectiveDate,
    p_evidence_reference: input.evidenceReference,
    p_evidence_sha256: input.evidenceSha256,
    p_from_owner_person_id: input.fromOwnerPersonId,
    p_idempotency_key: input.idempotencyKey,
    p_organization_id: context.organizationId,
    p_property_id: input.propertyId,
    p_reason: input.reason,
    p_to_owner_person_id: input.toOwnerPersonId,
  });
  finish(result.error);
}

function parse<Schema extends z.ZodType>(schema: Schema, formData: FormData): z.output<Schema> {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Invalid owner balance command.");
  return result.data;
}

function positiveExactAmount(value: string) {
  const amount = canonicalizeOwnerOpeningAmount(value);
  if (amount === "0.00") throw new Error("Enter an amount greater than zero.");
  return amount;
}

function finish(error: { message?: string } | null) {
  if (error) throw new Error(error.message ?? "Authoritative owner balance command failed.");
  revalidatePath("/balances");
}
