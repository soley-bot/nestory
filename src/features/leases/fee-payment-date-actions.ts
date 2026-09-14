"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireHistoricalRentRecoveryContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { postgresUuid } from "@/lib/validation/postgres-uuid";

const uuid = postgresUuid("Choose a valid settlement.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid payment date.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Choose a valid payment date.");
const inputSchema = z.object({ allocationId: uuid, paymentDate: date });
const candidateSchema = z.object({ allocationId: uuid, invoiceNumber: z.string(), amount: z.number().finite().positive(), paymentDate: date, feeDate: date });
const previewSchema = z.object({
  allocationId: uuid, oldDate: date, newDate: date, amount: z.number().finite().positive(),
  canApply: z.boolean(), blockers: z.array(z.string()), previewHash: z.string().regex(/^[a-f0-9]{64}$/i),
  cashChangeOnEarlierDate: z.number().finite(), currentBalanceChange: z.number().finite(),
}).refine((value) => !value.canApply || value.blockers.length === 0);
const applySchema = inputSchema.extend({
  reason: z.string().trim().min(8, "Explain why the payment date needs correcting.").max(500),
  previewHash: z.string().regex(/^[a-f0-9]{64}$/i, "Preview the correction again."),
  idempotencyKey: postgresUuid("Refresh this correction and try again."),
});

export type FeePaymentDateCandidate = z.infer<typeof candidateSchema>;
export type FeePaymentDatePreview = z.infer<typeof previewSchema>;
export type FeePaymentDateActionState = {
  status?: "error" | "preview" | "success";
  message?: string;
  preview?: FeePaymentDatePreview;
};

function errorMessage(error: { message: string }) {
  const message = error.message.toLowerCase();
  if (/privileged_email_step_up_required|privileged email verification required/.test(message)) return "Verify this signed-in session by email, then retry the correction.";
  if (/closed|financial_month_locked|locked.*period|period.*locked/.test(message)) return "A financial month affected by this correction is closed. Reopen the period before correcting this payment.";
  if (/stale|sources_changed|preview.*changed|preview.*mismatch/.test(message)) return "The settlement changed after preview. Preview the correction again.";
  if (/payout|underfund_owner_cash|insufficient|negative/.test(message)) return "This date would leave insufficient owner cash on an affected date. Review the cash balance and later payouts before correcting this payment.";
  if (/in_future|future_date/.test(message)) return "The original and corrected payment dates must be on or before today's business date.";
  if (/owner_mismatch/.test(message)) return "The settlement owner is not an owner on the corrected date. Check the ownership dates before continuing.";
  if (/date_unchanged/.test(message)) return "Choose a different payment date.";
  if (/idempotency_conflict/.test(message)) return "This correction attempt already has different details. Reload the lease and preview again.";
  if (/inputs_invalid/.test(message)) return "Check the payment date and reason, then preview the correction again.";
  if (/source|conflict|reversed|already.*correct|eligible|not_correctable|not_found/.test(message)) return "This settlement can no longer be corrected. Reload the lease and choose an eligible settlement.";
  if (/permission|forbidden|authorized/.test(message)) return "You do not have permission to correct fee payment dates.";
  return "The fee payment date could not be corrected. Refresh the preview and try again.";
}

export async function listFeePaymentDateCandidatesAction(leaseId: string): Promise<{ candidates?: FeePaymentDateCandidate[]; message?: string }> {
  if (!uuid.safeParse(leaseId).success) return { message: "Choose a valid lease." };
  const context = await requireHistoricalRentRecoveryContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_fee_payment_date_candidates", { p_organization_id: context.organizationId, p_lease_id: leaseId });
  if (error) return { message: errorMessage(error) };
  const parsed = z.array(candidateSchema).safeParse(data);
  return parsed.success ? { candidates: parsed.data } : { message: "Nestory could not verify the fee settlements. Reload the lease and try again." };
}

export async function previewFeePaymentDateCorrectionAction(input: { allocationId: string; paymentDate: string }): Promise<FeePaymentDateActionState> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const context = await requireHistoricalRentRecoveryContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("preview_fee_payment_date_correction", { p_organization_id: context.organizationId, p_allocation_id: parsed.data.allocationId, p_payment_date: parsed.data.paymentDate });
  if (error) return { status: "error", message: errorMessage(error) };
  const preview = previewSchema.safeParse(data);
  if (!preview.success || preview.data.allocationId !== parsed.data.allocationId || preview.data.newDate !== parsed.data.paymentDate) return { status: "error", message: "Nestory could not verify the correction preview." };
  return { status: "preview", preview: preview.data };
}

export async function correctFeePaymentDateAction(input: { allocationId: string; paymentDate: string; reason: string; previewHash: string; idempotencyKey: string }): Promise<FeePaymentDateActionState> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const context = await requireHistoricalRentRecoveryContext();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("correct_fee_payment_date", {
    p_organization_id: context.organizationId, p_allocation_id: parsed.data.allocationId,
    p_payment_date: parsed.data.paymentDate, p_reason: parsed.data.reason,
    p_preview_hash: parsed.data.previewHash, p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return { status: "error", message: errorMessage(error) };
  if (!z.object({ correctionId: uuid }).safeParse(data).success) return { status: "error", message: "Nestory could not verify the correction result. Reload the lease before trying again." };
  for (const path of ["/finance", "/finance/accounts", "/balances", "/owner-accounts", "/ledger", "/leases", "/owner-balances", "/rent-income", "/reports", "/properties"]) revalidatePath(path);
  revalidatePath("/leases/[leaseId]", "page");
  revalidatePath("/properties/[propertyId]", "layout");
  return { status: "success", message: "Fee payment date corrected. The original settlement remains in the audit history." };
}
