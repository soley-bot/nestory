"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFinanceCorrectionContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { transactionDeleteSchema, transactionCommandError } from "./transaction-delete";
import type { FinanceOperationsActionState } from "./finance-operations.types";

export async function deleteTransactionAction(_state: FinanceOperationsActionState, formData: FormData): Promise<FinanceOperationsActionState> {
  const parsed = transactionDeleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message };
  const input = parsed.data;
  const context = await requireFinanceCorrectionContext();
  const client = await createSupabaseServerClient();
  const common = { p_organization_id: context.organizationId, p_reason: input.reason, p_idempotency_key: input.idempotencyKey };
  try {
    // Each command resolves the source property and enforces authority in PostgreSQL.
    // The browser's property ID is only used for cache invalidation.
    const result = input.kind === "distribution"
      ? await client.rpc("reverse_property_withdrawal", { ...common, p_withdrawal_id: input.id, p_reversal_date: input.date })
      : input.kind === "contribution"
        ? await client.rpc("void_owner_contribution", { ...common, p_cash_event_id: input.id })
        : input.kind === "tenant-invoice"
          ? await client.rpc("void_tenant_invoice_checked", { ...common, p_invoice_id: input.id, p_expected_issue_date: input.date, p_expected_lines: input.expectedLines! })
          : input.kind === "tenant-payment"
            ? await client.rpc("reverse_tenant_invoice_payment", { ...common, p_payment_id: input.id, p_reversal_date: input.date })
            : await client.rpc("reverse_owner_collection_confirmation", { ...common, p_confirmation_id: input.id, p_reversal_date: input.date });
    if (result.error) return { status: "error", message: transactionCommandError(result.error.message) };
    const uuid = z.string().uuid();
    const valid = input.kind === "tenant-payment" || input.kind === "owner-collection"
      ? uuid.safeParse(result.data).success
      : input.kind === "tenant-invoice"
        ? z.object({ correction_id: uuid, invoice_id: z.literal(input.id), action: z.literal("void") }).safeParse(result.data).success
        : input.kind === "contribution"
          ? z.object({ originalId: z.literal(input.id), reversalId: uuid }).safeParse(result.data).success
          : z.object({ property_withdrawal_id: uuid, reversal_of_id: z.literal(input.id) }).safeParse(result.data).success;
    if (!valid) return { status: "error", message: "The deletion could not be confirmed. Refresh the list before trying again." };
  } catch {
    return { status: "error", message: "The deletion could not be confirmed. Refresh the list before trying again." };
  }
  revalidatePath(`/properties/${input.propertyId}`, "layout");
  for (const path of ["/units", "/finance", "/balances", "/reports", "/ledger"]) revalidatePath(path, "layout");
  return { status: "success", message: "Transaction deleted. Its history is retained." };
}
