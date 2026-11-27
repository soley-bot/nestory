import { z } from "zod";
import { financialWriteError } from "@/lib/finance/financial-write-context";

export const transactionDeleteSchema = z.object({
  kind: z.enum(["distribution", "contribution", "tenant-invoice", "tenant-payment", "owner-collection"]),
  id: z.string().uuid("Choose a valid transaction."),
  propertyId: z.string().uuid("Choose a valid property."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.").refine(value => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Choose a valid date."),
  reason: z.string().trim().min(8, "Enter a reason with at least 8 characters.").max(500),
  idempotencyKey: z.string().min(8).max(120),
  expectedLines: z.string().optional().transform((value, context) => {
    if (!value) return undefined;
    try {
      return z.array(z.object({ id: z.string().uuid(), amount: z.string().regex(/^-?\d{1,12}\.\d{2}$/) })).min(1).max(500).parse(JSON.parse(value));
    } catch { context.addIssue({ code: "custom", message: "Refresh the invoice before voiding it." }); return z.NEVER; }
  }),
}).refine(value => value.kind !== "tenant-invoice" || Boolean(value.expectedLines?.length), "Refresh the invoice before voiding it.");

export type TransactionDeleteEntry = {
  kind: z.infer<typeof transactionDeleteSchema>["kind"];
  id: string;
  propertyId: string;
  date: string;
  label: string;
  amount: number;
  expectedLines?: Array<{ id: string; amount: string }>;
};

export const transactionUndoLabels: Record<TransactionDeleteEntry["kind"], string> = {
  "tenant-invoice": "Void invoice",
  "tenant-payment": "Reverse payment",
  "owner-collection": "Reverse owner collection",
  contribution: "Reverse contribution",
  distribution: "Reverse distribution",
};

export function transactionCommandError(message: string) {
  const sessionError = financialWriteError(message);
  if (sessionError) return sessionError;
  if (/privileged_email_step_up_required/.test(message)) return "Verify your email before changing this financial transaction.";
  if (message === "tenant_payment_owner_allocation_required") return "This rent receipt needs an owner allocation. Review the receipt in Owner accounts before reversing the payment.";
  if (/Reversal date cannot be before the (original )?payment date/i.test(message)) return "Choose the payment date or a later reversal date.";
  if (/Reversal date cannot be before the confirmation date/i.test(message)) return "Choose the collection confirmation date or a later reversal date.";
  if (/forbidden|permission|not authorized/i.test(message)) return "You do not have permission to change this transaction.";
  if (/closed|month_locked|month is locked/i.test(message)) return "An affected financial month is closed. Reopen it before changing this transaction.";
  if (/dependent_owner_cash|consumed|held_cash|insufficient|underfund/i.test(message)) return "This money is used by another transaction. Review the related payments before reversing it.";
  if (/already|not_issued|target_missing/i.test(message)) return "This transaction has already changed. Refresh the list before trying again.";
  if (/idempotency|sources_changed|serialization/i.test(message)) return "The transaction changed while you were working. Refresh and review it again.";
  if (/(tenant|owner)_invoice_(has_settlements|settlement_active)/.test(message)) return "This invoice has payments attached. Open its payment history before voiding it.";
  return "The change could not be confirmed. Refresh the transaction to check its status.";
}
