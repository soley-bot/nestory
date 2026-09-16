"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFinanceCorrectionContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { canonicalizeOwnerOpeningAmount } from "./owner-balance.money";
import { ownerCashCorrectionFields } from "./owner-transaction-correction";
import type { OwnerCashActionState } from "./owner-cash-actions";

const uuid = z.string().uuid("Choose a valid transaction.");
const inputSchema = ownerCashCorrectionFields.extend({
  kind: z.enum(["distribution", "contribution"]),
  originalId: uuid,
  propertyId: uuid,
  idempotencyKey: z.string().min(8).max(120),
});
const resultSchema = z.object({
  originalId: uuid, replacementId: uuid, reversalId: uuid,
  newDate: z.string(), newAmount: z.union([z.string(), z.number()]),
  reference: z.string().nullable(),
});

function correctionError(message = "") {
  if (/privileged_email_step_up_required/.test(message)) return "Verify your email for this financial correction, then try again.";
  if (/forbidden|permission/.test(message)) return "You do not have permission to correct this transaction.";
  if (/closed|month_locked/.test(message)) return "An affected financial month is closed. Reopen it before correcting this transaction.";
  if (/already_reversed|already_corrected/.test(message)) return "This transaction has already been corrected or reversed. Refresh the account and open the replacement.";
  if (/unchanged/.test(message)) return "Change the date, amount, or reference before reviewing the correction.";
  if (/dependent_owner_cash/.test(message)) return "This contribution has already funded another payment. Correct or reverse the dependent payment first, then review this contribution again.";
  if (/underfund|insufficient|held_cash|cash_reserv/.test(message)) return "This correction would leave insufficient owner cash. Review the amount, date, and later payments.";
  if (/in_future/.test(message)) return "Choose a date on or before today.";
  if (/owner_mismatch|owner.*assignment/.test(message)) return "The owner assignment does not match this date. Review the ownership dates.";
  if (/sources_changed|idempotency|serialization/.test(message)) return "The transaction changed while you were working. Refresh and review it again.";
  return "The correction could not be saved. Refresh the account and review the transaction before trying again.";
}

export async function correctOwnerTransactionAction(_previous: OwnerCashActionState, formData: FormData): Promise<OwnerCashActionState> {
  const parsed = inputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const input = parsed.data;
  const context = await requireFinanceCorrectionContext();
  const supabase = await createSupabaseServerClient();
  try {
    const common = {
      p_organization_id: context.organizationId,
      p_amount: input.amount,
      p_reference: input.reference || null,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
    };
    const result = input.kind === "distribution"
      ? await supabase.rpc("correct_owner_distribution", {
          ...common, p_withdrawal_id: input.originalId, p_distribution_date: input.date,
        })
      : await supabase.rpc("correct_owner_contribution", {
          ...common, p_cash_event_id: input.originalId, p_event_date: input.date,
        });
    if (result.error) return { status: "error", message: correctionError(result.error.message) };
    const receipt = resultSchema.safeParse(result.data);
    if (!receipt.success || receipt.data.originalId !== input.originalId || receipt.data.newDate !== input.date
      || canonicalizeOwnerOpeningAmount(String(receipt.data.newAmount)) !== input.amount
      || (receipt.data.reference ?? "") !== input.reference) {
      return { status: "error", message: "The correction could not be confirmed. Refresh the account before trying again." };
    }
  } catch {
    return { status: "error", message: "The correction could not be confirmed. Refresh the account before trying again." };
  }
  revalidatePath(`/properties/${input.propertyId}`, "layout");
  for (const path of ["/finance", "/balances", "/reports", "/ledger"]) revalidatePath(path);
  return { status: "success", message: "Transaction corrected. The original remains in the account history." };
}
