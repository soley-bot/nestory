"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFinanceCorrectionContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

const uuid = z.string().uuid("Choose a valid transaction.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Choose a real calendar date.");
const inputSchema = z.object({ withdrawalId: uuid, distributionDate: date, feePaymentDate: date });
const confirmSchema = inputSchema.extend({ allocationId: uuid, reason: z.string().trim().min(8, "Explain the correction in at least 8 characters.").max(500), previewHash: z.string().regex(/^[0-9a-f]{64}$/), idempotencyKey: z.string().trim().min(8).max(160) });
const previewSchema = z.object({
  allocationId: uuid, withdrawalId: uuid, oldDate: date, newDate: date,
  oldDistributionDate: date, newDistributionDate: date, previewHash: z.string().regex(/^[0-9a-f]{64}$/),
  amount: z.number().positive(), distributionAmount: z.number().positive(), currentBalanceChange: z.number(),
  canApply: z.boolean(), blockers: z.array(z.string()),
});
export type OwnerDistributionRecoveryPreview = z.infer<typeof previewSchema>;
export type OwnerDistributionRecoveryState = { status: "idle" | "error" | "success"; message?: string; preview?: OwnerDistributionRecoveryPreview };

function recoveryError(message = "") {
  if (/privileged_email_step_up_required/.test(message)) return "Verify your email for this financial correction, then review the dates again.";
  if (/forbidden|permission/.test(message)) return "You do not have permission to correct these transactions.";
  if (/closed|month_locked/.test(message)) return "An affected financial month is closed. Reopen it before reviewing these dates.";
  if (/underfund|insufficient|held_cash/.test(message)) return "There is not enough owner cash on these dates. Check the actual rent receipt and fee payment dates.";
  if (/stale|sources_changed|idempotency/.test(message)) return "The financial records changed. Refresh and preview the correction again.";
  if (/already_reversed|not_correctable/.test(message)) return "A selected transaction was already corrected. Refresh and review the current transactions.";
  if (/in_future/.test(message)) return "Choose actual payment dates on or before today.";
  if (/scope_invalid|owner_mismatch/.test(message)) return "These dates or owner records do not match a supported correction. Review the original fee and distribution.";
  return "The correction could not be confirmed. Refresh the account and review both transactions before trying again.";
}

export async function previewOwnerDistributionRecoveryAction(_state: OwnerDistributionRecoveryState, formData: FormData): Promise<OwnerDistributionRecoveryState> {
  const parsed = inputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const context = await requireFinanceCorrectionContext();
  const supabase = await createSupabaseServerClient();
  const input = parsed.data;
  try {
    const withdrawal = await supabase.from("property_withdrawals").select("id,property_id,reversal_of_id").eq("organization_id", context.organizationId).eq("id", input.withdrawalId).maybeSingle();
    if (withdrawal.error || !withdrawal.data || withdrawal.data.reversal_of_id) return { status: "error", message: "The original distribution could not be read. Refresh the account and check your property access." };
    const lines = await supabase.from("owner_invoice_lines").select("id,recognized_on").eq("organization_id", context.organizationId).eq("property_id", withdrawal.data.property_id).eq("source_type", "management_fee").gt("recognized_on", input.distributionDate).limit(501);
    if (lines.error || !lines.data || lines.data.length > 500) return { status: "error", message: "The related fees could not be read completely. Refresh the account or ask an administrator to review them." };
    if (!lines.data.length) return { status: "error", message: "No later fee explains this distribution. Review the owner cash and receipt dates." };
    const allocations = await supabase.from("owner_charge_cash_allocations").select("id,owner_invoice_line_id,allocation_date").eq("organization_id", context.organizationId).eq("property_id", withdrawal.data.property_id).in("owner_invoice_line_id", lines.data.map(line => line.id)).is("reversal_of_id", null).limit(501);
    if (allocations.error || !allocations.data || allocations.data.length > 500) return { status: "error", message: "The fee payments could not be read completely. Refresh and review the fee history." };
    const recognized = new Map(lines.data.map(line => [line.id, line.recognized_on]));
    const candidates = allocations.data.filter(allocation => {
      const recognizedOn = recognized.get(allocation.owner_invoice_line_id);
      return recognizedOn != null && allocation.allocation_date < recognizedOn;
    });
    if (!candidates.length) return { status: "error", message: "No early fee payment explains this distribution. Review the owner cash and receipt dates." };
    const reversals = await supabase.from("owner_charge_cash_allocations").select("reversal_of_id").eq("organization_id", context.organizationId).eq("property_id", withdrawal.data.property_id).in("reversal_of_id", candidates.map(candidate => candidate.id)).limit(501);
    if (reversals.error || !reversals.data || reversals.data.length > 500) return { status: "error", message: "The fee correction history could not be read. Refresh before reviewing the dates." };
    const reversed = new Set(reversals.data.map(reversal => reversal.reversal_of_id));
    const active = candidates.filter(candidate => !reversed.has(candidate.id));
    if (active.length !== 1) return { status: "error", message: active.length ? "Several early fee payments may affect this distribution. Ask an administrator to review the fee history before correcting dates." : "The related fee payments were already corrected. Refresh and review the current transactions." };
    const result = await supabase.rpc("preview_owner_distribution_fee_recovery", { p_organization_id: context.organizationId, p_allocation_id: active[0].id, p_payment_date: input.feePaymentDate, p_withdrawal_id: input.withdrawalId, p_distribution_date: input.distributionDate });
    if (result.error) return { status: "error", message: recoveryError(result.error.message) };
    const preview = previewSchema.safeParse(result.data);
    if (!preview.success || preview.data.allocationId !== active[0].id || preview.data.withdrawalId !== input.withdrawalId || preview.data.newDate !== input.feePaymentDate || preview.data.newDistributionDate !== input.distributionDate) return { status: "error", message: "The preview could not be verified. Refresh and review the dates again." };
    return { status: preview.data.canApply ? "success" : "error", message: preview.data.canApply ? "Review both date changes. Nothing has been saved." : recoveryError(preview.data.blockers.join(" ")), preview: preview.data };
  } catch { return { status: "error", message: recoveryError() }; }
}

export async function confirmOwnerDistributionRecoveryAction(_state: OwnerDistributionRecoveryState, formData: FormData): Promise<OwnerDistributionRecoveryState> {
  const parsed = confirmSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const context = await requireFinanceCorrectionContext();
  const supabase = await createSupabaseServerClient();
  const input = parsed.data;
  try {
    const withdrawal = await supabase.from("property_withdrawals").select("property_id").eq("organization_id", context.organizationId).eq("id", input.withdrawalId).maybeSingle();
    if (withdrawal.error || !withdrawal.data) return { status: "error", message: "The distribution could not be read. Refresh the account and check your property access." };
    const result = await supabase.rpc("recover_owner_distribution_fee_dates", { p_organization_id: context.organizationId, p_allocation_id: input.allocationId, p_payment_date: input.feePaymentDate, p_withdrawal_id: input.withdrawalId, p_distribution_date: input.distributionDate, p_reason: input.reason, p_preview_hash: input.previewHash, p_idempotency_key: input.idempotencyKey });
    if (result.error) return { status: "error", message: recoveryError(result.error.message) };
    if (!z.object({ correctionId: uuid }).safeParse(result.data).success) return { status: "error", message: recoveryError() };
    revalidatePath(`/properties/${withdrawal.data.property_id}`, "layout");
    for (const path of ["/finance", "/balances", "/reports", "/ledger"]) revalidatePath(path);
    return { status: "success", message: "Fee and distribution dates corrected. Both original transactions remain in history." };
  } catch { return { status: "error", message: recoveryError() }; }
}
