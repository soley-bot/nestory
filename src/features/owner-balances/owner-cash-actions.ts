"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canonicalizeOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import { requireFinanceCorrectionContext, requireFinanceOperationContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

export type OwnerCashActionState = { status: "idle" | "error" | "success"; message?: string };
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Choose a valid record.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Choose a real calendar date.");
const shared = { propertyId: uuid, idempotencyKey: z.string().trim().min(8).max(160), reason: z.string().trim().min(3, "Enter a reason of at least 3 characters.").max(500) };
const contributionSchema = z.object({ ...shared, ownerPersonId: uuid, currency: z.literal("USD"), amount: z.string(), eventDate: date });
const correctionSchema = z.object({ ...shared, withdrawalId: uuid, distributionDate: date, reason: z.string().trim().min(8, "Explain the correction in at least 8 characters.").max(500), idempotencyKey: z.string().trim().min(8).max(120) });
const correctionResultSchema = z.object({ withdrawalId: uuid, reversalId: uuid, oldDate: date, newDate: date });
function commandError(message: string | undefined) {
  const code = (message ?? "").toLowerCase();
  if (/privileged_email_step_up_required/.test(code)) return "Verify your email for this financial correction, then try again.";
  if (/forbidden|permission/.test(code)) return "You do not have permission to make this financial change.";
  if (/financial_month_locked|closed|month_locked/.test(code)) return "This financial month is closed. Reopen the affected month before correcting the date.";
  if (/insufficient|underfund|held_cash/.test(code)) return "There is not enough available owner cash on the new date. Review the cash position before correcting it.";
  if (/owner_mismatch|owner.*assignment/.test(code)) return "The owner assignment does not match the selected date. Review the property ownership dates.";
  if (/already_reversed/.test(code)) return "This distribution has already been reversed. Refresh the account to find its current replacement.";
  if (/date_unchanged/.test(code)) return "Choose a date different from the original distribution date.";
  if (/in_future/.test(code)) return "Choose a date on or before today.";
  return "The change could not be saved. Refresh the account, check the date and owner assignment, then try again.";
}

function refresh(propertyId: string) {
  revalidatePath(`/properties/${propertyId}`, "layout");
  for (const path of ["/finance", "/balances", "/reports", "/ledger"]) revalidatePath(path);
}

export async function recordOwnerContributionAction(_previous: OwnerCashActionState, formData: FormData): Promise<OwnerCashActionState> {
  const parsed = contributionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const input = parsed.data;
  let amount: string;
  try {
    amount = canonicalizeOwnerOpeningAmount(input.amount);
    if (amount === "0.00") return { status: "error", message: "Enter an amount greater than zero." };
  } catch { return { status: "error", message: "Enter a positive amount with up to 12 integer digits and 2 decimal places." }; }
  // Authorization stays outside the database error boundary so redirects propagate.
  const context = await requireFinanceOperationContext();
  const supabase = await createSupabaseServerClient();
  try {
    const result = await supabase.rpc("record_owner_cash_event", {
      p_amount: amount, p_currency: input.currency, p_event_date: input.eventDate,
      p_event_type: "owner_contribution", p_idempotency_key: input.idempotencyKey,
      p_organization_id: context.organizationId, p_owner_person_id: input.ownerPersonId,
      p_property_id: input.propertyId, p_reason: input.reason,
    });
    if (result.error) return { status: "error", message: commandError(result.error.message) };
  } catch { return { status: "error", message: "The contribution could not be recorded. Please try again." }; }
  refresh(input.propertyId);
  return { status: "success", message: "Owner contribution recorded." };
}

export async function correctOwnerDistributionDateAction(_previous: OwnerCashActionState, formData: FormData): Promise<OwnerCashActionState> {
  const parsed = correctionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const input = parsed.data;
  const context = await requireFinanceCorrectionContext();
  const supabase = await createSupabaseServerClient();
  try {
    const result = await supabase.rpc("correct_owner_distribution_date", {
      p_organization_id: context.organizationId, p_withdrawal_id: input.withdrawalId,
      p_distribution_date: input.distributionDate, p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    });
    if (result.error) return { status: "error", message: commandError(result.error.message) };
    const receipt = correctionResultSchema.safeParse(result.data);
    if (!receipt.success || receipt.data.newDate !== input.distributionDate) return { status: "error", message: "The correction could not be confirmed. Refresh the account before trying again." };
  } catch { return { status: "error", message: "The date could not be corrected. Please try again." }; }
  refresh(input.propertyId);
  return { status: "success", message: "Owner distribution date corrected." };
}
